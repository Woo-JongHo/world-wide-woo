import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { FileDevelopmentMapSource } from "../src/infrastructure/development-map-source";
import { DevelopmentMapView } from "../src/presentation/tui/development-map-view";
import { DevelopmentMapPollingLifecycle } from "../src/presentation/tui/workbench-shell";

describe("development map", () => {
	test("projects explicit initiative, epic, and story relations without inferring acceptance", async () => {
		const root = await mkdtemp(join(tmpdir(), "www-development-map-"));
		await mkdir(join(root, ".www/planning/001-product"), { recursive: true });
		await mkdir(join(root, ".www/evidence"), { recursive: true });
		await writeFile(join(root, ".www/planning/001-product/INITIATIVE.json"), JSON.stringify({
			id: "INIT-001", title: "제품 기반", status: "active",
			artifacts: [{ id: "EP-010", kind: "epic" }, { id: "ST-010-01", kind: "story" }],
			relations: [{ from: "EP-010", kind: "decomposes-to", to: "ST-010-01" }],
		}));
		await writeFile(join(root, ".www/planning/catalog.jsonl"), [
			JSON.stringify({ revision: 1, type: "epic.created", artifact: { id: "EP-010", title: "Planning", goal: "goal", createdAt: "2026-01-01T00:00:00Z" } }),
			JSON.stringify({ revision: 2, type: "story.created", artifact: { id: "ST-010-01", epicId: "EP-010", title: "Map", acceptance: "구조를 표시한다", createdAt: "2026-01-01T00:00:00Z", supersedes: null } }),
			JSON.stringify({ revision: 3, type: "epic.created", artifact: { id: "EP-011", title: "고아 Epic", goal: "goal", createdAt: "2026-01-01T00:00:00Z" } }),
		].join("\n"));
		await writeFile(join(root, ".www/evidence/ST-010-01.md"), "evidence only");
		await writeFile(join(root, ".www/Epics.md"), "## EP-002 — 출력 계약\n\n- 상태: 진행 중\n");
		await writeFile(join(root, ".www/Stories.md"), "## EP-002 — 출력 계약\n\n- [x] ST-002-01 완료 카드\n- [ ] ST-002-02 실시간 출력\n");

		const snapshot = await new FileDevelopmentMapSource(root).read();
		expect(snapshot.revision).toBe(3);
		expect(snapshot.initiatives[0]?.epics[0]?.stories[0]).toMatchObject({
			id: "ST-010-01", status: "drafted",
			relations: {
				run: { state: "unlinked" },
				todo: { state: "unlinked" },
				evidence: { state: "unknown", references: [".www/evidence/ST-010-01.md"] },
			},
		});
		expect(snapshot.unlinkedEpics.map(epic => epic.id)).toEqual(["EP-002", "EP-011"]);
		expect(snapshot.unlinkedEpics[0]).toMatchObject({
			id: "EP-002", title: "출력 계약", status: "진행 중",
			stories: [{ id: "ST-002-01", status: "legacy-completed" }, { id: "ST-002-02", status: "pending" }],
		});

		const output = stripTerminalSequences(new DevelopmentMapView(() => snapshot).render(120).join("\n"));
		expect(output).toContain("INIT-001");
		expect(output).toContain("Esc 돌아가기");
		expect(output).toContain("/dashboard");
		expect(output).toContain("EP-010");
		expect(output).toContain("ST-010-01");
		expect(output).toContain("Evidence unknown · .www/evidence/ST-010-01.md");
		expect(output).toContain("미연결 Epic");
	});

	test("surfaces unavailable and invalid sources instead of a normal empty snapshot", async () => {
		const missing = await new FileDevelopmentMapSource(await mkdtemp(join(tmpdir(), "www-development-map-missing-"))).read();
		expect(missing).toMatchObject({ sourceHealth: { state: "unavailable" }, initiatives: [], unlinkedEpics: [] });

		const root = await mkdtemp(join(tmpdir(), "www-development-map-invalid-"));
		await mkdir(join(root, ".www/planning"), { recursive: true });
		await writeFile(join(root, ".www/planning/catalog.jsonl"), "{not-json}");
		const invalid = await new FileDevelopmentMapSource(root).read();
		expect(invalid.sourceHealth).toMatchObject({ state: "invalid" });
		expect(stripTerminalSequences(new DevelopmentMapView(() => invalid).render(120).join("\n"))).toContain("invalid");
	});

	test("keeps the last valid projection stale during a failed poll without overlapping refreshes", async () => {
		const root = await mkdtemp(join(tmpdir(), "www-development-map-stale-"));
		await mkdir(join(root, ".www/planning"), { recursive: true });
		await mkdir(join(root, ".www/evidence"), { recursive: true });
		const catalog = join(root, ".www/planning/catalog.jsonl");
		await writeFile(catalog, JSON.stringify({ revision: 1, type: "epic.created", artifact: { id: "EP-010", title: "첫 Epic" } }));
		const source = new FileDevelopmentMapSource(root);
		const states: string[] = [];
		const done = new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => reject(new Error("map stale timeout")), 1_000);
			const stop = source.startPolling(snapshot => {
				states.push(snapshot.sourceHealth.state);
				if (snapshot.sourceHealth.state === "stale") { clearTimeout(timeout); stop(); resolve(); }
			}, 10);
		});
		await new Promise(resolve => setTimeout(resolve, 30));
		await writeFile(catalog, "{broken");
		await done;
		expect(states).toEqual(["available", "stale"]);
	});

	test("starts map polling only while map is open and stops idempotently", () => {
		let starts = 0;
		let stops = 0;
		const lifecycle = new DevelopmentMapPollingLifecycle({
			startPolling: () => { starts += 1; return () => { stops += 1; }; },
		}, () => undefined);
		lifecycle.leave();
		lifecycle.enter();
		lifecycle.enter();
		lifecycle.leave();
		lifecycle.leave();
		lifecycle.enter();
		lifecycle.leave();
		expect({ starts, stops }).toEqual({ starts: 2, stops: 2 });
	});

	test("sanitizes and bounds file-derived terminal text", () => {
		const snapshot = {
			revision: 1, observedAt: "", sourceHealth: { state: "available" as const }, unlinkedEpics: [],
			initiatives: [{ id: "INIT-\u001b[2J", title: "x".repeat(200), status: "active", epics: [] }],
		};
		const output = new DevelopmentMapView(() => snapshot).render(200).join("\n");
		expect(output).not.toContain("\u001b[2J");
		expect(stripTerminalSequences(output)).not.toContain("x".repeat(100));
	});

	test("notifies an open map when its planning revision changes", async () => {
		const root = await mkdtemp(join(tmpdir(), "www-development-map-live-"));
		await mkdir(join(root, ".www/planning"), { recursive: true });
		await mkdir(join(root, ".www/evidence"), { recursive: true });
		const catalog = join(root, ".www/planning/catalog.jsonl");
		await writeFile(catalog, JSON.stringify({ revision: 1, type: "epic.created", artifact: { id: "EP-010", title: "첫 Epic" } }));
		const source = new FileDevelopmentMapSource(root);
		const revisions: number[] = [];
		const done = new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => reject(new Error("map refresh timeout")), 1_000);
			const stop = source.startPolling(snapshot => {
				revisions.push(snapshot.revision);
				if (snapshot.revision === 2) { clearTimeout(timeout); stop(); resolve(); }
			}, 10);
		});
		await new Promise(resolve => setTimeout(resolve, 30));
		await writeFile(catalog, [
			JSON.stringify({ revision: 1, type: "epic.created", artifact: { id: "EP-010", title: "첫 Epic" } }),
			JSON.stringify({ revision: 2, type: "story.created", artifact: { id: "ST-010-01", epicId: "EP-010", title: "새 Story" } }),
		].join("\n"));
		await done;
		expect(revisions).toEqual([1, 2]);
	});

	test("marks malformed catalog relations invalid and renders every aggregate as unknown", async () => {
		const root = await mkdtemp(join(tmpdir(), "www-development-map-invalid-"));
		await mkdir(join(root, ".www/planning"), { recursive: true });
		await writeFile(join(root, ".www/planning/catalog.jsonl"), JSON.stringify({
			revision: 2,
			type: "story.created",
			artifact: { id: "ST-010-01", epicId: "EP-010", title: "고아 Story" },
		}));
		const snapshot = await new FileDevelopmentMapSource(root).read();
		expect(snapshot.sourceHealth.state).toBe("invalid");
		const output = stripTerminalSequences(new DevelopmentMapView(() => snapshot).render(100).join("\n"));
		expect(output).toContain("Initiative unknown");
		expect(output).toContain("수락 unknown");
		expect(output).not.toContain("Initiative 0");
		expect(output).not.toContain("미수락 0");
	});

	test("marks malformed Initiative identity and unknown Epic references invalid", async () => {
		for (const manifest of [
			{},
			{ id: "INIT-001", title: "잘못된 관계", artifacts: [{ id: "EP-999", kind: "epic" }] },
			{ id: "INIT-001", title: "알 수 없는 종류", artifacts: [{ id: "garbage", kind: "unknown" }] },
			{ id: "INIT-001", title: "종류 불일치", artifacts: [{ id: "EP-010", kind: "story" }] },
		]) {
			const root = await mkdtemp(join(tmpdir(), "www-development-map-invalid-manifest-"));
			await mkdir(join(root, ".www/planning/001-invalid"), { recursive: true });
			await mkdir(join(root, ".www/evidence"), { recursive: true });
			await writeFile(join(root, ".www/planning/catalog.jsonl"), "");
			await writeFile(join(root, ".www/planning/001-invalid/INITIATIVE.json"), JSON.stringify(manifest));
			const snapshot = await new FileDevelopmentMapSource(root).read();
			expect(snapshot.sourceHealth.state).toBe("invalid");
			expect(stripTerminalSequences(new DevelopmentMapView(() => snapshot).render(100).join("\n")))
				.toContain("Initiative unknown");
		}
	});
});
