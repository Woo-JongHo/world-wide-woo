# WWW Epics

## 지속 규칙

- Epic은 프로젝트 수명 동안 누적하며 새 Epic은 파일 끝에 추가한다.
- 기존 Epic을 새 작업으로 덮어쓰거나 번호를 재사용하지 않는다.
- 완료된 Epic도 삭제하지 않고 상태와 연결된 Story 이력을 보존한다.
- Epic 상태 변경은 허용하지만 제목·목표의 역사적 의미를 바꾸지 않는다.
- 세부 실행 단위와 완료 이력은 [`Stories.md`](./Stories.md)에 기록한다.

## EP-001 — 제품 Shell

- 상태: 완료
- 목표: 하나의 외곽 프레임에서 대화, Router, 프로젝트 작업 상태를 안전하게 운용한다.
- Stories: [`ST-001-*`](./Stories.md#ep-001--제품-shell)

## EP-002 — 출력 계약

- 상태: 진행 중
- 목표: 모델·Tool·Bash·Diff 출력을 원문 보존과 terminal 폭 안전성을 지키며 표현한다.
- Stories: [`ST-002-*`](./Stories.md#ep-002--출력-계약)

## EP-003 — Agent Runtime

- 상태: 진행 중
- 목표: 모델 요청부터 Tool 실행, 증거, 취소, 완료까지 진실한 Agent lifecycle을 제공한다.
- Stories: [`ST-003-*`](./Stories.md#ep-003--agent-runtime)

## EP-004 — WES Context

- 상태: 진행 중
- 목표: 저장 원문과 화면·모델 Context projection을 분리하고 provenance를 보존한다.
- Stories: [`ST-004-*`](./Stories.md#ep-004--wes-context)

## EP-005 — 제품 품질

- 상태: 진행 중
- 목표: terminal 크기, 색상, 운영체제, 인증 경합, 장기 session 안정성을 검증한다.
- Stories: [`ST-005-*`](./Stories.md#ep-005--제품-품질)

## EP-006 — 배포

- 상태: 예정
- 목표: 검증된 실행 파일과 설치·업데이트·복구 계약을 제공한다.
- Stories: [`ST-006-*`](./Stories.md#ep-006--배포)

## EP-007 — Monitoring Dashboard

- 상태: 완료
- 목표: session·turn·tool·Todo 상태를 하나의 read-only 관측 projection으로 제공한다.
- Stories: [`ST-007-*`](./Stories.md#ep-007--monitoring-dashboard)

## EP-008 — Work Narration UX

- 상태: 완료
- 목표: 숨겨진 추론을 노출하지 않으면서 WWW가 실제로 무엇을 수행하는지 지속적으로 설명한다.
- Stories: [`ST-008-*`](./Stories.md#ep-008--work-narration-ux)

## EP-009 — 01_www Adapt-In

- 상태: 진행 중
- 목표: 01_www의 검증된 경계·역할·Planning·Work Ledger 재료를 WWW 제품에 작은 목표 단위로 흡수한다.
- Source: `woo-world/www`의 `01_www`, reviewed baseline `490bc36e94c89180edd81df4bc374ad7870cad79`
- 규칙: 파일을 통째로 복제하지 않고 acceptance와 evidence가 있는 capability만 Story 단위로 Adapt-In한다.
- Stories: [`ST-009-*`](./Stories.md#ep-009--01_www-adapt-in)
<!-- www-planning-v1:start -->
- EP-010 | Project-local Planning Package v1 | Why·How·Outcome·Work·Runtime 경계를 stable ID와 append-only 이력으로 관리하고 명시적인 Epic·Story 저장 surface를 제공한다.
- EP-011 | v0.1.0 Native Project Workbench | Codex native execution을 보존하면서 Chat·T-notes·project Todo를 세 패널로 연결하고, 승인된 Markdown을 Git/GitHub/Obsidian same-file 정본으로 관리하며 Claude Opus·Gemini 읽기 전용 검토와 macOS·Windows release gate를 제공한다.
- EP-012 | 세션 오케스트레이션 상태를 읽을 수 있게 만든다 | 사용자가 /stats에서 한 세션의 목적·행동·결과와 실행 효율·자원 사용·병목을 한 페이지로 확인하되, hidden reasoning이나 별도 Truth를 만들지 않는다.
<!-- www-planning-v1:end -->
