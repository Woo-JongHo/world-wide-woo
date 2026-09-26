import type { TuiFeatureDescriptor } from "@/adapters/inbound/tui/features/feature.types";
import { approvalUnits }             from "@/adapters/inbound/tui/features/approval/registration/approval.units";

export const approvalFeature = {
	id           : "TUI-F013",
	key          : "approval",
	title        : "승인",
	order        : 130,
	kind         : "interaction",
	productGroup : "control",
	status       : "active",
	units        : approvalUnits,
} as const satisfies TuiFeatureDescriptor;
