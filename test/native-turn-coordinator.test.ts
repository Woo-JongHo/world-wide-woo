import { describe, expect, test } from "bun:test";
import { NativeTurnCoordinator }  from "../src/core/application/orchestration/native-turn-coordinator.js";

describe("NativeTurnCoordinator", () => {
	test("builds exact Native inputs without explicit undefined properties", () => {
		const coordinator = new NativeTurnCoordinator();
		expect(coordinator.threadInput({
			cwd            : "/project",
			model          : undefined,
			effort         : undefined,
			approvalPolicy : "never",
			sandbox        : "workspace-write",
		})).toEqual({ cwd: "/project", approvalPolicy: "never", sandbox: "workspace-write" });
		expect(coordinator.turnInput({
			threadId       : "thread-1",
			text           : "질문",
			cwd            : "/project",
			model          : "gpt-5",
			effort         : "high",
			approvalPolicy : "on-request",
			sandboxPolicy: {
				type                : "workspaceWrite",
				writableRoots       : ["/project"],
				networkAccess       : false,
				excludeTmpdirEnvVar : false,
				excludeSlashTmp     : false,
			},
			collaborationMode: {
				mode: "default",
				settings: { model: "gpt-5", reasoning_effort: "high", developer_instructions: null },
			},
		})).toMatchObject({
			threadId : "thread-1",
			text     : "질문",
			model    : "gpt-5",
			effort   : "high",
		});
		expect(coordinator.steerInput({
			threadId  : "thread-1",
			turnId    : "turn-1",
			messageId : "message-1",
			text      : "후속",
		})).toEqual({
			threadId            : "thread-1",
			expectedTurnId      : "turn-1",
			clientUserMessageId : "message-1",
			text                : "후속",
		});
	});

	test("owns FIFO and uncertain-delivery transitions", () => {
		const coordinator = new NativeTurnCoordinator();
		expect(coordinator.enqueue({ id: "one", content: "첫째", queuedAt: "2026-09-24T00:00:00.000Z" })).toBe(1);
		expect(coordinator.enqueue({ id: "two", content: "둘째", queuedAt: "2026-09-24T00:00:01.000Z" })).toBe(2);
		expect(coordinator.head?.id).toBe("one");
		expect(coordinator.shiftHeadIf("two")).toBe(false);
		expect(coordinator.shiftHeadIf("one")).toBe(true);
		expect(coordinator.head?.id).toBe("two");

		coordinator.markUncertain({ id: "two", content: "둘째" });
		expect(coordinator.deliveryBlocked).toBe(true);
		expect(coordinator.clearUncertain()).toEqual({ id: "two", content: "둘째" });
		expect(coordinator.deliveryBlocked).toBe(false);
	});

	test("instructs Native Plan generation to emit one concise sentence per item", () => {
		const coordinator = new NativeTurnCoordinator();
		for (const mode of ["manual", "plan"] as const) {
			const instructions = coordinator.collaboration(mode, "gpt-5", "high").settings.developer_instructions;
			expect(instructions).toContain("각 항목은 80자 이내의 간결한 한 문장");
			expect(instructions).toContain("여러 행동을 나열하지 마세요");
		}
	});

	test("reads idle, in-progress, and unknown delivery states", () => {
		const coordinator = new NativeTurnCoordinator();
		expect(coordinator.deliveryState({ status: { type: "idle" }, turns: [] })).toEqual({ state: "idle" });
		expect(coordinator.deliveryState({
			status: { type: "active" },
			turns: [{ id: "turn-1", status: { type: "inProgress" } }],
		})).toEqual({ state: "in-progress", turnId: "turn-1" });
		expect(coordinator.deliveryState({ status: { type: "active" }, turns: [{}] })).toEqual({ state: "unknown" });
	});
});
