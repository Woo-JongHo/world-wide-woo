import type { TuiFeatureUnitDescriptor } from "@/adapters/inbound/tui/features/feature.types";

export const contextUnits = [
	{ id: "TUI-F011-U01", featureId: "TUI-F011", key: "session-context-capabilities", title: "세션 Context·권한·도구·위임 현황", status: "active" },
] as const satisfies readonly TuiFeatureUnitDescriptor[];
