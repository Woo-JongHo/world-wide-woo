import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import type { ExceptionContract, RegistryEnvelope, SpecContract, TestContract, TraceabilityEdge, TraceabilityLedger, TraceabilityRef } from "../../../core/domain/development/development-traceability.js";
import { obsidianWikiTarget } from "../../../core/domain/development/obsidian-contract.js";
import { canonicalDigest, sha256, validateLedger, validateRegistryEnvelope } from "./development-traceability-contract.js";
import { inspectObsidianVault, type ObsidianInspectOptions, type ObsidianVaultDocument } from "./obsidian-contract.js";

export interface ObsidianLedgerMigrationAction {
	kind: "create" | "replace" | "refresh";
	createsIssue: boolean;
	linearId: string;
	from?: TraceabilityRef;
	to: TraceabilityRef;
	path: string;
	digest: string;
}

export interface ObsidianLedgerMigrationPreview {
	schemaVersion: 1;
	sourceLedgerDigest: string;
	vaultDigest: string;
	actions: ObsidianLedgerMigrationAction[];
	candidate: TraceabilityLedger;
	digest: string;
	workflow: {
		vaultRename: "separate-preview-required";
		ledgerMigration: "previewed";
		sqliteRebuild: "pending-after-ledger-apply";
		linearUriUpdate: "separate-draft-readback-required";
	};
}

interface ObsidianLedgerMigrationOptions extends ObsidianInspectOptions { projectRoot?: string }

const withoutDigest = <T extends { digest: string }>(value: T): Omit<T, "digest"> => {
	const { digest: _, ...body } = value;
	return body;
};
const previewDigest = (value: Omit<ObsidianLedgerMigrationPreview, "digest">): string => canonicalDigest(value);
const edgeKey = (edge: TraceabilityEdge): string => `${edge.from}|${edge.relation}|${edge.to}`;
const cloneLedger = (ledger: TraceabilityLedger): TraceabilityLedger => JSON.parse(JSON.stringify(ledger)) as TraceabilityLedger;
const canonicalDocuments = (documents: readonly ObsidianVaultDocument[]) => documents.filter((document): document is ObsidianVaultDocument & {
	documentId: string;
	linearId: string;
	properties: NonNullable<ObsidianVaultDocument["properties"]>;
} => Boolean(document.documentId && document.linearId && document.properties));

function aliases(document: ObsidianVaultDocument): string[] {
	const path = document.relativePath.replace(/\.md$/u, "");
	return [path, path.split("/").at(-1)!];
}

const registryDirectory = { spec: "specs", "test-contract": "tests", exception: "exceptions", decision: "decisions" } as const;
type RegistryKind = keyof typeof registryDirectory;

function importDeclaredRegistry(candidate: TraceabilityLedger, projectRoot: string | undefined, kind: RegistryKind, id: string): TraceabilityRef {
	const current = candidate.entities.filter(entity => entity.kind === kind && entity.id === id).sort((left, right) => (right.version ?? 0) - (left.version ?? 0))[0];
	if (current) return current.ref;
	if (!projectRoot) throw new Error(`OBSIDIAN_PROPERTY_ENTITY_MISSING:${kind}:${id}`);
	const path = resolve(projectRoot, `.www/control-ledger/registry/${registryDirectory[kind]}/${id}.json`);
	if (!existsSync(path)) throw new Error(`OBSIDIAN_PROPERTY_REGISTRY_MISSING:${kind}:${id}`);
	const bytes = readFileSync(path);
	const envelope = JSON.parse(bytes.toString("utf8")) as RegistryEnvelope<SpecContract & TestContract & ExceptionContract>;
	const errors = validateRegistryEnvelope(envelope);
	if (errors.length || envelope.kind !== kind || envelope.id !== id) throw new Error(`OBSIDIAN_PROPERTY_REGISTRY_INVALID:${kind}:${id}:${errors.join(",")}`);
	const ref = `${kind}:${id}@v${envelope.version}` as TraceabilityRef;
	candidate.entities.push({ ref, kind, id, version: envelope.version, immutable: true, source: { path: relative(projectRoot, path).replaceAll("\\", "/"), digest: sha256(bytes) } });
	return ref;
}

/** Build the exact candidate ledger without mutating either Git or the Vault. */
export function createObsidianLedgerMigrationPreview(
	ledgerBytes: string,
	vaultRoot: string,
	options: ObsidianLedgerMigrationOptions = {},
): ObsidianLedgerMigrationPreview {
	const ledger = JSON.parse(ledgerBytes) as TraceabilityLedger;
	const inspected = inspectObsidianVault(vaultRoot, options);
	const blocking = inspected.issues.filter(problem => problem.code !== "PATH_DRIFT");
	if (blocking.length) throw new Error(`OBSIDIAN_CONTRACT_BLOCKED:${blocking.map(problem => `${problem.code}:${problem.path}`).join(",")}`);
	const documents = canonicalDocuments(inspected.documents);
	if (!documents.length) throw new Error("OBSIDIAN_CANONICAL_DOCUMENT_REQUIRED");
	const candidate = cloneLedger(ledger);
	const replacements = new Map<TraceabilityRef, TraceabilityRef>();
	const actions: ObsidianLedgerMigrationAction[] = [];
	const declaredRefs = new Map<string, TraceabilityRef>();
	const resolveDeclared = (kind: RegistryKind | "unit", id: string): TraceabilityRef => {
		const key = `${kind}:${id}`;
		const cached = declaredRefs.get(key);
		if (cached) return cached;
		const ref = kind === "unit"
			? candidate.entities.find(entity => entity.kind === kind && entity.id === id)?.ref
			: importDeclaredRegistry(candidate, options.projectRoot, kind, id);
		if (!ref) throw new Error(`OBSIDIAN_PROPERTY_ENTITY_MISSING:${kind}:${id}`);
		declaredRefs.set(key, ref);
		return ref;
	};
	for (const document of documents) {
		const issueRef = `issue:${document.linearId}` as TraceabilityRef;
		const detailEdges = candidate.edges.filter(edge => edge.from === issueRef && edge.relation === "detailed-by");
		if (detailEdges.length > 1) throw new Error(`OBSIDIAN_LINEAR_DETAIL_EDGE_UNIQUE_REQUIRED:${issueRef}`);
		const createsIssue = !candidate.entities.some(entity => entity.ref === issueRef && entity.kind === "issue");
		if (createsIssue) candidate.entities.push({ ref: issueRef, kind: "issue", id: document.linearId });
		const from = detailEdges[0]?.to;
		const old = from ? candidate.entities.find(entity => entity.ref === from) : undefined;
		if (from && (!old || old.kind !== "note")) throw new Error(`OBSIDIAN_LEGACY_NOTE_MISSING:${from}`);
		const to = `note:${document.documentId}` as TraceabilityRef;
		const collision = candidate.entities.find(entity => entity.ref === to && entity.ref !== from);
		if (collision) throw new Error(`OBSIDIAN_DOCUMENT_ID_COLLISION:${to}`);
		if (from) replacements.set(from, to);
		actions.push({ kind: !from ? "create" : from === to ? "refresh" : "replace", createsIssue, linearId: document.linearId, ...(from ? { from } : {}), to, path: document.relativePath, digest: document.digest });
		for (const id of document.properties.spec_ids) resolveDeclared("spec", id);
		for (const id of document.properties.code_ids) resolveDeclared("unit", id);
		for (const id of document.properties.test_ids) resolveDeclared("test-contract", id);
		for (const id of document.properties.exception_ids) resolveDeclared("exception", id);
		for (const id of document.properties.decision_ids) resolveDeclared("decision", id);
	}
	for (const action of actions) {
		const value = { ref: action.to, kind: "note" as const, id: action.to.slice("note:".length), source: { path: action.path, digest: action.digest } };
		if (action.from) candidate.entities[candidate.entities.findIndex(entity => entity.ref === action.from)] = value;
		else {
			candidate.entities.push(value);
			candidate.edges.push({ from: `issue:${action.linearId}`, relation: "detailed-by", to: action.to });
		}
		if (action.from && action.from !== action.to) {
			if (!candidate.tombstones.includes(action.from)) candidate.tombstones.push(action.from);
			if (!candidate.migrations.some(migration => migration.from === action.from && migration.to === action.to)) {
				candidate.migrations = [...candidate.migrations, { from: action.from, to: action.to, reason: "Obsidian note identity migrated from Linear filename to stable document_id" }];
			}
		}
	}
	candidate.edges = candidate.edges.map(edge => ({
		...edge,
		from: replacements.get(edge.from) ?? edge.from,
		to: replacements.get(edge.to) ?? edge.to,
	}));
	const migratedRefs = new Set(actions.map(action => action.to));
	candidate.edges = candidate.edges.filter(edge => !((edge.relation === "parent-of" || edge.relation === "related-to") && (migratedRefs.has(edge.from) || migratedRefs.has(edge.to))));
	const byAlias = new Map<string, typeof documents>();
	for (const document of documents) for (const alias of aliases(document)) byAlias.set(alias, [...(byAlias.get(alias) ?? []), document]);
	for (const document of documents) {
		const from = `note:${document.documentId}` as TraceabilityRef;
		const propertyRefs = [
			...document.properties.spec_ids.map(id => resolveDeclared("spec", id)),
			...document.properties.code_ids.map(id => resolveDeclared("unit", id)),
			...document.properties.test_ids.map(id => resolveDeclared("test-contract", id)),
			...document.properties.exception_ids.map(id => resolveDeclared("exception", id)),
			...document.properties.decision_ids.map(id => resolveDeclared("decision", id)),
		];
		for (const target of propertyRefs) candidate.edges.push({ from, relation: "references", to: target });
		for (const specId of document.properties.spec_ids) {
			const specRef = resolveDeclared("spec", specId);
			for (const codeId of document.properties.code_ids) candidate.edges.push({ from: specRef, relation: "implemented-by", to: resolveDeclared("unit", codeId) });
			for (const exceptionId of document.properties.exception_ids) candidate.edges.push({ from: specRef, relation: "excepted-by", to: resolveDeclared("exception", exceptionId) });
			for (const decisionId of document.properties.decision_ids) candidate.edges.push({ from: specRef, relation: "decided-by", to: resolveDeclared("decision", decisionId) });
		}
		for (const exceptionId of document.properties.exception_ids) {
			const exceptionRef = resolveDeclared("exception", exceptionId);
			const exceptionEntity = candidate.entities.find(entity => entity.ref === exceptionRef)!;
			const exceptionEnvelope = JSON.parse(readFileSync(resolve(options.projectRoot!, exceptionEntity.source!.path), "utf8")) as RegistryEnvelope<ExceptionContract>;
			for (const testId of exceptionEnvelope.payload.testIds) candidate.edges.push({ from: exceptionRef, relation: "verified-by", to: resolveDeclared("test-contract", testId) });
		}
		const links: Array<{ relation: "parent-of" | "related-to"; value: string; parent: boolean }> = [];
		if (document.properties.parent) links.push({ relation: "parent-of", value: document.properties.parent, parent: true });
		for (const value of document.properties.related) links.push({ relation: "related-to", value, parent: false });
		for (const link of links) {
			const target = obsidianWikiTarget(link.value);
			const matches = target ? byAlias.get(target) ?? [] : [];
			if (matches.length !== 1) continue; // navigation notes are not detailed-canonical ledger nodes
			const other = `note:${matches[0]!.documentId}` as TraceabilityRef;
			candidate.edges.push(link.parent
				? { from: other, relation: link.relation, to: from }
				: { from, relation: link.relation, to: other });
		}
	}
	candidate.entities.sort((left, right) => left.ref.localeCompare(right.ref));
	candidate.tombstones.sort();
	candidate.migrations = [...candidate.migrations].sort((left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to));
	const uniqueEdges = new Map(candidate.edges.map(edge => [edgeKey(edge), edge]));
	candidate.edges = [...uniqueEdges.values()].sort((left, right) => edgeKey(left).localeCompare(edgeKey(right)));
	const { payloadDigest: _, ...candidateBody } = candidate;
	candidate.payloadDigest = canonicalDigest(candidateBody);
	const ledgerErrors = validateLedger(candidate);
	if (ledgerErrors.length) throw new Error(`OBSIDIAN_LEDGER_CANDIDATE_INVALID:${ledgerErrors.join(",")}`);
	const material = {
		schemaVersion: 1 as const,
		sourceLedgerDigest: sha256(ledgerBytes),
		vaultDigest: canonicalDigest(inspected.snapshot),
		actions: actions.sort((left, right) => left.linearId.localeCompare(right.linearId)),
		candidate,
		workflow: { vaultRename: "separate-preview-required" as const, ledgerMigration: "previewed" as const, sqliteRebuild: "pending-after-ledger-apply" as const, linearUriUpdate: "separate-draft-readback-required" as const },
	};
	return { ...material, digest: previewDigest(material) };
}

/** Apply only the reviewed candidate bound to the exact current ledger and Vault snapshot. */
export function applyObsidianLedgerMigrationPreview(options: {
	ledgerPath: string;
	vaultRoot: string;
	preview: ObsidianLedgerMigrationPreview;
	acceptedDigest: string;
	inspect?: ObsidianInspectOptions;
}): TraceabilityLedger {
	if (options.preview.digest !== options.acceptedDigest || options.preview.digest !== previewDigest(withoutDigest(options.preview))) throw new Error("PREVIEW_DIGEST_MISMATCH");
	const currentBytes = readFileSync(options.ledgerPath, "utf8");
	if (sha256(currentBytes) !== options.preview.sourceLedgerDigest) throw new Error("LEDGER_SOURCE_CHANGED");
	const current = inspectObsidianVault(options.vaultRoot, options.inspect);
	if (canonicalDigest(current.snapshot) !== options.preview.vaultDigest) throw new Error("VAULT_SOURCE_CHANGED");
	const errors = validateLedger(options.preview.candidate);
	if (errors.length) throw new Error(`OBSIDIAN_LEDGER_CANDIDATE_INVALID:${errors.join(",")}`);
	const temporary = resolve(dirname(options.ledgerPath), `.traceability-v3.${process.pid}.${Date.now()}.tmp`);
	if (existsSync(temporary)) throw new Error("LEDGER_STAGING_COLLISION");
	try {
		writeFileSync(temporary, `${JSON.stringify(options.preview.candidate, null, 2)}\n`, { flag: "wx" });
		renameSync(temporary, options.ledgerPath);
	} catch (error) {
		try { rmSync(temporary, { force: true }); } catch { /* best-effort staging cleanup */ }
		throw error;
	}
	return options.preview.candidate;
}
