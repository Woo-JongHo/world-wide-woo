import { describe, expect, test } from "bun:test";
import { PlanningService, type PlanningCatalogStore } from "../src/application/planning-service";
import { createPlanningSnapshot } from "../src/domain/planning";

const createdAt = "2026-08-31T11:24:24.000Z";

class MemoryStore implements PlanningCatalogStore {
	private snapshot = createPlanningSnapshot(0, [], []);
	async read() { return this.snapshot; }
	async createEpic(title: string, goal: string) {
		const epic = { id: "EP-001", title, goal, createdAt };
		this.snapshot = createPlanningSnapshot(1, [epic], []);
		return { snapshot: this.snapshot, epic };
	}
	async createStory(epicId: string, title: string, acceptance: string, supersedes: string | null = null) {
		const story = { id: "ST-001-01", epicId, title, acceptance, supersedes, createdAt };
		this.snapshot = createPlanningSnapshot(2, this.snapshot.epics, [story]);
		return { snapshot: this.snapshot, story };
	}
}

describe("PlanningService", () => {
	test("publishes current immutable snapshots while isolating listener failures", async () => {
		const service = new PlanningService(new MemoryStore());
		const revisions: number[] = [];
		service.subscribe(() => { throw new Error("broken listener"); });
		service.subscribe(snapshot => revisions.push(snapshot.revision));
		await service.initialize();
		await service.createEpic("Epic", "Goal");
		await service.createStory("EP-001", "Story", "Acceptance");
		expect(revisions).toEqual([0, 1, 2]);
		expect(service.current?.stories[0]?.id).toBe("ST-001-01");
	});
});
