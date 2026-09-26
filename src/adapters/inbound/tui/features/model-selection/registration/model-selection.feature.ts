import type { TuiFeatureDescriptor } from "@/adapters/inbound/tui/features/feature.types";
import { modelSelectionUnits }       from "@/adapters/inbound/tui/features/model-selection/registration/model-selection.units";

export const modelSelectionFeature = {
	id           : "TUI-F015",
	key          : "model-selection",
	title        : "모델 선택",
	order        : 150,
	kind         : "interaction",
	productGroup : "control",
	status       : "active",
	units        : modelSelectionUnits,
} as const satisfies TuiFeatureDescriptor;
