# 제품 구조 초안

상태: 목표 아키텍처 초안. 현행 src의 이동 지시나 구현 완료 기록이 아니다.

## 설계 기준과 하위 구조 후보

WWW는 프로젝트와 도구가 바뀌어도 업무 의미·인수인계·근거를 유지한다. 최상위 탐색 축은 tui / system / workflows다. 하위 모듈은 실제 책임과 변경 흐름으로 정한다. Linear Parent Issue의 분류·상태만으로 코드 의존 관계를 결정하지 않는다.

아래 하위 디렉터리 전체는 검토 후보이며 사용자 확정 사항이 아니다. 각 항목의 필요성·소유 책임·Interface는 Linear 항목을 하나씩 논의하면서 결정한다.

```text
src/
├── tui/                  # 사용자 입력·표시·탐색·조작
│   ├── shell/
│   ├── layout/
│   ├── chat/
│   ├── tracer/
│   ├── todo/
│   ├── t-note/
│   ├── monitor/
│   ├── dashboard/
│   ├── stats/
│   └── theme/
├── system/               # 공통 실행·기록·통제
│   ├── workbench/
│   ├── runtime/          # executor·실행 session·run
│   ├── journal/
│   ├── ledger/
│   ├── approval/
│   ├── evidence/
│   ├── observability/
│   ├── integrations/
│   └── settings/
├── workflows/            # 업무별 수행 정책
│   └── tui-development/  # 첫 profile 후보, 범위는 WOO-671 논의에서 확정
├── app.ts
└── cli.ts
```

빈 폴더를 선제 생성하지 않는다. 공유 함수는 실제 다중 사용과 소유 책임을 확인한 뒤 추출한다. 기존 legacy 경로는 의존을 조사해 격리 위치를 정하고, 이동을 이유로 삭제하지 않는다.

## 책임과 Interface

| 영역 | 소유 | 소유하지 않음 |
| --- | --- | --- |
| TUI | 입력 편집, 화면 크기·색·focus, source 탐색, 공개 명령 호출 | 업무 수락 판정·executor wire 해석 |
| System | 실행 요청·취소·재개, 관측 정규화·기록, 승인 응답 전달, 근거 보존, 원본 참조 | 특정 Workflow의 단계 완료 조건 |
| Workflow | 실행 순서·재시도·사람 승인 조건, 업무 진행 의미, 근거 충분성·수락 판단 | 외부 executor 프로토콜·파일 저장 형식 |

계약은 각 모듈 가까이에 둔다. 예: runtime의 executor 계약, journal의 observation 계약, evidence의 reference 계약. 공개 Interface는 데이터 타입뿐 아니라 실패·순서·수명·권한 조건을 포함한다. 순수 계약과 IO 구현 파일은 구분해 import 검사를 유지한다.

- System은 특정 Workflow 구현을 import하지 않는다.
- Workflow는 System의 공개 명령·조회 계약을 사용하며 concrete executor·저장소를 import하지 않는다.
- TUI는 System과 Workflow의 공개 계약을 사용한다. 명령과 읽기 모델 모두 필요하다.
- app.ts는 구현과 의존을 조립한다. 업무 규칙을 직접 수행하는 거대 조정자로 만들지 않는다.
- TUI의 줄바꿈·축약·표시용 가공은 허용한다. 업무 상태와 수락은 재판정하지 않는다.
- System의 공개 관측은 숨겨진 추론을 포함하지 않으며 미관측 값과 관측된 0을 구분한다.

## 업무 한 건의 흐름

요청 → 관련 Unit/Linear Work 확인 → Workflow가 입력·완료 조건 결정 → System이 실행·승인·관측 기록 → Workflow가 근거 확인·수락 판정 → TUI에서 결과·출처 확인.

System의 일반 실행·관측 기능은 전문 Workflow 없이도 사용할 수 있다. 첫 Workflow 도입 때문에 모든 세션에 범용 엔진을 강제하지 않는다.

## 기록과 판단

System은 Evidence identity·외부 출처·revision·보존 위치를 관리한다. Workflow는 어떤 주장에 어떤 Evidence가 충분한지 판단한다. Evidence는 실행 Journal뿐 아니라 Figma·Git·테스트 보고서 등 외부 원본에서도 온다. 모든 Evidence가 Journal에서 파생된다는 제약을 두지 않는다.

Approval의 요청·응답·대상 revision은 System이 기록한다. 어떤 승인이 필요한지는 Workflow 정책이 정한다. 승인 이후 대상이 바뀌면 이전 승인의 유효성을 재검사한다.

## 이관 검증

기존 동작·공개 계약·테스트를 기준선으로 확보한다. Issue별로 코드와 테스트의 현재 위치를 연결한 뒤 이관한다. 경로 변경과 기능 변경의 결과를 구별할 수 있게 기록한다. 이관 후 순환 의존, 순수 모듈의 IO 유입, 원장 경로 단절, source identity 유실, 취소·resume 회귀를 검증한다.

전체 코드의 목표 위치는 각 Unit 논의 후 확정한다. 파일 이름의 workflow라는 단어만으로 Specialized Workflow로 이동하지 않는다. 현재 workflow-projection은 Native Plan 관측을 다루므로 내용 기반 분류가 필요하다.
