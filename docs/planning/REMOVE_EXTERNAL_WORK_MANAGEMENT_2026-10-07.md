# 외부 작업 관리 구조 제거 설계

## 결정과 목적

사용자2026-10-07 지시: Linear·WES·Obsidian과 같은 작업 관리 구조를 제거하고 사용하지 않는다. 이 결정이 이전 Project Comment 강제 게시 및 Obsidian 정본 지시를 대체한다. 설계·변경 설명은 저장소 docs, 구현은 Git, 실행 검증은 로컬 증거로 남긴다.

## 범위

로컬 연결·자동 주입·작업 관리 UI·CLI·게시 adapter·강제 기록 훅·추적성 원장 강제 검사·전용 스킬을 제거한다. 기존 외부 Linear 프로젝트/이슈와 Obsidian Vault는 별도 삭제 선택이 없으면 보존한다. 공유 머신 설정과 다른 저장소의 시스템도 이번 제품 제거에 포함하지 않는다.

대화의 PLAN·PROGRESS·TEST·WORKING, Native 실행, Git Bash AI 해석, 모델 설정, 대화 재개, 로컬 event journal을 유지한다. 제품 실행 사건의 관측 기록과 외부 업무 원장의 의무 게시를 구분한다.

## 현재 배선

- WES: WesEntryCollector→WooEntry→Chat 추가 context. 머신 woo.yaml/system.yaml/외부 Python runner 의존.
- Linear: WorkbenchConfig→MCP dashboard→Context/Trace 표시, runtime publication capability.
- Obsidian: DevelopmentService/Store→Vault checkpoint, runtime publication adapter, contract/traceability CLI.
- 절차: AGENTS/woo-entry/전용 스킬 및 .codex Stop hook이 외부 조회·Comment 게시를 필수로 요구.

## 실행 순서

1. 현 dirty tree와 전체 테스트 실패 기준선을 보존한다.
2. 로컬 규칙·등록 훅을 제거하고 entry를 위치/브랜치 확인으로 단순화한다.
3. production 조립과 domain/application의 WES·Linear·개발 원장 연결을 제거한다.
4. TUI 작업 관리 메뉴/조회/명령과 CLI 진입점을 제거한다.
5. 전용 adapter·CLI·스킬·설정·schema 및 폐기 기능 테스트를 제거하거나 남은 GitHub/Native 책임으로 축소한다.
6. 타입·아키텍처·모듈 import·동작 회귀·전체 실패 기준선을 대조한다.

## 불변식과 완료 조건

- 새 Chat turn이 WES runner를 실행하거나 woo_entry context를 주입하지 않는다.
- 앱 시작에 Linear MCP 조회나 Obsidian/관리 SQLite 생성·Vault 쓰기가 없다.
- 작업 종료에 외부 기록을 요구하는 등록 훅이 없다.
- runtime config가 폐기된 외부 publication을 허용하지 않는다.
- GitHub 작업의 검증에 Linear/Obsidian 링크가 필수가 아니다.
- PLAN·PROGRESS·TEST·WORKING·Git Bash 해석과 재개가 기존 경로로 동작한다.
- 삭제된 module import 없음, 타입·아키텍처 통과, 전체 테스트에 새 실패 없음.

## 데이터와 복구

외부 기록 삭제는 아직 확인 중이며 로컬 구조 제거와 독립이다. 기존 대화 journal, 실행 설정, 사용자 미커밋 변경을 삭제하지 않는다. 이번 diff는 작업 시작 사본과 대조하며 복구할 때 이번 변경만 되돌린다. 과거 evidence/audit는 당시 사실로 보존하고 운영 지시에서 분리한다.

## 검토 경계

Codex가 설계와 구현을 소유하며 별도 읽기 전용 패스로 결과를 검토한다. Claude 교차 provider 검토/Opus 최종 감사는 이전 실제 호출의 session limit을 알고 있으므로 미실행이면 이를 명시한다. 단순 코드 검사로 이를 대신 통과 처리하지 않는다.
