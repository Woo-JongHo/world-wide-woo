#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import type { RegistryEnvelope, TraceabilityLedger, TraceabilityRef } from "../src/core/domain/development-traceability.js";
import type { ProjectActivity } from "../src/core/domain/project-activity.js";
import { createExecutionRun, normalizeProjectActivity, replayExecutionRun, type CompletionReceipt } from "../src/core/runtime/execution-run.js";
import { parseWorkTraceabilityManifest } from "../src/core/domain/work/traceability.js";
import { buildDevelopmentMap } from "../src/adapters/outbound/development-map-builder.js";
import { DevelopmentStore } from "../src/adapters/outbound/development-store.js";
import { canonicalDigest, migrateTraceabilityV2ToV3, requiredCoverageFromRegistries, sha256, validateVerificationReceipt, verificationReceiptFromCompletion, type VerificationReceiptCompletionContext } from "../src/adapters/outbound/development-traceability-contract.js";
import { validateTraceability } from "../src/adapters/outbound/traceability-validator.js";

export function resolveVaultRoot(projectRoot: string, _vaultId: string, explicit?: string): string {
	return resolve(explicit ?? process.env.WWW_OBSIDIAN_VAULT_ROOT ?? join(projectRoot, ".www/vault"));
}
const argument = (argv: readonly string[], name: string) => { const index = argv.indexOf(name); return index < 0 ? undefined : argv[index + 1]; };
const ledgerPath = (root: string) => resolve(root, ".www/control-ledger/traceability-v3.json");
const loadLedger = (root: string) => JSON.parse(readFileSync(ledgerPath(root), "utf8")) as TraceabilityLedger;
const containedPath = (root: string, value: string | undefined, name: string): string => {
	if (!value) throw new Error(`${name.toUpperCase()}_REQUIRED`);
	const canonicalRoot = realpathSync(root);
	const path = resolve(canonicalRoot, value);
	let existing = path;
	while (!existsSync(existing) && existing !== dirname(existing)) existing = dirname(existing);
	const canonicalExisting = realpathSync(existing);
	if (canonicalExisting !== canonicalRoot && !canonicalExisting.startsWith(`${canonicalRoot}/`)) throw new Error(`${name.toUpperCase()}_MUST_BE_CONTAINED`);
	return path;
};
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const activityFromJournal = (value: unknown): ProjectActivity => {
	if (!record(value)
		|| value.schemaVersion !== 1
		|| typeof value.id !== "string" || !value.id
		|| typeof value.projectId !== "string" || !value.projectId
		|| !Number.isSafeInteger(value.sequence) || (value.sequence as number) < 1
		|| typeof value.recordedAt !== "string" || !Number.isFinite(Date.parse(value.recordedAt))
		|| !["message", "tool", "approval", "progress", "file-change"].includes(value.kind as string)
		|| !["started", "updated", "completed", "failed", "cancelled"].includes(value.phase as string)
		|| typeof value.provider !== "string" || !value.provider
		|| !record(value.nativeRefs)
		|| typeof value.sourceDigest !== "string" || !/^sha256:[a-f0-9]{64}$/iu.test(value.sourceDigest)
		|| !record(value.payload)) throw new Error("JOURNAL_PROJECT_ACTIVITY_REQUIRED");
	return value as unknown as ProjectActivity;
};
const completionReceiptFromJournal = (activity: ProjectActivity): CompletionReceipt | null => {
	const receiptValue = activity.kind === "progress" && activity.payload.method === "execution/completion-receipt"
		? activity.payload.receipt
		: null;
	if (receiptValue === null || receiptValue === undefined) return null;
	if (!receiptValue || typeof receiptValue !== "object") throw new Error("JOURNAL_COMPLETION_RECEIPT_ENVELOPE_REQUIRED");
	const receipt = receiptValue as Partial<CompletionReceipt>;
	if (typeof receipt.receiptId !== "string" || !/^[a-f0-9]{64}$/iu.test(receipt.receiptId)
		|| !/^[a-f0-9]{64}$/iu.test(receipt.receiptDigest ?? "")
		|| typeof receipt.runId !== "string" || typeof receipt.threadId !== "string" || typeof receipt.turnId !== "string"
		|| !record(receipt.terminalSource) || typeof receipt.terminalSource.id !== "string"
		|| !Number.isSafeInteger(receipt.terminalSource.sequence) || !/^sha256:[a-f0-9]{64}$/iu.test(receipt.terminalSource.sourceDigest as string)
		|| !/^[a-f0-9]{64}$/iu.test(receipt.checkpointDigest ?? "")
		|| !["completed", "cancelled", "interrupted", "failed"].includes(receipt.status ?? "")
		|| !Array.isArray(receipt.evidenceRefs)
		|| !receipt.evidenceRefs.every(item => item && typeof item.activityId === "string" && Number.isSafeInteger(item.sequence) && /^sha256:[a-f0-9]{64}$/iu.test(item.sourceDigest))) throw new Error("JOURNAL_COMPLETION_RECEIPT_INVALID");
	return receipt as CompletionReceipt;
};
const verifiedCompletionReceipt = (receipt: CompletionReceipt): CompletionReceipt => {
	const terminalSource = receipt.terminalSource;
	const receiptId = sha256(JSON.stringify(["completion-receipt-v1", receipt.runId, terminalSource]));
	const bare = {
		receiptId, runId: receipt.runId, threadId: receipt.threadId, turnId: receipt.turnId, status: receipt.status,
		objective: receipt.objective, changed: receipt.changed, verification: receipt.verification, evidenceRefs: receipt.evidenceRefs,
		remaining: receipt.remaining, completedAt: receipt.completedAt, terminalSource, checkpointDigest: receipt.checkpointDigest,
	};
	if (receipt.receiptId !== receiptId || receipt.receiptDigest !== sha256(JSON.stringify(bare))) throw new Error("JOURNAL_COMPLETION_RECEIPT_DIGEST_MISMATCH");
	return receipt;
};
export const selectedCompletionReceipt = (text: string, receiptId: string | undefined): CompletionReceipt => {
	if (!receiptId) throw new Error("RUNTIME_RECEIPT_ID_REQUIRED");
	const activities = text.split(/\r?\n/u).filter(Boolean).map((line) => activityFromJournal(JSON.parse(line) as unknown));
	const ids = new Set<string>(), sequences = new Set<number>(), projectIds = new Set<string>();
	for (const activity of activities) {
		if (ids.has(activity.id) || sequences.has(activity.sequence)) throw new Error("JOURNAL_ACTIVITY_ID_OR_SEQUENCE_DUPLICATE");
		ids.add(activity.id); sequences.add(activity.sequence); projectIds.add(activity.projectId);
	}
	if (projectIds.size !== 1) throw new Error("JOURNAL_PROJECT_IDENTITY_MISMATCH");
	const ordered = [...activities].sort((left, right) => left.sequence - right.sequence);
	if (ordered.some((activity, index) => activity.sequence !== index + 1)) throw new Error("JOURNAL_ACTIVITY_SEQUENCE_GAP");
	const receipts = ordered.flatMap(activity => {
		const receipt = completionReceiptFromJournal(activity);
		return receipt?.receiptId === receiptId ? [{ activity, receipt }] : [];
	});
	if (receipts.length !== 1) throw new Error("JOURNAL_COMPLETION_RECEIPT_UNIQUE_REQUIRED");
	const selected = receipts[0]!;
	const receipt = verifiedCompletionReceipt(selected.receipt);
	const { threadId, turnId } = selected.activity.nativeRefs;
	if (!threadId || !turnId || receipt.threadId !== threadId || receipt.turnId !== turnId || receipt.runId !== `${threadId}:${turnId}`) throw new Error("JOURNAL_RECEIPT_PROJECT_THREAD_TURN_MISMATCH");
	const events = ordered
		.filter(activity => activity.nativeRefs.threadId === threadId && activity.nativeRefs.turnId === turnId)
		.filter(activity => completionReceiptFromJournal(activity) === null)
		.map(normalizeProjectActivity);
	const hash = { sha256Hex: (input: Uint8Array) => sha256(Buffer.from(input)) };
	const replayed = replayExecutionRun(createExecutionRun({ runId: receipt.runId, threadId, turnId, hash }), events, hash);
	const reconstructed = replayed.receipt;
	if (!reconstructed || replayed.rejectedEventIds.length
		|| reconstructed.receiptId !== receipt.receiptId
		|| reconstructed.receiptDigest !== receipt.receiptDigest
		|| reconstructed.checkpointDigest !== receipt.checkpointDigest
		|| !sameJson(reconstructed.terminalSource, receipt.terminalSource)
		|| !sameJson(reconstructed.evidenceRefs, receipt.evidenceRefs)) throw new Error("JOURNAL_COMPLETION_RECEIPT_REPLAY_MISMATCH");
	return receipt;
};
const sameJson = (left: unknown, right: unknown) => canonicalDigest(left) === canonicalDigest(right);
const observedRevision = (projectRoot: string): string => {
	const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: projectRoot, encoding: "utf8" }).trim();
	if (!/^[a-f0-9]{40}$/u.test(head)) throw new Error("GIT_REVISION_INVALID");
	const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: projectRoot, encoding: "utf8" }).trim().length > 0;
	return dirty ? `worktree:${head}:dirty` : `git:${head}`;
};
const writeImmutableJson = (path: string, value: unknown): void => {
	if (existsSync(path)) throw new Error("VERIFICATION_RECEIPT_ALREADY_EXISTS");
	mkdirSync(resolve(path, ".."), { recursive: true });
	const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
	try {
		writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
		renameSync(temporary, path);
	} catch (error) {
		rmSync(temporary, { force: true });
		throw error;
	}
};

export async function runTraceability(argv = process.argv.slice(2)): Promise<string> {
	const projectRoot = resolve(argument(argv, "--project-root") ?? resolve(import.meta.dir, ".."));
	const command = argv[0] ?? "check";
	if (command === "receipt-from-runtime") {
		const journal = containedPath(projectRoot, argument(argv, "--journal"), "journal");
		const contextPath = containedPath(projectRoot, argument(argv, "--context"), "context");
		const output = containedPath(projectRoot, argument(argv, "--output"), "output");
		const completion = selectedCompletionReceipt(readFileSync(journal, "utf8"), argument(argv, "--runtime-receipt-id"));
		const context = JSON.parse(readFileSync(contextPath, "utf8")) as VerificationReceiptCompletionContext;
		const ledger = loadLedger(projectRoot);
		const required = requiredCoverageFromRegistries(projectRoot, ledger, {
			acceptanceCoverage: context.acceptanceCoverage,
			exceptionCoverage: context.exceptionStageCoverage,
		});
		if (!sameJson([...context.requiredAcceptanceRefs].sort(), required.requiredAcceptances)
			|| !sameJson([...context.applicableExceptionStages].sort((a, b) => a.exceptionRef.localeCompare(b.exceptionRef)), required.importantStages)) throw new Error("RECEIPT_CONTEXT_REQUIRED_COVERAGE_MISMATCH");
		const revision = observedRevision(projectRoot);
		if (context.observedSourceRevision !== revision) throw new Error("RECEIPT_SOURCE_REVISION_MISMATCH");
		const receipt = verificationReceiptFromCompletion(completion, context);
		const errors = validateVerificationReceipt(receipt, context.observedSourceRevision);
		if (errors.length) throw new Error(errors.join("\n"));
		writeImmutableJson(output, receipt);
		const receiptEntity = ledger.entities.find((entity) => entity.ref === `receipt:${receipt.id}`);
		if (!receiptEntity) throw new Error("RECEIPT_LEDGER_ENTITY_REQUIRED");
		receiptEntity.source = { path: relative(realpathSync(projectRoot), realpathSync(output)), digest: sha256(readFileSync(output)) };
		const revisionRef = `git-revision:${revision}` as const;
		if (!ledger.entities.some((entity) => entity.ref === revisionRef)) {
			ledger.entities.push({ ref: revisionRef, kind: "git-revision", id: revision });
		}
		ledger.edges = ledger.edges.filter((edge) => edge.from !== receiptEntity.ref || edge.relation !== "at-revision");
		ledger.edges.push({ from: receiptEntity.ref, relation: "at-revision", to: revisionRef });
		const staleEvidenceRefs = new Set(ledger.edges
			.filter(edge => edge.from === receiptEntity.ref && (edge.relation === "produced" || edge.relation === "evidenced-by"))
			.map(edge => edge.to));
		ledger.edges = ledger.edges.filter(edge => edge.from !== receiptEntity.ref || (edge.relation !== "produced" && edge.relation !== "evidenced-by"));
		for (const evidence of receipt.evidence) {
			const ref = `evidence:${evidence.id}` as TraceabilityRef;
			const source = { path: evidence.path, digest: evidence.sha256 };
			const index = ledger.entities.findIndex(entity => entity.ref === ref);
			if (index < 0) ledger.entities.push({ ref, kind: "evidence", id: evidence.id, immutable: true, source });
			else ledger.entities[index] = { ...ledger.entities[index]!, kind: "evidence", id: evidence.id, immutable: true, source };
			ledger.edges.push({ from: receiptEntity.ref, relation: "produced", to: ref }, { from: receiptEntity.ref, relation: "evidenced-by", to: ref });
		}
		ledger.entities = ledger.entities.filter(entity => entity.kind !== "evidence" || !staleEvidenceRefs.has(entity.ref) || ledger.edges.some(edge => edge.from === entity.ref || edge.to === entity.ref));
		ledger.entities.sort((left, right) => left.ref.localeCompare(right.ref));
		ledger.edges.sort((left, right) => left.from.localeCompare(right.from) || left.relation.localeCompare(right.relation) || left.to.localeCompare(right.to));
		const { payloadDigest: _ledgerDigest, ...ledgerBody } = ledger;
		ledger.payloadDigest = canonicalDigest(ledgerBody);
		const ledgerTemporary = `${ledgerPath(projectRoot)}.${process.pid}.${Date.now()}.tmp`;
		writeFileSync(ledgerTemporary, `${JSON.stringify(ledger, null, 2)}\n`, { flag: "wx" });
		renameSync(ledgerTemporary, ledgerPath(projectRoot));
		return JSON.stringify({ id: receipt.id, payloadDigest: receipt.payloadDigest });
	}
	if (command === "migrate-v2") {
		const input = resolve(projectRoot, argument(argv, "--input") ?? ".www/control-ledger/traceability-v2.json");
		const output = resolve(projectRoot, argument(argv, "--output") ?? ".www/control-ledger/traceability-v3.json");
		const migrated = migrateTraceabilityV2ToV3(JSON.parse(readFileSync(input, "utf8")));
		const content = `${JSON.stringify(migrated, null, 2)}\n`;
		if (existsSync(output) && readFileSync(output, "utf8") !== content) throw new Error("V3_MIGRATION_OUTPUT_DIFFERS");
		if (!existsSync(output)) writeFileSync(output, content, { flag: "wx" });
		return JSON.stringify({ inputDigest: canonicalDigest(JSON.parse(readFileSync(input, "utf8"))), outputDigest: migrated.payloadDigest });
	}
	const ledger = loadLedger(projectRoot);
	if (command === "map:build" || command === "map:check") {
		const mapPath = resolve(projectRoot, ".www/Development-Map.md");
		const manifestPath = resolve(projectRoot, ".www/control-ledger/traceability.json");
		const manifest = existsSync(manifestPath) ? parseWorkTraceabilityManifest(JSON.parse(readFileSync(manifestPath, "utf8"))) : undefined;
		const rendered = buildDevelopmentMap(readFileSync(mapPath, "utf8"), ledger, manifest);
		if (command === "map:check") { if (rendered !== readFileSync(mapPath, "utf8")) throw new Error("Development Map is stale"); }
		else writeFileSync(mapPath, rendered);
		return `Development Map current: ${ledger.entities.filter(entity => entity.kind === "issue").length} issues`;
	}
	if (command === "rebuild") { const store = new DevelopmentStore({ projectRoot, dataRoot: argument(argv, "--data-root") }); try { return JSON.stringify(store.rebuildTraceability()); } finally { store.close(); } }
	if (command === "query") {
		const [kind, id] = argv.slice(1) as ["spec" | "acceptance" | "test" | "exception", string];
		if (!kind || !id || !["spec", "acceptance", "test", "exception"].includes(kind)) throw new Error("query requires <spec|acceptance|test|exception> <id>");
		const store = new DevelopmentStore({ projectRoot, dataRoot: argument(argv, "--data-root") }); try { return JSON.stringify(store.queryTraceability(kind, id), null, 2); } finally { store.close(); }
	}
	if (command === "coverage") {
		const [kind, id] = argv.slice(1) as ["spec", string];
		if (kind !== "spec" || !id) throw new Error("coverage requires spec <id>");
		const store = new DevelopmentStore({ projectRoot, dataRoot: argument(argv, "--data-root") }); try { return JSON.stringify(store.coverageForSpec(id), null, 2); } finally { store.close(); }
	}
	if (command === "drift" || command === "orphans") {
		const store = new DevelopmentStore({ projectRoot, dataRoot: argument(argv, "--data-root") });
		try { return JSON.stringify(command === "drift" ? store.traceabilityDrift() : store.traceabilityOrphans(), null, 2); } finally { store.close(); }
	}
	const linearSnapshotPath = containedPath(projectRoot, argument(argv, "--linear-snapshot"), "linear-snapshot");
	const linearReceiptPath = containedPath(projectRoot, argument(argv, "--linear-receipt"), "linear-receipt");
	const vaultManifestPath = containedPath(projectRoot, argument(argv, "--vault-export-manifest"), "vault-export-manifest");
	const linearSnapshot = JSON.parse(readFileSync(linearSnapshotPath, "utf8")) as { issues?: readonly unknown[] };
	const linearReceipt = JSON.parse(readFileSync(linearReceiptPath, "utf8")) as { snapshotPath?: string; snapshotSha256?: string };
	if (linearReceipt.snapshotPath !== relative(realpathSync(projectRoot), realpathSync(linearSnapshotPath))
		|| linearReceipt.snapshotSha256 !== sha256(readFileSync(linearSnapshotPath))) {
		throw new Error("LINEAR_READBACK_RECEIPT_MISMATCH");
	}
	const vaultManifest = JSON.parse(readFileSync(vaultManifestPath, "utf8")) as {
		status?: string;
		actualVaultRoot?: string;
		sourceRevision?: string;
		files?: readonly {
			noteId?: string;
			actualPath?: string;
			exportPath?: string;
			byteIdentical?: boolean;
			actualSha256?: string;
			exportSha256?: string;
		}[];
	};
	if (vaultManifest.status !== "PASS" || !vaultManifest.files?.length
		|| vaultManifest.files.some((file) => !file.byteIdentical || file.actualSha256 !== file.exportSha256)) {
		throw new Error("VAULT_EXPORT_PROVENANCE_MISMATCH");
	}
	if (!vaultManifest.actualVaultRoot || !vaultManifest.sourceRevision) throw new Error("VAULT_EXPORT_PROVENANCE_MISMATCH");
	if (vaultManifest.sourceRevision !== observedRevision(projectRoot)) throw new Error("VAULT_EXPORT_SOURCE_REVISION_MISMATCH");
	const actualVaultRoot = realpathSync(vaultManifest.actualVaultRoot);
	const seenVaultNotes = new Set<string>();
	for (const file of vaultManifest.files) {
		if (!file.noteId || seenVaultNotes.has(file.noteId) || !file.actualPath || !file.exportPath) {
			throw new Error("VAULT_EXPORT_NOTE_IDENTITY_MISMATCH");
		}
		seenVaultNotes.add(file.noteId);
		const actualPath = realpathSync(file.actualPath);
		if (actualPath !== actualVaultRoot && !actualPath.startsWith(`${actualVaultRoot}/`)) {
			throw new Error("VAULT_ACTUAL_PATH_ESCAPES_ROOT");
		}
		const exportPath = containedPath(projectRoot, file.exportPath, "vault-export");
		const actualDigest = sha256(readFileSync(actualPath));
		const exportDigest = sha256(readFileSync(exportPath));
		if (actualDigest !== file.actualSha256 || exportDigest !== file.exportSha256 || actualDigest !== exportDigest) {
			throw new Error("VAULT_EXPORT_BYTE_DIGEST_MISMATCH");
		}
	}
	const requiredNoteIds = ledger.entities.filter((entity) => entity.kind === "note").map((entity) => entity.id).sort();
	const manifestNoteIds = new Set([...seenVaultNotes].filter((id) => id.startsWith("WOO-")));
	if (requiredNoteIds.some((id) => !manifestNoteIds.has(id))) {
		throw new Error("VAULT_EXPORT_NOTE_COVERAGE_MISMATCH");
	}
	const errors = await validateTraceability({
		projectRoot,
		ledger,
		vaultRoot: resolveVaultRoot(projectRoot, ""),
		linearSnapshot: linearSnapshot.issues ?? [],
	});
	if (errors.length) throw new Error(errors.join("\n"));
	const temp = mkdtempSync(join(tmpdir(), "www-traceability-check-"));
	try {
		const store = new DevelopmentStore({ projectRoot, dataRoot: temp }); const first = store.rebuildTraceability(); store.close();
		for (const suffix of ["", "-wal", "-shm"]) rmSync(join(temp, "development", `index.sqlite${suffix}`), { force: true });
		const rebuilt = new DevelopmentStore({ projectRoot, dataRoot: temp }); const second = rebuilt.rebuildTraceability(); rebuilt.close();
		if (first.logicalDigest !== second.logicalDigest || first.rowDigest !== second.rowDigest) throw new Error("SQLite rebuild digest mismatch");
		return `Traceability OK: ${ledger.entities.length} entities, ${ledger.edges.length} edges, digest ${first.logicalDigest}`;
	} finally { rmSync(temp, { recursive: true, force: true }); }
}
if (import.meta.main) runTraceability().then(console.log).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
