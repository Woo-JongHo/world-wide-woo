import type { TuiFeatureUnitDescriptor } from "@/adapters/inbound/tui/features/feature.types";

export const sessionUnits = [
	{ id : "TUI-F007-U01" , featureId : "TUI-F007" , key : "native-thread-resume" , title : "Native thread 재개 선택"      , status : "active" },
	{ id : "TUI-F007-U02" , featureId : "TUI-F007" , key : "permission-mode"      , title : "실행 권한·모드 전환"          , status : "active" },
	{ id : "TUI-F007-U03" , featureId : "TUI-F007" , key : "goal-wes-status"      , title : "세션 Goal·WES 상태 다시 읽기" , status : "active" },
] as const satisfies readonly TuiFeatureUnitDescriptor[];
