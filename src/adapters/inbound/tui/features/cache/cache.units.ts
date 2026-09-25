import type { TuiFeatureUnitDescriptor } from "@/adapters/inbound/tui/features/feature.types";

export const cacheUnits = [
	{ id: "TUI-F018-U01", featureId: "TUI-F018", key: "render-cache-dashboard", title: "렌더 캐시 구성·점유·재사용 현황", status: "active" },
] as const satisfies readonly TuiFeatureUnitDescriptor[];
