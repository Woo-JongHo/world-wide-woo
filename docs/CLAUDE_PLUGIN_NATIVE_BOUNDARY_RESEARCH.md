# Claude Code 플러그인과 Codex 네이티브 경계 조사

조사일: 2026-09-01  
대상: OmniRoute, Claude Map, Headroom, Claude Code Setup, Task Observer  
판단 원칙: Codex 네이티브와 WWW의 기존 관측 계층을 우선하고, 플러그인은 결손이 실측된 경우에만 추가한다.

## 결론

**현재 다섯 개 모두 설치하지 않는다.**

- `Claude Code Setup`은 공식·읽기 전용이지만 현재 WES/WWW보다 얕은 추천 체크리스트다.
- `Claude Map`과 `Task Observer`는 코드와 작업 위에 별도 문서 정본을 만든다. 각각 WES의 MAP/Atlas, WWW의 Chat·Todo·T-notes와 충돌한다.
- `OmniRoute`와 `Headroom`의 Claude 플러그인은 본체가 아니라 로컬 프록시를 켜고 끄는 얇은 wrapper다. 실제 위험과 효용은 플러그인이 아니라 요청을 가로채는 프록시에서 발생한다.
- Codex에는 `AGENTS.md`, Skills, Plugins, MCP, Hooks, Subagents와 App Server 이벤트가 이미 있다. WWW는 이 네이티브 이벤트를 투영하는 제품이므로 같은 상태를 다시 수집하는 상시 플러그인을 두지 않는다.

채택 대신 아이디어만 제한적으로 가져온다.

1. OmniRoute의 provider·quota 비교 화면은 미래 Router 참고 자료로만 쓴다.
2. Claude Map의 invariant·trust-boundary 표기는 기존 MAP/Atlas 문법 후보로만 검토한다.
3. Headroom은 RPA 대용량 로그를 모델에 넣기 전 **명시적으로 한 번 압축하는 실험**에만 후보가 될 수 있다. Codex/Claude 세션 전체를 프록시로 감싸지 않는다.
4. Claude Code Setup의 질문 목록은 새 프로젝트 bootstrap 체크리스트로만 흡수한다.
5. Task Observer의 회고 개념은 명시적 주간 review로만 가져오고, 매 세션 자동 기록은 쓰지 않는다.

## 대상의 정확한 정체

| 이름 | 실제 형태 | 핵심 동작 | Codex에 같은 기능이 있는가 | 현재 판정 |
|---|---|---|---|---|
| OmniRoute | 커뮤니티 Claude skill wrapper + 별도 로컬 gateway | gateway 시작·중지·상태 확인, 수동 환경변수 안내. 실제 routing은 별도 OmniRoute 본체가 수행 | **부분적**. Codex는 모델 선택·subagent 역할 배치를 제공하지만, 여러 provider의 quota 기반 자동 fallback은 네이티브가 아님 | 설치하지 않음 |
| Claude Map | 커뮤니티 skill 하나 | `.claude-map/`에 소스 파일을 따라가는 모델 전용 shadow 문서 생성 | **부분적**. Codex의 repo 탐색·`AGENTS.md`·skills는 있으나 persistent shadow map은 없음. WES에는 이미 MAP·Atlas가 있음 | 설치하지 않음 |
| Headroom | 커뮤니티 Claude skill wrapper + 별도 로컬 compression proxy | 요청·tool output·대화 기록을 압축한 뒤 provider로 전달 | **부분적**. Codex에는 context compaction이 있지만 transparent per-request compression proxy와 같지는 않음 | 세션 proxy로는 거절 |
| Claude Code Setup | Anthropic 공식 read-only skill plugin | 저장소를 읽고 hooks·skills·MCP·subagent 추천 | **기능상 있음**. Codex 네이티브 customization과 plugin/skill 관리 기능을 조합하면 같은 목적을 달성. 단일 동일 명령은 아님 | 상시 설치 불필요 |
| Task Observer | 커뮤니티가 재포장한 model-invoked meta-skill | 모든 multi-step 작업을 관찰해 별도 skill-observation log에 계속 기록 | **정확한 portable skill이 존재**하지만 Codex core 기능은 아님. Hooks와 App Server 이벤트로 관측 자체는 가능 | 설치하지 않음 |

Codex의 공식 구분에서 Skill은 반복 작업을 위한 지침·자료이고, Plugin은 Skills와 connector/MCP 등을 배포하는 묶음이다. Codex CLI와 앱에는 plugin browser가 있으며, 설치 후 새 세션에서 capability가 활성화된다. 따라서 Codex에도 플러그인 체계가 없어서 못 쓰는 것이 아니다. **쓸 수 있지만 필요하지 않아서 쓰지 않는 것**이 이번 판단이다. [OpenAI Skills & Plugins](https://learn.chatgpt.com/docs/skills-and-plugins), [OpenAI Plugins](https://learn.chatgpt.com/docs/plugins)

## 개별 비판

### 1. OmniRoute

확인한 Claude 플러그인은 OmniRoute 자체가 아니다. `start/status/stop/enable/disable` 다섯 skill이 `localhost:20128`의 별도 gateway를 제어하거나 환경변수를 출력할 뿐이다. 기본 상태에서는 Claude Code 트래픽을 바꾸지 않는다고 명시한다. [wrapper manifest와 README](https://github.com/maneabhishek1983/claude-plugins/tree/e2dd81ffc64526b8d846bb85944e30c2e6dd6fc5/plugins/omniroute)

실제 OmniRoute 본체는 다수 provider와 모델을 한 OpenAI-compatible endpoint 뒤에 놓고 routing, fallback, quota, compression을 수행한다고 주장하는 별도 runtime이다. [OmniRoute README](https://github.com/diegosouzapw/OmniRoute/blob/abbbca216da343fc5a6311c7f10c1bbd975f2f83/README.md)

WWW에는 맞지 않는다.

- 사용자가 지키려는 것은 Codex/Claude 네이티브 동작과 각 구독의 경계다. gateway는 endpoint, 인증, 모델 ID, fallback과 일부 prompt 처리를 중간에서 소유한다.
- 자동 fallback은 “누가 어떤 모델로 저작했고 누가 검토했는가”라는 WES provenance를 흐린다.
- provider 장애 시 조용히 다른 모델로 바꾸면 결과 재현성과 리뷰 책임이 약해진다.
- 구독 가격 변화 대응은 필요하지만, 이는 플러그인 설치 문제가 아니라 명시적 provider 선택·handoff 정책 문제다.

후속 Router를 만든다면 `선택 모델`, `선택 이유`, `실제 provider/model`, `fallback 발생`, `token/비용`, `검토자`를 이벤트로 남기는 WWW/WES 소유 기능이어야 한다. OmniRoute를 상시 gateway로 넣지 않는다.

### 2. Claude Map

Claude Map은 `.claude-map/LEGEND.md`를 먼저 읽고, 소스와 평행한 Markdown 파일을 bottom-up으로 생성하는 skill이다. 함수별 purpose, invariant, trust, gotcha, cross-reference를 압축 기호로 기록한다. 실행 코드나 freshness checker는 없고, skill 지침이 timestamp와 source mtime 비교를 모델에 요구한다. [Claude Map skill](https://github.com/karanlyons/claude-plugins/blob/64ad8dd403d581e5a327b4c6f7a25bf0b86c89aa/plugins/claude-map/skills/claude-map/SKILL.md)

아이디어는 좋지만 현재 구조에는 해롭다.

- 소스·AGENTS·architecture 문서 옆에 또 하나의 설명 정본이 생긴다.
- freshness가 기계적으로 강제되지 않아 코드보다 조용히 낡을 수 있다.
- 비표준 고밀도 기호는 사람과 다른 provider에게 읽기 비용을 넘긴다.
- WES에는 이미 사람용 `MAP.md`, canonical 문서, Atlas projection이 있다. `.claude-map/`은 같은 관계를 별도 namespace에서 재소유한다.

따라서 shadow map을 만들지 않는다. 다만 `invariant`, `trust boundary`, `gotcha`, `parity`라는 네 가지 분류어는 기존 MAP/Atlas schema를 개선할 때 참고할 가치가 있다.

### 3. Headroom

Claude 플러그인은 Headroom 본체가 아니라 `localhost:8787` proxy를 시작·중지하고, 세션별 `ANTHROPIC_BASE_URL` 설정을 출력하는 wrapper다. [wrapper manifest와 README](https://github.com/maneabhishek1983/claude-plugins/tree/e2dd81ffc64526b8d846bb85944e30c2e6dd6fc5/plugins/headroom)

Headroom 본체는 tool output, logs, files, RAG chunks, conversation history를 모델에 전달하기 전에 압축하고 원문을 로컬 cache에 저장한다. 현재 upstream은 agent wrapping 과정에서 user-scope Serena 설치가 가능하고, `headroom learn`이 `AGENTS.md` 등에 교정 내용을 쓸 수 있으며, 선택 기능은 output verbosity와 reasoning effort도 바꾼다고 설명한다. [Headroom README](https://github.com/headroomlabs-ai/headroom/blob/1390d897155e69f8b4554eed5641c2e523860d0f/README.md)

이는 네이티브 보존 원칙과 직접 충돌한다.

- 모델이 보는 입력이 native transcript와 달라진다.
- 압축 오류는 조용한 누락으로 나타날 수 있고, 원문 복구 도구를 모델이 적시에 호출한다는 보장이 추가된다.
- proxy가 prompt, credential 전달, cache, 모델 parameter의 새 신뢰 경계가 된다.
- WWW가 보여주는 Context와 실제 provider에 들어간 Context 사이에 또 다른 해석층이 생긴다.

또한 조사한 wrapper의 `status` skill은 Headroom에 `doctor`나 `dashboard` 명령이 없다고 적지만, 현재 upstream README는 두 명령을 설치 검증 절차로 안내한다. 즉 얇은 wrapper도 이미 upstream과 drift했다. 이 상태에서 상시 경로로 채택할 이유가 없다.

Codex의 `thread/compact/start`와 `contextCompaction` 이벤트는 네이티브 history compaction을 관찰·호출하게 해주지만 Headroom과 동일한 기능은 아니다. [Codex App Server](https://learn.chatgpt.com/docs/app-server)

유일한 재검토 조건은 RPA 실행 로그가 실제로 context 병목을 만들고, 원문 대비 질 손실·latency·token 절감률을 고정 corpus로 재현했을 때다. 그때도 세션 proxy가 아니라 `raw RPA log → 명시적 압축 artifact → model input`의 격리된 adapter로 시험한다.

### 4. Claude Code Setup

다섯 개 중 유일한 Anthropic 공식 플러그인이다. 코드를 수정하지 않고 저장소를 읽어 MCP, Skills, Hooks, Subagents, Slash Commands를 각 1~2개 추천한다. [Claude Code Setup README](https://github.com/anthropics/claude-plugins-official/blob/ed404106fcd80ba98ecb7c851e531dcb626d13b7/plugins/claude-code-setup/README.md)

안전하지만 지금은 필요하지 않다.

- 현재 저장소에는 이미 전역·프로젝트 `AGENTS.md`, skills, hooks, 역할별 모델, review 규칙, WWW App Server adapter가 있다.
- 이 플러그인은 새 capability를 실행하지 않고 후보를 추천한다.
- 추천의 성공 기준보다 “각 범주 1~2개”라는 출력 형식이 앞서므로, 필요가 없는 범주에도 확장점을 늘릴 유인이 있다.
- Claude 전용 setup을 Codex 중심 제품의 상시 의존성으로 둘 이유가 없다.

Codex의 공식 customization 표면도 `AGENTS.md`, Skills, MCP, Subagents를 같은 구성요소로 정의하며 Hooks와 Plugins를 별도로 제공한다. [Codex Customization](https://learn.chatgpt.com/docs/customization/overview), [Codex Hooks](https://learn.chatgpt.com/docs/hooks)

완전히 빈 새 저장소에서 한 번 read-only audit을 할 때는 쓸 수 있다. WES가 조립한 프로젝트에서는 bootstrap checklist로 충분하다.

### 5. Task Observer

이것은 task 진행 표시기가 아니다. 모든 substantive session에서 skill 개선 기회를 찾고, workspace에 observation log를 생성·append하며, 주간 review와 skill 변경 후보까지 운영하는 meta-skill이다. 조사한 wrapper는 매 세션 activation과 반복 checkpoint write를 요구한다. [wrapper의 Task Observer skill](https://github.com/maneabhishek1983/claude-plugins/blob/e2dd81ffc64526b8d846bb85944e30c2e6dd6fc5/plugins/task-observer/skills/task-observer/SKILL.md)

WWW에 넣으면 안 된다.

- 사용자가 원하는 실행 관측과 달리 “스킬 방법론 개선”이 목적이다.
- Chat·Todo·T-notes 외에 `skill-observations`라는 네 번째 지속 상태를 만든다.
- multi-step 작업마다 항상 활성화되어 prompt와 파일 I/O를 늘린다.
- 병렬 세션 log collision을 피하기 위한 복잡한 append·backup·renumber 규칙까지 agent 문맥에 넣는다.
- 사용자가 고치고 싶은 “응답이 느리고 과정이 너무 많다”는 문제를 오히려 키운다.

Codex App Server는 `turn/plan/updated`, `item/started`, `item/completed`, command/file/MCP/collab call, public reasoning summary와 `contextCompaction`을 native event로 제공한다. WWW는 이미 이 이벤트를 Chat timeline, Todo, T-notes에 목적별로 투영한다. 관측 데이터가 부족한 것이 아니라, 같은 데이터의 또 다른 자동 해석자가 불필요한 상태다. [Codex App Server event model](https://learn.chatgpt.com/docs/app-server)

정확한 upstream Task Observer skill은 Codex에서도 설치 가능한 portable skill로 검색되지만, “설치 가능”은 “채택해야 함”을 뜻하지 않는다. 조사 시점 skills.sh 표시는 5.5K installs였다. [Task Observer skill directory](https://skills.sh/rebelytics/one-skill-to-rule-them-all/task-observer)

## 교차 검증에서 드러난 공급망 문제

### 신뢰 등급이 서로 다르다

- `claude-code-setup`은 `anthropics/claude-plugins-official`의 공식 항목이다.
- OmniRoute·Headroom·Task Observer wrapper marketplace는 조사 시점 **한 개의 initial commit, 0 stars, 0 forks**였다. upstream 본체의 인기와 wrapper의 신뢰도를 합치면 안 된다. [wrapper marketplace revision](https://github.com/maneabhishek1983/claude-plugins/tree/e2dd81ffc64526b8d846bb85944e30c2e6dd6fc5)
- Claude Map repository도 조사 시점 **한 개의 initial commit, 0 stars, 0 forks**였다. [Claude Map revision](https://github.com/karanlyons/claude-plugins/tree/64ad8dd403d581e5a327b4c6f7a25bf0b86c89aa)

### wrapper와 upstream이 벌어져 있다

- Task Observer wrapper의 bundled `SKILL.md` SHA-256은 `60bfdc…`, 현재 upstream은 `a7d1e2…`로 달랐다. 현재 upstream은 log를 단일 파일에서 observation별 디렉터리로 바꾸는 등 계약이 변했다.
- wrapper manifest는 Task Observer license를 `MIT`로 적지만 upstream은 `CC BY 4.0`을 명시한다. [upstream license](https://github.com/rebelytics/one-skill-to-rule-them-all/blob/510caad26c907793e48306262af216ff9f71c9f7/LICENSE.txt)
- Headroom wrapper의 command 설명은 현재 upstream README와 불일치한다.

이 세 가지는 악성이라는 증거가 아니다. 그러나 상시 session 경로에 넣을 만큼 versioning·provenance·update 계약이 성숙하지 않았다는 증거다.

## WWW에 적용할 경계

```text
Native Codex / Claude
  └─ native session, auth, approval, model, tool lifecycle
       └─ WWW adapter
            ├─ Chat: native event의 읽을 수 있는 투영
            ├─ Todo: 현재 계획의 서술형 투영
            ├─ T-notes: 완료된 질문의 사후 요약
            └─ Usage: native context·quota·session usage
```

추가 플러그인이나 proxy는 다음 모두를 만족할 때만 후보가 된다.

1. 네이티브/App Server에 없는 결손이 실제 사용에서 반복 측정됐다.
2. 같은 상태의 두 번째 정본을 만들지 않는다.
3. model input, output, approval, credential을 조용히 바꾸지 않는다.
4. 정확한 version과 source revision이 고정된다.
5. 기본값은 off이며 한 세션·한 입력 단위로 되돌릴 수 있다.
6. raw evidence와 가공 결과가 분리되고 손실을 검증할 수 있다.
7. latency와 token 절감이 품질 저하보다 크다는 benchmark가 있다.

## 최종 판정

| 대상 | 지금 | 나중에 볼 조건 |
|---|---|---|
| OmniRoute | 거절 | provider 비용·quota 때문에 native handoff가 실제 병목이고, silent fallback 없는 provenance 계약을 만들 때 |
| Claude Map | 거절 | 기존 MAP/Atlas에서 표현할 수 없는 코드 관계가 반복적으로 확인될 때 |
| Headroom | 세션 proxy 거절 | 고정 RPA log corpus에서 명시적 전처리 adapter가 질을 유지하며 절감을 재현할 때 |
| Claude Code Setup | 설치 불필요 | 아무 규칙도 없는 새 Claude 전용 저장소를 1회 진단할 때 |
| Task Observer | 거절 | 명시적 주간 skill audit이 필요하고, 기존 WES 기록에 중복 없이 투영할 계약이 생길 때 |

**WWW v0.1.x의 답은 “플러그인을 더 붙인다”가 아니다. Codex App Server가 내는 native event를 빠르고 정확하게 보여주고, Todo와 T-notes의 책임을 분리하는 것이다.**

## 조사 제한

- OmniRoute와 Headroom의 절감률·정확도·provider 수는 upstream이 공개한 주장으로만 확인했고 독립 benchmark를 재현하지 않았다. 이번 판정은 그 수치를 사실로 채택하지 않는다.
- Claude community wrapper를 설치·실행하거나 credential을 연결하지 않았다. manifest, README, skill source와 upstream revision을 읽기 전용으로 대조했다.
- Codex에서 exact-name package는 현재 로컬 설치본에서 발견되지 않았다. Codex의 “같은 기능” 판정은 공식 native surface와 현재 WWW 구현을 기준으로 했다.
- Claude Opus 읽기 전용 반대 검토는 두 번 시도했지만 verdict를 생성하지 못했다. 따라서 외부 모델 승인을 주장하지 않으며, 교차 검증은 wrapper source↔upstream source↔Codex 공식 문서의 세 방향 대조만 의미한다.
