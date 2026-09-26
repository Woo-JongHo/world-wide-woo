# WWW 오픈소스 비교·키값 정합성·가독성 감사 — 2026-09-19

- 목적: (1) 유명 오픈소스 터미널 코딩 에이전트와의 차이·도입점, (2) 병합 WIP 코드의 정합성·가독성, (3) 여러 도구 병합에서 키값(키 바인딩)이 코드·도움말·문서에 일관하게 적용되는지 검증
- 확인 revision: `1d7b451` + 미커밋 작업트리(렌더 성능·Antigravity 인증·zai 사용량)
- 방법: 코드 실측(astra-surface·workbench-shell·usage/auth 어댑터), 범위 지정 독립 리뷰 1회(12건, 표본 교차검증 2건 일치), 공개 문서 조사

## 1. 유명 오픈소스와의 비교

| 도구 | 언어·UI | 구조 | WWW와의 차이 |
| --- | --- | --- | --- |
| [OpenCode](https://opencode.ai) | TS · 풀 TUI | client-server + LSP + MCP + plugin, TUI/데스크톱/IDE 다중 표면 | WWW는 client-server(codex app-server)까지는 유사. LSP 연동과 키바인드 설정화가 없음 |
| [Crush](https://thenewstack.io/terminal-user-interfaces-review-of-crush-ex-opencode-al) (Charm) | Go · Bubble Tea | Elm Architecture(Model-Update-View) — 갱신 루프가 순수 함수에 가깝다 | WWW 셸은 거대 컨트롤러 1개가 조립·키·명령을 모두 보유(update 분리 없음) |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | TS · Ink/React | 샌드박스 실행, 프레임워크 UI | WWW는 자체 pi-tui. 도구 실행 샌드박스 계약이 약함 |
| [Aider](https://aider.chat/2023/10/22/repomap.html) | Python · REPL | tree-sitter repo-map을 매 요청에 첨부, git auto-commit | WWW의 /map은 개발 현황 지도일 뿐 프롬프트용 코드 repo-map이 없음 |

### 도입 가능 부분 (우선순위)

1. **동작 이름 기준 키맵 단일 원본** (OpenCode, [keybinds 문서](https://opencode.ai/docs/keybinds/)): 바인딩을 키가 아니라 동작 이름(`session_new`, `command_list`)으로 정의하고, 기본맵 1곳 + 사용자 재매핑 + `none` 비활성화 + 플랫폼 변형(Windows)을 선언적으로 처리. WWW의 3원본 분산(아래 2장)의 직접 해법.
2. **Elm식 갱신 분리** (Crush/Bubble Tea): 셸의 입력→상태→렌더 전이를 순수 전이 함수로 모으면 키 회귀 테스트가 쉬워진다.
3. **tree-sitter repo-map** (Aider): Native 요청 컨텍스트에 코드 요약 지도 첨부 — pi lane·Codex 모두 공용으로 쓸 수 있는 표면.
4. **LSP 연동** (OpenCode): 에디터 자동완성·정의 이동 품질. 현재 WWW는 파일 탐색 자동완성만 제공.
5. **도구 실행 샌드박스 계약** (Gemini CLI): Bash 카드의 실행 격리 문서화·옵션화.

## 2. 키값 정합성 감사 — 3원본이 각자 놀린다

키 바인딩의 원본이 코드 테이블·도움말 화면·문서 3곳에 흩어져 있고, 키를 고정하는 테스트가 0건이다.

| 원본 | 위치 | 관리 방식 |
| --- | --- | --- |
| 코드 테이블 | `ASTRA_KEYS`(F2–F9), `ASTRA_VIEWS`(Ctrl+G 1–8) — `src/adapters/inbound/tui/shell/www-surface.ts:20-30` | 배열 상수. F키 루프(`workbench-shell.ts:1078`)만 소비 |
| 도움말 화면 | `HelpView` — `www-surface.ts:95-105` | 키 줄을 하드코딩, `ASTRA_VIEWS`만 재사용 |
| 문서 | [WWW_EXECUTION_CONSOLE.md](../WWW_EXECUTION_CONSOLE.md) 46-68행 | 수동 표 |

확인된 어긋남:

1. **F9 누락**: 코드엔 `f9 → /test`(`www-surface.ts:23`)가 있으나 HelpView(`:100`)와 문서(68행) 모두 "F2–F8"로 표기.
2. **Shift+Tab 미기재**: `cycleRuntimeMode`(협업·권한 모드 순환, `workbench-shell.ts:478`, `:1102`)가 HelpView·문서 어디에도 없음.
3. **Esc 중단 조건 이중 분기**: `workbench-shell.ts:1143`(dashboard 모드 조건부 취소)과 `:1153`(작업 중 Esc 전역 취소)이 같은 `chat.cancel`을 중복 처리 — 1143은 1153의 부분집합이며 문서는 "실행 화면의 입력 상태"로만 기술.
4. **Ctrl+C 미기재**: 오버레이 닫기·이중 눌러 종료(`:1157-1169`)가 문서 표에 없음.
5. **키 회귀 테스트 부재**: `test/www-shell.test.ts`에 키 관련 단정이 0건 — 리맵·충돌이 발생해도 어떤 테스트도 잡지 못한다.

### 권고 (키값)

- 동작 이름 기준 키맵 테이블 1개(예: `ASTRA_KEYMAP: Record<action, key[]>`)로 통합하고 HelpView·문서 표를 **생성물**로 전환(빌드·스크립트 또는 테스트로 동기화 단정).
- characterization 테스트 1개로 (a) 동작별 키 존재, (b) 충돌 없음, (c) 문서 표와의 일치를 고정 — OpenCode의 예시 설정이 곧 기본값 문서가 되는 패턴 준용.

## 3. 정합성·가독성 리뷰 (독립 리뷰 12건, 표본 2건 재확인 완료)

계층 위반(LAYERS.md 대비 inbound→outbound 직접 참조 등)은 없었음. 발견은 범주별:

**정합성**
- A1 `isInvalidOAuthRefresh` 정규식 헬퍼가 `auth-service.ts:46`·`usage-service.ts:276`에 완전 중복 → 공용 헬퍼 추출. *(재확인 완료)*
- A2 draft "Response n-m" 라벨을 `www-execution.ts:308`과 `:480-484`가 다른 알고리즘·구분자로 이중 계산 → 라벨 헬퍼 통일.
- A3 `antigravity-auth.ts:10` 클래스명이 파일 역할과 다른 범용 `ProviderAuthController` → 역할명으로 개명.
- A4 동일 라이브 상태의 한·영 라벨 혼용("Working/Esc to interrupt" vs "실행 중/Esc 중단", `www-surface.ts:191-193` vs `www-execution.ts:54`) → 상태 라벨 표 단일화.

**가독성**
- B1 `runProjectWorkbenchShell`(`workbench-shell.ts:288-1196`) 과대 — `handleLocal`만 ~270줄 if-체인(`:709-978`) → 오버레이 클러스터·명령 디스패치 분리.
- B2 `durableBlocks`(`www-execution.ts:393-476`) 다중 역할 클로저 + `:397-442` 탭 깊이 혼용 → 엔티티별 헬퍼 분리.
- B3 앵커 복원 매직 넘버(`chat-scroll.view.ts:31-36`, `:72-79`의 4행 샘플·80자·`length>=16; length-=8`·`chunkSize+3` 겹침) → 상수화 + 겹침 이유 주석.
- B4 HelpView "F2–F8" drift(위 2장 1번과 동일 건).

**병합 경계**
- C1 ModelPicker에 항상 configured인 가짜 auth 스텁 주입(`workbench-shell.ts:650`) — `source` 어휘도 `auth-service.ts:25`와 불일치.
- C2 upstream identity 잔재: `zai-coding-plan-usage.ts:76`의 `User-Agent: "OpenCode-Status-Plugin/1.0"` 그대로 사용 → WWW UA 상수화. *(재확인 완료)*
- C3 활동 표시 파이프라인 이중 소유: 셸이 항상 indicator를 밀지만 astra 경로는 `syncActivity(_indicator) {}` 스텁으로 폐기(`www-execution.ts:356`).
- C4 상대 import 확장자 레인 혼용(`.js` 접미사 레인 vs 무확장자 레인 공존) — 병합 전 도구 관습이 남아 있음.

## 4. 권고 조치 순서

1. 키맵 단일 원본 + 동기화 테스트(§2 권고) — 병합 프로젝트의 "키값이 잘 적용되는가"를 기계 검증 가능하게 만든다. 스킬·작업 흐름에서도 이 테스트 1개만 근거로 인용하면 된다.
2. C2(UA 문자열)·C1(가짜 auth 스텁) 정리 — 외부 식별 신뢰 문제.
3. A1·A2·A4 중복·라벨 통일, B1 셸 분리 — 렌더 성능 커밋 이후 리팩터링 단위로.
4. repo-map·LSP·샌드박스는 기능 이슈로 별도 등록.

## 5. 적용 기록 — 2026-09-19

권고 1·2차와 A1을 적용했다. 전체 스위트 1,279 pass / 0 fail, `bun run check` 통과.

- 키맵 단일 원본: `src/adapters/inbound/tui/foundation/keyboard/www-keymap.ts` 신설(동작 이름 기준 18개 바인딩), `ASTRA_KEYS`·`ASTRA_VIEWS`·HelpView·셸 전역 핸들러를 모두 파생 전환, `test/www-keymap.test.ts` 5건(키 소유·충돌 없음·F2–F9 파생·HelpView 동기화·문서 동기화)
- 문서 표 갱신: F2–F9, Shift+Tab(협업·권한 모드 순환), Ctrl+C(중단·이중 종료) 추가
- Esc 대시보드 조건부 취소 분기 제거 — 문서 계약(모든 상세 화면에서 돌아가기)으로 정렬, 실행 취소는 실행 화면 Esc·Ctrl+C로 유지
- C1 `codexNativeAuthStatus` 상수+근거 주석, C2 `ZAI_USAGE_USER_AGENT` 상수, A1 `oauth-refresh-error.ts` 단일화(authentication 소유, usage-service 참조)
- 별도: 이전 세션의 스테이지된 yaml 변경(execution 모델 luna/xhigh)에 `test/workbench-config.test.ts` 기대값 동기화 — 본 감사와 무관한 선존재 불일치
- 미적용(예정대로 보류): A2·A3·A4·B1·B2·B3(렌더 성능 커밋 이후), repo-map·LSP·샌드박스(기능 이슈 별도 등록)

## 출처

- [OpenCode keybinds](https://opencode.ai/docs/keybinds/), [opencode.ai](https://opencode.ai)
- [Crush 리뷰 — The New Stack](https://thenewstack.io/terminal-user-interfaces-review-of-crush-ex-opencode-al), [Bubble Tea](https://github.com/charmbracelet/bubbletea)
- [Gemini CLI](https://github.com/google-gemini/gemini-cli)
- [Aider repo map](https://aider.chat/2023/10/22/repomap.html)
- [2026 터미널 코딩 에이전트 비교 — amux.io](https://amux.io/blog/best-terminal-ai-coding-agents-2026), [Pinggy 블로그](https://pinggy.io/blog/best_open_source_cli_coding_agents)
