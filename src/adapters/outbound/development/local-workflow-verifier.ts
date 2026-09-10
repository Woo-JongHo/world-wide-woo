import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { loadLocalUnitManifest, validateLocalUnitManifest, type LocalUnitManifest } from "./local-unit-registry";

export interface LocalWorkflowVerification {
 status: "passed" | "failed" | "uncertain";
 subjectDigest: string;
 evidence: readonly string[];
 issues: readonly string[];
 checkedAt: string;
}
interface Snapshot {
 root: string;
 files: Map<string, Buffer>;
 manifest: LocalUnitManifest;
 skippedNotes: string[];
 digest: string;
}
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const manifestPath = ".woo/units.yaml";
const ledgerPaths = [".www/control-ledger/traceability-v3.json", ".www/control-ledger/traceability-v2.json"];

function partsOf(path: string): string[] {
 if (!path || isAbsolute(path) || path.includes("\\") || path.includes("\0") || path.split("/").some(part => !part || part === "." || part === "..")) {
  throw new Error(`LOCAL_WORKFLOW_PATH_INVALID: ${path}`);
 }
 return path.split("/");
}

// Refuse all symlink components, including manifest/ledger ancestors. A private
// snapshot keeps the legacy validator from following mutable project paths.
function readContained(root: string, path: string, optional = false): Buffer | undefined {
 const parts = partsOf(path);
 let current = root;
 for (const part of parts) {
  current = join(current, part);
  let stat;
  try { stat = lstatSync(current); } catch (error) {
   if (optional && (error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
   throw new Error(`LOCAL_WORKFLOW_INPUT_MISSING: ${path}: ${String(error)}`);
  }
  if (stat.isSymbolicLink()) throw new Error(`LOCAL_WORKFLOW_PATH_SYMLINK: ${path}`);
 }
 const canonicalPath = realpathSync(current);
 if (canonicalPath !== current) throw new Error(`LOCAL_WORKFLOW_PATH_SYMLINK: ${path}`);
 const descriptor = openSync(canonicalPath, constants.O_RDONLY | constants.O_NOFOLLOW);
 try {
  const stat = fstatSync(descriptor);
  if (!stat.isFile()) throw new Error(`LOCAL_WORKFLOW_INPUT_NOT_FILE: ${path}`);
  const data = readFileSync(descriptor);
  const after = lstatSync(current);
  const handleAfter = fstatSync(descriptor);
  if (after.isSymbolicLink() || after.ino !== stat.ino || after.dev !== stat.dev || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || handleAfter.size !== stat.size || handleAfter.mtimeMs !== stat.mtimeMs) {
   throw new Error(`LOCAL_WORKFLOW_SOURCE_CHANGED: ${path}`);
  }
  return data;
 } finally { closeSync(descriptor); }
}
function stage(directory: string, path: string, bytes: Buffer): void {
 const target = join(directory, path);
 mkdirSync(dirname(target), { recursive: true });
 writeFileSync(target, bytes);
}
function snapshot(root: string, stagingRoot: string): Snapshot {
 const files = new Map<string, Buffer>();
 const manifestBytes = readContained(root, manifestPath)!;
 files.set(manifestPath, manifestBytes); stage(stagingRoot, manifestPath, manifestBytes);
 const manifest = loadLocalUnitManifest(stagingRoot);
 if (!manifest.units.length) throw new Error("LOCAL_WORKFLOW_UNITS_EMPTY: .woo/units.yaml에 검증할 unit이 필요합니다.");
 let foundLedger = false;
 for (const path of ledgerPaths) {
  const bytes = readContained(root, path, true);
  if (bytes !== undefined) { files.set(path, bytes); stage(stagingRoot, path, bytes); foundLedger = true; break; }
 }
 if (!foundLedger) throw new Error("LOCAL_WORKFLOW_LEDGER_MISSING: .www/control-ledger/traceability-v3.json 또는 traceability-v2.json이 필요합니다.");
 const skippedNotes: string[] = [];
 for (const unit of manifest.units) {
  if (!unit || typeof unit.code?.path !== "string") throw new Error("LOCAL_WORKFLOW_CODE_PATH_MISSING: unit.code.path가 필요합니다.");
  const code = readContained(root, unit.code.path)!;
  files.set(unit.code.path, code); stage(stagingRoot, unit.code.path, code);
  if (unit.obsidian !== undefined) {
   if (typeof unit.obsidian !== "string") throw new Error("LOCAL_WORKFLOW_OBSIDIAN_PATH_INVALID");
   const note = readContained(root, unit.obsidian, true);
   if (note === undefined) skippedNotes.push(unit.obsidian);
   else { files.set(unit.obsidian, note); stage(stagingRoot, unit.obsidian, note); }
  }
 }
 const digest = hash(JSON.stringify({ scope: "local-workflow-v1", root, files: [...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, bytes]) => [path, hash(bytes)]), skippedNotes: [...skippedNotes].sort() }));
 return { root, files, manifest, skippedNotes, digest };
}

/** Local preflight only: manifest/code declarations and local ledger links.
 * No remote Linear/Obsidian read-back, tests, or full workflow acceptance is
 * claimed. Obsidian paths are project-relative; available files are fingerprinted,
 * unavailable notes are explicitly excluded. Symlinks are refused conservatively.
 * The digest binds the canonical root and checked bytes; expected rejects stale
 * subjects. A detected change during verification returns uncertain.
 */
export async function verifyLocalWorkflow(projectRoot: string, expected?: { subjectDigest: string }): Promise<LocalWorkflowVerification> {
 let subjectDigest = hash(JSON.stringify({ root: resolve(projectRoot), unavailable: true }));
 let before: Snapshot | undefined;
 const stagingRoot = mkdtempSync(join(tmpdir(), "www-local-preflight-"));
 const result = (status: LocalWorkflowVerification["status"], issues: string[]): LocalWorkflowVerification => ({
  status, subjectDigest, issues, checkedAt: new Date().toISOString(),
  evidence: before ? [...before.files].sort(([a], [b]) => a.localeCompare(b)).map(([path, bytes]) => `local-readback:${path}:sha256:${hash(bytes)}`).concat(before.skippedNotes.map(path => `local-scope-excluded:obsidian:${path}`)) : [],
 });
 try {
  const root = realpathSync(projectRoot);
  before = snapshot(root, join(stagingRoot, "before")); subjectDigest = before.digest;
  const localManifest = { ...before.manifest, units: before.manifest.units.map(unit => before!.skippedNotes.includes(unit.obsidian ?? "") ? { ...unit, obsidian: undefined } : unit) };
  const issues = validateLocalUnitManifest(join(stagingRoot, "before"), localManifest, join(stagingRoot, "before"));
  // Yield once so concurrent edits are observed by the second read-back.
  await Promise.resolve();
  let after: Snapshot;
  try { after = snapshot(realpathSync(projectRoot), join(stagingRoot, "after")); }
  catch (error) { return result("uncertain", [`LOCAL_WORKFLOW_SOURCE_CHANGED: ${String(error)}`]); }
  if (after.digest !== before.digest) return result("uncertain", ["LOCAL_WORKFLOW_SOURCE_CHANGED: 검증 도중 원본이 바뀌었습니다. 다시 검증하세요."]);
  if (expected && expected.subjectDigest !== before.digest) issues.push("LOCAL_WORKFLOW_STALE: 이전 검증 이후 원본이 변경되었습니다. 다시 검증하세요.");
  return result(issues.length ? "failed" : "passed", issues);
 } catch (error) {
  return result(String(error).includes("LOCAL_WORKFLOW_SOURCE_CHANGED") ? "uncertain" : "failed", [String(error)]);
 } finally { rmSync(stagingRoot, { recursive: true, force: true }); }
}
