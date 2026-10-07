# WWW Execution Console

## 로컬 개발 기록

2026-10-07 결정으로 외부 작업 관리 구조와 종료 시 게시를 강제하던 훅을 제거했다. 설계·결정은 저장소 docs, 검증은 로컬 Evidence에 남긴다. 대화 재개용 Native/session journal은 계속 사용한다.

WWW는 AI 대화를 꾸미는 화면이 아니라 개발자가 실행을 맡기고, 상태를 읽고, 필요한 순간 개입하는 터미널 작업 공간이다. 실행 엔진과 명령 계약은 기존 Workbench를 공유하고 표현 계층만 분리한다.

## 실행

```sh
www
www --resume
www --resume <native-thread-id>
```

plain `www`와 `bun start`는 WWW Execution Console을 기본으로 연다. 과거 `www astra` 호출은 문서에 노출하지 않는 deprecated alias로만 유지한다. `--resume`만 지정하면 기존 Native 세션을 선택하며, 선택을 취소하면 새 세션을 만들지 않는다. Pi 호환 실행은 `www --execution-lane pi`로 명시한다. 기존 Wooni Router는 `www router`에서만 연다.

WWW는 Chat 실행 타임라인에서 시작하며 Esc 없이 바로 요청을 입력한다. `WWW Dashboard`는 `/dashboard`로 필요할 때 연다.

## 화면의 문법

일반 요청은 UNDERSTANDING → WORKING → REPORTING으로 표시한다. WWW Request Runtime은 공개 UNDERSTAND 보고의 Plan 필요 여부와 이유를 기록한다. Plan이 필요하면 현재 turn의 유효한 Native Plan이 도착한 뒤 WORKING으로 넘어가고, 불필요하면 빈 Plan 없이 넘어간다. REPORTING은 공개 결과 작성 보고 뒤 표시한다. 보고가 누락되면 단계 전환을 추정하지 않는다. PROGRESS와 TEST는 실제 활동에서 읽는다. 사용자 질문은 테마의 `userSurface` 배경으로 응답과 구분한다.

- 상단: 현재 실행과 개입 필요 여부. 실행 중에만 짧은 인디고 그라데이션이 이동하며 경과시간과 최근 관측을 h·m·s 단위로 표시한다. 밀리초와 소수 초는 표시하지 않는다. 이는 진행률이나 서버 생존 보장이 아니다. 승인, 수신 불확실성, 오류에서는 움직임을 멈춘다. 실행이 끝나면 실제 시작·종료 관측으로 계산한 처리 시간과 종료 시각을 같은 자리에 남긴다.
- 본문: 입력 → 도구 실행 → 공개 출력이 실제 기록 순서대로 이어지는 ZChat 타임라인. 사용자 입력은 `INPUT`, 응답은 `OUTPUT`으로 표시한다. PLAN은 골드, PROGRESS는 그린, TEST는 틸 제목색을 사용한다. 작업 중인 응답의 도구 요약은 `OUTPUT … 작성 중` 카드 안에만 표시한다. 같은 Turn의 명령은 성공·실패 모두 이름과 상태를 짧게 나열하며 `/bin/zsh -lc` 래퍼는 요약에서 생략한다. 완료된 명령의 설명 바로 아래에는 `Git Bash · Input` 박스로 실제 입력 명령과 관측된 저장소 상대 경로를 표시한다. 입력 명령은 Bash 구문으로, 출력은 Git 상태·diff·성공·경고·오류 행의 의미에 따라 색으로 구분한다. 단일 cat/head/tail/sed/rg/git/jq 명령은 설명을 즉시 만든다. 해석을 기다리는 명령은 실제 입력 카드만 먼저 표시한다. 실패 출력과 exit 상태는 유지하고 Ctrl+E·`/source`로 원본을 읽는다. 공개 Native 설명은 기존 응답으로 표시하고 없는 목적을 추측하지 않는다. 단일 호출도 원본 카드를 유지하며 실행 중 출력은 마지막 6줄을 미리 보여준다.
- 넓은 화면: 112열 이상이고 기본 입력 상태의 본문 높이가 충분하면 실제 Native Plan을 오른쪽에 함께 표시한다. `Ctrl+B`로 사이드바를 닫거나 다시 열 수 있고 화면 이동 중에도 선택을 유지한다. 입력·자동완성이 늘어나도 계획 열의 폭은 유지하고, 세로로는 스크롤 가능한 본문을 줄인다. Native Plan의 실행·관측 Tracer는 같은 화면에서 이어 읽는다. 현재 실행 계획은 Ctrl+G 2에서 읽는다.
- 좁은 화면: 계획 보조 영역을 숨기고 실행·입력·HUD를 유지한다. 핵심 조작 기준은 80×24다.
- 입력과 HUD: 입력칸의 위·아래 경계와 `›`로 포커스를 표시한다. HUD는 한 줄의 provider 색상 바와 한 줄의 실행·context 상태로 구성한다. 각 바 안에 provider 아이콘 또는 이름, 잔여 비율, 관측된 7d·5h 기간을 함께 표시하고 `[`·`]` 테두리는 쓰지 않는다. Kitty 이미지 프로토콜을 지원하는 터미널에서는 OpenAI·Claude·Gemini·Z.ai의 로컬 32×32 PNG를 가로 2칸·세로 1줄로 표시한다. 미지원 터미널과 이미지 파일 누락 시 provider 이름을 사용한다. 폭이 부족하면 리셋 시각, 기간 표기, 이름 순서로 축약한다. 전체 한도와 세션별 비율은 `/usage`에서 확인한다. 한도는 청구 금액이 아니며 `*`는 마지막 성공 값이다.
- 상세 문서: Plan, Stats, Monitor, Session, Map, Context가 동일한 들여쓰기와 읽기 흐름을 공유한다.
- 보조 설명·경과·근거는 이탤릭으로 구분하고 핵심 명령·결과·승인 선택지는 직립으로 유지한다. Native Plan에서 동기화된 Todo는 Plan 아래에 중복 표시하지 않으며, 수동·레거시 Todo만 별도 Todo 섹션에 남긴다.
- 승인: 중앙 팝업을 띄우지 않고 실행 타임라인 아래 입력 영역에 명령·이유·선택지를 인라인으로 표시한다. HUD에는 승인 대기와 조작 힌트만 남긴다. Esc로 보류하면 입력란이 복원된다.

배경은 사용자의 dark terminal을 존중하고 선택 행과 HUD 사용량 바에만 배경색을 넣는다. 기본 본문 글자는 흰색이며 상태색·역할색은 제목 표식과 이름에 사용한다. 성공은 차분한 민트, 주의는 앰버, 실패는 로즈다. 웹 카드나 전체 프레임 테두리는 사용하지 않는다.

## Native 관측의 표시 원칙

2026-09-28 Native Observation 프롬프트의 [구조 비교와 채택 판정](audit/2026-09-28-native-observation-prompt-review.md)을 적용한다. 아래는 채택한 방향이며, 구현이 남은 항목은 해당 검토의 gap 표가 소유한다.

- Chat은 현재 요청의 실시간 작업, Monitor는 요청 하나의 상세 관측, Dashboard는 세션 요약과 요청 탐색을 담당한다. 모두 같은 Native 관측과 Core Projection을 사용한다.
- ACTION은 실제 tool·shell·file-change 관측이며 Chat 본문 카드에 둔다. Chat 사이드바에는 일반 ACTION 목록이나 Shell 실행 카드를 추가하지 않는다. 사이드바의 TEST 결과·검증 근거와 full Monitor의 행동 상세는 각 화면의 책임을 유지한다.
- PLAN은 큰 작업 목표, PROGRESS는 현재 계획 안의 세부 목표다. Action label이나 모델 해석은 PLAN 완료와 TEST 성공을 판정하지 않는다. private reasoning으로 UNDERSTAND를 구성하지 않는다.
- v4 요청의 WORK가 실행 중이면 같은 요청의 관측된 세부 진행을 PROGRESS에 표시한다. 세부 진행이 없으면 WORK 요약을 표시하고, 완료된 WORK 요약이 도착하면 이를 우선한다. Plan 전용 화면에 이전 Plan이 유지될 때는 그 Plan과 같은 turn의 진행만 함께 표시한다.
- INPUT→PLAN→PROGRESS→ACTION은 설명 관계다. 관측되지 않은 부모 관계나 강제 직렬 lifecycle을 만들어 넣지 않는다. Native thread/turn/item 참조와 Projection이 부여한 관계를 구분한다.
- Shell 한 줄 설명은 파일·줄 범위·검색어·출력 제한 등 확인 가능한 명령 의미를 짧게 표현한다. deterministic fast path를 우선하는 개선 방향을 채택하며, 추가 LLM 해석이 Shell 실행을 기다리게 해서는 안 된다. 현재 `설명 준비 중`과 직렬 narration 큐는 후속 개선 대상이다.
- TEST의 label 번역·목적 요약과 실제 결과 권위를 분리한다. 성공·실패·duration은 실행 관측과 runner 출력에 근거하며 없는 값은 미관측이다.
- Journal은 제한·정제된 파생 관측이다. RAW 전체 보존을 주장하지 않는다. 단계 시간의 병렬·중첩과 local 수신 지연, terminal-write 반환과 실제 pixel 표시를 구분한다.

## 키보드


| 키 | 동작 |
| --- | --- |
| Ctrl+G → 1 | 실행·질문 요약 ZChat 타임라인 |
| Ctrl+G → 2 | 계획·Todo·Queue·검증·남은 작업 |
| Ctrl+G → 3 | 현재 질문의 실시간 Monitor |
| Ctrl+G → 4 | 세션 검토와 Stats |
| Ctrl+G → 5 | Dashboard: 세션 요약과 질문별 Monitor 기록 |
| Ctrl+G → 8 | 질문별 Test 관측 |
| Ctrl+G → 9 | Workflow · Subagents 관측 |
| Ctrl+B | 넓은 실행 화면의 계획 사이드바 열기/닫기 |
| Ctrl+P | 명령 검색. Enter는 입력란에 넣기만 하며 실행하지 않음 |
| Tab | 빈 입력에서 본문 읽기로, 읽기에서 입력으로 전환. 입력 중에는 파일·명령 자동완성 |
| ↑↓, j/k | 읽기 모드에서 이동. 세션 목록의 ↑↓는 선택 이동 |
| PgUp / PgDn | 본문 또는 현재 모달의 긴 내용 읽기 |
| Home / End, g/G | 읽기 모드에서 처음/끝. 실행 타임라인의 End는 실시간 끝 따라가기 복귀 |
| Ctrl+E | 읽기 모드에서 도구 출력 펼치기/접기. 입력 중에는 기존 줄 끝 이동 |
| Esc | 모달/상세/읽기 상태에서 돌아가기. 실행 화면의 입력 상태에서는 현재 실행 중단 |
| Ctrl+D | 입력이 비었을 때 안전하게 종료 |
| Shift+Tab | 협업·권한 모드 순환 |
| Ctrl+C | 실행 중 응답 중단. 500ms 안에 다시 누르면 종료 |

Mac의 **Control** 키를 사용한다(Command가 아니다). Ctrl+G를 누른 뒤 손을 떼고 숫자를 누른다. 선택기에서 ↑↓와 Enter도 가능하며 작성 중인 초안은 유지된다. 출력 언어는 `/language ko|en`으로 선택한다. 움직임을 줄이려면 `WWW_REDUCED_MOTION=1 bun start`를 사용한다. `NO_COLOR` 환경에서도 움직이는 색 효과를 사용하지 않는다.

언어 선택은 `.www/runtime/output-language.json`에 저장되며, 선택 기록이 없으면 `.www/workbench.yaml`의 `display.language`를 기본값으로 사용한다. 전환 뒤 시작하는 Native 턴과 새로 생성하는 명령 행동 요약·Note는 선택한 언어를 지침으로 받는다. 이미 저장된 대화·활동 원문은 번역하거나 덮어쓰지 않는다.

`/monitor`는 현재 질문을 실시간으로 표시한다. `/dashboard`는 현재 세션 요약과 질문 기록을 최신순으로 보여준다. Dashboard에서 ↑↓로 질문을 고르고 Enter로 해당 Monitor 기록을 열거나, `/monitor #번호`를 입력할 수 있다. `/monitor`로 돌아오면 다시 실시간 질문을 본다. 번호는 현재 Dashboard의 순서이며 요청 ID가 기록을 식별한다. 여러 세션의 관측 범위·추이·선택은 `/history`에서 읽고, 선택한 세션의 Stats로 이동한다. Cache와 Context 화면은 기본 화면 선택기와 명령 목록에서 숨기고, 기존 `/cache`와 `/context` 직접 명령으로 열 수 있다.

`/Test`는 현재 세션에서 실제로 관측된 테스트 실행을 질문별로 다시 읽는 전용 화면이다. 명령과 결과를 Native Activity 및 runner 출력에서 읽으며, 별도 테스트 데이터베이스를 만들지 않는다. 테스트 계획이나 검증 의도는 실행 결과로 취급하지 않는다.

코드 변경 전의 기준선 검사와 변경 없는 검증 요청도 TEST에 표시한다. “이 테스트가 확인하는 것”과 “선택 이유”는 관측 입력을 바탕으로 한 설명이며 실행 결과의 권위가 아니다. 선택 이유는 제공된 해석이 있을 때만 표시하고 없으면 미관측으로 남긴다. 현재 실행 명령의 인식만으로 단위·통합·E2E 유형을 확정하지 않으며, 임의의 Python 스크립트나 성능 측정 스크립트가 모두 자동 인식되는 것은 아니다.

```text
블랙박스 테스트
└─ 사용자 요청부터 실제 결과까지 실행한다
   └─ 목표 · 실제 경계에서 요청이 완료되는지 확인
```

실제 실행 근거가 없는 완료 계획은 통과로 표시하지 않는다. 실행 명령과 exit code가 확인된 경우에만 성공·실패를 붙이고 `/source <activity-id>`로 원본 근거를 다시 열 수 있다. `/test`와 `/Test`는 동일하게 동작한다.

`/context`에서 세션 식별자, 권한, Provider 사용량, MCP, 위임 작업, 계획 연결 근거와 실행 Receipt를 확인한다. 긴 프로젝트 갱신 본문은 시작 화면을 밀어내지 않는다.

## 모델과 질문 요약

`/model gpt-6-astra medium` 또는 `/model` 선택기로 Codex App Server가 현재 제공하는 모델을 선택한다. Workbench 시작 시, `/model` 선택창을 열 때, `/model` 인자 명령을 실행할 때 `model/list`를 페이지 끝까지 조회한다. 전체 조회는 5초로 제한하고, 성공한 목록은 세션 안에서 마지막 정상 목록으로 보관한다. 조회에 실패하면 마지막 정상 목록 또는 내장 목록을 사용하며 UI에 경고한다. 신규 모델과 Native effort 목록은 선택기·자동완성·파서·설정 저장·실행 검증에 함께 반영한다. 조회는 Codex 바이너리를 설치·업데이트하지 않고, 선택창을 연 채 백그라운드 polling하지 않으며, 재실행 시 다시 조회한다(디스크 모델 캐시는 없다).

2026-09-12 설치 Codex 0.154.0의 실제 조회에서는 `gpt-6-astra`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`, `gpt-5.3-codex-spark`가 반환됐고, Luna에도 `ultra`가 포함됐다. 모델과 effort 가용성은 계정·호스트별 목록 응답에 따른다. Native의 `ultra`는 자동 위임을 포함하는 별도 옵션이며 `xhigh`로 치환하지 않는다.

[OpenAI 모델 문서](https://developers.openai.com/api/docs/models/gpt-6-astra)와 [App Server 모델 목록 계약](https://learn.chatgpt.com/docs/app-server#models)을 참고했다. 일반 API의 reasoning 옵션과 Native Codex의 effort 옵션은 서로 다른 계약이다. 발견된 모델을 선택할 수 있어도 기본 실행 모델(`gpt-5.6-sol`), T-note·narrator 모델(`gpt-5.6-luna`), 현재 프로젝트 YAML을 자동 변경하지 않는다.

Native 모델의 추론 정보가 비어 있으면 Workbench 기본값 `medium`을 사용하며 자동 위임으로 올리지 않는다. 기존 `settings.json`과 레거시/Pi 선택기는 기존 low/medium/high/ultra 계약을 유지한다. 내장 fallback의 GPT-5.4 옵션은 low/medium/high/xhigh이며, Native 조회 성공 시에는 호스트 응답이 우선한다. 현재 계정의 목록에는 GPT-5.4가 없으므로 정상 동기화된 선택기에 추가하지 않는다. 아직 WWW가 표현할 수 없는 새 effort 계약만 반환되면 자동 지원으로 간주하지 않고 조회 오류로 표시한다.

완료된 요청마다 T-note 생성 큐가 별도로 동작한다. 새 T-note는 요청별 상세 업무 REPORT로 저장하고 다음 실행을 막지 않는다. REPORT는 짧은 제목 아래 요청 목적과 접근, 의미 있는 작업, 장시간·차단·재시도와 원인, 잘된 점, 관측된 모델·토큰, 업무 자체평가, 다음 유사 요청의 접근·관리 기준, 코드·문서·GitHub 변경 상태, Commit·Evidence를 기록한다. 제목과 같은 질문 필드는 반복하지 않으며 관측되지 않은 값은 추정하지 않고 `관측 없음`으로 남긴다. Detached narrator의 provider·model·version은 생성 내용과 분리된 provenance로 표시한다. Test는 모델이 작성하지 않고 시스템이 완료된 검증 관측에서 REPORT 뒤에 붙인다. 한 Turn의 source activity가 안전 한도 100개를 넘으면 전체 range와 요청·시작·최종 응답·완료 경계를 유지한 채 중간 활동을 결정론적으로 균등 표본화한다. 선택된 활동들의 합계가 packet의 256 KiB byte budget을 넘으면 packet 모듈이 모든 activity identity·순서·완료 metadata를 보존하고 title·body에 공정한 공통 상한을 적용해 전체 크기를 결정론적으로 맞춘다. 호출자와 자동저장 큐는 개별 본문 크기로 전체 packet 크기를 추정하지 않는다. 저장된 옛 `질문 · Plan · 과정 · 결론` 및 `질문 · 왜 · 결과` 노트는 계속 읽을 수 있지만 새 생성 결과로는 수락하지 않는다. 완성된 보고서는 별도 화면이나 명령으로 탐색하게 하지 않고 ZChat 타임라인에서 해당 요청의 근거 뒤에 표시한다. 기존 `/tnotes`와 `/tnote` 파서는 호환을 위해 남지만 WWW의 화면 이동·명령 검색에서는 노출하지 않는다. 생성 실패는 자동 생성 보류로 표시하며, 관측하지 않은 내용을 대신 만들지 않는다.

읽기 모드에서 `Ctrl+E`로 실행 출력을 펼치면 `Conversation Recap`도 함께 표시된다. Recap은 현재 snapshot의 공개 user·assistant 메시지만 사용하고 system·reasoning·tool payload를 제외한다. 최대 6개 항목과 1,400 code point로 제한하며, Native history나 T-note를 수정하거나 별도로 저장하지 않는다.

## 유지되는 계약

기존 Slash command 파서·실행 dispatcher·승인 결정·모델 설정 저장·인증·세션 재개·초안 저장·종료 lease 해제를 공유한다. `/goal`, `/source`, `/trace`, `/agents`, `/tnote range`, `/review`, `/workflow`, `/permission`, `/mode`, `/mcp`, `/compact`, `/clear`, `/cancel` 등의 기존 기능은 같은 경로로 실행된다. 알 수 없는 Slash 입력은 기존과 같이 Native로 전달된다.

승인창을 닫는 것은 승인이나 거절이 아니다. `/approval`은 보류한 요청을 다시 읽기만 한다. `/approve`는 직접 승인하고 `/decline`은 직접 거절하는 기존 명령이다. 승인 선택지는 스크롤과 분리해 고정한다. 긴 승인·로그인·모델 선택 내용은 모달 내부에서 페이지 이동하고, 선택을 옮기면 해당 항목이 화면에 나타난다. 승인 대기 중에는 로그인을 시작하지 않으며, 로그인 중 승인이 도착하면 로그인 흐름을 취소하고 승인을 우선한다.

타임라인은 durable activity 순서를 따른다. 원본 활동이 아직 없는 경우에는 전송 중인 사용자 요청만 낙관적으로 표시한다. 읽던 중 새 출력이 도착해도 읽는 위치를 유지한다. Raw reasoning은 표시하지 않으며, 공개 응답·공개 요약과 bounded public projection만 사용한다. 알 수 없는 측정값은 `—`로 표시하고, 실행 완료와 독립 검증 통과를 구분한다.

색상과 컴포넌트 변경은 `www-*` 표현 계층에 모았다. 인증·승인의 theme은 선택적으로 주입한다. 모델 선택기는 Native 능력 목록을 명시적으로 사용하는 호출만 새 옵션을 적용하고, 기존 Workbench와 Pi의 디자인은 유지한다.

## 검증

```sh
bun run check
bun test
```

`test/www-ui.test.ts`는 반응형 프레임, 진행 표시, 입력 포커스, Bash 출력, 잔여 한도, 질문 요약, 스트리밍 중 스크롤 위치, 기록 순서, 공개 정보 경계와 긴 승인창을 검사한다. `test/www-shell.test.ts`는 실제 shell controller와 터미널 입력 경로로 Ctrl+G 화면 이동·초안 보존·F키 호환·인증·승인·종료를 검사한다. `test/www-model.test.ts`는 모델 선택기, YAML 왕복, parser, Workbench와 가짜 App Server 사이 요청을 검사한다. `test/native-model-catalog.test.ts`는 미등록 가상 모델의 발견부터 선택·저장·reload·가짜 Native 실행까지, 페이지네이션·오류·fallback 및 작은 화면 동작을 검사한다. Fixture는 합성 데이터이며 실제 세션 측정값으로 표시하지 않는다. 모델 목록 조회와 실제 유료 추론 성공은 서로 다른 검증이다. 이 문서 동기화에서는 테스트를 실행하지 않았다.
