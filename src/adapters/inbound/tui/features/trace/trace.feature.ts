import type { TuiFeatureDescriptor } from "@/adapters/inbound/tui/features/feature.types";
import { traceUnits }                from "@/adapters/inbound/tui/features/trace/trace.units";

export const TRACE_FEATURE = {
	id     : "TUI-F005",
	key    : "trace",
	title  : "Trace · Source",
	order  : 50,
	kind   : "page",
	route  : "source",
	status : "active",
	units  : traceUnits,
} as const satisfies TuiFeatureDescriptor;
