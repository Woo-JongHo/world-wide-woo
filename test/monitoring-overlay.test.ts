import { describe, expect, test } from "bun:test";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import type { MonitoringListener, MonitoringSource } from "../src/core/application/session/session-monitor";
import type { MonitoringSnapshot } from "../src/core/domain/observability/monitoring";
import { MonitoringOverlay } from "../src/adapters/inbound/tui/monitoring-overlay";

const base: MonitoringSnapshot = {
	sessionId: "session-123456789",
	projectName: "www",
	cwd: "/repo",
	provider: "openai-codex",
	model: "gpt-5.6-sol",
	effort: "ultra",
	phase: "streaming",
	activityLabel: "파일 확인 중",
	startedAt: Date.now() - 5_000,
	updatedAt: Date.now(),
	elapsedMs: 5_000,
	turns: { user: 2, assistant: 1, cancelled: 0 },
	tools: {
		running: 1,
		passed: 3,
		failed: 1,
		cancelled: 0,
		active: { name: "read", status: "running" },
		latest: { name: "read", status: "running" },
	},
	todo: { completed: 1, total: 3, detailCompleted: 1, detailTotal: 2, activeContent: "Monitor 구현" },
};

class FakeMonitor implements MonitoringSource {
	public snapshot = base;
	public listener: MonitoringListener | null = null;
	public unsubscribed = false;
	subscribe(listener: MonitoringListener): () => void {
		this.listener = listener;
		listener(this.snapshot);
		return () => { this.unsubscribed = true; this.listener = null; };
	}
}

describe("MonitoringOverlay", () => {
	test("renders a content-safe live session dashboard", () => {
		const monitor = new FakeMonitor();
		let updates = 0;
		const overlay = new MonitoringOverlay(monitor, () => { updates += 1; }, () => {});
		overlay.start();
		const output = stripTerminalSequences(overlay.render(70).join("\n"));
		expect(output).toContain("Monitoring · Live snapshot");
		expect(output).toContain("RUNNING");
		expect(output).toContain("이전 이력은 부분적일 수 있음");
		expect(output).toContain("user 2 · 🐙 Wooni 1 · 중단 0");
		expect(output).toContain("성공 3 · 실패 1");
		expect(output).toContain("1/3 · 세부 1/2");
		expect(output).toContain("Monitor 구현");
		expect(output).not.toContain("raw prompt");
		expect(updates).toBe(1);
	});

	test("keeps core status visible at narrow width and marks missing observations unknown", () => {
		const monitor = new FakeMonitor();
		monitor.snapshot = {
			...base,
			phase: "starting",
			activityLabel: null,
			turns: { user: 0, assistant: 0, cancelled: 0 },
			tools: { running: 0, passed: 0, failed: 0, cancelled: 0, active: null, latest: null },
			todo: { completed: 0, total: 0, detailCompleted: 0, detailTotal: 0, activeContent: null },
		};
		const output = stripTerminalSequences(new MonitoringOverlay(monitor, () => {}, () => {}, () => base.updatedAt).render(40).join("\n"));
		for (const value of ["UNKNOWN", "Session", "Turn", "Tool", "Todo", "0/0", "Esc 닫기"]) {
			expect(output).toContain(value);
		}
		expect(output).not.toContain("COMPLETED");
	});

	test.each([
		["completed", { ...base, phase: "ready", tools: { ...base.tools, running: 0, active: null, latest: { name: "read", status: "passed" as const } }, todo: { ...base.todo, completed: 3, activeContent: null } }, "COMPLETED"],
		["failed", { ...base, phase: "error", tools: { ...base.tools, running: 0, active: null, latest: { name: "read", status: "failed" as const } }, todo: { ...base.todo, activeContent: null } }, "FAILED"],
	] as const)("renders %s state from the latest observed snapshot", (_name, snapshot, expected) => {
		const monitor = new FakeMonitor();
		monitor.snapshot = snapshot;
		const output = stripTerminalSequences(new MonitoringOverlay(monitor, () => {}, () => {}, () => snapshot.updatedAt).render(40).join("\n"));
		expect(output).toContain(expected);
		expect(output).toContain("갱신 0s 전");
	});

	test("unsubscribes on Escape", () => {
		const monitor = new FakeMonitor();
		let closed = false;
		const overlay = new MonitoringOverlay(monitor, () => {}, () => { closed = true; });
		overlay.start();
		overlay.handleInput("\u001b");
		expect(closed).toBe(true);
		expect(monitor.unsubscribed).toBe(true);
	});
});
