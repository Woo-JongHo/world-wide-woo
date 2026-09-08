# Test1 승인 대기 입력 잠김 — Linear intake

- 관측: Test1은 `working · Permission manual · 대기 2` 상태에서 Tool RUNNING과 `결과를 기다리는 중`을 표시하지만 승인 overlay나 다음 조작이 보이지 않는다.
- 사용자 영향: 입력 두 건이 대기열에 쌓이고 사용자는 승인·거절·중단 중 무엇을 해야 하는지 알 수 없어 진행할 수 없다.
- 중복 판정: WOO-710이 승인 대기→결정, 실패→근거, 재시도를 같은 실행에 연결하는 책임을 이미 소유한다. 새 이슈를 만들지 않고 기존 이슈를 보완한다.
- 위치: World Wide Woo → TUI → Monitor WOO-675 → WOO-710.
- 관련 책임: 입력·승인 조작은 WOO-694, 실행 identity는 WOO-705를 재사용한다.
- 메타데이터 변경: Bug 라벨 추가, 상태 In Progress. parent·milestone·기존 라벨은 유지한다.
