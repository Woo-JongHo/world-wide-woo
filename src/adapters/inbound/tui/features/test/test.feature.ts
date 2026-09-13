import type { TuiFeatureDescriptor } from "../feature.types";
import { testUnits } from "./test.units";

export const testFeature = {
	id: "TUI-F012",
	key: "test",
	title: "Test",
	order: 120,
	kind: "page",
	route: "test",
	status: "active",
	units: testUnits,
} as const satisfies TuiFeatureDescriptor;
