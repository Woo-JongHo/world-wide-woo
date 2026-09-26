import type { TuiFeatureUnitDescriptor } from "@/adapters/inbound/tui/features/feature.types";

export const traceUnits = [
	{ id: "TUI-F005-U01", featureId: "TUI-F005", key: "plan-execution-flow-tracer", title: "Plan·실행 Flow Tracer", status: "active" },
	{ id: "TUI-F005-U02", featureId: "TUI-F005", key: "activity-source-selection", title: "정확한 Activity Source 선택", status: "active" },
] as const satisfies readonly TuiFeatureUnitDescriptor[];
