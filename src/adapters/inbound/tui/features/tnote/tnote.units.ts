import type { TuiFeatureUnitDescriptor } from "@/adapters/inbound/tui/features/feature.types";

export const tnoteUnits = [
	{ id : "TUI-F004-U01" , featureId : "TUI-F004" , key : "completed-question-notes"     , title : "질문별 완료 Note 읽기" , status : "unwired" },
	{ id : "TUI-F004-U02" , featureId : "TUI-F004" , key : "capture"                      , title : "Note 캡처"             , status : "active"  },
	{ id : "TUI-F004-U03" , featureId : "TUI-F004" , key : "canonical-promotion-approval" , title : "Note 정본 반영 승인"   , status : "active"  },
	{ id : "TUI-F004-U04" , featureId : "TUI-F004" , key : "external-review"              , title : "공개 Note 외부 검토"   , status : "active"  },
] as const satisfies readonly TuiFeatureUnitDescriptor[];
