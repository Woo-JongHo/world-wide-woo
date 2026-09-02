import { describe, expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";

const UP = "\x1b[A";
const DOWN = "\x1b[B";
const ENTER = "\r";
const ESC = "\x1b";
import type { NativeApprovalRequest } from "../src/domain/native-session";
import type { WorkbenchApprovalDecision } from "../src/domain/workbench";
import { ApprovalOverlay } from "../src/presentation/tui/approval-overlay";

function request(overrides: Partial<NativeApprovalRequest> = {}): NativeApprovalRequest {
	return {
		requestId: 44,
		callbackId: null,
		kind: "command",
		refs: { threadId: "thread-1", approvalRequestId: 44 },
		availableDecisions: ["accept", "acceptForSession", "decline"],
		params: { command: "rm -rf /tmp/probe-dir", reason: "명령 실행에 승인이 필요합니다.", cwd: "/workspace/sample" },
		...overrides,
	};
}

function overlay(overrides: Partial<NativeApprovalRequest> = {}) {
	const decisions: WorkbenchApprovalDecision[] = [];
	let closed = 0;
	const panel = new ApprovalOverlay(request(overrides), () => undefined, (decision) => decisions.push(decision), () => { closed += 1; });
	return { panel, decisions, closed: () => closed, lines: () => panel.render(60).map(stripTerminalSequences) };
}

describe("ApprovalOverlay", () => {
	test("shows the command, the reason, the path, and every advertised decision", () => {
		const lines = overlay().lines().join("\n");
		expect(lines).toContain("승인 필요 · 명령");
		expect(lines).toContain("rm -rf /tmp/probe-dir");
		expect(lines).toContain("명령 실행에 승인이 필요합니다.");
		expect(lines).toContain("/workspace/sample");
		expect(lines).toContain("1. 승인");
		expect(lines).toContain("2. 이번 세션 동안 승인");
		expect(lines).toContain("3. 거절");
	});

	test("pads every row to the requested width so the sheet border stays straight", () => {
		for (const width of [40, 60, 96]) {
			const rows = overlay().panel.render(width);
			expect(rows.every((row) => visibleWidth(row) === width)).toBe(true);
		}
	});

	test("keeps the slash command visible as a second entrance", () => {
		expect(overlay().lines().join("\n")).toContain("/approve");
	});

	test("resolves the highlighted decision on Enter and moves with the arrow keys", () => {
		const view = overlay();
		view.panel.handleInput(DOWN);
		view.panel.handleInput(ENTER);
		expect(view.decisions).toEqual(["acceptForSession"]);
	});

	test("wraps the selection at both ends", () => {
		const view = overlay();
		view.panel.handleInput(UP);
		view.panel.handleInput(ENTER);
		expect(view.decisions).toEqual(["decline"]);
	});

	test("takes a number key as a direct decision", () => {
		const view = overlay();
		view.panel.handleInput("3");
		expect(view.decisions).toEqual(["decline"]);
	});

	test("closes on Escape without deciding anything", () => {
		const view = overlay();
		view.panel.handleInput(ESC);
		expect(view.decisions).toEqual([]);
		expect(view.closed()).toBe(1);
	});

	test("ignores further input once a decision is on its way", () => {
		const view = overlay();
		view.panel.handleInput(ENTER);
		view.panel.handleInput(DOWN);
		view.panel.handleInput(ENTER);
		expect(view.decisions).toEqual(["accept"]);
	});

	test("offers only what the request advertises", () => {
		const lines = overlay({ availableDecisions: ["decline"] }).lines().join("\n");
		expect(lines).toContain("1. 거절");
		expect(lines).not.toContain("승인\n");
		expect(lines).not.toContain("2.");
	});

	test("never invents a decision when the request advertises none", () => {
		const view = overlay({ kind: "permissions", availableDecisions: [], params: {} });
		expect(view.lines().join("\n")).toContain("결정 선택지를 제공하지 않습니다");
		view.panel.handleInput(ENTER);
		expect(view.decisions).toEqual([]);
	});

	test("renders commit, push, and GitHub Issue candidates with their exact execution scope", () => {
		const lines = overlay({
			params: {
				externalMutationCandidates: [
					{ kind: "commit", target: "main", content: "승인 화면 추가", currentState: "2 files staged", scope: "staged files only", status: "pending", payload: { message: "승인 화면 추가" } },
					{ kind: "push", target: "origin/main", content: "abc1234", currentState: "ahead 1", scope: "one commit", status: "ready", payload: { remote: "origin", branch: "main" } },
					{ kind: "issue", target: "owner/repo", content: "버그 보고", currentState: "new", scope: "create one issue", status: "blocked", payload: { title: "버그 보고" } },
				],
			},
		}).lines().join("\n");
		for (const value of ["커밋 · pending", "Push · ready", "GitHub Issue · blocked", "staged files only", "one commit", "create one issue"]) {
			expect(lines).toContain(value);
		}
	});
});
