# Chat 렌더 중복 계산 수정

날짜: 2026-09-29 · 기존 이슈 WOO-915 (In Progress, parent WOO-679)

## 변경

- 정확한 행 수 계산에서 렌더한 행을 기존 8MiB 제한 LRU에 보관한다. 같은 폭의 viewport 재료화는 이 결과를 재사용한다.
- durable generation 교체 시 동일한 불변 블록의 캐시 행을 새 generation으로 이동한다. 변경·삭제된 블록은 버리고 logicalBytes에서 뺀다. 행 배열 복사나 캐시 예산 증가는 없다.
- draft 블록은 text·request label·response number가 동일하면 재사용한다. 내용이 달라지면 새 블록을 만든다.
- Native 활동 사이에 놓인 draft anchor 순서와 정확한 scroll height 계약은 유지한다. 아직 전체 durable graph/count index 순회는 남아 있다.

## 같은 환경의 비교

80×24, 약 37KB 초안, 각 20회. 수정 전 소스는 이번 변경만 역변환한 scratchpad 사본을 Bun onLoad로 공급했다. 제품 소스를 잠시 되돌리거나 다른 worktree를 변경하지 않았다. 동일 fixture·스크립트·Bun 1.4.0을 사용했지만 두 실행은 순차였고 호스트 부하를 완전히 고정하지 못했다.

| 이력 수 | 수정 전 초안 p95 | 수정 후 초안 p95 | 수정 전 cold | 수정 후 cold |
|---|---:|---:|---:|---:|
| 1 | 16.18ms | 8.46ms | 26.32ms | 17.31ms |
| 1000 | 18.85ms | 9.97ms | 100.78ms | 107.01ms |

양쪽 모두 현재 환경에서 GREEN이며 변경 후 longDraft p95는 기존 32ms 기준 이하다. 9월 28일 진단의 57.47/74.95ms와 직접 감소율을 계산하지 않는다. 과거와 호스트 부하가 다르다. 이력 1,000개의 정확한 첫 행 수 계산은 여전히 약 100ms다. cold 비용은 이번 수정으로 줄지 않았다.

## 검증 범위와 한계

- TypeScript check, import 정규화, 두 파일 표 정렬, git diff --check 통과. 변경 파일에서 TODO/test.skip/test.only 없음.
- 기존 production shell 메모리 터미널 벤치마크 GREEN. 실제 PTY 픽셀 지연·Codex 동일 입력 비교는 미실측이다. 별도 테스트 스위트는 실행하지 않았다.
- 1,000 이력 cold 행 캐시가 약 1.68MB로 증가했다. 기존 8MiB 상한은 유지한다. 큰 행 집합의 퇴출은 기존 LRU에 따른다.
- 실행 중인 cmux surface:2의 WWW는 화면 조회만 했다. 재시작하거나 새 코드가 로드됐다고 주장하지 않는다.
- Claude Sonnet 5 읽기 전용 리뷰를 시도했으나 CLI가 Not logged in / api_error로 종료했다. 독립 리뷰는 미실행이다. 같은 인증 경계의 Opus 최종 감사도 미실행 blocker이며 낮은 모델로 대체하지 않았다.
- WOO-915의 실제 CMux 입력·스크롤 수락과 독립 검토가 남아 있으므로 전체 이슈 완료를 주장하지 않는다.

## 근거

- `.www/evidence/2026-09-29-chat-render-repair/benchmark-before.json`
- `.www/evidence/2026-09-29-chat-render-repair/benchmark-final.json`
- `.www/evidence/2026-09-29-chat-render-repair/sonnet-review.json`
- `.www/evidence/2026-09-29-chat-render-repair/review-input.md`
