# Request protocol delivery shape 독립 리뷰

대상: `src/core/application/orchestration/request-protocol.ts`, `test/request-runtime.test.ts`

## 검토 결과

- `requestProtocolContext()`의 `deliveryShape`가 parser의 유일한 허용 최상위 필드인 `deliveries` 배열을 사용한다.
- parser는 `only(...)` allowlist로 최상위 `target`·`artifact`를 거부하고, 배열 원소에서만 `target`·`artifact`·`evidence`를 허용한다. 새 안내 문구와 실제 수용 계약이 일치한다.
- 실제 UUID 형식 requestId를 사용해 protocol에서 생성된 delivery shape를 stage 메시지에 전개하고 `parseRequestStageReport()`가 `deliveries`로 복원하는 테스트는, 과거의 shape/parser 불일치를 직접 잡는다.
- 기존 `deliveries` 배열의 parser 계약과 호출부는 변경하지 않아 호환성 회귀가 없다.
- 실행: `npm test -- --runInBand test/request-runtime.test.ts` — 17 pass. `git diff --check` — pass.

## Skill-perspective check

`remove-ai-slops`와 `programming` 스킬은 이 환경에 제공되지 않아, 불필요한 가공·취약한 문자열 테스트·구현 복제 테스트 기준을 직접 적용했다. 새 production 추상화나 parsing은 없으며, 테스트는 생성된 protocol shape와 실제 parser를 연결하므로 구현 상수를 단독 확인하는 테스트가 아니다.

## Verdict

- codeQualityStatus: CLEAR
- recommendation: APPROVE
- blockers: 없음.
