import type { TuiFeatureDescriptor } from "@/adapters/inbound/tui/features/feature.types";
import { dashboardUnits }            from "@/adapters/inbound/tui/features/dashboard/dashboard.units";

export const dashboardFeature = {
	id     : "TUI-F001",
	key    : "dashboard",
	title  : "Dashboard",
	order  : 10,
	kind   : "page",
	route  : "dashboard",
	status : "active",
	units  : dashboardUnits,
} as const satisfies TuiFeatureDescriptor;
