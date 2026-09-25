## 판정 요약

**정확성 blocker: 없음.** 이번 delta에서 반례를 만들어 내지 못했다. **증거: 조건부 수락**(아래 E1 하나만 확인 필요). **적용 가부: 예** — 실행 중인 작업이 안전하게 멈출 수 있게 되면 이 구현은 적용해도 된다. 다만 이것은 WOO-915 완료가 아니다.

## 1. 코드 정확성

**A1 transactional memo — 건전함.** `validated`는 성공 반환 경로에서만 채워지고, WeakSet 반영은 graph 전체가 통과한 뒤 `trustedImmutable`에서 한 번에 일어난다. 실패 시 `validated`는 그대로 폐기되므로 부분 신뢰가 남지 않는다. cycle back-edge(`visiting.has → true`)도 자기 frame이 끝날 때만 `validated`에 들어가고, 조상이 나중에 실패하면 transaction 전체가 버려진다. self-cycle + frozen `Date` 실패 회귀가 바로 이 경로를 고정한다. 반례 없음.

**캐시 key 충분성.** `executionActivitySummary`가 읽는 snapshot 입력은 `activities`, `threadId`, `activeTurnId` 셋뿐이고 캐시 key가 정확히 그 셋이다. 누락된 의존 입력을 찾지 못했다.

**prototype/descriptor 게이트.** own getter는 `"value" in descriptor` 실패로 거부되고, `Object.prototype` 이외 prototype은 거부된다. 남는 이론적 구멍은 전역 `Object.prototype` 오염과 거짓말하는 Proxy뿐이며 생산 계약 밖이다.

**A4 예외 보존.** primary/cleanup 조합 네 경우가 모두 원인을 보존한다(`AggregateError` + `cause`). `terminal.started` 게이트로 start 이전 실패의 원인 예외도 덮이지 않는다.

**C7 artifact.** `allowedKeys` 확장은 기존 4절 필수 검사와 독립이며, half-pair는 pair 오류 하나, unknown key는 unknown 오류 하나로 분리된다. `profile` key는 non-rpa linear-issue에서 unknown으로 거부되고 `rpa-task-v1`은 `!rpaTask` 분기를 타지 않으므로 두 경로가 겹치지 않는다. 기존 digest/readback 불변.

**utils.** 이번 회차는 주석뿐이고 주석 내용도 코드와 일치한다(ESC 0x1b는 `simpleTerminalCodeUnitWidth`에서 -1이므로 ANSI 입력은 반드시 보수 경로로 간다). 동작 변경 없음, 반례 없음.

**streaming metric 문구.** `streamingMemoryTerminalInput`이 "우선 처리된 입력의 첫 frame"이고 최신 draft paint가 아니라는 서술은 `RenderScheduler` 동작과 일치하고, scope 문자열·별도 무계측 marker assertion으로 이중 고정돼 있다. 이는 threshold 완화가 아니라 측정 대상의 정명(正名)이며, 새 gate가 기존과 동일한 50/100ms인 점도 그 판단을 뒷받침한다.

## 2. 증거 수락

- **E1 (유일한 확인 요청):** 제시된 최종 report는 console 형태라 `results`가 빠져 있다. `verdict: GREEN`/`failingCounts: []`는 script가 계산한 값이라 gate 통과 자체는 함의하지만, **어떤 counts/reps에서 통과했는지가 이 artifact 안에 없다**. `ASTRA_BENCH_OUTPUT` 파일에 `results[].count === 1000`과 `warmBody.samples === 50`(및 `idleWrites: 0`)가 실제로 들어 있는지만 확인하면 수락한다. report 최상위에 `counts`/`repetitions`를 기록하면 이 왕복이 없어진다.
- **source-final-check.json:** `changed: []`, exit 0이고 report의 `sourceRevision`과 동일 해시다. 실행 중 source manifest 불변 주장 수락. (이 값은 manifest digest이지 commit SHA가 아니라는 점만 문서에서 구분해 두라.)
- **pnpm-install-audit.log:** frozen 상태에서 patch가 실제 적용됐다는 근거로 수락. dirty tree 때문에 clean-clone 재현은 미룬다는 판단도 타당하다.
- **A2/A3:** 생산 freeze 소유자(journal coordinator `immutable(structuredClone)`, durable projection `Object.freeze([...])`)와 invalidation-count 0 회귀 모두 주장과 코드가 일치한다. 수락.
- **B5:** 전후 speedup·provider/pixel 무주장 유지 확인.

## 3. 남은 운영 작업 (blocker 아님)

1. **기존 live www 미재시작** — 알려진 미결. 별도 작업 중단 여부는 사용자 결정 대기.
2. E1의 최종 report 필드 확인.
3. 트리 commit 후 clean clone에서 frozen install 1회 재확인(연기된 항목).

## 4. 개선 제안 (선택, 적용 차단 아님)

- `failing` 필터의 임계값 리터럴(16/32/50/100)이 `criteria` 객체와 이중 정의돼 있다. 한쪽만 바꾸면 report가 강제되지 않는 기준을 광고하게 된다. 상수 하나에서 양쪽을 파생시키라.
- `waitForOutput`은 마지막 65536자만 남기는 `output` 버퍼를 본다. 37KB draft 반복 뒤 marker가 잘려 나가면 **거짓 RED**가 난다(거짓 GREEN 위험은 없다). marker 전용 플래그를 `write()`에서 세우면 안정된다.
- `assert.equal(submitted, text + streamingText)`는 rejected dispatch가 composer 텍스트를 보존한다는 shell 동작에 묶여 있다. 실측으로 통과했으므로 현재는 옳지만, 이 역시 깨지면 거짓 RED다.

## 5. 적용 가부와 과제 완료의 구분

**적용 가부:** 이 변경분은 정확성 blocker 없이 적용 가능하다. 실행 중 작업이 안전하게 멈출 수 있는 시점에 적용하라 — 적용 자체가 그 중단을 정당화하지는 않는다.

**과제 완료 아님:** 여기서 GREEN은 합성 harness에서 heading/utils/benchmark 계약이 성립한다는 뜻이다. 실사용 세션에서의 체감 해소, provider/PTY/pixel 경로, 실 live www 재시작 검증은 여전히 미검증이다. **WOO-915는 In Progress 유지**가 맞다.