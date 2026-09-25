import type { TuiFeatureUnitDescriptor } from "@/adapters/inbound/tui/features/feature.types";

export const monitoringUnits = [
	{ id : "TUI-F006-U01" , featureId : "TUI-F006" , key : "runtime-request-live-monitor"  , title : "Runtime·Request Live Monitor" , status : "active" },
	{ id : "TUI-F006-U02" , featureId : "TUI-F006" , key : "local-workflow-run"            , title : "로컬 Workflow 실행 재개·조회" , status : "active" },
	{ id : "TUI-F006-U03" , featureId : "TUI-F006" , key : "uncertain-operation-read-back" , title : "미확인 동작 read-back 대조"   , status : "active" },
] as const satisfies readonly TuiFeatureUnitDescriptor[];
