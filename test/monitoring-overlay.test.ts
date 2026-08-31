import { describe, expect, test } from "bun:test";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import type { MonitoringListener, MonitoringSource } from "../src/application/session-monitor";
import type { MonitoringSnapshot } from "../src/domain/monitoring";
import { MonitoringOverlay } from "../src/presentation/tui/monitoring-overlay";

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
		expect(output).toContain("Monitoring · Dashboard");
		expect(output).toContain("사용자 2 · WWW 1 · 중단 0");
		expect(output).toContain("성공 3 · 실패 1");
		expect(output).toContain("1/3 · 세부 1/2 · Monitor 구현");
		expect(output).not.toContain("raw prompt");
		expect(updates).toBe(1);
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
