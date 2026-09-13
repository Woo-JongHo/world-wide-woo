import type { TuiFeatureUnitDescriptor } from "../feature.types";

export const repositoryUnits = [
	{ id: "TUI-F016-U01", featureId: "TUI-F016", key: "git-activity", title: "Git 작업 트리·Commit 조회", status: "legacy" },
	{ id: "TUI-F016-U02", featureId: "TUI-F016", key: "github-issues", title: "열린 GitHub Issue 조회", status: "legacy" },
] as const satisfies readonly TuiFeatureUnitDescriptor[];
