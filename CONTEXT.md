# World Wide Woo

`www`는 서비스 생애주기의 일을 여러 실행기와 도구에 배분하고, 사용자의 Standard·승인·Evidence 아래 일관되게 통제하는 개인화 Orchestration Harness다.

## Language

**Chat**: 사용자와 선택된 Execution Lane의 대화 및 공개 가능한 중간 작업을 시간순으로 보여주는 표면.
_Avoid_: 별도 모델이 다시 쓴 세션 요약.

**Todo.md**: 활성 Run이 공개한 Plan과 진행 상태를 보여주는 읽기 전용 Projection.
_Avoid_: 사용자 장기 Backlog, 직접 편집하는 실행 원장, raw activity log.

**Session Goal**: 해당 Run 전체가 도달하려는 선택적 한 문장. Chat의 완료 기록 앞에 표시할 수 있다.

**T-note**: 질문 하나의 Turn이 끝난 뒤 `질문 · 왜 이 과정을 거쳤는지 · 결과`를 Chat의 안정된 `#n`으로 남기는 완료 기록.
_Avoid_: 실시간 진행 표시, Todo 복제, raw transcript 나열.

**Trace**: 선택한 Run이 공개한 Plan·Agent·Tool·승인·결과와 Source를 시간 및 계층 관계로 보여주는 관측 Projection.
_Avoid_: 숨겨진 추론, 관측되지 않은 실행, raw activity log.

**Evidence**: Artifact가 Contract를 충족하고 업무가 수락 가능한지를 뒷받침하는 검증 자료의 집합.
_Avoid_: 실행기의 완료 주장, 성공 exit code 하나, raw 로그 전체.

**Summary checkpoint**: 완료된 Turn 경계에서 충분한 새 활동이 누적됐는지 판단하고 T-note 생성을 예약하는 시점.
_Avoid_: activity가 들어올 때마다 요약을 다시 만드는 동작.

**Service Lifecycle**: 기획·디자인·개발·검증·배포·운영·유지보수를 하나의 서비스 변화 흐름으로 관리하는 WWW의 최상위 업무 범위.
_Avoid_: 코딩 세션 하나, 배포 파이프라인만을 뜻하는 lifecycle.

**Orchestration Harness**: Service Lifecycle의 Stage를 실행기와 도구에 배분하고 승인·상태·Evidence·완료 판정을 일관되게 통제하는 WWW 제품 전체.
_Avoid_: 모델 Router만 있는 오케스트레이터, 내부 Adapter 하나, 범용 Coding Agent.

**Application Runtime**: Work Chain·Workflow Loop·승인·Projection·Evidence의 상태와 생명주기를 소유하는 WWW의 실행 계층.
_Avoid_: TUI 자체, Agent Execution Runtime, 저장 디렉터리.

**Agent Execution Runtime**: 모델 호출과 Tool 결과를 Session 안에서 완료까지 반복하는 실행 계층.
_Avoid_: WWW의 Workflow Loop, 모델 API 한 번, 화면 렌더러.

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

**Embedded Executor**: WWW 프로세스 안에 SDK Library로 내장되지만 Agent Execution Runtime의 생명주기와 계약은 Adapter 뒤에서 분리되는 실행기.
_Avoid_: 별도 CLI 프로세스, WWW Application Runtime 전체, 복사한 upstream 소스.

**Direct Executor**: 제한된 업무에서 WWW가 모델 입력·Tool·반복·종료를 직접 소유하는 선택적 실행기.
_Avoid_: 모든 코딩 작업의 기본 실행기, Native Executor의 선행 재구현.

**Lightweight Executor**: 분류·추출·형식 변환처럼 실패 영향이 작고 Contract로 즉시 검증할 수 있는 작업을 낮은 비용과 지연으로 수행하는 실행기 역할.
_Avoid_: 복잡한 설계·코딩, 외부 Write, 사람 승인 대체.

**Workflow Loop**: Blueprint의 Stage 사이에서 실행기 선택·재시도·승인·검증·완료를 조정하는 WWW의 상위 반복.
_Avoid_: 모델과 Tool 사이를 반복하는 Native Execution Loop.

**Workflow Profile**: Product·RPA처럼 업무 유형에 맞는 Stage·Handoff·Contract의 기본 구성을 선택하는 Standard의 분기.
_Avoid_: 별도 WWW 제품, 특정 프로젝트의 값, 실행기 종류.

**Agent Revision**: 같은 업무 목적을 유지하면서 Stage·Skill·모델·Context·예산 정책을 바꾼 비교 가능한 Agent 정의 버전.
_Avoid_: 모델 이름만 바꾼 세션, 실행 중 임시 Prompt.

**Provider Lane**: 독립된 인증·구독 한도·Session·실행 계약을 가진 Codex·Claude·Gemini 공급자 축.
_Avoid_: 모델 이름 하나, Agent Role.

**Execution Lane**: Run을 시작할 때 선택해 Agent Execution Runtime의 Plan·Tool Loop·Skill·Subagent·Session·승인을 끝까지 소유하는 Executor Adapter 경로.
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

**Role View**: 동일한 Work Chain을 PM·디자인·개발·검증 등 역할의 책임과 결정에 필요한 상태·원본·승인·Evidence로 투영한 화면.
_Avoid_: 역할별 독립 Truth, 모든 정보를 똑같이 복제한 범용 Dashboard.

**Handoff Contract**: 역할이나 도구의 경계를 넘을 때 업무 의도·원본·결정·상태·Acceptance Criteria·Evidence가 유실되지 않았음을 요구하는 계약.
_Avoid_: 자유 형식 전달 메모, 복사·붙여넣기, 다음 역할의 추측.

**Work Chain**: 하나의 업무와 역할 사이 전달을 Figma·Atlas·Linear·GitHub·Obsidian의 Artifact 및 WWW Logical ID로 연결한 추적 단위.
_Avoid_: 도구 간 내용 복제, 외부 ID 하나를 전체 업무 ID로 사용하는 것.

**RPA Work**: 업무 프로세스와 자동화 정의에서 시작해 입력·출력·예외·운영을 중심으로 구성되는 Workflow Profile.
_Avoid_: WWW가 수행하는 모든 자동화, Agent Tool 실행.

**Product Work**: 사용자 문제와 제품 요구에서 시작해 기획·디자인·개발·검증을 연결하는 Web·App·Tool Workflow Profile.
_Avoid_: 비RPA, 디자인과 무관한 모든 개발 작업.

**Atlas**: 디자인 또는 자동화 요구를 개발 가능한 항목과 Dashboard로 구조화하는 업무 공간.
_Avoid_: Figma 디자인 원본, Linear 실행 일지, GitHub 코드 저장소.
