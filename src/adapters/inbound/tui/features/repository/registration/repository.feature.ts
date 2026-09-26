import type { TuiFeatureDescriptor } from "@/adapters/inbound/tui/features/feature.types";
import { repositoryUnits }           from "@/adapters/inbound/tui/features/repository/registration/repository.units";

export const repositoryFeature = {
	id           : "TUI-F016",
	key          : "repository",
	title        : "저장소",
	order        : 160,
	kind         : "interaction",
	productGroup : "integration",
	status       : "active",
	units        : repositoryUnits,
} as const satisfies TuiFeatureDescriptor;
