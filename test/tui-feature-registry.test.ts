import { describe, expect, test } from "bun:test";
import {
	TUI_FEATURES,
	TUI_FEATURE_UNITS,
	TUI_RETIRED_FEATURE_UNIT_IDS,
	tuiFeatureUnitById,
	tuiFeatureUnitsByFeatureId,
} from "../src/adapters/inbound/tui/features/feature-registry.js";
import type { TuiFeatureId, TuiFeatureUnitId } from "../src/adapters/inbound/tui/features/feature.types.js";

const EXPECTED_COUNTS = {
	"TUI-F001": 2,
	"TUI-F002": 8,
	"TUI-F003": 2,
	"TUI-F004": 4,
	"TUI-F005": 2,
	"TUI-F006": 3,
	"TUI-F007": 3,
	"TUI-F008": 2,
	"TUI-F009": 1,
	"TUI-F010": 1,
	"TUI-F011": 1,
	"TUI-F012": 1,
	"TUI-F013": 1,
	"TUI-F014": 2,
	"TUI-F015": 1,
	"TUI-F016": 2,
} as const satisfies Record<TuiFeatureId, number>;

const EXPECTED_TITLES = {
	"TUI-F001-U01": "첫 진입 프로젝트 요약",
	"TUI-F001-U02": "세션·프로젝트 관측 대시보드",
	"TUI-F002-U01": "질문·공개 응답 대화 흐름",
	"TUI-F002-U02": "첫 질문 시작 화면",
	"TUI-F002-U03": "실행 단계·관측 카드",
	"TUI-F002-U04": "도구 결과·Diff 카드",
	"TUI-F002-U05": "위임 작업 트리·에이전트 상세",
	"TUI-F002-U06": "읽던 transcript 위치 유지",
	"TUI-F002-U07": "대화·실행 제어 명령",
	"TUI-F002-U08": "현재 공개 대화 Recap 조회",
	"TUI-F003-U01": "Native Plan·Todo 읽기",
	"TUI-F003-U02": "프로젝트 계획 초안 작성",
	"TUI-F004-U01": "질문별 완료 T-note 읽기",
	"TUI-F004-U02": "T-note 캡처",
	"TUI-F004-U03": "T-note 정본 반영 승인",
	"TUI-F004-U04": "공개 T-note 외부 검토",
	"TUI-F005-U01": "Plan·실행 Flow Tracer",
	"TUI-F005-U02": "정확한 Activity Source 선택",
	"TUI-F006-U01": "Runtime·Request Live Monitor",
	"TUI-F006-U02": "로컬 Workflow 실행 재개·조회",
	"TUI-F006-U03": "미확인 동작 read-back 대조",
	"TUI-F007-U01": "Native thread 재개 선택",
	"TUI-F007-U02": "실행 권한·모드 전환",
	"TUI-F007-U03": "세션 Goal·WES 상태 다시 읽기",
	"TUI-F008-U01": "Session Review·Diagnostics",
	"TUI-F008-U02": "Request 통계 상세 조사",
	"TUI-F009-U01": "Provider 잔여량·Context HUD",
	"TUI-F010-U01": "프로젝트 구조·진척도 Map",
	"TUI-F011-U01": "세션 Context·권한·도구·위임 현황",
	"TUI-F012-U01": "질문별 검증 계획·근거 보기",
	"TUI-F013-U01": "Native 요청 승인·거절",
	"TUI-F014-U01": "Provider 로그인·인증 방식 선택",
	"TUI-F014-U02": "Provider 인증 삭제",
	"TUI-F015-U01": "모델·추론 강도 선택",
	"TUI-F016-U01": "Git 작업 트리·Commit 조회",
	"TUI-F016-U02": "열린 GitHub Issue 조회",
} as const satisfies Partial<Record<TuiFeatureUnitId, string>>;

describe("TUI feature Unit catalog", () => {
	test("contains the 16 features and exact 36 inventoried Units", () => {
		expect(TUI_FEATURES).toHaveLength(16);
		expect(TUI_FEATURE_UNITS).toHaveLength(36);
		expect(Object.fromEntries(TUI_FEATURE_UNITS.map((unit) => [unit.id, unit.title]))).toEqual(EXPECTED_TITLES);
	});

	test("keeps Unit IDs unique and attached to the declared parent feature", () => {
		expect(new Set(TUI_FEATURE_UNITS.map((unit) => unit.id)).size).toBe(TUI_FEATURE_UNITS.length);
		for (const feature of TUI_FEATURES) {
			for (const unit of feature.units) {
				expect(unit.featureId).toBe(feature.id);
				expect(unit.id.startsWith(`${feature.id}-U`), unit.id).toBe(true);
				expect(tuiFeatureUnitById(unit.id)).toBe(unit);
			}
			expect(tuiFeatureUnitsByFeatureId(feature.id)).toBe(feature.units);
		}
	});

	test("numbers each feature from U01 without gaps and preserves the inventory counts", () => {
		for (const feature of TUI_FEATURES) {
			const units = tuiFeatureUnitsByFeatureId(feature.id);
			expect(units).toHaveLength(EXPECTED_COUNTS[feature.id]);
			expect(units.map((unit) => String(unit.id))).toEqual(
				Array.from({ length: units.length }, (_, index) => `${feature.id}-U${String(index + 1).padStart(2, "0")}`),
			);
		}
	});

	test("never reuses an ID reserved by a retired Unit", () => {
		const currentIds = TUI_FEATURE_UNITS.map((unit) => unit.id);
		const allKnownIds = [...currentIds, ...TUI_RETIRED_FEATURE_UNIT_IDS];
		expect(new Set(allKnownIds).size).toBe(allKnownIds.length);
		for (const retiredId of TUI_RETIRED_FEATURE_UNIT_IDS) {
			expect(tuiFeatureUnitById(retiredId)).toBeUndefined();
		}
	});
});
