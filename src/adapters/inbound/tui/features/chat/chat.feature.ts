import type { TuiFeatureDescriptor } from "@/adapters/inbound/tui/features/feature.types";
import { chatUnits }                 from "@/adapters/inbound/tui/features/chat/chat.units";

export const CHAT_FEATURE = {
	id     : "TUI-F002",
	key    : "chat",
	title  : "Chat",
	order  : 20,
	kind   : "page",
	route  : "execution",
	status : "active",
	units  : chatUnits,
} as const satisfies TuiFeatureDescriptor;
