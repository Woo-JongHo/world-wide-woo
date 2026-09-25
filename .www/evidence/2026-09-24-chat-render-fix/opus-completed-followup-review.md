## 판정: 제한된 진단 주장으로 수용 가능, 전체는 계속 미결

**수용되는 부분**

경계 고정이 이제 검증 가능하다. 실제 완료 영수증 5,683에서 자르고 다음 `turn/started` 5,688을 제외한 선택은 근거가 명시적이며, pre(5,674)/post(5,683) digest 두 개를 남긴 점도 적절하다. 앞선 지적 세 가지가 실제로 반영되었다.

- 완료 전환이 별도 harness로 분리되었고, durable 784 blocks 재사용·신규 1개 count로 "전체 history 재렌더 없음"이라는 좁은 결론만 냈다.
- 키 입력이 삼켜지는 통과가 막혔다. scrollTop 감소/증가, Home 0, End follow를 각각 단언했고 raw 기록도 방향이 단조롭다. no-write는 timeout으로 실패한다.
- cold 535.24ms를 acceptance에서 분리했고, renderer 3.93ms를 shell 24.16ms와 동일시하지 않는다는 판단도 옳다. cadence·write가 포함된 경로를 renderer 기준으로 채점하지 않은 것은 타당하다.
- 인과를 INDETERMINATE로 내리고 공유 부하 일반화를 철회한 것이 이번 수정의 핵심 가치다.

**남는 공백**

1. 두 harness의 corpus digest가 대조 불가하다. transition은 trailing newline을 붙여 `d24e21…`, shell은 붙이지 않아 `62eb32…`를 냈다. 같은 5,683 prefix라는 주장이 digest로 교차 확인되지 않는다. 원본 6,236 digest 부재와 별개의 공백이다.
2. 완료 전환은 최종 280자 body를 draft로 대입한 합성이다. 실제 streaming draft·provider event 간격이 빠져 있으므로 18.92ms는 하한 성격이며 사용자 체감 전환 비용이 아니다.
3. 표본이 작다. 전환 5개는 min/median/max뿐이고, Home/End 10회 p95는 최댓값과 동일하다. loadavg 4.3/6.9/8.8의 비통제 부하도 남아 있어 어느 수치도 상·하한이 고정되지 않는다.
4. MemoryTerminal write는 `\x1b[?2026l` 기준이라 emulator·PTY·pixel이 여전히 제외된다.
5. PageUp은 3,865→3,265 구간만 이동해 상단 경계와 최초 표시 경로는 미검증이다.

**결론**

기술적 관측으로만 읽으면 과대주장은 제거되었다. 다만 GREEN도, 원인 귀속도, 사용자 증상 해소도 인증되지 않는다. WOO915는 In Progress 유지가 맞고, PID 86770의 진행 중 작업과 대기 요청이 끝날 때까지 재시작하지 않는 현재 처리가 승인 범위에 부합한다.