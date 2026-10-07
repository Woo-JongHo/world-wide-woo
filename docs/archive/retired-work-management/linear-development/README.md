# Linear 기반 개발 기획

상태: 2026-09-05 작성한 논의용 초안. 전체 기획 완료·Linear 반영·코드 이관 완료를 뜻하지 않는다.

2026-09-06에는 사용자 실행 지시에 따라 [TUI 준비 계획](TUI_PREPARATION_PLAN.md)의 요구사항 정리·Linear 반영·코드 ID 연결을 수행했다. [실행 결과](TUI_PREPARATION_RESULT.md)를 기준으로 이어가며 제품 구현과 실제 TUI 수락은 남아 있다.

추가 요청인 Linear→Unit/Code→DB→대화·테스트→Obsidian 흐름은 [개발 기록 연결 설계](KNOWLEDGE_BRIDGE_DESIGN.md)에서 다룬다. 공유 DB는 SQLite다. 기존 목적·권위 경계를 대조한 [정정 기록](DECISION_RECONCILIATION.md)을 함께 읽는다. DB/Obsidian 통합은 설계 단계이며 아직 구현하지 않았다.

## 목적과 진행 순서

사용자가 읽기 쉬운 TUI / System / Workflows 구조로 WWW를 개발한다. Linear에서 업무 범위와 수락 조건을 먼저 논의하고, 기존 구현을 ID로 연결하며 개발한다. 코드·테스트·증거를 확인한 뒤 사용자와 수락을 판정한다.

1. 코드 저장소에 둘 기획 문서와 정본 역할을 확정한다.
2. ID Unit의 의미와 기존 Linear·EP/ST·코드 연결 규칙을 확정한다.
3. Linear Project와 v0.1.0 범위를 사용자와 논의한다.
4. TUI / System / 첫 Workflow의 Parent Issue를 하나씩 논의한다.
5. 각 기능의 기존 구현·부족한 부분·수락 조건을 확인하고 실행 Issue를 완성한다.
6. 논의된 Issue에 연결된 범위부터 코드 이관·개발·검증을 진행한다.

전체 v0.1.0 작업 분해를 개발 전에 어디까지 확정할지는 사용자와 scope 논의에서 결정한다. 빈 System·Workflow Issue를 작성자가 임의로 상세 확정하지 않는다.

## 문서 구성과 소유권

| 문서 | 소유 내용 | 현재 단계 |
| --- | --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 목표 구조·책임·의존 규칙 | 논의용 초안 |
| [IDENTITY.md](IDENTITY.md) | Unit·Issue·Run·Evidence 식별과 관계 | Unit/Issue 분리 확정, 상세 계약 초안 |
| [DEVELOPMENT_FLOW.md](DEVELOPMENT_FLOW.md) | Linear 논의부터 코드 검증·수락까지 | 논의용 초안 |
| [BASELINE.md](BASELINE.md) | 현재 Linear·코드·연결 상태와 충돌 | 관측 기준선 |
| [기존 제품 방향](../../WWW_PRODUCT_DIRECTION.md) | 장기 목적·제품 원칙 | 유지, 범위 혼동 점검 필요 |
| [기존 코드 아키텍처](../../WWW_CODE_ARCHITECTURE.md) | 현재 구현·이관 이력 | 현재 안전장치와 과거 이관안을 구분 |
| [기존 첫 마일스톤](../../WWW_FIRST_PRODUCT_MILESTONE.md) | 첫 로컬 Workbench 목표 | Linear 공개 배포 목표와 대조 필요 |

이 폴더는 이번 논의의 작업 패키지다. 채택 시 목표 아키텍처를 기존 코드 아키텍처 정본에 통합하고 이 파일은 결정 링크로 바꾼다. 같은 목표 트리를 두 문서에서 독립 유지하지 않는다. 변경 이유·채택일·대체되는 규칙은 결정 기록으로 남긴다.

Linear는 작업 요구·우선순위·진행·수락 상태를, Git은 코드·테스트·기술 계약을 소유한다. 연결 원장은 ID·관계·위치만 보존한다. 원격 조회 스냅샷은 조회 시점의 자료이며 현재 상태의 정본이 아니다.

## 논의 순서

Unit/Issue ID 분리는 확정했다. 다음 논의는 Project/Milestone 범위이며, 이후 TUI Parent → Chat/Message → Tracer/Todo/Layout → Monitor/Dashboard/Stats → System Parent → 첫 Workflow 순으로 하나씩 검토한다. 이는 논의 순서 후보이며 개발 의존 순서는 별도로 확인한다. ID 형식·발급·schema 이관 상세도 코드 연결 전에 확정해야 한다.

각 항목은 현재 내용, 발견한 충돌, 수정 초안, 사용자 결정, 반영 후 read-back을 남긴다. 사용자 결정 전에 Linear 쓰기를 수행하지 않는다.
