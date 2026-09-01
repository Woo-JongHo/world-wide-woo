import type { SessionEventInput } from "../domain/session-events";
import {
	MAX_TODO_EVIDENCE,
	sanitizeTodoText,
	validateTodoDocument,
	type TodoDetail,
	type TodoDocument,
	type TodoItem,
	type TodoItemStatus,
} from "../domain/todos";
import type { SemanticWorkStep, WorkFlowProjection, WorkStepStatus } from "../domain/work-steps";
import type { SessionRepository, TodoController, TodoStore } from "./ports";

/** Coordinates the project todo document with the session audit trail. */
export class TodoLedger implements TodoController {
	private current: TodoDocument | null = null;
	private readonly listeners = new Set<(snapshot: TodoDocument | null) => void>();
	private stopWatching: (() => void) | null = null;

	public constructor(
		private readonly sessionId: string,
		private readonly store: TodoStore,
		private readonly events: SessionRepository,
		private readonly clock: () => Date = () => new Date(),
	) {}

	public get snapshot(): TodoDocument | null {
		return this.current;
	}

	public async initialize(): Promise<void> {
		this.current = immutableSnapshot(await this.store.read());
		this.stopWatching?.();
		const observable = this.store as TodoStore & {
			watch?: (listener: (document: TodoDocument | null, source: string | null) => void) => () => void;
		};
		this.stopWatching = observable.watch?.((document) => {
			const snapshot = immutableSnapshot(document);
			if (JSON.stringify(snapshot) === JSON.stringify(this.current)) return;
			this.current = snapshot;
			this.emit();
		}) ?? null;
		this.emit();
	}

	public dispose(): void {
		this.stopWatching?.();
		this.stopWatching = null;
	}

	/** Mirrors the current Native plan into the canonical two-level Todo.md. */
	public async syncNativePlan(_turnId: string, flow: WorkFlowProjection): Promise<TodoDocument> {
		let activeAssigned = false;
		const items = flow.steps.slice(0, 12).map((step, index): TodoItem => {
			let status = todoStatus(step.status);
			if (status === "in_progress") {
				if (activeAssigned) status = "pending";
				else activeAssigned = true;
			}
			return nativeTodoItem(step, index, status);
		});
		const content = {
			ownerSessionId: this.sessionId,
			storyId: null,
			title: boundedTodoText(flow.goal, "현재 요청"),
			items,
		};
		if (this.current && sameTodoContent(this.current, content)) return this.current;
		return this.commit(this.document(content));
	}

	public async create(title: string, items: readonly string[], storyId?: string): Promise<TodoDocument> {
		if (this.current && !this.current.items.every((item) => item.status === "completed")) {
			throw new Error(
				`Cannot replace unfinished todo work; continue ${this.current.items
					.map(item => `${item.id} [${item.status}] ${item.content}`)
					.join("; ")}`,
			);
		}
		if (!Array.isArray(items) || items.length < 1 || items.length > 12 || items.some((item) => typeof item !== "string")) {
			throw new Error("Todo items must contain between 1 and 12 strings");
		}
		const next = this.document({
			ownerSessionId: this.sessionId,
			storyId: storyId ?? null,
			title,
			items: items.map((content, index) => ({ id: `todo-${index + 1}`, content, status: "pending" as const, evidenceIds: [], details: [] })),
		});
		return this.commit(next);
	}

	public async add(content: string, placement: "now" | "after"): Promise<TodoDocument> {
		const document = this.requireCurrent();
		if (document.items.length >= 12) throw new Error("Todo item limit reached");
		if (placement !== "now" && placement !== "after") throw new Error("Todo placement must be now or after");
		const nextNumber = document.items.reduce((highest, item) => {
			const match = /^todo-(\d+)$/u.exec(item.id);
			return Math.max(highest, match ? Number.parseInt(match[1]!, 10) : 0);
		}, 0) + 1;
		const item = { id: `todo-${nextNumber}`, content, status: placement === "now" ? "in_progress" as const : "pending" as const, evidenceIds: [], details: [] };
		const activeIndex = document.items.findIndex(candidate => candidate.status === "in_progress");
		let items = document.items.map(candidate =>
			placement === "now" && candidate.status === "in_progress"
				? { ...candidate, status: "pending" as const, evidenceIds: [] }
				: candidate,
		);
		const firstIncomplete = items.findIndex(candidate => candidate.status !== "completed");
		const insertion = placement === "after"
			? activeIndex >= 0 ? activeIndex + 1 : items.length
			: activeIndex >= 0 ? activeIndex : firstIncomplete >= 0 ? firstIncomplete : items.length;
		const index = insertion;
		items = [...items.slice(0, index), item, ...items.slice(index)];
		return this.commit(this.document({ ...document, items }));
	}

	public async addDetails(itemId: string, details: readonly string[]): Promise<TodoDocument> {
		if (typeof itemId !== "string" || !isId(itemId)) throw new Error("Invalid todo item id");
		if (!Array.isArray(details) || details.length < 1 || details.length > 8 || details.some(detail => typeof detail !== "string")) {
			throw new Error("Todo details must contain between 1 and 8 strings");
		}
		const document = this.requireCurrent();
		const parent = document.items.find(item => item.id === itemId);
		if (!parent) throw new Error(`Unknown todo item: ${itemId}`);
		if (parent.status === "completed") throw new Error("Cannot add details to a completed todo item");
		if (parent.details.length + details.length > 8) throw new Error("Todo detail limit reached");
		const nextNumber = parent.details.reduce((highest, detail) => {
			const match = new RegExp(`^${escapeRegExp(parent.id)}-detail-(\\d+)$`, "u").exec(detail.id);
			return Math.max(highest, match ? Number.parseInt(match[1]!, 10) : 0);
		}, 0);
		const next = this.document({
			...document,
			items: document.items.map(item => item.id === parent.id
				? {
					...item,
					details: [
						...item.details,
						...details.map((content, index) => ({
							id: `${parent.id}-detail-${nextNumber + index + 1}`,
							content,
							status: "pending" as const,
							evidenceIds: [],
						})),
					],
				}
				: item),
		});
		return this.commit(next);
	}

	public async start(itemId: string): Promise<TodoDocument> {
		return this.transition(itemId, (item, parent, document) => {
			if (item.status !== "pending") throw new Error("Only pending todo items can be started");
			if (parent) {
				if (parent.status !== "in_progress") throw new Error("Todo detail requires an active parent");
				if (document.items.some(candidate => candidate.details.some(detail => detail.status === "in_progress"))) {
					throw new Error("A todo detail is already active");
				}
			} else if (document.items.some((candidate) => candidate.status === "in_progress")) throw new Error("A todo item is already active");
			return { ...item, status: "in_progress", evidenceIds: [] };
		});
	}

	public async complete(itemId: string): Promise<TodoDocument> {
		return this.transition(itemId, (item, parent, document) => {
			if (item.status !== "in_progress") throw new Error("Only active todo items can be completed");
			if (parent) {
				if (item.evidenceIds.length === 0) throw new Error("Todo detail completion requires evidence recorded after start");
			} else if (isTodoParent(item) && item.details.length > 0) {
				if (!item.details.every(detail => detail.status === "completed")) throw new Error("Todo completion requires all details to be completed");
			} else if (item.evidenceIds.length === 0) throw new Error("Todo completion requires evidence recorded after start");
			return { ...item, status: "completed" };
		});
	}

	public async block(itemId: string): Promise<TodoDocument> {
		return this.transition(itemId, (item, parent, document) => {
			if (item.status !== "pending" && item.status !== "in_progress") throw new Error("Only pending or active todo items can be blocked");
			if (parent) return { ...item, status: "blocked" };
			if (!isTodoParent(item)) throw new Error("Invalid todo detail parent");
			return { ...item, status: "blocked", details: item.details.map(detail => detail.status === "in_progress" ? { ...detail, status: "blocked" as const } : detail) };
		});
	}

	public async reopen(itemId: string): Promise<TodoDocument> {
		return this.transition(itemId, (item, _parent, document) => {
			if (item.status !== "blocked") throw new Error("Only blocked todo items can be reopened");
			return { ...item, status: "pending" };
		});
	}

	public async recordEvidence(evidenceId: string): Promise<TodoDocument | null> {
		if (!this.current) return null;
		if (typeof evidenceId !== "string" || !isId(evidenceId)) throw new Error("Invalid evidence id");
		const document = this.requireCurrent();
		const active = document.items.find((item) => item.status === "in_progress");
		const activeDetail = active?.details.find(detail => detail.status === "in_progress");
		if (!active) return null;
		if (activeDetail && (activeDetail.evidenceIds.includes(evidenceId) || activeDetail.evidenceIds.length >= MAX_TODO_EVIDENCE)) return null;
		if (!activeDetail && (active.evidenceIds.includes(evidenceId) || active.evidenceIds.length >= MAX_TODO_EVIDENCE)) return null;
		const next = this.document({
			...document,
			items: document.items.map((item) => item.id !== active.id ? item : activeDetail
				? { ...item, details: item.details.map(detail => detail.id === activeDetail.id ? { ...detail, evidenceIds: [...detail.evidenceIds, evidenceId] } : detail) }
				: { ...item, evidenceIds: [...item.evidenceIds, evidenceId] }),
		});
		return this.commit(next);
	}

	public subscribe(listener: (snapshot: TodoDocument | null) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private async transition(itemId: string, change: (item: TodoDocument["items"][number] | TodoDocument["items"][number]["details"][number], parent: TodoDocument["items"][number] | null, document: TodoDocument) => TodoDocument["items"][number] | TodoDocument["items"][number]["details"][number]): Promise<TodoDocument> {
		if (typeof itemId !== "string" || !isId(itemId)) throw new Error("Invalid todo item id");
		const document = this.requireCurrent();
		const parent = document.items.find(candidate => candidate.id === itemId);
		if (parent) {
			const changed = change(parent, null, document);
			return this.commit(this.document({ ...document, items: document.items.map(candidate => candidate.id === itemId ? changed as typeof candidate : candidate) }));
		}
		const detailParent = document.items.find(candidate => candidate.details.some(detail => detail.id === itemId));
		const detail = detailParent?.details.find(candidate => candidate.id === itemId);
		if (!detail || !detailParent) throw new Error(`Unknown todo item: ${itemId}`);
		const changed = change(detail, detailParent, document);
		return this.commit(this.document({
			...document,
			items: document.items.map(candidate => candidate.id !== detailParent.id ? candidate : {
				...candidate,
				details: candidate.details.map(value => value.id === itemId ? changed as typeof value : value),
			}),
		}));
	}

	private async commit(next: TodoDocument): Promise<TodoDocument> {
		const expectedRevision = this.current?.revision ?? null;
		if (await this.store.compareAndSwap(expectedRevision, next) !== "written") {
			let current: TodoDocument | null = null;
			try { current = await this.store.read(); } catch { current = null; }
			this.current = immutableSnapshot(current);
			this.emit();
			const inspectable = this.store as TodoStore & {
				readonly lastConflictSource?: string | null;
				readSource?: () => Promise<string | null>;
			};
			let source = inspectable.lastConflictSource ?? null;
			if (source === null && inspectable.readSource) {
				try { source = await inspectable.readSource(); } catch { source = null; }
			}
			throw new TodoWriteConflictError(source, next, this.current);
		}
		this.current = next;
		this.emit();
		await this.events.append(this.sessionId, todoUpdatedEvent(next));
		return next;
	}

	private document(value: Omit<TodoDocument, "version" | "revision" | "updatedAt"> & Partial<Pick<TodoDocument, "revision">>): TodoDocument {
		return validateTodoDocument({
			...value,
			version: 1,
			revision: (this.current?.revision ?? -1) + 1,
			updatedAt: this.clock().toISOString(),
		});
	}

	private requireCurrent(): TodoDocument {
		if (!this.current) throw new Error("Todo document has not been initialized");
		return this.current;
	}

	private emit(): void {
		for (const listener of this.listeners) {
			try { listener(this.current); } catch { /* Listeners cannot break ledger state. */ }
		}
	}
}

export class TodoWriteConflictError extends Error {
	public constructor(
		public readonly currentSource: string | null,
		public readonly pending: TodoDocument,
		public readonly current: TodoDocument | null,
	) {
		super("Todo document changed concurrently; review currentSource and pending before retrying");
		this.name = "TodoWriteConflictError";
	}
}

function todoUpdatedEvent(document: TodoDocument): SessionEventInput {
	return {
		category: "todo",
		type: "todo.updated",
		status: "passed",
		title: "Todo updated",
		body: document.title,
		metadata: { todo: JSON.parse(JSON.stringify(document)) as Record<string, unknown> },
	};
}

function isId(value: string): boolean {
	return /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value) && sanitizeTodoText(value) === value;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function isTodoParent(item: TodoDocument["items"][number] | TodoDocument["items"][number]["details"][number]): item is TodoDocument["items"][number] {
	return "details" in item;
}

function nativeTodoItem(step: SemanticWorkStep, index: number, status: TodoItemStatus): TodoItem {
	const id = `native-step-${index + 1}`;
	const evidenceIds = validEvidenceIds(step.activityIds);
	const summaries = step.narration.inputSummary
		.map((summary) => boundedTodoText(summary, "실행 내용 확인"))
		.filter((summary, summaryIndex, values) => values.indexOf(summary) === summaryIndex)
		.slice(0, 8);
	const details = summaries.map((content, detailIndex): TodoDetail => {
		const isLast = detailIndex === summaries.length - 1;
		return {
			id: `${id}-detail-${detailIndex + 1}`,
			content,
			status: detailStatus(status, isLast),
			evidenceIds: isLast ? evidenceIds : [],
		};
	});
	return {
		id,
		content: boundedTodoText(step.title, `Step ${index + 1}`),
		status,
		evidenceIds: details.length === 0 ? evidenceIds : [],
		details,
	};
}

function todoStatus(status: WorkStepStatus): TodoItemStatus {
	if (status === "running") return "in_progress";
	if (status === "completed") return "completed";
	if (status === "failed" || status === "cancelled") return "blocked";
	return "pending";
}

function detailStatus(parentStatus: TodoItemStatus, isLast: boolean): TodoItemStatus {
	if (parentStatus === "completed") return "completed";
	if (parentStatus === "blocked") return "blocked";
	if (parentStatus === "in_progress") return isLast ? "in_progress" : "completed";
	return "pending";
}

function validEvidenceIds(values: readonly string[]): string[] {
	return [...new Set(values.filter(isId))].slice(-MAX_TODO_EVIDENCE);
}

function boundedTodoText(value: string, fallback: string): string {
	const sanitized = sanitizeTodoText(value) || fallback;
	return Array.from(sanitized).slice(0, 120).join("");
}

function sameTodoContent(
	current: TodoDocument,
	next: Pick<TodoDocument, "ownerSessionId" | "storyId" | "title" | "items">,
): boolean {
	return current.ownerSessionId === next.ownerSessionId
		&& current.storyId === next.storyId
		&& current.title === next.title
		&& JSON.stringify(current.items) === JSON.stringify(next.items);
}

function immutableSnapshot(document: TodoDocument | null): TodoDocument | null {
	return document === null ? null : validateTodoDocument(document);
}
