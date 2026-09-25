## 변경

- CMux의 www 프로세스와 자식 검사 작업을 확인하고 채팅 이벤트→snapshot→렌더→터미널 흐름을 진단 문서로 정리했다. 제품 코드는 변경하지 않았다.
- 8코어 머신의 load average 111과 www 자식 작업의 8병렬 TypeScript 검사를 관측했다. 사용자 증상과의 인과 및 기여율은 미확인이다.
- 기존 벤치 fixture의 불변성 조건 차이를 확인했다. 같은 1,000개 메시지 대조에서 깊은 불변 fixture는 draft 갱신 시 과거 block 재계산 계수가 증가하지 않았다.

## 영향

- 시스템 부하·긴 본문 계산·벤치 조건을 구분해 부분 최적화 결과를 전체 앱 성능 수락으로 오인하지 않게 한다.
- 긴 본문 불변 fixture에서 frame 160~211ms를 재현했지만 공유 머신 부하를 통제하지 않았으며 실제 CMux 입력·스크롤 지연 해결을 주장하지 않는다.

## 분류

Validation · Operation

## 검증

- ASTRA_BENCH_REPS=5 ASTRA_BENCH_COUNTS=1000 bun scripts/astra-render-benchmark.ts: exit 1 / RED. 가변 fixture 결과를 실사용 streaming 회귀로 직접 귀속하지 않는다.
- minimal.ts의 가변/불변 1,000개 fixture 및 불변 긴 본문 대조: 과거 block 계수와 count-build/materialization 시간을 분리 기록했다.
- CMux 화면 조회는 접근 정책으로 거절됐다. 실행 중 revision과 최근 변경 전후 인과는 미확인이다. Opus 문서 감사 REVISE 지적을 반영했으며 수정본 독립 PASS는 미수행이다.

## 연결

- Linear: https://linear.app/woo-world/issue/WOO-689
- Audit: docs/audit/2026-09-24-chat-render-system-diagnosis.md
- Evidence: .www/evidence/2026-09-24-chat-render-system-diagnosis
- Related prior Project Comment: 30f00db1-c05a-4d67-a730-a03f589c46e9 (앞선 dense-layout 수정 기록; 이번 작업은 별도 후속 진단)
