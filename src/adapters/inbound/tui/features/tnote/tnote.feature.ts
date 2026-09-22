import type { TuiFeatureDescriptor } from "../feature.types";
import { tnoteUnits } from "./tnote.units";

export const TNOTE_FEATURE = {
	id: "TUI-F004",
	key: "tnote",
	title: "Report · Note",
	order: 40,
	kind: "embedded",
	status: "active",
	units: tnoteUnits,
} as const satisfies TuiFeatureDescriptor;
