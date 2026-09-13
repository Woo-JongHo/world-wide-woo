import type { TuiFeatureDescriptor } from "../feature.types";
import { repositoryUnits } from "./repository.units";

export const repositoryFeature = {
	id: "TUI-F016",
	key: "repository",
	title: "저장소",
	order: 160,
	kind: "interaction",
	status: "active",
	units: repositoryUnits,
} as const satisfies TuiFeatureDescriptor;
