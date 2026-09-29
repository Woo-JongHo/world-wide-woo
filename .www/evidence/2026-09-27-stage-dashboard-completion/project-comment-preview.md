## 변경

- WWW 기본 실행을 observational Request Runtime으로 연결해 후속 요청도 7단계 관측 대상이 되게 했다.
- 계획 단계의 설명용 evidence 문자열이 실제 Activity ID가 아니어도 Stage 전체를 거절하지 않되 EXECUTE·VERIFY·DELIVER 완료 증거는 계속 엄격하게 검증한다.
- 첫 진입 Dashboard를 RELEASE → PROJECT → NOW → ACTIVITY로 개편하고 현재 PRODUCT_VERSION과 일치하는 Linear Update만 릴리스 노트로 표시한다.
- 최신 일반 Update 뒤에 있는 v0.0.N 릴리스 Update도 최근 20건에서 찾아 현재 버전과 대조한다.
- 첫 화면에서 Session Goal이 아직 없으면 임시 문구인 ‘GOAL 이해 중’을 숨기고 실제 Goal이 생긴 뒤에만 GOAL 배지를 표시한다.
- RELEASE는 로딩·연결 실패·현재 버전 미게시 상태를 구분해 빈 영역처럼 보이지 않게 한다.

## 영향

- Stage가 0/7과 전체 blocked 상태에 머무는 주요 보고 거절 경로를 제거한다.
- 현재 버전과 무관한 Project Update를 릴리스 노트로 오인하지 않는다.
- loading·unavailable에서도 네 개 Dashboard 섹션의 위치가 유지된다.
- 사용자는 실제 목표가 없는 첫 화면을 진행 중 상태로 오인하지 않고 릴리스 노트가 안 보이는 이유를 즉시 구분한다.

## 분류

Feature · Fix · Improvement · Validation

## 검증

- 관련 Workbench·Runtime·Dashboard 테스트 193개가 통과했다.
- 최종 보정 집중 테스트 73개가 통과했다.
- 첫 화면 GOAL·RELEASE 후속 보정 관련 테스트 91개와 tsc --noEmit이 통과했다.
- tsc --noEmit, import normalization, table alignment와 git diff --check가 통과했다.
- 독립 Standards·Spec 재검토가 최종 CLEAR로 판정했다.

## 연결

- Linear: WOO-700 · WOO-907
- Evidence: .www/evidence/2026-09-27-stage-dashboard-completion
- Review: .www/evidence/stage-dashboard-spec-review.md
- Branch: dev · HEAD 495f61c0f3d5e3c9c6d58340d315c06b4ad70cc0 · uncommitted
