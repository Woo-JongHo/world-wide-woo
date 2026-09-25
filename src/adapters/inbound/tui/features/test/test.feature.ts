import type { TuiFeatureDescriptor } from "@/adapters/inbound/tui/features/feature.types";
import { testUnits }                 from "@/adapters/inbound/tui/features/test/test.units";

export const testFeature = {
	id     : "TUI-F012",
	key    : "test",
	title  : "Test",
	order  : 120,
	kind   : "page",
	route  : "test",
	status : "active",
	units  : testUnits,
} as const satisfies TuiFeatureDescriptor;
