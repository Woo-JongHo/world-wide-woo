# WORKING 갱신 지연 검증

## 요구와 재현

WORKING 표시가 느리다는 사용자 관측을 production Shell의 타이머 갱신 경로에서 재현했다. 기존 WOO-679의 Chat 관측 흐름과 WOO-915의 렌더 성능 범위다. 제품 snapshot에 작은 working fixture를 넣고 실제 setInterval 및 memory Terminal의 write 시각을 측정했다. 사용자 Native 세션이나 실제 화면 pixel 지연은 측정하지 않았다.

## 원인과 수정

120ms 주기의 타이머가 다음 시각을 정한 뒤, 모든 프레임 완료가 그 시각을 다시 완료 시각+120ms 이후로 밀었다. 경량 프레임도 다음 tick을 놓쳐 실제 갱신은 약240ms가 됐다. 첫 수정에서 렌더 소요시간만 빼도 타이머→비동기 render queue 지연이 남아 실패했다.

최종 수정은 렌더 소요시간과 그 두 배의 휴식이120ms 안에 들어가는 경량 프레임에서 타이머 deadline을 유지한다. 그보다 무거운 프레임은 기존 완료 이후 backoff를 유지한다. Native 이벤트·입력의 직접 렌더 경로는 수정하지 않았다. 이는 기존120ms 갱신 의도를 복구한 구현 수정으로, 사용자 동작·WHY·외부 계약 변경이나 신규 capability는 없다. Obsidian 새 개정 대상은 아니며 이전 작업의 정본 identity blocker는 별개로 남는다.

## 검증과 한계

- 재현 검사: 5ms 프레임과3ms 비동기 대기를 포함해 연속120ms tick의 요청을 검사한다. 원본 코드와 첫 수정은 실패했고 최종 수정은 통과했다.
- 관련4개 파일: 68 pass,0 fail. 기존300ms 프레임 뒤599ms 억제·600ms 허용도 유지된다.
- 실제 타이머: 수정 전239.6~243.4ms. 첫 수정 중앙값240.93ms. 최종3~7.8초 구간38간격 중앙값120.97ms, 최소118.99ms, 최대226.06ms. 짧은 fixture 측정이며 무지터 보장이 아니다.
- NO_COLOR와 WWW_REDUCED_MOTION을 해제한 motion 활성 조건이다. 기본 실행 도구 환경의 NO_COLOR에서는1000ms fallback이므로 사용자 세션의 설정과 동일하다고 주장하지 않는다.
- TypeScript 검사 exit0. 변경2개 파일 import 및 표 정렬 직접 검사 통과. public xxx wrapper는 npm xxx@0.2.0 ETARGET으로 실행 불가하며 호스트 게이트 PASS로 기록하지 않는다.
- 사용자 실행 프로세스 재시작과 hot reload는 수행하지 않았다. 실제 사용자 화면 수락은 남아 있다.

## 증거

[재현·측정·테스트 원문](../../.www/evidence/2026-10-07-working-latency/)

Sonnet 5 읽기 전용 검토는 실제 호출했으나 세션 한도 응답으로 exit1, 미실행이다. 한도 재설정 안내는 Asia/Seoul 00:30이다. Opus 최종 감사(actual model claude-opus-5-5)는 PASS, P1 없음이다. P2 관찰 두 건: 지연된 타이머 다음 tick 누락 가능성과40~60ms 프레임의 기존 backoff 양자화. 무지터 또는 모든 부하에서120ms 보장은 하지 않는다. 읽기 전용 리뷰이며 독립 테스트 재실행은 아니다. 코드·자동 검증 결과와 독립 감사 수락을 구분한다.
