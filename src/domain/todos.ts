export const TODO_ITEM_STATUSES = ["pending", "in_progress", "completed", "blocked"] as const;
export const MAX_TODO_EVIDENCE = 8;
export type TodoItemStatus = (typeof TODO_ITEM_STATUSES)[number];

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
}

export interface TodoDocument {
	readonly version: 1;
	readonly revision: number;
	readonly ownerSessionId: string;
	readonly storyId: string | null;
	readonly title: string;
	readonly items: readonly TodoItem[];
	readonly updatedAt: string;
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
		return Object.freeze({ id: raw.id, content, status, evidenceIds, details: Object.freeze(details) });
	});
	if (active > 1) fail("at most one todo item may be in progress");
	return Object.freeze({
		version: 1,
		revision: value.revision,
		ownerSessionId: value.ownerSessionId,
		storyId: value.storyId,
		title: sanitizeTitle(value.title),
		items: Object.freeze(items),
		updatedAt: value.updatedAt,
	});
}

export function renderTodoMarkdown(document: TodoDocument): string {
	const todo = validateTodoDocument(document);
	const header = JSON.stringify({ version: todo.version, revision: todo.revision, ownerSessionId: todo.ownerSessionId, storyId: todo.storyId, updatedAt: todo.updatedAt });
	const lines = [`<!-- ${header} -->`, `# ${todo.title}`, ""];
	for (const item of todo.items) {
		lines.push(renderEntry(item));
		for (const detail of item.details) lines.push(`  ${renderEntry(detail)}`);
	}
	return `${lines.join("\n")}\n`;
}

export function parseTodoMarkdown(markdown: string): TodoDocument {
	const lines = markdown.split("\n");
	if (lines.at(-1) === "") lines.pop();
	if (lines.length < 3 || !lines[0] || !lines[1] || lines[2] !== "") fail("invalid todo markdown layout");
	const header = parseComment(lines[0]);
	if (!isRecord(header) || Object.keys(header).length !== 5 || header.version !== 1) fail("invalid todo markdown header");
	if (!lines[1].startsWith("# ") || lines[1].slice(2).length === 0) fail("invalid todo heading");
	const items: Array<Omit<TodoItem, "details"> & { details: TodoDetail[] }> = [];
	for (const line of lines.slice(3)) {
		if (line.startsWith("  - ")) {
			const parent = items.at(-1);
			if (!parent) fail("orphan todo detail markdown");
			parent.details.push(parseItemLine(line.slice(2)));
		} else {
			if (/^\s/.test(line)) fail("invalid todo detail indentation");
			items.push({ ...parseItemLine(line), details: [] });
		}
	}
	return validateTodoDocument({ ...header, title: lines[1].slice(2), items });
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
	if (!isRecord(metadata) || Object.keys(metadata).length !== 3 || typeof metadata.id !== "string" || typeof metadata.status !== "string" || !Array.isArray(metadata.evidenceIds)) fail("invalid todo item metadata");
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
	return { id: metadata.id, status, evidenceIds: metadata.evidenceIds as string[], content, details: [] };
}

function renderEntry(item: TodoDetail | TodoItem): string {
	const prefix = item.status === "in_progress" ? "진행 중: " : item.status === "blocked" ? "막힘: " : "";
	const checked = item.status === "completed" ? "x" : " ";
	const metadata = JSON.stringify({ id: item.id, status: item.status, evidenceIds: item.evidenceIds });
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
function fail(message: string): never { throw new Error(`Invalid todo document: ${message}`); }
