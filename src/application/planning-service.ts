import type { PlanningEpic, PlanningSnapshot, PlanningStory } from "../domain/planning.js";

export interface PlanningCatalogStore {
	read(): Promise<PlanningSnapshot>;
	createEpic(title: string, goal: string): Promise<{ snapshot: PlanningSnapshot; epic: PlanningEpic }>;
	createStory(epicId: string, title: string, acceptance: string, supersedes?: string | null): Promise<{ snapshot: PlanningSnapshot; story: PlanningStory }>;
}

export class PlanningService {
	private snapshot: PlanningSnapshot | null = null;
	private readonly listeners = new Set<(snapshot: PlanningSnapshot) => void>();

	public constructor(private readonly store: PlanningCatalogStore) {}
	public get current(): PlanningSnapshot | null { return this.snapshot; }

	public async initialize(): Promise<PlanningSnapshot> { return this.publish(await this.store.read()); }
	public async readSnapshot(): Promise<PlanningSnapshot> { return this.publish(await this.store.read()); }
	public async createEpic(title: string, goal: string): Promise<PlanningEpic> {
		const result = await this.store.createEpic(title, goal); this.publish(result.snapshot); return result.epic;
	}
	public async createStory(epicId: string, title: string, acceptance: string, supersedes?: string | null): Promise<PlanningStory> {
		const result = await this.store.createStory(epicId, title, acceptance, supersedes); this.publish(result.snapshot); return result.story;
	}
	public subscribe(listener: (snapshot: PlanningSnapshot) => void): () => void {
		this.listeners.add(listener);
		if (this.snapshot !== null) this.notify(listener, this.snapshot);
		return () => this.listeners.delete(listener);
	}
	private publish(snapshot: PlanningSnapshot): PlanningSnapshot {
		this.snapshot = snapshot;
		for (const listener of this.listeners) this.notify(listener, snapshot);
		return snapshot;
	}
	private notify(listener: (snapshot: PlanningSnapshot) => void, snapshot: PlanningSnapshot): void {
		try { listener(snapshot); } catch { /* Listener failures must not affect catalog mutations. */ }
	}
}
