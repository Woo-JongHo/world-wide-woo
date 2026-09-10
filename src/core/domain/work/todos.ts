export const TODO_ITEM_STATUSES = ["pending", "in_progress", "completed", "blocked"] as const;
export const MAX_TODO_EVIDENCE = 8;
export type TodoItemStatus = (typeof TODO_ITEM_STATUSES)[number];

export interface TodoPlanRevisionReference {
	readonly sourceRevisionKeyDigest: string;
	readonly activityId: string;
	readonly sequence: number;
	readonly sourceDigest: string;
}

export interface TodoInputReference {
	readonly activityId: string;
	readonly requestId: string;
	readonly sourceDigest: string;
}

export interface TodoExecutionReference {
	readonly provider: string | null;
	readonly model: string | null;
	readonly agentId: string | null;
	readonly threadId: string | null;
	readonly runId: string | null;
}

/** @linear WOO-702 Native provenance survives Todo.md storage and session resume. */
export interface TodoNativePlanSource {
	readonly kind: "native-plan";
	readonly threadKeyDigest: string;
	readonly turnId: string;
	readonly input: TodoInputReference | null;
	readonly planRevision: TodoPlanRevisionReference;
	readonly rootExecution: TodoExecutionReference;
}

export interface TodoNativePlanItemSource {
	readonly kind: "native-plan-item";
	readonly identity: string;
	readonly originRevision: TodoPlanRevisionReference;
	readonly currentRevision: TodoPlanRevisionReference;
	readonly executions: readonly TodoExecutionReference[];
}

export interface TodoNativePlanBinding {
	readonly input: TodoInputReference | null;
	readonly rootExecution: TodoExecutionReference;
}

export interface TodoDetail {
	readonly id: string;
	readonly content: string;
	readonly status: TodoItemStatus;
	readonly evidenceIds: readonly string[];
}

export interface TodoItem {
	readonly id: string;
	readonly content: string;
	readonly status: TodoItemStatus;
	readonly evidenceIds: readonly string[];
	readonly details: readonly TodoDetail[];
	/** Absent on reference-free legacy and manually-authored Todo documents. */
	readonly source?: TodoNativePlanItemSource;
}

export interface TodoDocument {
	readonly version: 1;
	readonly revision: number;
	/** Native thread-derived owner and provenance for this session-scoped Todo. */
	readonly ownerSessionId: string;
	readonly storyId: string | null;
	readonly title: string;
	readonly items: readonly TodoItem[];
	readonly updatedAt: string;
	/** Absent means the historical document has no observed Native model/agent/Plan binding. */
	readonly source?: TodoNativePlanSource;
}

export interface TodoProgress {
	readonly total: number;
	readonly completed: number;
	readonly active: number;
	readonly pending: number;
	readonly blocked: number;
}

export interface TodoDetailProgress extends TodoProgress {}

const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const ansiPattern = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const oscPattern = /\u001B\][\s\S]*?(?:\u0007|\u001B\\)/g;
const controlPattern = /[\u0000-\u001F\u007F-\u009F]/g;
const referenceControlPattern = /[\u0000-\u001F\u007F-\u009F]/u;
const secretAssignmentPattern = /\b(api[_-]?key|token|password|secret|credential|authorization)\b\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/gi;
const openAiKeyPattern = /\bsk-[A-Za-z0-9_-]{8,}\b/g;
const githubTokenPattern = /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g;
const googleApiKeyPattern = /\bAIza[A-Za-z0-9_-]{20,}\b/g;

export function todoProgress(document: TodoDocument): TodoProgress {
	return progressFor(document.items);
}

/** Reports progress for details without changing top-level todo progress semantics. */
export function todoDetailProgress(document: TodoDocument): TodoDetailProgress {
	return progressFor(document.items.flatMap((item) => item.details));
}

function progressFor(items: readonly { readonly status: TodoItemStatus }[]): TodoProgress {
	let completed = 0;
	let active = 0;
	let pending = 0;
	let blocked = 0;
	for (const item of items) {
		if (item.status === "completed") completed += 1;
		else if (item.status === "in_progress") active += 1;
		else if (item.status === "blocked") blocked += 1;
		else pending += 1;
	}
	return { total: items.length, completed, active, pending, blocked };
}

/** Validates and returns a deeply immutable, display-safe document. */
export function validateTodoDocument(value: unknown): TodoDocument {
	if (!isRecord(value) || value.version !== 1 || !isNonNegativeInteger(value.revision)) fail("invalid document header");
	if (typeof value.ownerSessionId !== "string" || !idPattern.test(value.ownerSessionId)) fail("invalid owner session id");
	if (value.storyId !== null && (typeof value.storyId !== "string" || !idPattern.test(value.storyId))) fail("invalid story id");
	if (typeof value.title !== "string") fail("invalid title");
	if (typeof value.updatedAt !== "string" || !isIsoDate(value.updatedAt)) fail("invalid updatedAt");
	if (!Array.isArray(value.items) || value.items.length > 12) fail("invalid item count");

	const ids = new Set<string>();
	let active = 0;
	let detailActive = 0;
	const items = value.items.map((raw) => {
		if (!isRecord(raw) || typeof raw.id !== "string" || !idPattern.test(raw.id)) fail("invalid todo item id");
		if (ids.has(raw.id)) fail("duplicate todo item id");
		ids.add(raw.id);
		const { content, status, evidenceIds } = validateTodoEntry(raw, "todo item");
		if (raw.status === "in_progress") active += 1;
		const rawDetails = raw.details === undefined ? [] : raw.details;
		if (!Array.isArray(rawDetails) || rawDetails.length > 8) fail("invalid detail count");
		const details = rawDetails.map((detail) => {
			if (!isRecord(detail) || typeof detail.id !== "string" || !idPattern.test(detail.id)) fail("invalid todo detail id");
			if (ids.has(detail.id)) fail("duplicate todo item id");
			ids.add(detail.id);
			const validated = validateTodoEntry(detail, "todo detail");
			if (validated.status === "in_progress") detailActive += 1;
			return Object.freeze({ id: detail.id, ...validated });
		});
		if (detailActive > 1) fail("at most one todo detail may be in progress");
		if (details.some((detail) => detail.status === "in_progress") && status !== "in_progress") fail("active todo detail requires an in-progress parent");
		if (status === "completed" && details.some((detail) => detail.status !== "completed")) fail("completed todo item requires completed details");
		const source = raw.source === undefined ? undefined : validateTodoItemSource(raw.source);
		return Object.freeze({
			id: raw.id,
			content,
			status,
			evidenceIds,
			details: Object.freeze(details),
			...(source ? { source } : {}),
		});
	});
	const source = value.source === undefined ? undefined : validateTodoSource(value.source);
	if (active > 1 && !source) fail("at most one manual todo item may be in progress");
	if (!source && items.some((item) => item.source)) fail("Native Plan item requires a document source");
	if (source) {
		if (source.rootExecution.runId !== source.turnId) fail("Native Plan execution must match its turn");
		for (const item of items) {
			// Manual additions remain source-free inside a Native-sourced document.
			if (!item.source) continue;
			if (item.id !== `native-${item.source.identity.slice(0, 48)}`) fail("Native Plan item id must derive from source identity");
			if (!samePlanRevision(item.source.currentRevision, source.planRevision)) fail("Native Plan item revision must match document source");
			if (!item.source.executions.some((execution) => sameExecutionReference(execution, source.rootExecution))) {
				fail("Native Plan item execution must include root execution");
			}
		}
	}
	return Object.freeze({
		version: 1,
		revision: value.revision,
		ownerSessionId: value.ownerSessionId,
		storyId: value.storyId,
		title: sanitizeTitle(value.title),
		items: Object.freeze(items),
		updatedAt: value.updatedAt,
		...(source ? { source } : {}),
	});
}

export function renderTodoMarkdown(document: TodoDocument): string {
	const todo = validateTodoDocument(document);
	const header = renderHeader(todo);
	const lines = [`<!-- ${header} -->`, `# ${todo.title}`, ""];
	for (const item of todo.items) {
		lines.push(renderEntry(item));
		for (const detail of item.details) lines.push(`  ${renderEntry(detail)}`);
	}
	return `${lines.join("\n")}\n`;
}

export function parseTodoMarkdown(markdown: string): TodoDocument {
	const lines = markdown.split(/\r?\n/u);
	if (lines.at(-1) === "") lines.pop();
	if (lines.length < 2 || !lines[0] || !lines[1]) fail("invalid todo markdown layout");
	const header = parseComment(lines[0]);
	if (!isRecord(header) || !hasExactKeys(header, ["version", "revision", "ownerSessionId", "storyId", "updatedAt"], ["source"]) || header.version !== 1) fail("invalid todo markdown header");
	if (!lines[1].startsWith("# ") || lines[1].slice(2).length === 0) fail("invalid todo heading");
	const items: Array<Omit<TodoItem, "details"> & { details: TodoDetail[] }> = [];
	for (const line of lines.slice(2)) {
		if (!isManagedTodoLine(line)) {
			if (/- \[[ x]\] .+ <!-- \{"id":/.test(line)) fail("invalid todo detail indentation");
			continue;
		}
		if (line.startsWith("  - ")) {
			const parent = items.at(-1);
			if (!parent) fail("orphan todo detail markdown");
			parent.details.push(parseItemLine(line.slice(2)));
		} else {
			items.push({ ...parseItemLine(line), details: [] });
		}
	}
	return validateTodoDocument({ ...header, title: lines[1].slice(2), items });
}

/**
 * Rewrites only WWW-owned metadata, heading, and managed checkbox lines.
 * Unrecognized Markdown and the source line-ending convention remain byte-for-byte stable.
 */
export function patchTodoMarkdown(markdown: string, next: TodoDocument): string {
	parseTodoMarkdown(markdown);
	const todo = validateTodoDocument(next);
	const lines = splitMarkdownLines(markdown);
	lines[0]!.content = `<!-- ${renderHeader(todo)} -->`;
	lines[1]!.content = `# ${todo.title}`;

	const desired = todo.items.flatMap((item) => [
		renderEntry(item),
		...item.details.map((detail) => `  ${renderEntry(detail)}`),
	]);
	const managed = lines.flatMap((line, index) => isManagedTodoLine(line.content) ? [index] : []);
	const common = Math.min(managed.length, desired.length);
	for (let index = 0; index < common; index += 1) lines[managed[index]!]!.content = desired[index]!;
	for (let index = managed.length - 1; index >= desired.length; index -= 1) lines.splice(managed[index]!, 1);
	if (desired.length > managed.length) {
		const insertion = managed.length > 0 ? managed.at(-1)! + 1 : Math.min(3, lines.length);
		const eol = insertionLineEnding(lines, insertion);
		lines.splice(insertion, 0, ...desired.slice(managed.length).map(content => ({ content, eol })));
	}
	return lines.map(line => `${line.content}${line.eol}`).join("");
}

interface MarkdownLine {
	content: string;
	eol: "\r\n" | "\n" | "";
}

/** Keeps every original line terminator attached to its source line. */
function splitMarkdownLines(markdown: string): MarkdownLine[] {
	const lines: MarkdownLine[] = [];
	for (const match of markdown.matchAll(/([^\r\n]*)(\r\n|\n|$)/gu)) {
		const content = match[1]!;
		const eol = match[2]! as MarkdownLine["eol"];
		if (content === "" && eol === "") break;
		lines.push({ content, eol });
	}
	return lines;
}

function insertionLineEnding(lines: readonly MarkdownLine[], insertion: number): "\r\n" | "\n" {
	const nearby = [lines[insertion - 1]?.eol, lines[insertion]?.eol, ...lines.map(line => line.eol)]
		.find((eol): eol is "\r\n" | "\n" => eol === "\r\n" || eol === "\n");
	return nearby ?? "\n";
}

export function sanitizeTodoText(value: string): string {
	return value
		.replace(oscPattern, "")
		.replace(ansiPattern, "")
		.replace(secretAssignmentPattern, "$1: [REDACTED]")
		.replace(openAiKeyPattern, "[REDACTED]")
		.replace(githubTokenPattern, "[REDACTED]")
		.replace(googleApiKeyPattern, "[REDACTED]")
		.replace(/<!--|-->/g, "")
		.replace(controlPattern, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function parseItemLine(line: string): TodoItem {
	const match = /^- \[([ x])\] (.+) (<!-- .+ -->)$/.exec(line);
	if (!match) fail("invalid todo item markdown");
	const metadata = parseComment(match[3]);
	if (!isRecord(metadata) || !hasExactKeys(metadata, ["id", "status", "evidenceIds"], ["source"]) || typeof metadata.id !== "string" || typeof metadata.status !== "string" || !Array.isArray(metadata.evidenceIds)) fail("invalid todo item metadata");
	const status = metadata.status as TodoItemStatus;
	if (!(TODO_ITEM_STATUSES as readonly string[]).includes(status)) fail("invalid todo item status");
	if ((match[1] === "x") !== (status === "completed")) fail("invalid todo checkbox state");
	let content = match[2];
	if (status === "in_progress") {
		if (!content.startsWith("진행 중: ")) fail("invalid todo status prefix");
		content = content.slice("진행 중: ".length);
	} else if (status === "blocked") {
		if (!content.startsWith("막힘: ")) fail("invalid todo status prefix");
		content = content.slice("막힘: ".length);
	}
	return {
		id: metadata.id,
		status,
		evidenceIds: metadata.evidenceIds as string[],
		content,
		details: [],
		...(metadata.source === undefined ? {} : { source: metadata.source as TodoNativePlanItemSource }),
	};
}

function isManagedTodoLine(line: string): boolean {
	return /^(?:  )?- \[[ x]\] .+ <!-- \{"id":/.test(line);
}

function renderHeader(todo: TodoDocument): string {
	return JSON.stringify({
		version: todo.version,
		revision: todo.revision,
		ownerSessionId: todo.ownerSessionId,
		storyId: todo.storyId,
		updatedAt: todo.updatedAt,
		...(todo.source ? { source: todo.source } : {}),
	});
}

function renderEntry(item: TodoDetail | TodoItem): string {
	const prefix = item.status === "in_progress" ? "진행 중: " : item.status === "blocked" ? "막힘: " : "";
	const checked = item.status === "completed" ? "x" : " ";
	const metadata = JSON.stringify({
		id: item.id,
		status: item.status,
		evidenceIds: item.evidenceIds,
		...("source" in item && item.source ? { source: item.source } : {}),
	});
	return `- [${checked}] ${prefix}${item.content} <!-- ${metadata} -->`;
}

function validateTodoEntry(raw: Record<string, unknown>, label: string): Pick<TodoDetail, "content" | "status" | "evidenceIds"> {
	if (typeof raw.content !== "string") fail(`invalid ${label} content`);
	const content = sanitizeTodoText(raw.content);
	if (!content || Array.from(content).length > 120) fail(`invalid ${label} content`);
	if (typeof raw.status !== "string" || !(TODO_ITEM_STATUSES as readonly string[]).includes(raw.status)) fail(`invalid ${label} status`);
	if (
		!Array.isArray(raw.evidenceIds) ||
		raw.evidenceIds.length > MAX_TODO_EVIDENCE ||
		new Set(raw.evidenceIds).size !== raw.evidenceIds.length ||
		raw.evidenceIds.some((id) => typeof id !== "string" || !idPattern.test(id))
	) fail("invalid evidence ids");
	return { content, status: raw.status as TodoItemStatus, evidenceIds: Object.freeze([...raw.evidenceIds]) };
}

function parseComment(line: string): unknown {
	const match = /^<!-- (\{.+\}) -->$/.exec(line);
	if (!match) fail("invalid JSON comment");
	try { return JSON.parse(match[1]); } catch { fail("invalid JSON comment"); }
}

function sanitizeTitle(value: string): string {
	const title = sanitizeTodoText(value);
	if (!title || Array.from(title).length > 120) fail("invalid title");
	return title;
}

function isIsoDate(value: string): boolean {
	return isoDatePattern.test(value) && !Number.isNaN(Date.parse(value));
}
function isNonNegativeInteger(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function hasExactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
	const allowed = new Set([...required, ...optional]);
	return required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => allowed.has(key));
}

function validateTodoSource(value: unknown): TodoNativePlanSource {
	if (!isRecord(value) || !hasExactKeys(value, ["kind", "threadKeyDigest", "turnId", "input", "planRevision", "rootExecution"]) || value.kind !== "native-plan") fail("invalid Native Plan source");
	if (!isSha256Hex(value.threadKeyDigest) || !isOpaqueReference(value.turnId)) fail("invalid Native Plan source");
	const input = value.input === null ? null : validateInputReference(value.input);
	return Object.freeze({
		kind: "native-plan",
		threadKeyDigest: value.threadKeyDigest,
		turnId: value.turnId,
		input,
		planRevision: validatePlanRevision(value.planRevision),
		rootExecution: validateExecutionReference(value.rootExecution),
	});
}

function validateTodoItemSource(value: unknown): TodoNativePlanItemSource {
	if (!isRecord(value) || !hasExactKeys(value, ["kind", "identity", "originRevision", "currentRevision", "executions"]) || value.kind !== "native-plan-item") fail("invalid Native Plan item source");
	if (!isSha256Hex(value.identity) || !Array.isArray(value.executions) || value.executions.length > 16) fail("invalid Native Plan item source");
	const executions = value.executions.map(validateExecutionReference);
	const keys = executions.map((execution) => JSON.stringify(execution));
	if (new Set(keys).size !== keys.length) fail("duplicate execution reference");
	return Object.freeze({
		kind: "native-plan-item",
		identity: value.identity,
		originRevision: validatePlanRevision(value.originRevision),
		currentRevision: validatePlanRevision(value.currentRevision),
		executions: Object.freeze(executions),
	});
}

function validateInputReference(value: unknown): TodoInputReference {
	if (!isRecord(value) || !hasExactKeys(value, ["activityId", "requestId", "sourceDigest"])) fail("invalid input reference");
	if (!isOpaqueReference(value.activityId) || !isOpaqueReference(value.requestId) || !isSourceDigest(value.sourceDigest)) fail("invalid input reference");
	return Object.freeze({ activityId: value.activityId, requestId: value.requestId, sourceDigest: value.sourceDigest });
}

function validatePlanRevision(value: unknown): TodoPlanRevisionReference {
	if (!isRecord(value) || !hasExactKeys(value, ["sourceRevisionKeyDigest", "activityId", "sequence", "sourceDigest"])) fail("invalid Plan revision reference");
	if (!isSha256Hex(value.sourceRevisionKeyDigest) || !isOpaqueReference(value.activityId) || !isPositiveInteger(value.sequence) || !isSourceDigest(value.sourceDigest)) fail("invalid Plan revision reference");
	return Object.freeze({
		sourceRevisionKeyDigest: value.sourceRevisionKeyDigest,
		activityId: value.activityId,
		sequence: value.sequence,
		sourceDigest: value.sourceDigest,
	});
}

function validateExecutionReference(value: unknown): TodoExecutionReference {
	if (!isRecord(value) || !hasExactKeys(value, ["provider", "model", "agentId", "threadId", "runId"])) fail("invalid execution reference");
	for (const field of [value.provider, value.model, value.agentId, value.threadId, value.runId]) {
		if (field !== null && !isOpaqueReference(field)) fail("invalid execution reference");
	}
	return Object.freeze({
		provider: value.provider as string | null,
		model: value.model as string | null,
		agentId: value.agentId as string | null,
		threadId: value.threadId as string | null,
		runId: value.runId as string | null,
	});
}

function isOpaqueReference(value: unknown): value is string {
	return typeof value === "string" && value.length > 0 && value.length <= 512 && value.trim() === value && !referenceControlPattern.test(value);
}
function isSha256Hex(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value); }
function isSourceDigest(value: unknown): value is string { return typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value); }
function isPositiveInteger(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }
function samePlanRevision(left: TodoPlanRevisionReference, right: TodoPlanRevisionReference): boolean {
	return left.sourceRevisionKeyDigest === right.sourceRevisionKeyDigest
		&& left.activityId === right.activityId
		&& left.sequence === right.sequence
		&& left.sourceDigest === right.sourceDigest;
}
function sameExecutionReference(left: TodoExecutionReference, right: TodoExecutionReference): boolean {
	return left.provider === right.provider
		&& left.model === right.model
		&& left.agentId === right.agentId
		&& left.threadId === right.threadId
		&& left.runId === right.runId;
}
function fail(message: string): never { throw new Error(`Invalid todo document: ${message}`); }
