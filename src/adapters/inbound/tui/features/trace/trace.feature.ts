import type { TuiFeatureDescriptor } from "../feature.types";
import { traceUnits } from "./trace.units";

export const TRACE_FEATURE = {
	id: "TUI-F005",
	key: "trace",
	title: "Trace",
	order: 50,
	kind: "page",
	route: "source",
	status: "active",
	units: traceUnits,
} as const satisfies TuiFeatureDescriptor;
