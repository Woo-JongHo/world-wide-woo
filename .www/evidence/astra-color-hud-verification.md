# Astra 색상·HUD·질문 요약 보정 검증

검증 시각: 2026-09-12 (Asia/Seoul)

## 구현 결과

- 요청·응답·안내·도구·계획·질문 요약 제목을 `▰` 표식과 역할별 저채도 색으로 본문에서 분리했다.
- 실행 종료 뒤에도 성공·실패·중단과 소요 시간·종료 시각을 상단에 유지한다.
- Codex·Claude·Gemini·Z.AI를 좁은 폭에서도 모두 남기고 provider별 색을 구분한다.
- HUD를 최대 3행으로 제한하고 첫 행에 `A›`를 둔다.
- T-note를 별도 Astra 화면·명령 검색에서 제거하고 ZChat 실행 타임라인의 질문 요약으로 합쳤다. 기존 parser만 호환용으로 유지한다.

## 자동 검증

- `bun run check`: 통과
- `bun test`: 1087 pass, 0 fail, 8265 expectations, 120 files
- 전체 로그: `.www/scratchpad/astra-color-hud-final2-test.log`
- `git diff --check`: 통과
- 변경 대상의 `test.skip`·`test.only`·미구현 자리표시자: 없음 (`TODO` 검색 결과 한 건은 Todo 패널의 실제 라벨)

## 실제 합성 프레임 점검

- production과 같은 Header → Execution Heading → Workspace → Composer → HUD 구조로 80×24와 112×32 프레임을 직접 합성했다.
- 80×24에서 입력창 상·하 경계, `A›`, 모델·권한·context, 현재 action, Codex·Claude·Gemini·Z.AI가 viewport 안에 함께 남았다.
- 112×32에서 실행 타임라인과 우측 Plan rail이 하나의 작업 공간으로 정렬되고, 질문 요약은 별도 패널이 아니라 ZChat 흐름 안에 표시됐다.
- 모든 행은 해당 viewport 폭 이내였고, 카드형 외곽 박스 없이 여백·들여쓰기·얇은 divider로 위계가 유지됐다.

## 독립 검토

- Sonnet 읽기 전용 검토: `.www/scratchpad/astra-color-hud-sonnet.json`
  - provider 색 중복, 실패·중단 성공색, 좁은 폭 provider 누락을 발견했고 수정했다.
- Opus 읽기 전용 검토: `.www/scratchpad/astra-color-hud-opus-final.json`
  - ready/no-limit 표현, compact attention, child turn fallback, 안내/T-note 색 중복을 발견했고 수정했다.
- Opus 후속 최종 감사: `.www/scratchpad/astra-color-hud-opus-followup.json`
  - `claude-opus-5`로 6턴 실행했으나 주간 한도 429로 판정문을 반환하지 못했다. 초기화 시각은 2026-09-14 04:00 KST다.

## 현재 판정

구현과 자동 회귀는 통과했다. 수정 후 Opus 최종 판정은 주간 한도로 실행되지 않았으며, 2026-09-12 사용자 결정으로 이번 작업의 완료 게이트에서 제외했다. 이를 감사 통과로 기록하지 않는다. 커밋·Linear 게시·PR은 아직 수행하지 않았다.

## Linear 대조

이번 Astra 전면 재설계를 대표하는 이슈나 Project Activity Comment는 아직 없다. 관련 기존 이슈는 WOO-754(입력 테두리), WOO-678(HUD), WOO-688(응답 상태), WOO-680(Layout), WOO-693(T-note, 취소·보관)이며 서로 다른 과거 계약을 소유한다. 신규 이슈 후보 위치는 `WOO-673 → WOO-674 Workbench`이고, 관련 이슈를 관계로 연결하는 것이 적합하다.
