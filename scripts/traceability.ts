#!/usr/bin/env bun
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { TraceabilityLedger } from "../src/system/contracts/development-traceability.js";
import { parseWorkTraceabilityManifest } from "../src/system/contracts/work/traceability.js";
import { buildDevelopmentMap } from "../src/workflows/tui-development/adapters/development-map-builder.js";
import { digestLedger } from "../src/workflows/tui-development/adapters/traceability-digest.js";
import { DevelopmentStore } from "../src/workflows/tui-development/adapters/development-store.js";
import { validateTraceability } from "../src/workflows/tui-development/adapters/traceability-validator.js";
import { assertRepositoryReferencesExist } from "../src/system/adapters/work-reference-validator.js";
import { loadLinearContract, parseSnapshot, validate as validateLinearContract } from "./linear-contract.js";

export function resolveVaultRoot(projectRoot: string, vaultId: string, explicit?: string): string {
	if (explicit) return resolve(explicit);
	const env = process.env.WWW_OBSIDIAN_VAULT_ROOT;
	if (env) return resolve(env);
	try {
		const registry = JSON.parse(readFileSync(join(homedir(), "Library/Application Support/obsidian/obsidian.json"), "utf8"));
		if (registry.vaults?.[vaultId]?.path) return resolve(registry.vaults[vaultId].path);
	} catch { /* CI and non-macOS use the committed export below. */ }
	return resolve(projectRoot, ".www/vault");
}

function argument(argv: readonly string[], name: string): string | undefined {
	const index = argv.indexOf(name);
	return index >= 0 ? argv[index + 1] : undefined;
}

function repositoryArtifact(projectRoot: string, path: string, label: string): string {
	const root = realpathSync(projectRoot);
	const candidate = realpathSync(resolve(root, path));
	const local = relative(root, candidate);
	if (local === ".." || local.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(local)) {
		throw new Error(`${label} must stay inside the repository`);
	}
	return candidate;
}

function sha256(bytes: string | Buffer): string {
	return createHash("sha256").update(bytes).digest("hex");
}

type LinearReceipt = {
	artifactKind?: string; receiptVersion?: number; trustBoundary?: string; snapshotPath?: string; snapshotSha256?: string;
	issueUuidSetSha256?: string; queryStartedAt?: string; queryCompletedAt?: string; receivedAt?: string;
	pagination?: Array<{ query?: string; hasNextPage?: boolean; nextCursor?: string | null; issueIds?: string[] }>;
};

type VaultExportManifest = {
	status?: string; artifactKind?: string; vaultId?: string; exportRoot?: string; actualVaultRoot?: string; capturedAt?: string;
	files?: Array<{ noteId?: string; relativePath?: string; actualSha256?: string; exportSha256?: string; byteIdentical?: boolean }>;
};
type ValidVaultExportManifest = VaultExportManifest & {
	exportRoot: string; actualVaultRoot: string; files: NonNullable<VaultExportManifest["files"]>;
};

function readLinearReceipt(projectRoot: string, snapshotPath: string, receiptPath: string, enforceFreshness: boolean): unknown {
	const snapshotFile = repositoryArtifact(projectRoot, snapshotPath, "Linear snapshot");
	const receiptFile = repositoryArtifact(projectRoot, receiptPath, "Linear acquisition receipt");
	const bytes = readFileSync(snapshotFile);
	const snapshot = JSON.parse(bytes.toString()) as any;
	const receipt = JSON.parse(readFileSync(receiptFile, "utf8")) as LinearReceipt;
	if (receipt.artifactKind !== "external-linear-mcp-acquisition-receipt" || receipt.receiptVersion !== 1 || receipt.trustBoundary !== "external-mcp-ingestion") throw new Error("Linear acquisition receipt has an invalid boundary");
	if (repositoryArtifact(projectRoot, receipt.snapshotPath ?? "", "Receipt snapshot") !== snapshotFile || receipt.snapshotSha256 !== sha256(bytes)) throw new Error("Linear acquisition receipt snapshot hash differs");
	const issues = parseSnapshot(snapshot);
	const uuidSet = issues.map(issue => `${issue.id}:${issue.uuid}`).sort().join("\n");
	if (receipt.issueUuidSetSha256 !== sha256(uuidSet)) throw new Error("Linear acquisition receipt issue UUID set differs");
	const times = [receipt.queryStartedAt, receipt.queryCompletedAt, receipt.receivedAt];
	if (times.some(value => !value || Number.isNaN(Date.parse(value)))) throw new Error("Linear acquisition receipt timestamps are incomplete");
	const [started, completed, received] = times.map(value => Date.parse(value!));
	if (!(started <= completed && completed <= received) || snapshot.capturedAt !== receipt.queryCompletedAt) throw new Error("Linear acquisition receipt timestamp order differs");
	if (!Array.isArray(receipt.pagination) || !receipt.pagination.length || receipt.pagination.some(page => page.hasNextPage !== false || page.nextCursor !== null || !Array.isArray(page.issueIds))) throw new Error("Linear acquisition receipt does not prove complete pagination");
	const receiptIds = [...new Set(receipt.pagination.flatMap(page => page.issueIds ?? []))].sort();
	const snapshotIds = issues.map(issue => issue.id).sort();
	if (JSON.stringify(receiptIds) !== JSON.stringify(snapshotIds)) throw new Error("Linear acquisition receipt page issue set differs");
	if (enforceFreshness && (Date.now() - received > 24 * 60 * 60 * 1000 || received > Date.now() + 5 * 60 * 1000)) throw new Error("Linear acquisition receipt is stale or future-dated");
	return snapshot;
}

function readVaultExportManifest(projectRoot: string, ledger: TraceabilityLedger, manifestPath: string): ValidVaultExportManifest {
	const manifest = JSON.parse(readFileSync(repositoryArtifact(projectRoot, manifestPath, "Vault export manifest"), "utf8")) as VaultExportManifest;
	if (manifest.status !== "PASS" || manifest.artifactKind !== "actual-vault-byte-readback" || manifest.vaultId !== ledger.vault.id || !manifest.exportRoot || !manifest.actualVaultRoot || !manifest.capturedAt || Number.isNaN(Date.parse(manifest.capturedAt)) || !Array.isArray(manifest.files)) {
		throw new Error("Vault export provenance manifest is incomplete");
	}
	return manifest as ValidVaultExportManifest;
}

function vaultExportRoot(projectRoot: string, ledger: TraceabilityLedger, manifestPath: string): string {
	const manifest = readVaultExportManifest(projectRoot, ledger, manifestPath);
	const root = repositoryArtifact(projectRoot, manifest.exportRoot, "Vault export root");
	const expected = ledger.notes.map(note => `${note.id}:${note.relativePath}`).sort();
	const actual = manifest.files.map(file => `${file.noteId}:${file.relativePath}`).sort();
	if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Vault export manifest note set differs from relation ledger");
	for (const file of manifest.files) {
		const bytes = readFileSync(resolve(root, ledger.vault.relativeRoot, file.relativePath!));
		const digest = createHash("sha256").update(bytes).digest("hex");
		if (!file.byteIdentical || file.actualSha256 !== file.exportSha256 || digest !== file.exportSha256) throw new Error(`${file.noteId}: Vault export hash/provenance mismatch`);
	}
	return root;
}

function receiptVaultRoot(projectRoot: string, ledger: TraceabilityLedger, manifestPath: string, explicitVault: string): string {
	const manifest = readVaultExportManifest(projectRoot, ledger, manifestPath);
	const requested = realpathSync(resolve(explicitVault));
	const acquired = realpathSync(resolve(manifest.actualVaultRoot));
	if (requested !== acquired) throw new Error("receipt-check --vault-root differs from the manifest actualVaultRoot");
	return requested;
}

export async function runTraceability(argv = process.argv.slice(2)): Promise<string> {
	const projectRoot = resolve(argument(argv, "--project-root") ?? resolve(import.meta.dir, ".."));
	const ledger = JSON.parse(readFileSync(resolve(projectRoot, ".www/control-ledger/traceability-v2.json"), "utf8")) as TraceabilityLedger;
	const workManifest = parseWorkTraceabilityManifest(JSON.parse(readFileSync(resolve(projectRoot, ".www/control-ledger/traceability.json"), "utf8")));
	await assertRepositoryReferencesExist(workManifest, projectRoot);
	const command = argv[0] ?? "check";
	const mapPath = resolve(projectRoot, ".www/Development-Map.md");
	if (command === "map:build") {
		writeFileSync(mapPath, buildDevelopmentMap(readFileSync(mapPath, "utf8"), ledger, workManifest));
		return `Development Map generated: ${ledger.issues.length} issues`;
	}
	if (command === "map:check") {
		const current = readFileSync(mapPath, "utf8");
		if (buildDevelopmentMap(current, ledger, workManifest) !== current) throw new Error("Development Map is stale; run `bun run development-map:build`");
		return `Development Map current: ${ledger.issues.length} issues`;
	}
	if (command === "rebuild") {
		const store = new DevelopmentStore({ projectRoot, dataRoot: argument(argv, "--data-root") });
		try { return JSON.stringify(store.rebuildTraceability()); } finally { store.close(); }
	}
	if (command === "query") {
		const [kind, id] = argv.slice(1) as ["issue" | "unit" | "run" | "note", string];
		if (!kind || !id) throw new Error("query requires <issue|unit|run|note> <id>");
		const store = new DevelopmentStore({ projectRoot, dataRoot: argument(argv, "--data-root") });
		try { return JSON.stringify(store.queryTraceability(kind, id), null, 2); } finally { store.close(); }
	}
	if (command !== "check" && command !== "receipt-check") throw new Error(`Unknown traceability command: ${command}`);
	const linearPath = argument(argv, "--linear-snapshot");
	if (!linearPath) throw new Error(`${command} requires an explicit --linear-snapshot artifact`);
	const receiptPath = argument(argv, "--linear-receipt");
	if (!receiptPath) throw new Error(`${command} requires an explicit --linear-receipt artifact`);
	const linearArtifact = readLinearReceipt(projectRoot, linearPath, receiptPath, command === "receipt-check") as any;
	const linearSnapshot = parseSnapshot(linearArtifact) as Array<ReturnType<typeof parseSnapshot>[number] & { uuid: string }>;
	const contract = loadLinearContract(projectRoot);
	const contractErrors = [
		...validateLinearContract(linearSnapshot, undefined, contract, "Chat"),
		...validateLinearContract(linearSnapshot, undefined, contract, "Traceability"),
	];
	if (contractErrors.length) throw new Error(contractErrors.join("\n"));
	let vaultRoot: string;
	if (command === "check") {
		const manifestPath = argument(argv, "--vault-export-manifest");
		if (!manifestPath) throw new Error("check requires an explicit --vault-export-manifest artifact");
		vaultRoot = vaultExportRoot(projectRoot, ledger, manifestPath);
	} else {
		const explicitVault = argument(argv, "--vault-root");
		if (!explicitVault) throw new Error("receipt-check requires an explicit --vault-root");
		const manifestPath = argument(argv, "--vault-export-manifest");
		if (!manifestPath) throw new Error("receipt-check requires an explicit --vault-export-manifest artifact");
		vaultRoot = receiptVaultRoot(projectRoot, ledger, manifestPath, explicitVault);
	}
	const errors = await validateTraceability({ projectRoot, ledger, vaultRoot, linearSnapshot });
	if (errors.length) throw new Error(errors.join("\n"));
	const current = readFileSync(mapPath, "utf8");
	if (buildDevelopmentMap(current, ledger, workManifest) !== current) throw new Error("Development Map is stale; run `bun run development-map:build`");
	const temp = mkdtempSync(join(tmpdir(), "www-traceability-check-"));
	try {
		const store = new DevelopmentStore({ projectRoot, dataRoot: temp });
		const first = store.rebuildTraceability();
		const probes = [store.queryTraceability("issue", ledger.issues[0]!.id), store.queryTraceability("unit", ledger.units[0]!.key), store.queryTraceability("run", ledger.runs[0]!.id), store.queryTraceability("note", ledger.notes[0]!.id)];
		store.close();
		rmSync(join(temp, "development", "index.sqlite"), { force: true });
		rmSync(join(temp, "development", "index.sqlite-wal"), { force: true });
		rmSync(join(temp, "development", "index.sqlite-shm"), { force: true });
		const rebuilt = new DevelopmentStore({ projectRoot, dataRoot: temp });
		const second = rebuilt.rebuildTraceability();
		rebuilt.close();
		if (first.logicalDigest !== second.logicalDigest || probes.some(probe => probe.logicalDigest !== first.logicalDigest)) throw new Error("SQLite rebuild/query logical digest mismatch");
		const prefix = command === "receipt-check" ? "Fresh external-receipt traceability OK" : "Traceability OK";
		return `${prefix}: ${ledger.units.length} Units, ${ledger.issues.length} issues, ${ledger.notes.length} notes, ${ledger.edges.length} edges, digest ${digestLedger(ledger)}`;
	} finally { rmSync(temp, { recursive: true, force: true }); }
}

if (import.meta.main) runTraceability().then(console.log).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
