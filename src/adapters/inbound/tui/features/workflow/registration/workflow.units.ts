import type { TuiFeatureUnitDescriptor } from "@/adapters/inbound/tui/features/feature.types";

export const workflowUnits = [
	{ id: "TUI-F017-U01", featureId: "TUI-F017", key: "request-subagent-workflow", title: "Request 단계·Subagent 위임 관측", status: "active" },
] as const satisfies readonly TuiFeatureUnitDescriptor[];
