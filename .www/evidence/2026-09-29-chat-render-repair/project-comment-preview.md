## 변경

- 정확한 행 수 계산의 렌더 결과를 기존 8MiB LRU에서 viewport와 재사용한다. generation 변경 시 불변 블록의 행 캐시를 이동하고 변경·삭제된 블록만 제거한다.
- 같은 draft text와 응답 label의 블록을 재사용한다. Native draft anchor 순서와 exact height를 유지한다.

## 영향

- 37KB 초안 p95: 이력 1개 16.18→8.46ms, 이력 1,000개 18.85→9.97ms (같은 현재 환경 각 20회). 9월 28일 수치와 직접 감소율을 비교하지 않는다.
- 1,000개 이력의 cold 약 100ms와 전체 graph/index 순회는 남아 있다. Codex 동등 성능이나 실행 중 WWW에 적용됐음을 주장하지 않는다.

## 분류

Fix · Improvement · Validation

## 검증

- TypeScript, import 정규화, 표 정렬, diff 검사 통과. production shell 메모리 터미널 벤치마크 GREEN. 테스트 스위트 별도 실행 없음.
- Claude Sonnet 5 읽기 전용 리뷰 시도는 Not logged in/api_error로 종료. Sonnet 독립 리뷰와 Opus 최종 감사는 미실행 blocker이며 모델 대체 없음.
- 실제 CMux 입력·스크롤 수락과 PTY 픽셀·Codex 직접 비교는 미실측. 기존 실행 세션은 화면 조회만 수행.

## 연결

- Linear: WOO-915 (live: In Progress, parent WOO-679, World Wide Woo)
- Audit: docs/audit/2026-09-29-chat-render-repair.md
- Evidence: .www/evidence/2026-09-29-chat-render-repair
