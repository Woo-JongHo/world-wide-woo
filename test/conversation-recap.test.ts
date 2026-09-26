import { describe, expect, test }               from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import {
	CONVERSATION_RECAP_MAX_ENTRIES,
	CONVERSATION_RECAP_MAX_ENTRY_CODE_POINTS,
	CONVERSATION_RECAP_MAX_TOTAL_CODE_POINTS,
	projectConversationRecap,
} from "../src/core/domain/work/conversation-recap.js";
import { currentConversationRecap }             from "../src/core/application/work/conversation-recap.js";
import { conversationRecapRows }                from "../src/adapters/inbound/tui/features/chat/view/conversation-recap-view.js";
import type { WorkbenchChatMessage }            from "../src/core/domain/work/workbench.js";

function message(id: string, role: WorkbenchChatMessage["role"], content: string): WorkbenchChatMessage {
	return { id, role, content, activityId: `activity-${id}`, status: "completed" };
}

describe("Conversation Recap", () => {
	test("derives only public user and assistant text without mutating native messages", () => {
		const messages = [
			message("u1", "user", "토큰 sk-private-secret 로 배포해줘"),
			{ ...message("a1", "assistant", "<analysis>숨은 판단과 tool payload</analysis>\n<answer>배포 준비를 마쳤습니다.</answer>"), toolPayload: "절대 노출 금지" },
			message("s1", "system", "비공개 시스템 지침"),
		] as readonly WorkbenchChatMessage[];
		const before = JSON.stringify(messages);
		const recap = currentConversationRecap({ chat: messages });

		expect(recap.entries).toEqual([
			{ role: "user", text: "토큰 [redacted] 로 배포해줘" },
			{ role: "assistant", text: "배포 준비를 마쳤습니다." },
		]);
		expect(JSON.stringify(messages)).toBe(before);
		const output = JSON.stringify(recap);
		for (const hidden of ["숨은 판단", "tool payload", "절대 노출 금지", "비공개 시스템 지침", "sk-private-secret"]) {
			expect(output).not.toContain(hidden);
		}
	});

	test("keeps the first request and latest public messages inside fixed bounds", () => {
		const messages = Array.from({ length: 12 }, (_, index) =>
			message(String(index), index % 2 === 0 ? "user" : "assistant", `${index}:${"가".repeat(500)}`));
		const recap = projectConversationRecap(messages);

		expect(recap.entries).toHaveLength(CONVERSATION_RECAP_MAX_ENTRIES);
		expect(recap.entries[0]?.text).toStartWith("0:");
		expect(recap.entries[1]?.text).toStartWith("7:");
		expect(recap.omittedMessageCount).toBe(6);
		expect(recap.truncated).toBe(true);
		expect(recap.entries.every(entry => Array.from(entry.text).length <= CONVERSATION_RECAP_MAX_ENTRY_CODE_POINTS)).toBe(true);
		expect(recap.entries.reduce((total, entry) => total + Array.from(entry.text).length, 0)).toBeLessThanOrEqual(CONVERSATION_RECAP_MAX_TOTAL_CODE_POINTS);
	});

	test("renders the recap as bounded TUI rows and stays hidden until explicitly expanded", async () => {
		const messages = [message("u1", "user", "현재 기능을 확인해줘"), message("a1", "assistant", "확인 결과는 안전합니다.")] ;
		const rows     = conversationRecapRows({ chat: messages }, 40)                                                          ;
		const plain    = stripTerminalSequences(rows.join("\n"))                                                                ;

		expect(plain).toContain("Conversation Recap");
		expect(plain).toContain("현재 기능을 확인해줘");
		expect(plain).toContain("확인 결과는 안전합니다.");
		expect(rows.every(row => visibleWidth(row) <= 40)).toBe(true);

		const { WwwTranscriptView } = await import("../src/adapters/inbound/tui/features/chat/view/www-execution.js");
		const { wwwFixture } = await import("./fixtures/www-snapshot.js");
		const snapshot = wwwFixture("ready");
		const view = new WwwTranscriptView(snapshot);
		expect(stripTerminalSequences(view.render(80).join("\n"))).not.toContain("Conversation Recap");
		view.expanded = true;
		expect(stripTerminalSequences(view.render(80).join("\n"))).toContain("Conversation Recap");
	});
});
