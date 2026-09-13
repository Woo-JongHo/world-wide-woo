import type { TuiFeatureDescriptor } from "../feature.types";
import { modelSelectionUnits } from "./model-selection.units";

export const modelSelectionFeature = {
	id: "TUI-F015",
	key: "model-selection",
	title: "모델 선택",
	order: 150,
	kind: "interaction",
	status: "active",
	units: modelSelectionUnits,
} as const satisfies TuiFeatureDescriptor;
