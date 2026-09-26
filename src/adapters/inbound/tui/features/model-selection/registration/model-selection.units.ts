import type { TuiFeatureUnitDescriptor } from "@/adapters/inbound/tui/features/feature.types";

export const modelSelectionUnits = [
	{ id: "TUI-F015-U01", featureId: "TUI-F015", key: "model-reasoning-selection", title: "모델·추론 강도 선택", status: "active" },
] as const satisfies readonly TuiFeatureUnitDescriptor[];
