import type { TuiFeatureUnitDescriptor } from "../feature.types";

export const approvalUnits = [
	{ id: "TUI-F013-U01", featureId: "TUI-F013", key: "native-request-decision", title: "Native 요청 승인·거절", status: "active" },
] as const satisfies readonly TuiFeatureUnitDescriptor[];
