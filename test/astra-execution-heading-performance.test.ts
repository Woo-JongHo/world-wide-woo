/** @linear WOO-915 */
import { describe, expect, test }                from "bun:test";
import { stripTerminalSequences, visibleWidth }  from "@earendil-works/pi-tui";
import { renderLayoutFrame }                     from "@earendil-works/pi-tui/dist/layout.js";
import { AstraExecutionHeading, AstraWorkspace } from "../src/adapters/inbound/tui/shell/astra-surface";
import type { ProjectActivity }                  from "../src/core/domain/execution/project-activity";
import { astraFixture }                          from "./fixtures/astra-snapshot";

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
	for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
	return Object.freeze(value);
}

describe("AstraExecutionHeading activity projection", () => {
	test("reuses a deeply immutable activity revision and invalidation rebuilds it", () => {
		const snapshot = astraFixture("working");
		const target = snapshot.activities.map(activity => deepFreeze({ ...activity }));
		deepFreeze(target);
		let indexedReads = 0;
		let structuralScans = 0;
		const activities = new Proxy(target, {
			get(array, key, receiver) {
				if (typeof key === "string" && /^\d+$/u.test(key)) indexedReads += 1;
				return Reflect.get(array, key, receiver);
			},
			ownKeys(array) { structuralScans += 1; return Reflect.ownKeys(array); },
		});
		snapshot.activities = activities;
		let hint      = "first"                                                          ;
		let now       = Date.parse("2026-09-11T09:42:10.000Z")                           ;
		const heading = new AstraExecutionHeading(() => snapshot, () => hint, () => now) ;
		const first   = heading.render(100)                                              ;
		expect(indexedReads).toBeGreaterThan(0);
		expect(structuralScans).toBeGreaterThan(0);

		indexedReads    = 0        ;
		structuralScans = 0        ;
		hint            = "second" ;
		now += 240;
		const second = heading.render(70);
		expect(indexedReads).toBe(0);
		expect(structuralScans).toBe(0);
		expect(stripTerminalSequences(second.join("\n"))).toContain("second");
		expect(second).not.toEqual(first);
		expect(second.every(row => visibleWidth(row) <= 70)).toBe(true);

		heading.invalidate();
		heading.render(70);
		expect(indexedReads).toBeGreaterThan(0);
	});

	test("does not trust a shallow-frozen activity array with mutable records", () => {
		const snapshot = astraFixture("ready");
		const terminal: ProjectActivity = {
			...snapshot.activities[1]!,
			id         : "terminal",
			sequence   : 99,
			recordedAt : "2026-09-11T09:42:12.000Z",
			phase      : "completed" as const,
			payload    : { method: "turn/completed" },
		};
		snapshot.activities = Object.freeze([...snapshot.activities, terminal]);
		const heading = new AstraExecutionHeading(() => snapshot, undefined, () => Date.parse("2026-09-11T09:42:20.000Z"), false);
		expect(stripTerminalSequences(heading.render(100)[1]!)).toContain("✓ 처리");

		terminal.phase = "failed";
		terminal.payload = { method: "turn/failed" };
		const failed = stripTerminalSequences(heading.render(100)[1]!);
		expect(failed).toContain("! 실패까지");
		expect(failed).not.toContain("✓");
	});

	test("does not trust a frozen payload containing a mutable method function", () => {
		const snapshot = astraFixture("ready") ;
		let methodText = "turn/completed"      ;
		const method   = () => undefined       ;
		method.toString = () => methodText;
		const terminal: ProjectActivity = {
			...deepFreeze({ ...snapshot.activities[1]! }),
			id         : "functional-terminal",
			sequence   : 99,
			recordedAt : "2026-09-11T09:42:12.000Z",
			phase      : "completed",
			payload    : Object.freeze({ method }) as unknown as ProjectActivity["payload"],
		};
		snapshot.activities = Object.freeze([...snapshot.activities.map(activity => deepFreeze(activity)), Object.freeze(terminal)]);
		const heading = new AstraExecutionHeading(() => snapshot, undefined, () => Date.parse("2026-09-11T09:42:20.000Z"), false);
		expect(stripTerminalSequences(heading.render(100)[1]!)).toContain("✓ 처리");

		methodText = "turn/failed";
		const failed = stripTerminalSequences(heading.render(100)[1]!);
		expect(failed).toContain("! 실패까지");
		expect(failed).not.toContain("✓");
	});

	test("active turn changes invalidate the immutable activity projection key", () => {
		const snapshot = astraFixture("working");
		const laterStart = {
			...snapshot.activities[1]!,
			id         : "later-turn-start",
			sequence   : 99,
			recordedAt : "2026-09-11T09:42:20.000Z",
			nativeRefs : { threadId: "preview-thread", turnId: "later-turn", itemId: "later-turn" },
			payload    : { method: "turn/started" },
		};
		snapshot.activities = deepFreeze([...snapshot.activities, laterStart]);
		const heading = new AstraExecutionHeading(() => snapshot, undefined, () => Date.parse("2026-09-11T09:42:30.000Z"), false);
		snapshot.activeTurnId = "preview-turn";
		const original = stripTerminalSequences(heading.render(100)[1]!);
		snapshot.activeTurnId = "later-turn";
		const switched = stripTerminalSequences(heading.render(100)[1]!);
		expect(original).toContain("29s");
		expect(switched).toContain("10s");
	});

	test("keeps the first started event when its recordedAt is invalid", () => {
		const snapshot = astraFixture("ready");
		const activities = snapshot.activities.map(activity => activity.payload.method === "turn/started"
			? { ...activity, recordedAt: "invalid-first-start" }
			: activity);
		activities.push({
			...snapshot.activities[1]!,
			id         : "later-valid-start",
			sequence   : 98,
			recordedAt : "2026-09-11T09:42:10.000Z",
			payload    : { method: "turn/started" },
		}, {
			...snapshot.activities[1]!,
			id         : "terminal-after-invalid-start",
			sequence   : 99,
			recordedAt : "2026-09-11T09:42:12.000Z",
			phase      : "completed",
			payload    : { method: "turn/completed" },
		});
		snapshot.activities = deepFreeze(activities);
		const heading = new AstraExecutionHeading(() => snapshot, undefined, () => Date.parse("2026-09-11T09:42:20.000Z"), false);
		expect(stripTerminalSequences(heading.render(100)[1]!)).not.toContain("✓ 처리");

		snapshot.phase = "working";
		snapshot.activeTurnId = "preview-turn";
		expect(stripTerminalSequences(heading.render(100)[1]!)).toContain("실행 경과 계산 중");
	});

	test("validates retained frozen activity nodes once across durable appends", () => {
		const snapshot = astraFixture("working");
		let retainedStructuralScans = 0;
		const retained = snapshot.activities.map(activity => new Proxy(deepFreeze({ ...activity }), {
			ownKeys(target) { retainedStructuralScans += 1; return Reflect.ownKeys(target); },
		}));
		snapshot.activities = Object.freeze(retained);
		const heading = new AstraExecutionHeading(() => snapshot, undefined, () => Date.parse("2026-09-11T09:42:30.000Z"), false);
		heading.render(100);
		expect(retainedStructuralScans).toBeGreaterThan(0);

		const appended = deepFreeze({
			...snapshot.activities.at(-1)!,
			id         : "immutable-append",
			sequence   : 100,
			recordedAt : "2026-09-11T09:42:25.000Z",
		});
		retainedStructuralScans = 0;
		snapshot.activities = Object.freeze([...snapshot.activities, appended]);
		heading.render(100);
		expect(retainedStructuralScans).toBe(0);
	});

	test("a failed immutable validation does not trust nodes visited before the failure", () => {
		const snapshot = astraFixture("working");
		let sharedStructuralScans = 0;
		const shared = new Proxy(deepFreeze({ value: "retained" }), {
			ownKeys(target) { sharedStructuralScans += 1; return Reflect.ownKeys(target); },
		});
		const base = deepFreeze({ ...snapshot.activities[1]! });
		const cyclicParams: Record<string, unknown> = { shared };
		cyclicParams.self = cyclicParams;
		cyclicParams.invalidDate = Object.freeze(new Date(0));
		Object.freeze(cyclicParams);
		const invalidActivity = Object.freeze({
			...base,
			payload: Object.freeze({ method: "turn/started", params: cyclicParams }),
		});
		snapshot.activities = Object.freeze([invalidActivity]);
		const heading = new AstraExecutionHeading(() => snapshot, undefined, () => Date.parse("2026-09-11T09:42:30.000Z"), false);
		heading.render(100);
		expect(sharedStructuralScans).toBeGreaterThan(0);

		const validActivity = Object.freeze({
			...base,
			payload: Object.freeze({ method: "turn/started", params: Object.freeze({ shared }) }),
		});
		sharedStructuralScans = 0;
		snapshot.activities = Object.freeze([validActivity]);
		heading.render(100);
		expect(sharedStructuralScans).toBeGreaterThan(0);
	});

	test("layout frames do not invalidate the production heading component", () => {
		const snapshot = deepFreeze(astraFixture("ready"));
		class ObservedHeading extends AstraExecutionHeading {
			invalidations = 0;
			override invalidate(): void { this.invalidations += 1; super.invalidate(); }
		}
		const heading = new ObservedHeading(() => snapshot, undefined, () => Date.parse("2026-09-11T09:42:30.000Z"), false);
		const workspace = new AstraWorkspace(() => snapshot, () => [], undefined, Date.now, false, null, undefined, heading);
		for (let index = 0; index < 3; index++) expect(renderLayoutFrame(workspace.component, 120, 24, () => {}).lines).toHaveLength(24);
		expect(heading.invalidations).toBe(0);
		workspace.transcript.dispose();
	});
});
