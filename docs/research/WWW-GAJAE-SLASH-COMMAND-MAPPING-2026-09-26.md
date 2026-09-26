# Gajae Code 내장 슬래시 명령 체계와 WWW 대응 매핑 (2026-09-26)

## 목적과 조사 경계

- 목적: Gajae Code 호스트가 처리하는 **내장 슬래시 명령 체계**(Skill이 아님)를 WWW의 명령 체계와 비교해, WWW에 반영할 확인된 개념과 미반영 개념을 구분한다.
- 입력 경계: Gajae Code 명령 목록은 작업 지시(Handoff)로 제공된 목록이 유일한 입력이다. 이 조사 시점에 Gajae Code 공식 문서 조회와 실제 실행 재현을 하지 못했다. 아래 표의 Gajae 측 개념은 **미검증 입력**이며, WWW 측 대응은 실제 코드(`src/adapters/inbound/tui/commands/slash-commands.ts`, `shell/workbench-command-router.ts`, `foundation/keyboard/www-keymap.ts`, `shell/www-surface.ts` WwwCommandPalette·HelpView)에서 확인했다.
- 따라서 이번 조사에서 WWW 코드에 새로 반영한 명령은 없다. 반영 판단은 Gajae 개념이 공식 문서나 실제 실행으로 확인된 뒤에 한다.

## 입력의 3분류와 WWW 라우팅 대응

| 입력 종류 | Gajae 개념 (미검증) | WWW 현재 대응 | 대응 상태 |
|---|---|---|---|
| `/명령어` | 호스트가 직접 처리하는 결정론적 제어 | `handleLocal` 라우터(`workbench-command-router.ts`)가 네이티브 dispatch·화면 전환을 결정적으로 처리 | 있음 |
| `/skill:이름` | 워크플로 Skill 호출 | WWW에는 호스트 내장 스킬 호출 경로가 없다. 에이전트 위임은 `/agents` 관측과 delegation projection으로만 노출 | 없음 (불필요 여부 미판정) |
| 일반 문장 | 모델 Agent Turn | composer 제출 → `chat.send` dispatch → Native turn | 있음 |

## 명령군별 매핑

WWW 명령 목록은 `WORKBENCH_SLASH_COMMANDS` + `WWW_COMMANDS`(help·context·history·usage·approval·demo·work 보강) 기준이다. Gajae 명령 개수 54개는 고정 계약으로 취급하지 않는다.

### 시작·안내

| Gajae (미검증) | 개념 | WWW 대응 | 상태 |
|---|---|---|---|
| `/help` | 명령 안내 | `/help` + HelpView + `Ctrl+P` WwwCommandPalette | 있음 |
| `/tutorial` | 단계 안내 | 없음. 첫 화면 welcome이 시작 안내를 대신한다 | 없음 |
| `/hotkeys` | 키 목록 | HelpView에 WWW_KEYMAP·WWW_HELP_ACTIONS 표시 | 부분 |
| `/changelog` | 변경 이력 | 없음 (릴리스 기록은 Linear Project Update가 소유) | 없음 |
| `/settings` | 설정 화면 | `/model`(모델·추론 강도), `/mode`, `/permission`, `/theme`로 분산 | 부분 |
| `/language` | UI 언어 | 없음 (WWW는 한국어 고정) | 없음 |
| `/theme` | 테마 | `/theme` (Gruvbox·Tokyo Night) | 있음 |
| `/pet` | 장식 | 없음. Three Body Lab(`/three-body`)이 실험·장식 영역 | 해당 없음 |

### 목표·Agent

| Gajae (미검증) | 개념 | WWW 대응 | 상태 |
|---|---|---|---|
| `/goal` | 지속 상태 + continuation loop | `/goal` — sessionGoal 스냅샷으로 지속. continuation loop는 WWW가 아니라 실행 에이전트의 책임이라 개념을 축소해 반영 | 부분 |
| `/routing` | 라우팅 제어 | 없음. 라우팅은 core/application/routing이 소유하고 사용자 노출 없음 | 없음 (의도된 비노출) |
| `/tools` | 도구 상태 | `/mcp`(MCP 서버 status·enable·disable), `/status` | 부분 |
| `/extensions` | 확장 관리 | 없음 | 없음 |
| `/monitors` | 모니터 관리 | `/monitor`(Live Monitor 화면), `/dashboard` | 개념 다름 |
| `/debug` | 디버그 | `/stats diagnostics`, `/trace`, `/source` | 부분 |
| `/memory` | 메모리 | Context 화면의 Memory items 요약 + `/tnotes`·`/tnote`(질문별 보고서) | 개념 다름 |

### 모델·계정

| Gajae (미검증) | 개념 | WWW 대응 | 상태 |
|---|---|---|---|
| `/model` `/effort` `/fast` `/provider` | 모델·추론 강도·provider 선택 | `/model`(모델+effort 통합), `/permission`(실행 권한), `/mode`. fast·provider 전환 단독 명령은 없음 | 부분 |
| `/login` `/logout` `/credential` | 인증 | `/login [provider]`, `/logout <provider>`. credential 파일 조작은 노출하지 않음 | 부분 |
| `/usage` `/mm refresh` | 사용량·갱신 | `/usage`(Provider quota·세션 token 상세) + 사용량 갱신은 usage polling이 자동 수행 | 있음 |

### 세션

| Gajae (미검증) | 개념 | WWW 대응 | 상태 |
|---|---|---|---|
| `/new` `/clear` `/drop` | 세션·문맥 초기화 | `/clear` — Chat 화면만 비우고 기록·Native thread 유지. 세션 신규 생성·drop 명령은 없음 | 부분 |
| `/resume` `/sessions` `/session` | 세션 재개·목록 | `/history`(이전 Session·Project 관측 이력) + 재개 선택 view | 부분 |
| `/rename` `/star` `/unstar` `/move` | 세션 메타 조작 | 없음 | 없음 |
| `/background` | 백그라운드 전환 | 없음 | 없음 |
| `/exit` | 종료 | `/exit` — ShellLifecycle로 안전 종료 | 있음 |

### 요약·분기

| Gajae (미검증) | 개념 | WWW 대응 | 상태 |
|---|---|---|---|
| `/context` | 컨텍스트 조회 | `/context` — 세션·권한·사용량·MCP·위임 작업 + Context Dashboard(토큰 스펙트로미터) | 있음 |
| `/compact` | 같은 세션 토큰 절약 | `/compact` — 현재 Native thread 컨텍스트 압축 | 있음 |
| `/handoff` | 인계 내용 생성 후 새 세션 이동 | 없음. 인계는 T-Note(`/tnote`)가 보고서로 부분 담당하나 새 세션 자동 이동은 없음 | 없음 (후보) |
| `/fork` `/tree` | 과거 지점 분기 | 없음 | 없음 |
| `/btw` | 현재 문맥의 임시 보조 대화 | 없음 | 없음 |
| `/retry` | 재시도 | `/reconcile <request-id> <operation-id>` — 재조회만 하고 동작 재실행은 하지 않음(의도된 계약 차이) | 개념 다름 |

### 출력·공유

| Gajae (미검증) | 개념 | WWW 대응 | 상태 |
|---|---|---|---|
| `/copy` `/dump` `/export` `/transcript` | 출력·내보내기 | 없음. 대화 원본은 Native session journal이 소유하고 WWW는 view만 한다 | 없음 (후보) |
| `/contribute-pr` | 기여 PR | 없음. `/work`(Issue 연결·Obsidian checkpoint)와 `/review`(Note 외부 검토 미리보기·송신, 사람 승인 경유)가 유사한 외부 송신 경로 | 개념 다름 |

### 외부 연결·운영

| Gajae (미검증) | 개념 | WWW 대응 | 상태 |
|---|---|---|---|
| `/mcp` | MCP 관리 | `/mcp status\|enable\|disable\|reload` | 있음 |
| `/notify` `/health` `/jobs` | 알림·헬스·작업 | `/status`(Router·인증·세션 상태), `/monitor`(실시간 관측). notify·jobs는 없음 | 부분 |
| `/ssh` `/add` `/aside` | 원격·연결 추가·보조 | 없음 | 없음 |
| (조건부 명령) `/agents`, `/import-session` | 조건부 노출 | `/agents`(위임 트리 관찰), `/approval`(보류 승인 재열기)가 유사한 조건부 성격 | 부분 |

## WWW가 Gajae 개념과 다르게 둔 경계

1. **조회와 상태 변경의 구분**: WWW는 화면 전환(`/todo`, `/monitor`, `/cache`, `/usage`)과 상태 변경(`/mode`, `/permission`, `/mcp enable`, `/approve`)을 명령 설명으로 구분하고, 되돌리기 어려운 송신(`/promote`, `/review send`)은 diff 확인 + 사람 승인을 거친다. Gajae 목록의 조회/변경 구분도 같은 방향으로 정리할 수 있으나 미검증이다.
2. **세션 생명주기**: `/clear`(화면만 비움)·`/compact`(같은 thread 압축)는 있고, `/fork`·`/handoff`·`/btw` 같은 분기·보조 대화는 없다. WWW의 대화 분기는 Native thread 하나를 전제로 한다.
3. **요약의 소유**: 긴 실행의 요약은 모델 생성 T-Note(`request-report-v2`)가 소유하고 Progress 레일이 그것을 실시간 투영한다. `/handoff`가 확인되더라도 인계 문서는 T-Note 정본에 붙는 방향이 WWW의 구조에 맞다.

## 반영 권고 (확인 후 판정 대기)

공식 문서·실제 실행으로 확인될 경우에만 검토할 후보:

1. `/handoff` — T-Note 기반 인계 + 새 세션 시작 묶음. WWW 세션 lifecycle에 없는 유일한 큰 갭.
2. `/copy`·`/export` — 대화 원본의 사용자 손 범위 내보내기. journal digest와 함께라면 정합성 유지 가능.
3. `/retry` — 현재 `/reconcile`은 재조회만 한다. "재시작" 의미가 Gajae에서 확인되면 별도 명령으로 검토.

반영하지 않을 것(구조상 불일치): `/fork`·`/tree`(WWW는 단일 thread 전제), `/pet`·장식 계열, `/language`(한국어 고정).

## 참조

- WWW 명령 정의: `src/adapters/inbound/tui/commands/slash-commands.ts`
- 명령 실행 라우터: `src/adapters/inbound/tui/shell/workbench-command-router.ts`
- 명령 팔레트·도움말: `src/adapters/inbound/tui/shell/www-surface.ts` (`WwwCommandPalette`, `HelpView`)
- 키 이동 계약: `src/adapters/inbound/tui/foundation/keyboard/www-keymap.ts`
- Gajae 명령 목록 입력: 2026-09-26 WWW TUI UX 개선 Handoff (요구 7)
