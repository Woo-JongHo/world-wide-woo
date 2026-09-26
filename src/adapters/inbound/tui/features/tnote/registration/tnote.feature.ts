import type { TuiFeatureDescriptor } from "@/adapters/inbound/tui/features/feature.types";
import { tnoteUnits }                from "@/adapters/inbound/tui/features/tnote/registration/tnote.units";

export const TNOTE_FEATURE = {
	id           : "TUI-F004",
	key          : "tnote",
	title        : "Report · Note",
	order        : 40,
	kind         : "embedded",
	productGroup : "core-work",
	status       : "active",
	units        : tnoteUnits,
} as const satisfies TuiFeatureDescriptor;
