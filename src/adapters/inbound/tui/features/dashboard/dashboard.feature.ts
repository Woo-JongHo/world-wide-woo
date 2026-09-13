import type { TuiFeatureDescriptor } from "../feature.types";
import { dashboardUnits } from "./dashboard.units";

export const dashboardFeature = {
	id: "TUI-F001",
	key: "dashboard",
	title: "Dashboard",
	order: 10,
	kind: "page",
	route: "dashboard",
	status: "active",
	units: dashboardUnits,
} as const satisfies TuiFeatureDescriptor;
