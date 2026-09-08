# RPA Skills 구현 계획

## 목표

RPA Agent가 자유 형식 요청을 일관된 7개 Skill로 라우팅하고, 각 단계가 revision과 안정 RPA ID를 가진 Receipt를 다음 단계에 전달하게 한다. Monitor는 v0.1.0 제품 기능으로 분리한다.

## 확정 구조

| 번호 | Skill | 소유 결과 | 기존 자산 |
| --- | --- | --- | --- |
| 01 | Intake | 민감정보를 제외한 revision 고정 사실 묶음 | `rpa-intake` |
| 02 | Design | Process·Task·Unit 및 질문·결정 계약 | `rpa-map` |
| 03 | Build | 승인된 Unit 단위 코드·설정·테스트 변경 | 신규 `rpa-build` |
| 04 | Test | 예외·로그·재실행·메일 안전 Receipt | `rpa-safety` |
| 05 | Maintenance | 고객 요청·버그의 재현·최소 수정·회귀 Receipt | 신규 `rpa-maintenance` |
| 06 | Publish | Linear 작업과 필요한 Obsidian 정본의 검증된 게시 | `rpa-publish` |
| 07 | Reconcile | Code·rpa-map·Linear·Obsidian drift 판정 | 신규 `rpa-reconcile` |

## 공통 Handoff

모든 Skill은 `skill_id`, `source_revision`, `rpa_ids`, `status`, `facts`, `decisions`, `artifacts`, `verification`, `blocked`, `next_skill`을 가진 Receipt를 반환한다. `status`는 `PASS`, `PARTIAL`, `BLOCKED`만 허용하며 관측하지 않은 결과를 `PASS`로 바꾸지 않는다.

## 실행 분기

- 신규 개발: 01 → 02 → 03 → 04 → 06 → 07
- 신규 개발 테스트: 01 또는 기존 revision 확인 → 04 → 06 → 07
- 고객 요청·버그: 01 → 05 → 04 → 06 → 07
- 문서 정합: 07에서 시작하고 drift 소유 Skill로 복귀한 뒤 07을 다시 실행한다.
- Monitor: 실행 시스템의 sanitized event를 소비하며 7개 Skill에 포함하지 않는다.

## 구현 단계

1. 세 신규 Skill과 공유 Receipt 계약을 만든다.
2. 기존 네 Skill을 번호 체계와 공통 Handoff에 맞춘다.
3. RPA Agent의 Intent router와 질문 Gate를 7개 Skill에 연결한다.
4. Linear WOO-888 아래 01~07을 정확히 한 개씩 배치한다.
5. 각 Linear Skill에 대응하는 Obsidian schema v2 정본을 연결한다.
6. Skill validator, Linear hierarchy gate, Obsidian contract와 미완성 표식을 검사한다.

## 완료 조건

- `.agents/skills/rpa-*`에 7개 실행 Skill이 있고 역할이 겹치지 않는다.
- WOO-888 직계 하위가 01~07을 정확히 한 번씩 가진다.
- WOO-883은 WOO-675 및 v0.1.0에 남는다.
- 모든 Skill의 Linear ID와 Obsidian 문서가 1:1이며 read-back 검사를 통과한다.
