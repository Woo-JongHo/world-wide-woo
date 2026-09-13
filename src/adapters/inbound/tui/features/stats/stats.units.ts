import type { TuiFeatureUnitDescriptor } from "../feature.types";

export const statsUnits = [
	{ id: "TUI-F008-U01", featureId: "TUI-F008", key: "session-review-diagnostics", title: "Session Review·Diagnostics", status: "active" },
	{ id: "TUI-F008-U02", featureId: "TUI-F008", key: "request-detail", title: "Request 통계 상세 조사", status: "active" },
] as const satisfies readonly TuiFeatureUnitDescriptor[];
