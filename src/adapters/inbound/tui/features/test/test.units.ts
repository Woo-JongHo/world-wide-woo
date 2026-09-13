import type { TuiFeatureUnitDescriptor } from "../feature.types";

export const testUnits = [
	{ id: "TUI-F012-U01", featureId: "TUI-F012", key: "question-verification-evidence", title: "질문별 검증 계획·근거 보기", status: "active" },
] as const satisfies readonly TuiFeatureUnitDescriptor[];
