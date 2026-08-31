import type { SessionEventInput } from "../domain/session-events";
import { MAX_TODO_EVIDENCE, sanitizeTodoText, validateTodoDocument, type TodoDocument } from "../domain/todos";
import type { SessionRepository, TodoController, TodoStore } from "./ports";

/** Coordinates the project todo document with the session audit trail. */
export class TodoLedger implements TodoController {
	private current: TodoDocument | null = null;
	private readonly listeners = new Set<(snapshot: TodoDocument | null) => void>();

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
		if (this.current && this.current.ownerSessionId !== this.sessionId) {
			throw new Error(`Session Todo owner mismatch: ${this.current.ownerSessionId}`);
		}
		this.emit();
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
			items: items.map((content, index) => ({ id: `todo-${index + 1}`, content, status: "pending" as const, evidenceIds: [] })),
		});
		return this.commit(next);
	}

	public async add(content: string, placement: "now" | "after"): Promise<TodoDocument> {
		const document = this.requireCurrent();
		this.assertOwner(document);
		if (document.items.length >= 12) throw new Error("Todo item limit reached");
		if (placement !== "now" && placement !== "after") throw new Error("Todo placement must be now or after");
		const nextNumber = document.items.reduce((highest, item) => {
			const match = /^todo-(\d+)$/u.exec(item.id);
			return Math.max(highest, match ? Number.parseInt(match[1]!, 10) : 0);
		}, 0) + 1;
		const item = { id: `todo-${nextNumber}`, content, status: placement === "now" ? "in_progress" as const : "pending" as const, evidenceIds: [] };
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

	public async start(itemId: string): Promise<TodoDocument> {
		return this.transition(itemId, (item, document) => {
			this.assertOwner(document);
			if (item.status !== "pending") throw new Error("Only pending todo items can be started");
			if (document.items.some((candidate) => candidate.status === "in_progress")) throw new Error("A todo item is already active");
			return { ...item, status: "in_progress", evidenceIds: [] };
		});
	}

	public async complete(itemId: string): Promise<TodoDocument> {
		return this.transition(itemId, (item, document) => {
			this.assertOwner(document);
			if (item.status !== "in_progress") throw new Error("Only active todo items can be completed");
			if (item.evidenceIds.length === 0) throw new Error("Todo completion requires evidence recorded after start");
			return { ...item, status: "completed" };
		});
	}

	public async block(itemId: string): Promise<TodoDocument> {
		return this.transition(itemId, (item, document) => {
			this.assertOwner(document);
			if (item.status !== "pending" && item.status !== "in_progress") throw new Error("Only pending or active todo items can be blocked");
			return { ...item, status: "blocked" };
		});
	}

	public async reopen(itemId: string): Promise<TodoDocument> {
		return this.transition(itemId, (item, document) => {
			this.assertOwner(document);
			if (item.status !== "blocked") throw new Error("Only blocked todo items can be reopened");
			return { ...item, status: "pending" };
		});
	}

	public async recordEvidence(evidenceId: string): Promise<TodoDocument | null> {
		if (!this.current) return null;
		if (typeof evidenceId !== "string" || !isId(evidenceId)) throw new Error("Invalid evidence id");
		const document = this.requireCurrent();
		this.assertOwner(document);
		const active = document.items.find((item) => item.status === "in_progress");
		if (!active || active.evidenceIds.includes(evidenceId) || active.evidenceIds.length >= MAX_TODO_EVIDENCE) return null;
		const next = this.document({
			...document,
			items: document.items.map((item) => item.id === active.id ? { ...item, evidenceIds: [...item.evidenceIds, evidenceId] } : item),
		});
		return this.commit(next);
	}

	public subscribe(listener: (snapshot: TodoDocument | null) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private async transition(itemId: string, change: (item: TodoDocument["items"][number], document: TodoDocument) => TodoDocument["items"][number]): Promise<TodoDocument> {
		if (typeof itemId !== "string" || !isId(itemId)) throw new Error("Invalid todo item id");
		const document = this.requireCurrent();
		const item = document.items.find((candidate) => candidate.id === itemId);
		if (!item) throw new Error(`Unknown todo item: ${itemId}`);
		const changed = change(item, document);
		return this.commit(this.document({ ...document, items: document.items.map((candidate) => candidate.id === itemId ? changed : candidate) }));
	}

	private async commit(next: TodoDocument): Promise<TodoDocument> {
		const expectedRevision = this.current?.revision ?? null;
		if (await this.store.compareAndSwap(expectedRevision, next) !== "written") {
			this.current = immutableSnapshot(await this.store.read());
			this.emit();
			throw new Error("Todo document changed concurrently");
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

	private assertOwner(document: TodoDocument): void {
		if (document.ownerSessionId !== this.sessionId) throw new Error("Only the todo owner may change it");
	}

	private emit(): void {
		for (const listener of this.listeners) {
			try { listener(this.current); } catch { /* Listeners cannot break ledger state. */ }
		}
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

function immutableSnapshot(document: TodoDocument | null): TodoDocument | null {
	return document === null ? null : validateTodoDocument(document);
}
