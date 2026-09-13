import { projectConversationRecap, type ConversationRecap } from "../../domain/work/conversation-recap.js";
import type { WorkbenchSnapshot } from "../../domain/work/workbench.js";

/** Read-only use case: derive the current recap without changing native history. */
export function currentConversationRecap(
	snapshot: Pick<WorkbenchSnapshot, "chat">,
): ConversationRecap {
	return projectConversationRecap(snapshot.chat);
}
