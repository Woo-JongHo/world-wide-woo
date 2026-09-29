## 변경

- 기본 observe 프로토콜을 INTENT·WORK·RESULT 세 체크포인트로 줄이고 내부 저장 상태는 기존 7단계를 유지했다.
- WORK 체크포인트를 GROUND·DECIDE·EXECUTE·VERIFY에 원자적으로 투영하고 실행 증거와 검증 증거의 재사용을 금지했다.
- broker protocol v2는 기존 7단계 보고와 승인·증거 경계를 그대로 유지했다.

## 영향

- 일반 요청에서 모델이 반복 출력해야 하는 제어 메시지와 protocol context가 줄어든다.
- 고위험 쓰기 요청은 가벼운 observe 경로로 우회할 수 없다.
- 잘못된 WORK 보고가 일부 Stage만 전진시킨 채 요청을 고착시키지 않는다.

## 분류

Improvement · Refactor · Validation

## 검증

- tsc --noEmit이 통과했다.
- Runtime·Workbench·아키텍처 관련 203개 테스트와 4499개 assertion이 통과했다.
- git diff --check가 통과했고 변경 파일에서 TODO·skip·only 표식이 발견되지 않았다.
- 독립 Claude Sonnet 5 리뷰의 원자성·증거 재사용 지적을 수정하고 집중 테스트 26개로 재검증했다.
- 프로젝트가 요구하는 가독성 스크립트 두 개는 현재 경로에 존재하지 않아 실행하지 못했다.

## 연결

- Linear: WOO-700
- Evidence: .www/evidence/2026-09-28-compact-request-runtime
- Review: .www/scratchpad/2026-09-28-compact-request-runtime-review.md
- Branch: dev · HEAD 8486a759746ab2e0748beb1ab9fdd4d250fa6b27 · uncommitted
