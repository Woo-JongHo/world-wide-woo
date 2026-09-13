import type { TuiFeatureUnitDescriptor } from "../feature.types";

export const planUnits = [
	{ id: "TUI-F003-U01", featureId: "TUI-F003", key: "native-plan-todo", title: "Native Plan·Todo 읽기", status: "active" },
	{ id: "TUI-F003-U02", featureId: "TUI-F003", key: "project-plan-draft", title: "프로젝트 계획 초안 작성", status: "legacy" },
] as const satisfies readonly TuiFeatureUnitDescriptor[];
