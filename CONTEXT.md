# World Wide Woo

`www`는 사용자의 반복 업무를 여러 프로젝트에 같은 표준으로 적용하고, 진행상황을
사용자 자신의 기준으로 정의·판단하는 TUI에서 파악하며, 실행 결과·증거·Token 성과를
비교해 다음 실행을 개선하는 개인용 멀티프로젝트 Workbench다.

## Language

**Chat**: Codex와 주고받은 대화와 사용자가 확인할 수 있는 native 중간 작업을 시간순으로 보여주는 표면.
_Avoid_: 별도 모델이 다시 쓴 세션 요약.

**Todo.md**: 현재 Native 세션이 공개한 Plan과 진행 상태를 그대로 확인하는 읽기 전용 Projection. Native thread에 결속하고 새 세션은 빈 상태에서 시작하며 `--resume`만 같은 Plan 이력을 복구한다.
_Avoid_: 사용자 장기 Backlog, 직접 편집하는 실행 원장, raw activity log.

**Session Goal**: 해당 Native 세션 전체가 도달하려는 선택적 한 문장. `$session-goal` 결과가 있을 때만 Chat의 완료 기록 앞에 표시한다.

**T-note**: 질문 하나의 turn이 끝난 뒤 `질문 · 왜 이 과정을 거쳤는지 · 결과`를 Chat의 안정된 `#n`으로 남기는 완료 기록.
_Avoid_: 실시간 진행 표시, Todo 복제, raw transcript 나열.

**Summary checkpoint**: 완료된 turn 경계에서 충분한 새 활동이 누적됐는지 판단하고 T-note 생성을 예약하는 시점.
_Avoid_: activity가 들어올 때마다 요약을 다시 만드는 동작.

**Standard**: 여러 프로젝트에 반복 적용하는 버전이 있는 업무 규칙의 집합.
_Avoid_: 프로젝트 하나의 임시 설정, 자연어 권고만 있는 메모.

**Blueprint**: 한 업무를 어떤 단계·입력·산출물·승인으로 수행할지 정의한 Standard의 실행 가능한 형태.
_Avoid_: Native 세션 하나, 모델 Prompt 하나.

**Contract**: 산출물이 반드시 만족해야 하는 구조·값·관계·완료 조건.
_Avoid_: Skill의 수행 절차, Agent의 완료 주장.

**Project Binding**: Standard를 특정 프로젝트의 값·허용 예외·외부 Artifact 참조에 결속한 Instance.
_Avoid_: Standard 원본 수정, 외부 Artifact 복제.

**Logical ID**: WWW가 Definition과 Project Instance에 안정적으로 부여하고 외부 시스템 ID와 별도로 보존하는 식별자.
_Avoid_: Figma·Linear·GitHub가 발급한 ID를 WWW ID로 재해석하는 것.

**Validator**: 실행 주체의 주장과 독립적으로 Artifact가 Contract를 만족하는지 판정하는 결정론적 검사기.
_Avoid_: 모델의 자가검토, 성공 exit code만으로 한 완료 판정.

**Rule Critic**: Standard·Blueprint·Contract·Validator 규칙의 누락·충돌·모호성과 빠진 경계 사례를 찾아 수정 후보를 제안하는 읽기 전용 모델 역할.
_Avoid_: Validator의 최종 pass/fail 판정, 규칙 자동 변경.

**Native Executor**: 모델 호출·Tool Loop·승인·Sandbox·Session을 자기 계약으로 소유하고 WWW가 Adapter를 통해 사용하는 외부 실행기.
_Avoid_: WWW 내부 Agent Loop, 단순 모델 API.

**Direct Executor**: 제한된 업무에서 WWW가 모델 입력·Tool·반복·종료를 직접 소유하는 선택적 실행기.
_Avoid_: 모든 코딩 작업의 기본 실행기, Native Executor의 선행 재구현.

**Lightweight Executor**: 분류·추출·형식 변환처럼 실패 영향이 작고 Contract로 즉시 검증할 수 있는 작업을 낮은 비용과 지연으로 수행하는 실행기 역할.
_Avoid_: 복잡한 설계·코딩, 외부 Write, 사람 승인 대체.

**Workflow Loop**: Blueprint의 Stage 사이에서 실행기 선택·재시도·승인·검증·완료를 조정하는 WWW의 상위 반복.
_Avoid_: 모델과 Tool 사이를 반복하는 Native Execution Loop.

**Agent Revision**: 같은 업무 목적을 유지하면서 Stage·Skill·모델·Context·예산 정책을 바꾼 비교 가능한 Agent 정의 버전.
_Avoid_: 모델 이름만 바꾼 세션, 실행 중 임시 Prompt.

**Provider Lane**: 독립된 인증·구독 한도·Session·실행 계약을 가진 Codex·Claude·Gemini 공급자 축.
_Avoid_: 모델 이름 하나, Agent Role.

**Execution Lane**: Story·Run을 시작할 때 선택해 Plan·Tool Loop·Skill·Subagent·Session·승인을 끝까지 소유하는 Native Executor Adapter 경로.
_Avoid_: 실행 중 Provider 교체, Reviewer 모델 선택.

**Agent Role**: Primary Executor·Independent Reviewer·Rule Critic처럼 한 Stage에서 맡는 책임과 권한의 이름.
_Avoid_: Provider 이름, 특정 모델 ID.

**Role Binding**: Agent Role을 Provider Lane·모델·effort·권한·예산에 결속한 버전이 있는 실행 정책.
_Avoid_: 실행 중 조용한 Provider 변경, Provider에 역할을 영구 고정하는 것.

**Token Tuning**: Agent Revision별 Token·시간·재시도·사람 개입·검증 결과를 함께 비교해 다음 실행 정책을 개선하는 과정.
_Avoid_: 모델 weight 학습, Token 절감만으로 한 최적화.

**Progress Model**: 여러 프로젝트의 업무 상태·완료·대기·위험·다음 행동을 사용자가 자기 업무 기준으로 정의하고 판정하는 체계.
_Avoid_: 실행기가 내보낸 raw status, 고정된 범용 Kanban 상태.

**Operations TUI**: Progress Model에 따라 여러 프로젝트의 현재 위치·근거·다음 행동을 한곳에서 파악하고 조작하는 사용자 표면.
_Avoid_: Native Executor 화면의 단순 복제, 로그를 나열한 Dashboard.

**Work Chain**: 하나의 업무를 Figma·Atlas·Linear·GitHub·Obsidian의 역할별 Artifact와 WWW Logical ID로 연결한 추적 단위.
_Avoid_: 도구 간 내용 복제, 외부 ID 하나를 전체 업무 ID로 사용하는 것.

**RPA Work**: 기본 Workflow가 Atlas의 자동화 정의에서 시작되는 업무 유형.
_Avoid_: WWW가 수행하는 모든 자동화, Agent Tool 실행.

**Product Work**: Figma의 디자인 원본에서 시작해 Atlas의 개발 항목으로 이어지는 Web·App·Tool 업무 유형.
_Avoid_: 비RPA, 디자인과 무관한 모든 개발 작업.

**Atlas**: 디자인 또는 자동화 요구를 개발 가능한 항목과 Dashboard로 구조화하는 업무 공간.
_Avoid_: Figma 디자인 원본, Linear 실행 일지, GitHub 코드 저장소.

**Trace**: Native Executor가 공개한 Plan·Agent·Tool·승인·결과와 그 출처를 시간 및 계층 관계로 보여주는 관측 Projection.
_Avoid_: 숨겨진 추론, 관측되지 않은 Skill·Validator 호출, raw activity log.
