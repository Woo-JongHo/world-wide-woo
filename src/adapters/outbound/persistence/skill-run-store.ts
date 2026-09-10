import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, open, readFile, readdir, realpath, rename, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { SkillRunReceipt, SkillRunState } from "../../../core/workflows/skill-run.js";
import { verifySkillRunReceipt } from "../../../core/workflows/skill-run.js";

interface Commit {
 readonly schemaVersion: 1;
 readonly sequence: number;
 readonly rootDigest: string;
 readonly state: SkillRunState;
 readonly receipts: readonly SkillRunReceipt[];
}

/** Immutable JSON commits are authoritative; legacy paths are repairable exports. */
export class FileSkillRunStore {
 constructor(private readonly root: string) {}
 statePath(runId: string): string { return resolve(this.root, "runtime/skills", `${safeId(runId)}.json`); }
 receiptPath(receipt: SkillRunReceipt): string { return resolve(this.root, "receipts/skills", safeId(receipt.runId), `${safeId(receipt.receiptId)}.json`); }
 private commitsPath(runId: string): string { return resolve(this.root, "runtime/skills/commits", safeId(runId)); }
 private async binding(): Promise<string> {
  return createHash("sha256").update(await realpath(this.root)).digest("hex");
 }
 private async current(runId: string): Promise<Commit | null> {
  safeId(runId);
  const names = await readdir(this.commitsPath(runId)).catch(error => missing(error) ? [] : Promise.reject(error));
  const sequences = names.filter(name => /^\d{16}\.json$/u.test(name)).sort();
  const latest = sequences.at(-1);
  if (latest) {
   const commit = JSON.parse(await readFile(resolve(this.commitsPath(runId), latest), "utf8")) as Commit;
   if (commit.schemaVersion !== 1 || commit.sequence !== Number(latest.slice(0, -5)) || commit.state.runId !== runId) throw new Error("SKILL_RUN_COMMIT_INVALID");
   if (commit.rootDigest !== await this.binding()) throw new Error("SKILL_RUN_PROJECT_MISMATCH");
   for (const receipt of commit.receipts) { verifySkillRunReceipt(receipt); if (receipt.runId !== runId) throw new Error("SKILL_RUN_COMMIT_INVALID"); }
   return commit;
  }
  const text = await readFile(this.statePath(runId), "utf8").catch(error => missing(error) ? null : Promise.reject(error));
  if (text === null) return null;
  const state = await this.legacy<SkillRunState>(text);
  if (state.runId !== runId) throw new Error("SKILL_RUN_COMMIT_INVALID");
  const directory = resolve(this.root, "receipts/skills", safeId(runId));
  const receipts = await readdir(directory).catch(error => missing(error) ? [] : Promise.reject(error));
  const values = await Promise.all(receipts.filter(name => name.endsWith(".json")).sort().map(async name => {
   const receipt = await this.legacy<SkillRunReceipt>(await readFile(resolve(directory, name), "utf8"));
   verifySkillRunReceipt(receipt);
   if (receipt.runId !== runId) throw new Error("SKILL_RUN_COMMIT_INVALID");
   return receipt;
  }));
  return { schemaVersion: 1, sequence: 0, rootDigest: await this.binding(), state, receipts: values };
 }
 private async legacy<T>(text: string): Promise<T> {
  const { _storeRootDigest, ...value } = JSON.parse(text);
  if (_storeRootDigest !== undefined && _storeRootDigest !== await this.binding()) throw new Error("SKILL_RUN_PROJECT_MISMATCH");
  return value as T;
 }
 async read(runId: string): Promise<SkillRunState> {
  const commit = await this.required(runId); await this.project(commit); return commit.state;
 }
 private async required(runId: string): Promise<Commit> {
  const commit = await this.current(runId);
  if (!commit) throw Object.assign(new Error("SKILL_RUN_NOT_FOUND"), { code: "ENOENT" });
  return commit;
 }
 async write(state: SkillRunState, expectedRevision?: number): Promise<void> {
  await this.mutate(state.runId, current => {
   this.checkRevision(current, state, expectedRevision);
   if (!["ready", "running", "authorize", "execute"].includes(state.stage) && !(current === null && state.stage === "completed" && state.steps.length === 0)) throw new Error("SKILL_STEP_COMMIT_REQUIRED");
   if (current && !["ready", "running", "authorize", "execute"].includes(current.state.stage)) throw new Error("SKILL_STEP_COMMIT_REQUIRED");
   if (state.steps.some((step, index) => step.status !== current?.state.steps[index]?.status && !["pending", "running"].includes(step.status))) throw new Error("SKILL_STEP_COMMIT_REQUIRED");
   return { state, receipts: current?.receipts ?? [] };
  });
 }
 private checkRevision(current: Commit | null, state: SkillRunState, expectedRevision?: number): void {
  if (expectedRevision === undefined) {
   if (current || state.revision !== 1) throw new Error("SKILL_RUN_CONFLICT");
  } else if (!current || current.state.revision !== expectedRevision || state.revision !== expectedRevision + 1) throw new Error("SKILL_RUN_CONFLICT");
  if (current && (state.schemaVersion !== current.state.schemaVersion
   || state.runId !== current.state.runId || state.scope !== current.state.scope
   || state.subjectDigest !== current.state.subjectDigest
   || JSON.stringify(state.scenario) !== JSON.stringify(current.state.scenario)
   || JSON.stringify(state.steps.map(step => step.skill)) !== JSON.stringify(current.state.steps.map(step => step.skill)))) throw new Error("SKILL_RUN_IDENTITY_MISMATCH");
 }
 async commitStep(state: SkillRunState, receipt: SkillRunReceipt, expectedRevision: number): Promise<string> {
  verifySkillRunReceipt(receipt);
  if (receipt.runId !== state.runId || receipt.execution.revision !== expectedRevision) throw new Error("SKILL_RECEIPT_STATE_MISMATCH");
  await this.mutate(state.runId, current => {
   this.checkRevision(current, state, expectedRevision);
   const previous = current!.state;
   const activeIndex = previous.activeIndex;
   const active = activeIndex === null ? undefined : previous.steps[activeIndex];
   const next = activeIndex === null ? undefined : state.steps[activeIndex];
   const expectedStage = receipt.status === "succeeded" ? (state.steps.some(step => step.status === "pending") ? "ready" : "completed") : receipt.status;
   if (!["running", "execute"].includes(previous.stage) || !active || !next
    || active.skill !== receipt.skill.name || next.status !== receipt.status
    || state.activeIndex !== null || state.stage !== expectedStage
    || state.scope !== previous.scope || JSON.stringify(state.scenario) !== JSON.stringify(previous.scenario)
    || state.steps.length !== previous.steps.length
    || state.steps.some((step, index) => index !== activeIndex && JSON.stringify(step) !== JSON.stringify(previous.steps[index]))
    || next.skill !== active.skill || next.candidateId !== active.candidateId
    || next.candidateDigest !== active.candidateDigest || next.authorizationDigest !== active.authorizationDigest
    || receipt.candidateId !== active.candidateId || receipt.input.candidateDigest !== active.candidateDigest
    || JSON.stringify(next.evidence) !== JSON.stringify(receipt.evidence)) throw new Error("SKILL_RECEIPT_STATE_MISMATCH");
   if (current?.receipts.some(value => value.receiptId === receipt.receiptId)) throw new Error("SKILL_RECEIPT_EXISTS");
   return { state, receipts: [...(current?.receipts ?? []), receipt] };
  });
  return this.receiptPath(receipt);
 }
 async writeReceipt(receipt: SkillRunReceipt): Promise<string> {
  verifySkillRunReceipt(receipt);
  await this.mutate(receipt.runId, current => {
   if (!current) throw new Error("SKILL_RUN_NOT_FOUND");
   if (current.receipts.some(value => value.receiptId === receipt.receiptId)) throw new Error("SKILL_RECEIPT_EXISTS");
   return { state: current.state, receipts: [...current.receipts, receipt] };
  });
  return this.receiptPath(receipt);
 }
 async readReceipt(runId: string, receiptId: string): Promise<SkillRunReceipt> {
  safeId(receiptId);
  const commit = await this.required(runId);
  const receipt = commit.receipts.find(value => value.receiptId === receiptId);
  if (!receipt) throw Object.assign(new Error("SKILL_RECEIPT_NOT_FOUND"), { code: "ENOENT" });
  await this.project(commit); return receipt;
 }
 async listReceipts(runId: string): Promise<readonly SkillRunReceipt[]> {
  const commit = await this.current(runId);
  if (!commit) return Object.freeze([]);
  await this.project(commit); return Object.freeze([...commit.receipts]);
 }
 private async mutate(runId: string, update: (current: Commit | null) => Pick<Commit, "state" | "receipts">): Promise<void> {
  const directory = this.commitsPath(runId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  for (;;) {
   const current = await this.current(runId);
   const value = update(current);
   const commit: Commit = { schemaVersion: 1, sequence: (current?.sequence ?? 0) + 1, rootDigest: await this.binding(), ...value };
   const temporary = resolve(directory, `.${randomUUID()}.tmp`);
   const target = resolve(directory, `${String(commit.sequence).padStart(16, "0")}.json`);
   const handle = await open(temporary, "wx", 0o600);
   try { await handle.writeFile(`${JSON.stringify(commit)}\n`); await handle.sync(); } finally { await handle.close(); }
   let published = false;
   try {
    // link never replaces an existing sequence: independent processes race here.
    await link(temporary, target); published = true;
   } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
   finally { await unlink(temporary); }
   if (!published) continue;
   const dir = await open(directory, "r");
   try { await dir.sync(); } finally { await dir.close(); }
   await this.project(commit); return;
  }
 }
 private async project(commit: Commit): Promise<void> {
  if (commit.sequence === 0) return;
  // Export failure cannot split the authoritative state/receipt commit. Reads retry it.
  await Promise.allSettled([
   this.export(this.statePath(commit.state.runId), { ...commit.state, _storeRootDigest: commit.rootDigest }),
   ...commit.receipts.map(receipt => this.export(this.receiptPath(receipt), { ...receipt, _storeRootDigest: commit.rootDigest })),
  ]);
 }
 private async export(target: string, value: unknown): Promise<void> {
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`); } finally { await handle.close(); }
  try { await rename(temporary, target); } finally { await unlink(temporary).catch(error => missing(error) ? undefined : Promise.reject(error)); }
 }
}
function missing(error: unknown): boolean { return (error as NodeJS.ErrnoException).code === "ENOENT"; }
function safeId(value: string): string { if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value)) throw new Error("SKILL_RUN_ID_INVALID"); return value; }
