import type { TuiFeatureDescriptor } from "@/adapters/inbound/tui/features/feature.types";
import { approvalUnits }             from "@/adapters/inbound/tui/features/approval/approval.units";

export const approvalFeature = {
	id     : "TUI-F013",
	key    : "approval",
	title  : "승인",
	order  : 130,
	kind   : "interaction",
	status : "active",
	units  : approvalUnits,
} as const satisfies TuiFeatureDescriptor;
