# WORKING 반복 끊김 재현과 수정

## 문제와 원인

실제 120ms 주기 타이머가 한 번 20ms 늦어졌을 때, callback에서 설정하는 추가 deadline이 다음 정상 tick을 차단했다. 작은 대화와 1,000개 기록 모두 약222ms terminal write 공백으로 확대됐다. 중앙값 약121ms만 보면 놓치는 문제다.

현재 사용자 PID81812는 19:31:34에 시작한 일반 Bun 실행이며 hot reload가 없다. 이전 수정 뒤 재시작하지 않아 화면에는 이전 코드가 계속 적용되고 있었다.

## 수정

workbench-shell의 정상 callback deadline 재설정을 제거했다. 고정 주기 interval이 정상 cadence를 관리하며, 비용 큰 frame에만 기존 cooldown을 적용한다. Native 이벤트와 입력의 직접 render 경로는 유지한다. 기존 경량 회귀를 0/20ms 타이머 지터 두 조건으로 확장했다.

## 테스트와 실측

- Shell 통합 회귀: 20ms 지터 조건을 추가하자 수정 전 실패, 수정 후 통과. 실제 shell의 requestRender 호출 누락을 확인한다.
- 관련 회귀 4개 파일: 69 pass / 0 fail. 무거운 frame backoff와 render scheduler도 포함한다.
- 성능 probe: 매번 새 프로세스의 실제 production Shell, 실제 timer, frozen synthetic fixture, memory Terminal. 조건별6.5초, 통계1.8~6.2초. 작은 대화/1,000개 기록 × 평시/20ms event-loop block. terminal pixel 및 provider 지연 측정은 아니다.

| 조건 | 이전 최대 ms | 수정 최대 ms | 수정 중앙값 ms |
|---|---:|---:|---:|
| small / real | 125.41 | 126.45 | 121.01 |
| small / jitter | 222.49 | 159.87 | 121.16 |
| long / real | 219.44 | 122.67 | 121.16 |
| long / jitter | 221.85 | 141.63 | 121.16 |

주입한20ms와 OS scheduling 지연은 사라지지 않는다. 다음 정상 tick을 누락해 지연을 확대하던 제품 결함을 제거했다. cold 시작 구간은 별도이며 위 통계에 포함하지 않았다.

## 검증 경계와 실행 반영

TypeScript 검사 exit0, 변경2파일 import changed=0/errors=0, 표 정렬 misaligned=0/compressed=0, git diff --check 통과. 제품의 TODO 문자열은 기존 패널 제목이다. test.skip/test.only 자리표시 없음.

독립 Codex probe는 별도 패스로 실행했다. Claude Sonnet/Opus는 앞선 실제 호출이 session limit을 반환했으며 이번 diff의 교차 provider 검토·최종 감사는 미실행이다. 낮은 모델로 대체하지 않았다. xxx 공개 runner도 이전 npm ETARGET으로 실행되지 않아 직접00/06 검사와 구분한다.

현재 대화를 호스팅하는 사용자 실행 프로세스는 중단하지 않았다. 최종 응답 뒤 WWW를 종료하고 `www --resume`에서 현재 대화를 선택하면 수정 소스를 새로 읽는다. 사용자 실행 화면의 재시작 후 수락은 남아 있다. 전체 제품 정상 완료로 판정하지 않는다.

## 기록 판정

WOO-679와 WOO-915 기존 범위이며 새 이슈 필요 없음. 기존120ms cadence의 구현 결함 복구로 WHY·공개 계약 변경 없음, 새 Obsidian Candidate는 불필요하다. Project Comment는 상시 승인으로 검증·게시·read-back한다.

증거: `.www/evidence/2026-10-07-working-jitter/`. 독립 전문: `.www/scratchpad/2026-10-07-working-jitter/probe/report.md`.
