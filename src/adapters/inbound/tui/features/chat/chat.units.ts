import type { TuiFeatureUnitDescriptor } from "@/adapters/inbound/tui/features/feature.types";

export const chatUnits = [
	{ id : "TUI-F002-U01" , featureId : "TUI-F002" , key : "conversation"                    , title : "질문·공개 응답 대화 흐름"     , status : "active" },
	{ id : "TUI-F002-U02" , featureId : "TUI-F002" , key : "welcome"                         , title : "첫 질문 시작 화면"            , status : "active" },
	{ id : "TUI-F002-U03" , featureId : "TUI-F002" , key : "work-observation-cards"          , title : "실행 단계·관측 카드"          , status : "active" },
	{ id : "TUI-F002-U04" , featureId : "TUI-F002" , key : "tool-result-diff-cards"          , title : "도구 결과·Diff 카드"          , status : "legacy" },
	{ id : "TUI-F002-U05" , featureId : "TUI-F002" , key : "delegation-tree-agent-detail"    , title : "위임 작업 트리·에이전트 상세" , status : "active" },
	{ id : "TUI-F002-U06" , featureId : "TUI-F002" , key : "transcript-scroll-position"      , title : "읽던 transcript 위치 유지"    , status : "active" },
	{ id : "TUI-F002-U07" , featureId : "TUI-F002" , key : "conversation-execution-controls" , title : "대화·실행 제어 명령"          , status : "active" },
	{ id : "TUI-F002-U08" , featureId : "TUI-F002" , key : "conversation-recap"              , title : "현재 공개 대화 Recap 조회"    , status : "active" },
] as const satisfies readonly TuiFeatureUnitDescriptor[];
