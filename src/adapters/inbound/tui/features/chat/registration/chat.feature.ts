import type { TuiFeatureDescriptor } from "@/adapters/inbound/tui/features/feature.types";
import { chatUnits }                 from "@/adapters/inbound/tui/features/chat/registration/chat.units";

export const CHAT_FEATURE = {
	id           : "TUI-F002",
	key          : "chat",
	title        : "Chat",
	order        : 20,
	kind         : "page",
	productGroup : "core-work",
	route        : "execution",
	status       : "active",
	units        : chatUnits,
} as const satisfies TuiFeatureDescriptor;
