import type { TuiFeatureUnitDescriptor } from "../feature.types";

export const projectMapUnits = [
	{ id: "TUI-F010-U01", featureId: "TUI-F010", key: "project-progress-map", title: "프로젝트 구조·진척도 Map", status: "active" },
] as const satisfies readonly TuiFeatureUnitDescriptor[];
