import type { TuiFeatureUnitDescriptor } from "@/adapters/inbound/tui/features/feature.types";

export const dashboardUnits = [
	{ id: "TUI-F001-U01", featureId: "TUI-F001", key: "entry-session-summary", title: "첫 진입 세션 요약", status: "active" },
	{ id: "TUI-F001-U02", featureId: "TUI-F001", key: "session-project-observability-dashboard", title: "세션·프로젝트 관측 대시보드", status: "active" },
] as const satisfies readonly TuiFeatureUnitDescriptor[];
