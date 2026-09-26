import { wrapTextWithAnsi }           from "@earendil-works/pi-tui";
import type { ChatFeatureProjection } from "@/core/application/orchestration/workbench-feature-reads.js";
import { currentConversationRecap }   from "@/core/application/work/conversation-recap.js";
import { a, fit, section }            from "@/adapters/inbound/tui/foundation/theme/www-theme.js";

/**
 * Renders the bounded public recap inside Chat's existing expanded transcript.
 * Recap remains a transient Chat aid by design; do not persist or merge it into
 * Note content until the Note contract is redesigned.
 */
export function conversationRecapRows(snapshot: Pick<ChatFeatureProjection, "chat">, width: number): string[] {
	if (width <= 0) return [];
	const recap = currentConversationRecap(snapshot);
	if (recap.entries.length === 0) return [];
	const rows = [...section("Conversation Recap", width, "현재 대화", a.info)];
	for (const entry of recap.entries) {
		const label = entry.role === "user" ? a.request("USER") : a.response("ASSISTANT");
		rows.push(label, ...wrapTextWithAnsi(entry.text, Math.max(1, width - 2)).map(row => `  ${row}`));
	}
	if (recap.omittedMessageCount > 0) {
		rows.push(a.muted(`이전 공개 메시지 ${recap.omittedMessageCount}개 생략`));
	}
	return rows.map(row => fit(row, width));
}
