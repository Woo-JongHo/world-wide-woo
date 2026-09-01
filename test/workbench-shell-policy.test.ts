import { describe, expect, test } from "bun:test";
import {
	workbenchReceiptClearsComposer,
	workbenchReceiptNotice,
} from "../src/presentation/tui/workbench-shell";

describe("native workbench shell receipt policy", () => {
	test("clears an accepted chat and reports its message", () => {
		const accepted = { state: "accepted", commandId: "chat-1", message: "전송했습니다." } as const;
		expect(workbenchReceiptClearsComposer(accepted)).toBe(true);
		expect(workbenchReceiptNotice(accepted)).toBe("전송했습니다.");
	});

	test("clears a queued chat from the editor and reports its FIFO position", () => {
		const queued = { state: "queued", commandId: "chat-2", position: 2 } as const;
		expect(workbenchReceiptClearsComposer(queued)).toBe(true);
		expect(workbenchReceiptNotice(queued)).toBe("메시지를 대기열 2번에 추가했습니다.");
	});

	test("restores only rejected input", () => {
		const rejected = { state: "rejected", commandId: "chat-3", reason: "보낼 수 없습니다." } as const;
		expect(workbenchReceiptClearsComposer(rejected)).toBe(false);
		expect(workbenchReceiptNotice(rejected)).toBe("보낼 수 없습니다.");
	});

	test("points an uncertain native send to the explicit reconciliation command", () => {
		const uncertain = {
			state: "uncertain",
			commandId: "chat-4",
			reason: "Native turn/start 요청의 수신 여부를 확인할 수 없습니다.",
			resolution: "manual-reconcile",
		} as const;
		expect(workbenchReceiptClearsComposer(uncertain)).toBe(true);
		expect(workbenchReceiptNotice(uncertain)).toContain("/cancel로 서버 상태를 확인하세요");
	});
});
