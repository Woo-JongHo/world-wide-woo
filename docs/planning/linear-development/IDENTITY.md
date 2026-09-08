# ID Unit과 추적 계약 초안

상태: 2026-09-05 사용자 결정으로 Unit ID와 Linear Issue ID의 분리를 확정했다. ID 형식·발급 단위·원장 schema 이관은 아직 논의·구현 전이다. 아래 예시는 실제 ID 발급이 아니다.

2026-09-06 후속: 사용자의 Chat 개발 현황 확인·ID 연결 요청에 따라 기존 v1 schema에서 WOO-679·683·684·686~692의 실제 Linear UUID와 코드·테스트·Evidence 연결을 추가했다. [현재 연결](../../../.www/control-ledger/README.md)과 [확인 근거](../../../.www/evidence/2026-09-06-chat-development/assessment.md)를 따른다. 이는 별도 Unit 발급·DB 도입·schema 이관 결정이 아니며 Unit ID는 계속 미발급이다. 아래의 '실제 Linear 연결 없음'은 2026-09-05 기준선 설명이다.

2026-09-06 추가 설계: [Linear·Code·DB·Obsidian 연결](KNOWLEDGE_BRIDGE_DESIGN.md)에서 Unit·Development Session·Record·Test Run·Document와 코드 snapshot의 식별/관계를 제안했다. 신규 ID 발급·schema migration은 아직 수행하지 않았다. 접두어·세부 entity 목록은 확정된 ID 규격이 아니다.

## 확정한 결정

계속 유지되는 기능의 정체성과 닫을 수 있는 변경 작업의 정체성을 분리한다.

기능에는 고정 Unit ID를, 변경에는 Linear Issue UUID와 표시용 WOO 번호를 둔다. 검토한 대안은 기능 Parent Issue의 Linear UUID를 Unit identity로도 사용하는 방식이다. 별도 ID는 적지만 기능과 release별 작업의 수명이 달라, 사용자는 분리를 선택했다.

## 연결 모델 초안

| 식별 | 의미 | 변경 시 규칙 |
| --- | --- | --- |
| Unit | 지속 관리하는 사용자 기능 또는 독립 책임을 가진 공통 기능 | 경로·이름 변경으로 ID를 바꾸지 않음 |
| Linear Issue | 범위와 수락 조건을 가진 변경 작업 | Linear UUID를 보존하고 WOO 번호·URL로 사람이 탐색 |
| Code location | 특정 revision의 파일·공개 symbol | 이동하면 위치와 revision 갱신 |
| Test reference | 요구를 검증하는 테스트 위치 | 존재와 성공을 구분 |
| Run | 한 번의 실행 | provider thread/turn과 별도 참조 |
| Evidence | 특정 주장·대상 revision을 검증한 근거 | 수정된 결과는 새 revision/근거로 기록 |

Unit은 파일·클래스·폴더마다 발급하지 않는다. Message처럼 유지·수락 범위를 설명할 수 있는 기능이 후보다. 상위 TUI/System/Workflows 분류는 Unit ID에 경로처럼 박아 넣지 않아도 된다.

관계는 다대다다: Unit↔Issue, Unit↔Code, Issue↔변경 revision, Test/Evidence↔검증 대상. 부모 Issue 하나가 모듈 하나를 배타적으로 소유한다고 가정하지 않는다.

## 실제 Message로 보는 연결 후보

- 기능 후보: Message (Unit ID 미발급)
- 현재 기능 Parent: WOO-683 / UUID ea233806-8926-4e7f-90b1-8328f3f874d4
- 실행 작업 후보: WOO-686~WOO-690, 예외·테스트 항목 WOO-691/WOO-692는 범위 논의 필요
- 현재 구현 후보: src/adapters/inbound/tui/workbench-views.ts
- 관련 테스트 후보: test/workbench-views.test.ts, test/transcript-markdown.test.ts
- 목표 모듈 후보: src/tui/chat/message/

위는 탐색 연결이다. 각 Issue의 수락 조건 전체를 기존 코드가 충족한다는 증거가 아니다. 이동 전후 경로가 달라도 Unit과 Issue의 연결은 유지한다.

## 기존 코드의 활용과 차이

src/core/domain/work/traceability.ts는 Linear UUID·URL, EP/ST, 코드·테스트·Evidence 참조와 implements/verifies/tracks 등의 관계를 이미 검증한다. traceability-validator.ts는 로컬 경로 존재 여부를 검사한다.

현재 schemaVersion 1은 code/test/evidence의 ID로 경로를 사용한다. Unit과 Run은 별도 reference kind가 없고, 원장에는 실제 Linear reference가 아직 없다. 확정한 ID 분리를 구현하려면 schema 확장·version migration·이전 경로 추적의 상세 계약부터 정해야 한다. 문서 예시를 현재 원장에 그대로 넣지 않는다.

기존 EP/ST는 이력으로 보존하고 실제 Linear 작업과 관계를 확인한 뒤 연결한다. 동일 이름이라는 이유로 자동 동치 처리하지 않는다. 새 작업을 EP/ST와 Linear에 이중 발급할지 여부는 이전 planning 계약과 함께 개정한다.

## 정본과 검증

Linear 본문·진행 상태를 원장에 복제하지 않는다. 원장은 ID·관계·참조 위치와 검증 정보를 소유한다. 오프라인 경로 검증과 온라인 Linear 존재·권한·관계 read-back을 구분한다. 오프라인 성공은 원격 연결 검증 성공이 아니다.

코드 이관 시 dangling link·중복 ID·취소 작업의 잘못된 활성 연결을 확인한다. Evidence에는 확인한 코드 revision 또는 dirty worktree 식별 근거를 남긴다. 과거 통과를 현재 변경의 수락으로 재사용하지 않는다.
