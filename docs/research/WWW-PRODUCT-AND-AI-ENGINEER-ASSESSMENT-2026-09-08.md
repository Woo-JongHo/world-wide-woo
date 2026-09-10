# WWW 제품과 우종호의 AI Engineer 역량 평가

평가일: 2026-09-08. 대상: dev, `45aec4adbebcc5abc902d33f8b29cfd6cd796068` 기준 조사 시작 시점의 코드. 보고서 행 번호는 이 기준이다.

## 1. 판정

**WWW의 문제 정의와 큰 구조 방향은 맞다. TUI는 관측 제품으로 상당한 기반이 있지만, 정확한 완료 판정까지 신뢰할 상태는 아니다. Workflow는 실행 입력·상태·승인의 구성 요소가 존재하지만, 일반 Workbench의 실행을 끝까지 강제하는 제품으로 연결되지는 않았다.**

이는 전체를 버리거나 새 언어로 다시 만들 이유가 아니다. 현재 약속한 상태·증거 계약을 실제 입력과 실패 조건에서 닫아야 한다는 뜻이다. 더 많은 화면·실행기·문서 구조를 추가하는 것보다 이 연결을 우선해야 한다.

**우종호의 현재 역할은 Agent·Workflow 지향 AI 응용 제품 개발자이자 통합 책임자에 가장 가깝다.** 문제 정의와 제품 경계 설정은 이 대화에서 확인됐다. 구현을 갖춘 저장소도 존재한다. 그러나 이 자료만으로 독립적인 production AI 인프라 설계·운영 역량, 시니어 수준, 모델·ML 전문성을 입증할 수 없다. ‘상위 몇 %’, ‘업계보다 몇 년 늦음’은 판정하지 않는다.

직접 개발을 계속할 가치는 **조건부로 있다.** 사용자의 반복 업무에서 기존 실행기만 사용할 때보다 확인·복구·인계 비용을 줄이는지 측정해야 한다. 기술적 독창성과 개인 업무에서의 유용성은 별개다. 현재 투자 대비 개선 효과를 입증한 비교 데이터는 이번 조사에서 확보하지 못했다.

## 2. 기준과 한계

- 의도의 우선순위: 이번 사용자 정정(TUI·Workflow, WES 제외) → 사용자가 붙여준 대화 → 현재 제품 계약 → 과거 장기 계획.
- WES는 미래 구상으로 제외한다. 범용 Lifecycle, 다중 프로젝트 Dashboard, 모든 외부 도구 자동 연결의 부재를 현재 버그로 세지 않는다.
- 현재 문서는 혼재돼 있다. README:11은 개발 중 Workbench, `docs/planning/linear-development/README.md:3`은 논의용 초안임을 명시한다. `WWW_PRODUCT_DIRECTION.md`의 9월 3일 버전·Pi 설계 상태는 현재 package 0.0.16·Pi 코드와 달라 현황 판정에 그대로 쓰지 않았다.
- 기존 dirty 세 파일은 RPA 설명 계약·코드·테스트다. 이번 주요 발견은 이 변경과 무관한 HEAD 코드다. 제품 파일은 수정하지 않았다.
- 종료 점검 중 다른 작업의 Todo·Plan 관련 코드·테스트 변경이 추가된 것을 확인했다. 이 변경을 되돌리거나 이번 감사에 통합하지 않았다. 908개 테스트 결과와 재현 판정은 변경 전 조사 기준에 속하며 최신 이동 중 작업 디렉터리의 통과를 뜻하지 않는다. 종료 diff는 scratchpad의 `concurrent-changes.diff`에 보존했다.
- 코드·대화는 개인의 경력 전체가 아니다. Git 저자 이름, 코드량, AI가 만든 산출물을 사용자의 직접 구현 능력으로 환산하지 않는다. 사용자 대화 밖의 프로젝트 실적·고객 운영·장애 대응은 미확인이다.
- 이번 재현은 실제 application/store 코드에 메모리 실행기와 임시 파일시스템을 연결한 검증이다. 실제 Codex App Server 세션, 실터미널 입력·스크롤, Windows/Linux, 외부 서비스 쓰기는 실행하지 않았다.
- Claude Sonnet 5 요청은 구독 세션 한도로 실패했다. modelUsage가 비어 있어 실제 모델 실행을 입증하지 못했다. 반대 provider 검토가 수행됐다고 표현하지 않는다. Opus 고정 요청도 동일한 세션 한도로 실패했고 modelUsage가 비어 있다. 두 모델 모두 자동 대체하지 않았다.

## 3. 서비스 정의와 구조 정합성

WWW는 AI와 도구로 수행하는 업무에 개인의 절차와 완료 기준을 적용하고, 그 진행·실패·증거를 보여주는 로컬 업무 운영 제품이다.

| 축 | 사용자에게 제공할 가치 | 현재 구현 평가 |
|---|---|---|
| TUI | 무엇을 했고 무엇을 믿어도 되는지 판단 | Native 관측·journal·Todo·Trace·요약·재개 구현. 상태와 검증 요약의 연결 결함 재현 |
| Workflow | 절차·승인·완료 조건을 프로젝트마다 일관되게 적용 | RPA 고정 Skill chain·digest·상태 전이·Artifact 검사 존재. 별도 CLI 중심이며 일반 실행 강제는 미연결 |
| 두 축의 연결 | 같은 사건에서 같은 진행·완료 근거를 표시 | ExecutionRun과 Native Plan projection의 상태 해석이 갈라짐. 우선 수정 대상 |

`core / adapters` 방향은 적절하다. 모델·외부 실행기와 제품 상태를 분리할 자리가 있고 테스트 대역을 통해 애플리케이션 자체를 실행할 수 있다. 다만 의존성 검사 통과가 의미의 단일 소유까지 보장하지 않는다. 이번 Todo/Tracer 불일치는 그 반례다.

TUI가 제공할 신뢰는 ‘그럴듯하게 설명한다’가 아니라 ‘관측값·추정·미확인을 구별한다’여야 한다. Workflow의 통제 역시 매번 승인을 묻는 강도가 아니라, 필요한 조건을 만족하지 않은 전이를 실제로 차단하는 정확도다. 사람이 승인했다는 사실도 결과가 사실이라는 증명은 아니다.

## 4. 코드 발견사항

P1은 현재 제품의 핵심 신뢰·저장 계약을 깨뜨려 우선 수정해야 하는 문제, P2는 그 해석 또는 운영을 약화시키는 문제다. 보안 공격 가능성이나 고객 사고 발생을 입증했다는 뜻은 아니다.

| ID | 판정 | 발생 조건과 관측 결과 | 근거 |
|---|---|---|---|
| TUI-01 | P1 / 통합 재현 | Native Plan 진행 중 개별 commandExecution 종료 → Todo 완료, Tracer 진행 중 | `src/core/runtime/execution-run.ts:172`, `src/core/application/orchestration/project-workbench.ts:2046`, `src/core/domain/work/workflow-projection.ts:531` |
| TUI-02 | P1 / 통합 재현 | `bun test`, exitCode=1 뒤 turn 종료 → receipt.verification과 remaining이 빈 배열 | `src/core/runtime/execution-run.ts:183`, `:212`, `src/adapters/inbound/tui/chat/workbench-views.ts:584` |
| TUI-03 | P2 / 같은 재현 | 일반 item/completed의 exitCode와 item 결과를 phase 판정이 반영하지 않음 | `src/core/application/orchestration/project-workbench.ts:2524` |
| WF-01 | P1 / 함수 재현·CLI 정적 확인 | evidence=['']로 completed와 유효 digest Receipt 발급. CLI도 임의의 비어 있지 않은 참조를 실제 read-back 확인 없이 받음 | `src/core/workflows/skill-run.ts:87`, `:96`, `scripts/skill-runtime.ts:31` |
| WF-02 | P1 / 경쟁 스케줄 재현 | 두 writer가 같은 revision을 읽으면 둘 다 성공 가능. 최종 값이 앞선 결과를 덮음 | `src/adapters/outbound/persistence/skill-run-store.ts:13` |
| WF-03 | P1 / 저장 실패 주입 | 상태 저장 후 Receipt 경로 오류 → completed 상태만 남음 | `scripts/skill-runtime.ts:32` |

### TUI에서 관측된 실제 연결 실패

실제 ProjectWorkbench를 대역 실행기와 연결해 다음을 관측했다.

```text
Plan inProgress: Todo=in_progress / Tracer=running
item/completed(command=bun test, exitCode=1): Todo=completed / Tracer=running
turn/completed: receipt.status=completed / verification=[] / remaining=[]
```

도구 한 번의 종료가 계획 완료로 해석되고, Native 입력의 method가 `item/completed`이므로 `verif` 문자열만 찾는 검증 분류에서 빠진다. 단위 테스트의 가상 verification 이벤트와 실제 입력 경로가 다르다. 개별 도구 원문은 남아 있으므로 ‘실패 로그 전체 유실’은 아니다. 요약을 신뢰하는 사용자가 검증 실패와 남은 계획을 놓칠 수 있다는 문제다.

`turn/completed`는 Native turn 종료 의미로 타당할 수 있다. 이것을 업무 accepted로 읽어서는 안 되며, 모든 exit!=0에서 에이전트 전체를 중단하는 것도 답이 아니다. 도구 실패 후 정상 복구는 허용하되 실패 이력·검증 결과·계획 상태를 별도로 유지해야 한다.

### Workflow에서 관측된 계약의 빈틈

`finishSkillStep`은 근거 배열의 길이는 검사하지만 실제 근거를 판정하지 않는다. digest는 기록이 바뀌었는지를 확인하며 내용의 사실성을 보증하지 않는다. 빈 문자열 차단만으로는 read-back 계약이 충족되지 않는다.

CAS 재현은 read 반환 시점을 barrier와 지연으로 통제했다. 실제 write/rename 코드는 그대로 사용했으며 두 완료가 모두 fulfilled였다. 일반 부하에서의 빈도를 측정한 것은 아니다. 파일의 원자 rename과 read-check-write 전체의 원자성은 다르다.

Receipt 실패는 임시 디렉터리에 파일 장애를 주입한 결과다. 단순히 Receipt를 먼저 쓰도록 순서를 바꾸면 반대 방향의 고아 기록이 생길 수 있다. 상태와 증거를 하나의 일관된 commit 또는 복구 가능한 절차로 다뤄야 한다.

### 결함과 구분할 개발 범위

Skill Run 조립은 별도 scripts/skill-runtime.ts에 있고 일반 ProjectWorkbench의 완료 게이트로 연결되지 않았다. 따라서 ‘Workflow 강제가 구현 완료’라고 소개할 수 없다. 다만 첫 Workflow 기획이 진행 중임을 고려해 미연결 자체를 이미 수락한 기능의 회귀로 분류하지 않는다.

임의 actor 문자열, Native Candidate의 digest 모양 검사, 다른 root에 동일 Run 저장 가능성은 신뢰 경계의 한계다. 로컬 운영자가 임의 파일을 쓸 수 있다는 이유만으로 보안 취약점이라고 부르지 않는다. 다중 프로젝트 표준·예외·정체성은 아직 입증되지 않았다.

## 5. 구현에서 확인한 강점

- Native 실행은 ExecutorPort 뒤에 있고, journal 기록 후 화면에 publish하는 순서를 다룬다. 실행과 화면을 분리하려는 설계가 실제 테스트 가능하다.
- 불확실한 전송을 자동 중복 실행하지 않고 재조회·취소·큐 보존으로 처리한다.
- 재개 시 thread mismatch를 차단하고 부분적인 로컬 이력만 확보했음을 표시한다.
- journal 손상, sequence gap, 중복·다른 Run·종료 후 사건을 다루는 방어와 테스트가 있다.
- Skill 파일의 경로·bytes digest·revision을 수집하고 모호한 RPA intent·필수 입력 누락을 거절한다.
- stale 승인 digest와 uncertain Run 재시도 차단은 이번 probe에서도 동작했다.
- 렌더 요청 병합과 중요 상태 즉시 반영을 구분한다. 실제 사용 성능의 우수성까지 입증한 것은 아니다.

그러므로 ‘아무것도 구현하지 않고 문서만 많다’는 평가는 틀리다. 더 정확한 평가는 **구성 요소의 방어는 존재하지만 여러 구성 요소가 함께 만드는 의미를 검증하는 테스트가 부족하다**는 것이다. 2,829줄의 ProjectWorkbench도 길이 자체보다 command·queue·관측·재개·여러 projection을 함께 소유해 같은 개념이 다른 곳에서 해석된다는 점이 문제다.

## 6. 우종호의 AI Engineer 위치

### 직접 확인한 것과 추론을 나눈다

대화에서 직접 확인한 행동은 세 가지다. 모델의 말을 신뢰하는 대신 실행과 근거를 보려 했다. 여러 프로젝트의 업무 규칙을 코드로 강제하려 했다. 평가 범위가 WES로 확장되자 현재 TUI·Workflow로 되돌렸다. 이는 문제 정의, 운영 관점, 범위 선택의 증거다.

저장소에는 복구·무결성·상태·테스트에 대한 설계가 있다. 이는 우종호가 주도하는 개발 과정의 산출물이지, 해당 코드를 모두 혼자 설계·작성·디버깅했다는 증명은 아니다. 반대로 결함이 있다는 사실만으로 개인 능력의 부재를 결론 낼 수도 없다. 개인 평가의 신뢰도는 제품 코드 판정보다 낮다.

| 역량 축 | 확인된 근거 | 현재 책임 범위에 대한 판단 |
|---|---|---|
| 문제 정의·제품 의도 | 신뢰 판단과 반복 업무 통제라는 구체적 문제, 현재 범위 정정 | 목표 정의는 독립적으로 소유한 근거가 있음 |
| AI 응용 제품 통합 | Native 실행·TUI·저장·외부 도구 계약을 갖춘 제품 | 제한된 로컬 제품을 개발·통합하는 활동은 확인. 사용자가 끝까지 수락한 완결 제품의 증거는 부족 |
| Agent·Workflow 설계 | 모델 바깥 상태·승인·검증·인계에 관심, 실제 계약 코드 | 설계와 구성 요소 구현 단계. 강제된 종단 간 Workflow를 독립 소유했다는 입증은 부족 |
| 평가·신뢰성 | 반증 요구, 다수 행동 테스트, 복구 모델 | 기준에 대한 감각은 있음. 실제 입력·저장 실패·경쟁 조건을 포함한 검증의 빈틈 확인 |
| 운영 인프라 | 로컬 복구·journal·adapter | 다중 프로세스 저장 보장부터 보완 필요. 장기 운영·배포·격리·SLO 책임은 미확인 |
| 모델·ML | 이번 범위에 데이터·학습·서빙 실적 없음 | 미평가. 이 축이 없다고 AI 응용 엔지니어가 아닌 것은 아님 |

실무 역할명으로는 **Agent 시스템에 집중하는 AI Application Engineer / 제품 통합 개발자**가 가장 방어 가능한 표현이다. Agent Infrastructure Engineer는 현재 관심·개발 영역으로는 맞지만, production 숙련도를 나타내는 직함으로 확정할 근거는 부족하다. Junior/Mid/Senior 채용 등급은 경력 자료·직접 문제 해결 관찰 없이 매기지 않는다.

### 냉정하게 부족한 지점

1. **개념을 구분하는 것과 실행에서 보장하는 것 사이의 간격.** Evidence·Gate·CAS라는 이름을 도입했어도 실제 입력과 실패 시 계약이 깨졌다. 다음 성장 목표는 더 많은 용어가 아니라 그 이름이 의미하는 보장을 끝까지 입증하는 것이다.
2. **경계 간 검증.** 같은 개념을 모듈별로 구현하고 각 테스트가 통과해도 사용자 화면은 충돌했다. 설계 단위를 파일에서 사용자 흐름으로 옮겨야 한다.
3. **성과 측정.** 테스트 개수·문서 정합·기능 수와 별개로 확인 시간·재작업·완료 수락률이 좋아졌다는 측정이 필요하다.
4. **완결 우선순위.** 다양한 provider·관측 화면·기록 체계가 존재하는 동안 핵심 완료 판정에 결함이 남았다. 이것은 우선순위를 다시 점검할 근거다. 전체 과거 일정이나 개인의 성향까지 단정할 근거는 아니다.

제품을 완성할 가능성은 있으나 현재 자료로 완성을 보장하지 않는다. 지금 드러난 병목은 모델 지식의 양보다 작은 범위를 정확하게 끝내고 운영 증거로 닫는 능력이다. 이 병목을 해소한 실적이 개인 위치를 한 단계 더 확실하게 보여줄 것이다.

AI를 사용하지 않고 코딩하는 시험을 요구할 필요는 없다. 대신 향후 위 결함 하나의 원인을 스스로 설명하고, 최소 수정·반증 테스트·실행 로그를 검토해 수락 여부를 판단하는 과정을 관찰하면 직접 통합·판별 역량을 평가할 수 있다. 이번에는 그 추가 과제를 수행하지 않았다.

## 7. 업계 비교와 이전 대화의 정정

Cursor는 모델별 harness와 평가·실사용 신호를 이용한 개선을 공식적으로 설명하며, coding agent 개발 출발을 2024년 말로 적었다. 따라서 ‘동일 모델도 주변 실행 설계에 따라 결과가 달라진다’는 관찰은 맞다. 그러나 그 사실로 우종호가 몇 년 뒤처졌다고 계산할 수 없다. [Cursor 공식 글](https://cursor.com/blog/continually-improving-agent-harness)

Cursor도 다중 에이전트 조정과 업무 흐름을 다룬다. 따라서 ‘Cursor는 코딩만, WWW는 상위 Lifecycle이므로 고유하다’는 이분법은 약하다. WWW의 차별점은 실제 개인 업무 계약과 여러 도구 사이의 수락·인계를 얼마나 잘 해결하느냐로 증명해야 한다. [같은 공식 글](https://cursor.com/blog/continually-improving-agent-harness)

Anthropic은 정해진 코드 경로를 따르는 workflow와 모델이 동적으로 경로를 정하는 agent를 구분하고, 단순한 방식에서 시작해 필요할 때 복잡도를 더하라고 설명한다. WWW는 이미 해결된 범용 loop를 전부 다시 만들 필요가 없다. [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)

LangGraph는 checkpoint와 thread를 통한 상태 보존·재개 기능을 제공한다. 기존 framework의 존재가 WWW 교체를 곧바로 정당화하지는 않는다. 지금의 작은 로컬 Workflow에 필요한 보장을 직접 수정하는 비용과 프레임워크 연결·이관 비용을 비교해야 한다. [LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence)

Anthropic의 평가 지침은 실행 transcript와 실제 환경의 outcome을 구분한다. WWW에서 ‘성공 Receipt가 생성됨’과 ‘요구가 충족됨’을 나누어야 하는 이유와 직접 맞닿는다. 반복 trial, 결과 판정과 관측을 연결하는 것이 다음 성숙 단계다. [Agent evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

선행 기술을 재학습하는 것 자체는 엔지니어링에서 정상적이다. 투자 낭비는 선행 개념을 늦게 접했다는 사실보다, 이미 해결된 기반을 검토하지 않고 반복 구현하면서 실제 업무 효과를 측정하지 않는 데서 발생한다. 현재 비교는 기능·공개 원칙 수준이며 경쟁 제품을 같은 과제로 직접 실행한 성능 비교는 아니다.

## 8. 투자 판단과 다음 세 작업

### 유지할 것

Native 실행기를 재사용하는 기본 방향, core/adapter 분리, 실제 사건과 원본을 연결하는 TUI, 고정 Workflow와 결정론적 계약 검증. TUI는 사용자가 반복적으로 확인 비용을 느끼는 표면이므로 의미가 있지만, 정보량보다 판정의 정확성과 읽는 시간을 우선한다.

### 먼저 수정할 것

1. **하나의 계획 상태와 검증 결과를 TUI 전체에 연결한다.** 도구 완료로 Plan을 완료시키지 않는다. 실패·복구·미실행 검증을 요약에 보존한다. 수락: 동일 실제 형태 fixture에서 Todo·Tracer 상태 일치, 명시적 Plan update만 계획 완료, exitCode=1 결과가 종료 요약에서 사라지지 않음. tool 실패 후 정상 복구도 함께 검증한다.
2. **Skill 완료와 증거 저장을 하나의 보장으로 만든다.** 성공에는 유효한 검증 결과를 요구하고, 두 writer 중 하나만 commit되며, 모든 저장 실패 지점에서 재개 후 상태·Receipt가 일관돼야 한다. 수락: 빈/임의 증거 거절, 동시 revision 경쟁 한 건 성공, 장애 주입 후 근거 없는 completed 부재. 로컬 운영자 신뢰와 사람 승인 증명은 계약에서 구분한다.
3. **한 Workflow를 두 프로젝트에서 끝까지 실행한다.** 첫 후보는 현재 체인 중 작은 `rpa-reconcile`이다. 같은 규칙, 다른 project root와 업무 ID를 사용하고 실제 결과를 읽어 수락한다. 수락: 정상·참조 누락·stale·중단 재개를 두 프로젝트에서 재현하고 TUI가 다음 행동을 설명. 개발을 이 보고서에서 자동 시작하지 않는다.

### 효과 측정과 보류 조건

세 번째 작업 이후 비교용 반복 업무 5종을 고정하고 두 프로젝트에서 총 10쌍의 시도를 비교하는 소규모 pilot을 제안한다. Native+현재 규칙만 사용하는 경로와 WWW 경로를 동일 초기 상태·모델·수락 기준으로 비교하고 순서를 번갈아 배치한다. 확인에 쓴 사람 시간, 재작업, 잘못된 완료, 실행 시간·Token을 기록한다. 이는 새 제안이며 수행한 실험이 아니다.

최소 판단 기준은 잘못된 완료가 pilot에서 없어야 하고, 품질을 낮추지 않으면서 사람 확인 시간의 중앙값이 줄어야 한다. 10쌍은 운영 신뢰성을 보장하는 표본이 아니며 개인 투자 방향을 판단하는 초기 자료다. 유지비까지 포함한 효과가 없으면 해당 UI·자동화 범위를 줄인다.

새 실행기 확대, 범용 자체 Agent loop, 언어 전면 재작성, WES 도입은 이 세 작업의 선행 조건이 아니다. 작은 Workflow에 효용이 확인되기 전까지 보류하는 편이 현재 근거에 맞다.

## 9. 검증 기록

| 검사 | 결과 | 해석 한계 |
|---|---|---|
| `bun run check` | exit 0 | 타입 적합성 |
| `bun test` | 908 pass, 0 fail, 6,532 assertions, 102 files, 25.90초 | 정의된 테스트 통과; 제품 수락 아님 |
| TUI 집중 테스트 | 192 pass / 0 fail | 전체 suite의 부분집합; 합산하지 않음 |
| Workflow 집중 테스트 | 29 pass / 0 fail | 전체 suite의 부분집합; 합산하지 않음 |
| 통합자 TUI 재현 재실행 | 같은 Todo/Tracer 불일치·빈 검증 요약 확인 | 대역 Executor, 실제 application 코드 |
| 통합자 Workflow 재현 재실행 | 빈 근거 성공·완료만 잔존·동시 writer 성공 확인 | 임시 FS·스케줄 통제 |
| stale 승인·uncertain retry | 예상대로 거절 | 해당 경로만 확인 |
| 두 root에 Run 저장 probe | 같은 Run 저장 허용 | 실제 다중 프로젝트 일관 Workflow 완료를 뜻하지 않음 |
| skip/only 및 핵심 파일 미구현 표시 검사 | 실행형 skip/only 검색 일치 없음, 핵심 조사 파일 자리표시 없음 | fixture 문자열·Todo 기능명은 미구현 아님 |
| 실제 터미널·외부 실행기·원격 write·장기 부하 | 미실행 | UI 사용성·실서비스 복구·배포 수락은 미판정 |
| Sonnet 5 독립 검토 | 세션 한도로 미실행 | 자동 대체 없음 |
| Opus 최종 감사 | 세션 한도로 미실행 | `opus.json`, modelUsage 비어 있음; 대체 없음 |

원본 증거는 `.www/scratchpad/2026-09-08-product-audit/`에 있다. `baseline.json`, `tests.log`, `typecheck.log`, `tui.md`, `tui-repro.ts`, `tui-repro-rerun.log`, `workflow.md`, `workflow-probe.ts`, `workflow-probe-rerun.log`, `sonnet.json`을 보존한다. scratchpad는 로컬 증거이며 Git에 자동 포함된다고 가정하지 않는다. 이 문서는 제품 수락이나 독립 provider 감사 통과 선언이 아니다.
