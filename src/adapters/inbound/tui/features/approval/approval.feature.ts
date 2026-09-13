import type { TuiFeatureDescriptor } from "../feature.types";
import { approvalUnits } from "./approval.units";

export const approvalFeature = {
	id: "TUI-F013",
	key: "approval",
	title: "승인",
	order: 130,
	kind: "interaction",
	status: "active",
	units: approvalUnits,
} as const satisfies TuiFeatureDescriptor;
