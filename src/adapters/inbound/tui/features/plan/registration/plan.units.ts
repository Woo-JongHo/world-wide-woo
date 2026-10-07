import type { TuiFeatureUnitDescriptor } from "@/adapters/inbound/tui/features/feature.types";

export const planUnits = [
	{ id: "TUI-F003-U01", featureId: "TUI-F003", key: "native-plan-todo", title: "Native Plan·Todo 읽기", status: "active" },
] as const satisfies readonly TuiFeatureUnitDescriptor[];
