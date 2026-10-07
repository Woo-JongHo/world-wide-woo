# 외부 작업 관리 구조 제거 결과

## 결정과 설계

2026-10-07 사용자 지시에 따라 Linear·WES·Obsidian의 로컬 작업 관리 연결과 강제 기록 절차를 제거했다. 설계: [제거 설계](../planning/REMOVE_EXTERNAL_WORK_MANAGEMENT_2026-10-07.md).

## 제거 내용

- WES collector·WooEntry·상태 refresh·Chat context 주입.
- Linear dashboard·설정·MCP 자동조회·UI·publication adapter.
- Obsidian publication·Vault 승격·개발 SQLite/원장·planning 서비스·관리 CLI·traceability 검사.
- `.codex/hooks.json`의 기록강제 등록 및 handler/gate.
- `/map`, `/work`, `/woo-entry`, `/promote`, legacy 관리계획 명령 및 관리Map feature.
- 관리 전용 스킬16개는 발견되는 실행 경로에서 제거했다. 원장·planning·로컬Vault·전용계약·스킬 전문은 docs/archive/retired-work-management에 역사로 보존했다.
- GitHub PR은 로컬 Receipt만 필수 연결로 사용하며 폐기된 Linear/Obsidian/Code-ID 연결을 거부한다. runtime config도 폐기 publication/키를 거부한다.

## 보존과 로컬 정본

Native PLAN·PROGRESS·TEST·WORKING, Git Bash AI 해석, Native/session journal, Todo·Note·재개, 모델/승인 설정, GitHub 승인제어를 보존했다. 앞선 WORKING cadence 및 toolActions 캐시 변경을 덮어쓰지 않았다. 순수 로컬 skill-run은 코드/manifest와 저장된 근거를 확인하며 원격 정합을 의무화하지 않는다.

설계·결정은 docs, 구현은 Git, 검증은 로컬 Evidence가 소유한다. Project Comment 게시 의무는 이번 결정으로 종료됐다. 외부 Linear 이슈/Vault와 전역 공유 MCP/WES 설정에는 쓰지 않았다. src의 과거 @linear 주석 및 옛 Receipt 표시 파서는 역사 읽기 호환이며 실행 연결이 아니다.

## 독립 검토와 보완

Codex 별도 읽기전용 패스에서 신규 workspace manifest UUID 누락(P1), 활성 기능계약의 Obsidian 지시(P2), workspace/commit UUID validation 불일치(P2)를 발견했다. 모두 보완하고 재검토해 미해결 P1/P2 없음 확인.

로컬 commit identity는 폐기 ledger 밖의 .www/project.json.id로 옮기고 기존ID를 보존했다. 새manifest 생성, legacy id없는 manifest의 atomic migration, 기존ID bytes 보존, 잘못된UUID 거절과 원문무변경을 검증했다.

Claude Sonnet/Opus는 이전 실제 호출의 session limit으로 이번 감사 미실행이다. Codex 검토를 교차 provider 최종 감사로 대신 통과 처리하지 않았다. public xxx runner도 기존 npm ETARGET으로 미실행이며 직접00/06 검사와 구별한다.

## 검증

| 검증 | 결과 |
|---|---|
| 타입 tsc | exit0 |
| CLI bundle build | exit0 |
| feature-map 생성·diff | 통과 |
| 직접 import/표정렬 | 변경파일 00 changed=0, 06 misaligned=0 |
| 전체 기준선 | 1769개:1682pass/87fail/2errors |
| 최종 전체 | 1589개:1506pass/83fail/2errors |
| 실패이름 기준선 대조 | 신규0 |
| Codex 독립 집중검증 | 최초65pass, 후속44pass 및 UUID11pass |

폐기 기능의 테스트는 구현과 함께 제거했다. 전체 테스트 수 감소를 기능 개선으로 계산하지 않는다. Playwright discovery 오류2건은 기준선의 같은 apps/project-view 테스트이며 미해결이다. 전체 green 판정은 하지 않는다.

초기 통합에서 폐기 docs와 외부destination/원격안내를 요구하던 assertion을 발견해 새 계약으로 수정했다. coalesced Native frame의 타이밍 실패는 CPU경합 상태에서 한 번 발생했고 집중 replay 및 마지막 전체에서 통과했다. 마지막 전체 뒤 변경은 local workflow 테스트 evidence의 타입 안전 narrowing만이며 해당9개와 전체tsc를 재확인했다.

## 남은 경계

현재 대화를 호스팅하는 WWW 프로세스는 재시작하지 않았다. 새 소스의 실제 사용자 화면/pixel 수락과 등록hook 제거의 호스트 reload 확인은 남는다. 종료 후 www --resume으로 대화를 재개하면 새 모듈을 읽는다. commit/push/외부 기록 삭제 없음.

증거: .www/evidence/2026-10-07-remove-management/ (source manifest, 전체log/실패대조, 각 worker 및 독립검토 전문, recording-assessment).
