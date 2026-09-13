import type { TuiFeatureDescriptor } from "../feature.types";
import { chatUnits } from "./chat.units";

export const CHAT_FEATURE = {
	id: "TUI-F002",
	key: "chat",
	title: "Chat",
	order: 20,
	kind: "page",
	route: "execution",
	status: "active",
	units: chatUnits,
} as const satisfies TuiFeatureDescriptor;
