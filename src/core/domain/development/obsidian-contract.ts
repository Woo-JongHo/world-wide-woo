export const OBSIDIAN_SCHEMA_VERSION = 2 as const;

export const OBSIDIAN_SECTIONS = [
	"1. Intent",
	"2. Scope",
	"3. Desired Behavior",
	"4. Domain Contract",
	"5. State Model",
	"6. Data & Runtime Flow",
	"7. Identity & Persistence Contract",
	"8. Integration Contract",
	"9. Failure & Recovery Contract",
	"10. Acceptance Contract",
	"11. Verification Strategy",
	"12. Implementation Map",
	"13. Current State & Gaps",
	"14. Decisions & Evidence",
	"Change Log",
] as const;

export type ObsidianDocumentStatus = "draft" | "active" | "deprecated";
export type ObsidianAcceptanceStatus = "not-tested" | "partial" | "pass" | "fail";

export interface ObsidianCanonicalProperties {
	document_id: string;
	linear: string;
	record_type: "detailed-canonical";
	schema_version: 2;
	status: ObsidianDocumentStatus;
	acceptance: ObsidianAcceptanceStatus;
	domain: string;
	capability: string;
	parent: string | null;
	related: string[];
	spec_ids: string[];
	code_ids: string[];
	test_ids: string[];
	exception_ids: string[];
	decision_ids: string[];
	tags: string[];
	updated_at: string;
	source_revision: string;
}

export type ObsidianContractCode =
	| "PROPERTY_MISSING" | "PROPERTY_INVALID" | "FRONTMATTER_INVALID" | "HEADING_INVALID" | "SECTION_ORDER_INVALID"
	| "INCOMPLETE_MARKER"
	| "PATH_INVALID" | "PATH_DRIFT" | "DOCUMENT_ID_DUPLICATE" | "LINEAR_ID_DUPLICATE"
	| "LINEAR_CANONICAL_COUNT_INVALID"
	| "WIKILINK_BROKEN" | "WIKILINK_AMBIGUOUS" | "SYMLINK_FORBIDDEN" | "SOURCE_CHANGED" | "PREVIEW_DIGEST_MISMATCH"
	| "TARGET_COLLISION";

export interface ObsidianContractIssue {
	code: ObsidianContractCode;
	message: string;
	path: string;
	blocking: true;
}

export interface ObsidianDocumentInput {
	relativePath: string;
	properties: Record<string, unknown>;
	body: string;
}

export interface ObsidianDocumentContract {
	relativePath: string;
	targetPath?: string;
	documentId?: string;
	linearId?: string;
	humanTitle?: string;
	properties?: ObsidianCanonicalProperties;
	issues: ObsidianContractIssue[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LINEAR = /^WOO-[1-9]\d*$/;
const SOURCE_REVISION = /^(?:git:[0-9a-f]{40}|worktree:[0-9a-f]{40}:dirty)$/i;
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const LINEAR_ANYWHERE = /WOO-\d+/i;
const MACHINE_TITLE_TOKEN = /(?:\b(?:WOO|CODE|TEST|TST|EXC|ERR|DEC)-[A-Z0-9-]*\d+\b|\[[^\]\n]+\])/i;
const NUMERIC_TITLE_PREFIX = /^\s*\d+[._ -]/;
const WIKILINK = /^\[\[[^\]|#]+(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]$/;
const SAFE_SEGMENT = /^[^/\\:\0]+$/;
const ID_RULES: Record<string, RegExp> = {
	spec_ids: /^[A-Z][A-Z0-9]*-\d{3,}$/,
	code_ids: /^Code-\d{3,}$/,
	test_ids: /^(?:TEST|TST)(?:-[A-Z][A-Z0-9]*)*-\d{3,}$/,
	exception_ids: /^(?:EXC|ERR)(?:-[A-Z][A-Z0-9]*)*-\d{3,}$/,
	decision_ids: /^DEC(?:-[A-Z][A-Z0-9]*)*-\d{3,}$/,
};
const ANGLE_PLACEHOLDER = /<[^<>\n]+>/;
const WORK_MARKER = /\b(?:TODO|TBD|WIP)\b(?!-[A-Z0-9])/;

function withoutFencedCode(body: string): string {
	let fence: { marker: "`" | "~"; length: number } | undefined;
	return body.split(/\r?\n/).map(line => {
		const opening = line.match(/^\s*(`{3,}|~{3,})/);
		if (!fence && opening) { fence = { marker: opening[1]![0] as "`" | "~", length: opening[1]!.length }; return ""; }
		if (fence) {
			const closing = line.match(/^\s*(`+|~+)\s*$/)?.[1];
			if (closing?.[0] === fence.marker && closing.length >= fence.length) fence = undefined;
			return "";
		}
		return line;
	}).join("\n");
}

function withoutInlineCode(body: string): string {
	return body.split(/\r?\n/).map(line => {
		let result = "", cursor = 0;
		while (cursor < line.length) {
			const start = line.indexOf("`", cursor);
			if (start < 0) { result += line.slice(cursor); break; }
			result += line.slice(cursor, start);
			let endOfMarker = start; while (line[endOfMarker] === "`") endOfMarker++;
			const marker = line.slice(start, endOfMarker), end = line.indexOf(marker, endOfMarker);
			if (end < 0) { result += line.slice(start); break; }
			cursor = end + marker.length;
		}
		return result;
	}).join("\n");
}

function hasEmptyTableCell(body: string): boolean {
	return body.split(/\r?\n/).some(line => {
		const trimmed = line.trim();
		if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return false;
		const cells = trimmed.slice(1, -1).split("|").map(cell => cell.trim());
		return cells.some(cell => cell.length === 0);
	});
}

function issue(code: ObsidianContractCode, message: string, path: string): ObsidianContractIssue {
	return { code, message, path, blocking: true };
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every(item => typeof item === "string" && item.length > 0);
}

function portablePath(value: string): string { return value.replaceAll("\\", "/").replace(/^\.\//, ""); }

export function canonicalObsidianPath(domain: string, capability: string, humanTitle: string): string | undefined {
	if (![domain, capability, humanTitle].every(value => value.trim() === value && value.length > 0 && SAFE_SEGMENT.test(value) && value !== "." && value !== "..")) return undefined;
	return `${domain}/${capability} — ${humanTitle}.md`;
}

export function obsidianWikiTarget(link: string): string | undefined {
	if (!WIKILINK.test(link)) return undefined;
	return link.slice(2, -2).split("|")[0]!.split("#")[0]!.trim();
}

export function validateObsidianDocument(input: ObsidianDocumentInput): ObsidianDocumentContract {
	const path = portablePath(input.relativePath);
	const problems: ObsidianContractIssue[] = [];
	const p = input.properties;
	const required = ["document_id", "linear", "record_type", "schema_version", "status", "acceptance", "domain", "capability", "parent", "related", "spec_ids", "code_ids", "test_ids", "exception_ids", "decision_ids", "tags", "updated_at", "source_revision"];
	for (const key of required) if (!(key in p)) problems.push(issue("PROPERTY_MISSING", `필수 Property가 없습니다: ${key}`, path));

	const stringValue = (key: string): string | undefined => typeof p[key] === "string" ? p[key] as string : undefined;
	const documentId = stringValue("document_id");
	const linearId = stringValue("linear");
	const domain = stringValue("domain");
	const capability = stringValue("capability");
	if (documentId !== undefined && !UUID.test(documentId)) problems.push(issue("PROPERTY_INVALID", "document_id는 안정적인 UUID여야 합니다.", path));
	if (linearId !== undefined && !LINEAR.test(linearId)) problems.push(issue("PROPERTY_INVALID", "linear는 WOO-NNN 형식이어야 합니다.", path));
	if (p.record_type !== "detailed-canonical") problems.push(issue("PROPERTY_INVALID", "record_type은 detailed-canonical이어야 합니다.", path));
	if (p.schema_version !== OBSIDIAN_SCHEMA_VERSION) problems.push(issue("PROPERTY_INVALID", `schema_version은 ${OBSIDIAN_SCHEMA_VERSION}여야 합니다.`, path));
	if (!["draft", "active", "deprecated"].includes(String(p.status))) problems.push(issue("PROPERTY_INVALID", "status 값이 유효하지 않습니다.", path));
	if (!["not-tested", "partial", "pass", "fail"].includes(String(p.acceptance))) problems.push(issue("PROPERTY_INVALID", "acceptance 값이 유효하지 않습니다.", path));
	if (!domain || !SAFE_SEGMENT.test(domain) || !capability || !SAFE_SEGMENT.test(capability)) problems.push(issue("PROPERTY_INVALID", "domain과 capability는 안전한 단일 경로 segment여야 합니다.", path));
	if (p.parent !== null && (typeof p.parent !== "string" || !WIKILINK.test(p.parent))) problems.push(issue("PROPERTY_INVALID", "parent는 wiki-link 또는 null이어야 합니다.", path));
	if (!isStringArray(p.related) || p.related.some(link => !WIKILINK.test(link))) problems.push(issue("PROPERTY_INVALID", "related는 wiki-link 배열이어야 합니다.", path));
	for (const [key, rule] of Object.entries(ID_RULES)) if (!isStringArray(p[key]) || (p[key] as string[]).some(value => !rule.test(value))) problems.push(issue("PROPERTY_INVALID", `${key} 값이 유효하지 않습니다.`, path));
	if (!isStringArray(p.tags) || p.tags.some(tag => tag.startsWith("#") || /\s/.test(tag))) problems.push(issue("PROPERTY_INVALID", "tags는 #과 공백이 없는 문자열 배열이어야 합니다.", path));
	if (typeof p.updated_at !== "string" || !ISO_8601.test(p.updated_at) || Number.isNaN(Date.parse(p.updated_at))) problems.push(issue("PROPERTY_INVALID", "updated_at은 timezone을 포함한 ISO-8601 시각이어야 합니다.", path));
	if (typeof p.source_revision !== "string" || !SOURCE_REVISION.test(p.source_revision)) problems.push(issue("PROPERTY_INVALID", "source_revision 형식이 유효하지 않습니다.", path));

	const structuralBody = withoutFencedCode(input.body);
	const prose = withoutInlineCode(structuralBody);
	const headings = [...structuralBody.matchAll(/^## (.+)$/gm)].map(match => match[1]!.trim());
	if (headings.length !== OBSIDIAN_SECTIONS.length || headings.some((heading, index) => heading !== OBSIDIAN_SECTIONS[index])) {
		problems.push(issue("SECTION_ORDER_INVALID", `본문은 ${OBSIDIAN_SECTIONS.length}개 정본 절을 정확한 순서로 가져야 합니다.`, path));
	}
	if (p.status === "active" && ANGLE_PLACEHOLDER.test(prose)) problems.push(issue("INCOMPLETE_MARKER", "active 상세 정본에는 <...> placeholder를 남길 수 없습니다.", path));
	if (p.status === "active" && WORK_MARKER.test(prose)) problems.push(issue("INCOMPLETE_MARKER", "active 상세 정본에는 TODO/TBD/WIP 작업 표식을 남길 수 없습니다.", path));
	if (p.status === "active" && hasEmptyTableCell(structuralBody)) problems.push(issue("INCOMPLETE_MARKER", "active 상세 정본에는 빈 계약 표 셀을 남길 수 없습니다.", path));
	const h1s = [...structuralBody.matchAll(/^# (.+)$/gm)];
	const h1 = h1s.length === 1 ? h1s[0]![1]!.match(/^(.+?) — (.+)$/) : undefined;
	const headingCapability = h1?.[1]?.trim();
	const humanTitle = h1?.[2]?.trim();
	if (!h1 || headingCapability !== capability || !humanTitle || LINEAR_ANYWHERE.test(`${headingCapability ?? ""} ${humanTitle ?? ""}`) || MACHINE_TITLE_TOKEN.test(`${domain ?? ""} ${headingCapability ?? ""} ${humanTitle ?? ""}`) || [domain, headingCapability, humanTitle].some(value => value && NUMERIC_TITLE_PREFIX.test(value))) problems.push(issue("HEADING_INVALID", "H1과 경로는 사람이 읽는 도메인·기능·제목을 사용하며 ID, 번호 접두어, [라벨]을 포함하지 않아야 합니다.", path));
	const targetPath = domain && capability && humanTitle ? canonicalObsidianPath(domain, capability, humanTitle) : undefined;
	if (!targetPath) problems.push(issue("PATH_INVALID", "정본 경로를 계산할 수 없습니다.", path));
	else if (path !== targetPath) problems.push(issue("PATH_DRIFT", `정본 경로는 ${targetPath}입니다.`, path));

	const properties = problems.some(problem => problem.code === "PROPERTY_MISSING" || problem.code === "PROPERTY_INVALID") ? undefined : p as unknown as ObsidianCanonicalProperties;
	return { relativePath: path, targetPath, documentId, linearId, humanTitle, properties, issues: problems };
}
