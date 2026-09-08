import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { parse } from "yaml";
import { obsidianWikiTarget, validateObsidianDocument, type ObsidianContractIssue, type ObsidianDocumentContract } from "../../../core/domain/development/obsidian-contract.js";

export interface ObsidianVaultDocument extends ObsidianDocumentContract { digest: string }
export interface ObsidianVaultSnapshot { schemaVersion: 2; documents: { documentId: string; path: string; digest: string }[] }
export interface ObsidianDrift { documentId: string; kind: "renamed" | "content-changed" | "added" | "removed"; before?: string; after?: string }
export interface ObsidianRenameAction { kind: "rename"; documentId: string; from: string; to: string; sourceDigest: string }
export interface ObsidianSyncPreview { schemaVersion: 2; vaultDigest: string; actions: ObsidianRenameAction[]; issues: ObsidianContractIssue[]; digest: string }
export interface ObsidianInspectOptions {
	specRoot?: string;
	/** Linear issues that must each have exactly one canonical note in this inspection scope. */
	requiredLinearIds?: readonly string[];
}

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const previewDigest = (value: Omit<ObsidianSyncPreview, "digest">): string => sha256(canonical(value));

function splitMarkdown(raw: string): { properties: Record<string, unknown>; body: string; parseError?: string } {
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
	if (!match) return { properties: {}, body: raw };
	try {
		const properties = parse(match[1]!);
		return { properties: properties && typeof properties === "object" && !Array.isArray(properties) ? properties : {}, body: match[2]! };
	} catch (error) {
		return { properties: {}, body: match[2]!, parseError: error instanceof Error ? error.message : String(error) };
	}
}

function hasCanonicalMarker(raw: string): boolean {
	if (!raw.startsWith("---\n") && !raw.startsWith("---\r\n")) return false;
	const firstLineEnd = raw.indexOf("\n") + 1;
	const closing = raw.slice(firstLineEnd).search(/^---\s*$/m);
	const frontmatter = closing < 0 ? raw.slice(firstLineEnd) : raw.slice(firstLineEnd, firstLineEnd + closing);
	return /^record_type:\s*["']?detailed-canonical["']?\s*(?:#.*)?$/m.test(frontmatter);
}

function walkMarkdown(root: string, current = root, issues: ObsidianContractIssue[] = [], strictSymlinks = false): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
		const absolute = join(current, entry.name);
		if (entry.isSymbolicLink()) { if (strictSymlinks) issues.push({ code: "SYMLINK_FORBIDDEN", message: "Vault 계약 범위에서 symlink를 허용하지 않습니다.", path: relative(root, absolute), blocking: true }); continue; }
		if (entry.isDirectory()) files.push(...walkMarkdown(root, absolute, issues, strictSymlinks));
		else if (entry.isFile() && entry.name.endsWith(".md")) files.push(absolute);
	}
	return files;
}

function inside(root: string, relativePath: string): string {
	const target = resolve(root, relativePath);
	if (target !== resolve(root) && !target.startsWith(`${resolve(root)}${sep}`)) throw new Error(`PATH_OUTSIDE_VAULT:${relativePath}`);
	return target;
}

export function inspectObsidianVault(vaultRoot: string, options: ObsidianInspectOptions = {}): { documents: ObsidianVaultDocument[]; issues: ObsidianContractIssue[]; snapshot: ObsidianVaultSnapshot } {
	const traversalIssues: ObsidianContractIssue[] = [];
	const specRoot = options.specRoot ? inside(vaultRoot, options.specRoot) : vaultRoot;
	const specRootRelative = relative(vaultRoot, specRoot).replaceAll(sep, "/");
	const normalizedSpecRoot = specRootRelative || undefined;
	const allMarkdown = walkMarkdown(vaultRoot, vaultRoot, [], false);
	const documents = walkMarkdown(vaultRoot, specRoot, traversalIssues, true).flatMap(absolute => {
		const raw = readFileSync(absolute, "utf8");
		const relativePath = relative(vaultRoot, absolute).replaceAll(sep, "/");
		const parsed = splitMarkdown(raw);
		if (parsed.properties.record_type !== "detailed-canonical" && !hasCanonicalMarker(raw)) return [];
		const domain = typeof parsed.properties.domain === "string" ? parsed.properties.domain : undefined;
		const pathWithinSpec = relative(specRoot, absolute).replaceAll(sep, "/");
		const validationPath = normalizedSpecRoot && domain && basename(specRoot) === domain ? `${domain}/${pathWithinSpec}` : pathWithinSpec;
		const contract = validateObsidianDocument({ relativePath: validationPath, properties: parsed.properties, body: parsed.body });
		const targetPath = contract.targetPath && normalizedSpecRoot
			? basename(specRoot) === domain ? `${normalizedSpecRoot}/${contract.targetPath.slice(`${domain}/`.length)}` : `${normalizedSpecRoot}/${contract.targetPath}`
			: contract.targetPath;
		const parseIssues = parsed.parseError ? [{ code: "FRONTMATTER_INVALID" as const, message: `YAML frontmatter를 파싱할 수 없습니다: ${parsed.parseError}`, path: relativePath, blocking: true as const }] : [];
		return [{ ...contract, relativePath, targetPath,
			issues: [...parseIssues, ...contract.issues.map(problem => ({ ...problem, path: relativePath }))], digest: sha256(raw) }];
	});
	const issues = [...traversalIssues, ...documents.flatMap(document => document.issues)];
	const byDocument = new Map<string, ObsidianVaultDocument[]>();
	const byLinear = new Map<string, ObsidianVaultDocument[]>();
	for (const document of documents) {
		if (document.documentId) byDocument.set(document.documentId, [...(byDocument.get(document.documentId) ?? []), document]);
		if (document.linearId) byLinear.set(document.linearId, [...(byLinear.get(document.linearId) ?? []), document]);
	}
	for (const [id, matches] of byDocument) if (matches.length > 1) for (const document of matches) issues.push({ code: "DOCUMENT_ID_DUPLICATE", message: `document_id ${id}가 중복됩니다.`, path: document.relativePath, blocking: true });
	for (const [id, matches] of byLinear) if (matches.length > 1) for (const document of matches) issues.push({ code: "LINEAR_ID_DUPLICATE", message: `Linear ${id} 상세 정본이 중복됩니다.`, path: document.relativePath, blocking: true });
	for (const id of [...new Set(options.requiredLinearIds ?? [])].sort()) {
		const matches = byLinear.get(id) ?? [];
		if (matches.length !== 1) issues.push({ code: "LINEAR_CANONICAL_COUNT_INVALID", message: `Linear ${id} 상세 정본은 정확히 하나여야 합니다. 현재 ${matches.length}개입니다.`, path: normalizedSpecRoot ?? ".", blocking: true });
	}
	const linkTargets = new Map<string, number>();
	for (const absolute of allMarkdown) { const path = relative(vaultRoot, absolute).replaceAll(sep, "/"); for (const target of new Set([path.replace(/\.md$/, ""), path.split("/").at(-1)!.replace(/\.md$/, "")])) linkTargets.set(target, (linkTargets.get(target) ?? 0) + 1); }
	for (const document of documents) for (const link of [document.properties?.parent, ...(document.properties?.related ?? [])]) {
		if (!link) continue;
		const target = obsidianWikiTarget(link);
		if (target && !linkTargets.has(target)) issues.push({ code: "WIKILINK_BROKEN", message: `연결 문서를 찾을 수 없습니다: ${target}`, path: document.relativePath, blocking: true });
		else if (target && (linkTargets.get(target) ?? 0) > 1 && !target.includes("/")) issues.push({ code: "WIKILINK_AMBIGUOUS", message: `동명 문서가 있어 경로가 필요합니다: ${target}`, path: document.relativePath, blocking: true });
	}
	const snapshot = { schemaVersion: 2 as const, documents: documents.filter(document => document.documentId).map(document => ({ documentId: document.documentId!, path: document.relativePath, digest: document.digest })).sort((a, b) => a.documentId.localeCompare(b.documentId)) };
	return { documents, issues, snapshot };
}

export function compareObsidianSnapshots(before: ObsidianVaultSnapshot, after: ObsidianVaultSnapshot): ObsidianDrift[] {
	const left = new Map(before.documents.map(document => [document.documentId, document]));
	const right = new Map(after.documents.map(document => [document.documentId, document]));
	const drifts: ObsidianDrift[] = [];
	for (const id of [...new Set([...left.keys(), ...right.keys()])].sort()) {
		const a = left.get(id), b = right.get(id);
		if (!a) drifts.push({ documentId: id, kind: "added", after: b!.path });
		else if (!b) drifts.push({ documentId: id, kind: "removed", before: a.path });
		else { if (a.path !== b.path) drifts.push({ documentId: id, kind: "renamed", before: a.path, after: b.path }); if (a.digest !== b.digest) drifts.push({ documentId: id, kind: "content-changed", before: a.digest, after: b.digest }); }
	}
	return drifts;
}

export function createObsidianSyncPreview(vaultRoot: string, options: ObsidianInspectOptions = {}): ObsidianSyncPreview {
	const inspected = inspectObsidianVault(vaultRoot, options);
	const actions = inspected.documents.filter(document => document.documentId && document.targetPath && document.relativePath !== document.targetPath)
		.map(document => ({ kind: "rename" as const, documentId: document.documentId!, from: document.relativePath, to: document.targetPath!, sourceDigest: document.digest })).sort((a, b) => a.documentId.localeCompare(b.documentId));
	const vaultDigest = sha256(canonical(inspected.snapshot));
	const material = { schemaVersion: 2 as const, vaultDigest, actions, issues: inspected.issues };
	return { ...material, digest: previewDigest(material) };
}

export function applyObsidianSyncPreview(vaultRoot: string, preview: ObsidianSyncPreview, acceptedDigest: string, options: ObsidianInspectOptions = {}): ObsidianVaultSnapshot {
	if (preview.digest !== acceptedDigest || preview.digest !== previewDigest({ schemaVersion: preview.schemaVersion, vaultDigest: preview.vaultDigest, actions: preview.actions, issues: preview.issues })) throw new Error("PREVIEW_DIGEST_MISMATCH");
	const current = createObsidianSyncPreview(vaultRoot, options);
	if (current.vaultDigest !== preview.vaultDigest || current.digest !== preview.digest) throw new Error("SOURCE_CHANGED");
	const nonPathIssues = preview.issues.filter(problem => problem.code !== "PATH_DRIFT");
	if (nonPathIssues.length) throw new Error(`OBSIDIAN_CONTRACT_BLOCKED:${nonPathIssues.map(problem => problem.code).join(",")}`);
	const sources = new Set(preview.actions.map(action => inside(vaultRoot, action.from).toLocaleLowerCase()));
	const targets = new Set<string>();
	for (const action of preview.actions) {
		const from = inside(vaultRoot, action.from), to = inside(vaultRoot, action.to);
		if (sha256(readFileSync(from, "utf8")) !== action.sourceDigest) throw new Error(`SOURCE_CHANGED:${action.from}`);
		const normalizedTarget = to.toLocaleLowerCase();
		if (targets.has(normalizedTarget) || (existsSync(to) && !sources.has(normalizedTarget))) throw new Error(`TARGET_COLLISION:${action.to}`);
		targets.add(normalizedTarget);
	}
	const stagingRoot = inside(vaultRoot, `.obsidian-sync-${preview.digest.slice(0, 16)}`);
	if (existsSync(stagingRoot)) throw new Error("SYNC_STAGING_COLLISION");
	const staged: { action: ObsidianRenameAction; path: string }[] = [], completed: { action: ObsidianRenameAction; path: string }[] = [];
	try {
		mkdirSync(stagingRoot, { recursive: false });
		for (const [index, action] of preview.actions.entries()) { const path = join(stagingRoot, `${index}.md`); renameSync(inside(vaultRoot, action.from), path); staged.push({ action, path }); }
		for (const item of staged) { const target = inside(vaultRoot, item.action.to); mkdirSync(dirname(target), { recursive: true }); renameSync(item.path, target); completed.push(item); }
		const result = inspectObsidianVault(vaultRoot, options);
		if (result.issues.length) throw new Error(`OBSIDIAN_READBACK_FAILED:${result.issues.map(problem => problem.code).join(",")}`);
		rmSync(stagingRoot, { recursive: true, force: true });
		return result.snapshot;
	} catch (error) {
		for (const item of [...completed].reverse()) { const source = inside(vaultRoot, item.action.from), target = inside(vaultRoot, item.action.to); if (existsSync(target)) { mkdirSync(dirname(source), { recursive: true }); renameSync(target, source); } }
		for (const item of [...staged].reverse()) if (existsSync(item.path)) { const source = inside(vaultRoot, item.action.from); mkdirSync(dirname(source), { recursive: true }); renameSync(item.path, source); }
		rmSync(stagingRoot, { recursive: true, force: true });
		throw error;
	}
}
