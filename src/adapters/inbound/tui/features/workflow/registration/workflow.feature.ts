import type { TuiFeatureDescriptor } from "@/adapters/inbound/tui/features/feature.types";
import { workflowUnits }             from "@/adapters/inbound/tui/features/workflow/registration/workflow.units";

export const workflowFeature = {
	id           : "TUI-F017",
	key          : "workflow",
	title        : "Workflow",
	order        : 35,
	kind         : "page",
	productGroup : "core-work",
	route        : "workflow",
	status       : "active",
	units        : workflowUnits,
} as const satisfies TuiFeatureDescriptor;
