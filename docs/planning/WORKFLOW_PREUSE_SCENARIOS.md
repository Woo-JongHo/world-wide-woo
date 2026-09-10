# Workflow 실사용 전 시나리오와 개발 결과

2026-09-08. 실행 순서는 시나리오 → 로컬 테스트 → 수정 → 같은 요구 재검증 → 실사용이다.

## 수정 전 기준선

2단계는 8건 중 3 통과·5 실패, 3단계는 4 통과·2 실패·1 미구현이었다. 원본은 기본 작업 공간의 `.www/scratchpad/2026-09-08-reliability-scenarios/`에 보존한다. 모의 finish 성공은 실제 업무 성공으로 세지 않았다.

| 시나리오 | 기대 | 수정 후 검증 경계 |
|---|---|---|
| 빈 배열·빈 문자열·공백·임의 성공 주장 | 성공 거절 | Skill domain 거절 + 실제 검사 service |
| stale 승인 | 승인 거절 | Skill 상태 전이 |
| uncertain 재시도 | 자동 실행 거절 | 같은 Run 전이 |
| 동시 두 writer | 하나만 상태·Receipt commit | 실제 별도 Bun 프로세스 + 공개 store 조회 |
| Receipt export 장애·중단 | 근거 없는 completed 부재 | 원자 JSON envelope + 조회 후 projection 복구 |
| 동일 규칙·두 프로젝트 | 같은 검사, 다른 기록 | 실제 파일 verifier + LocalWorkflowService |
| 필수 Skill·참조 누락 | 실행 차단 또는 실패 기록 | Registry·실제 코드 symbol/원장 검사 |
| 상태·Receipt 복사 혼입 | 새 bound 기록 거절 | canonical root binding |
| 재시작·입력 변경 | 같은 입력만 재개, stale 거절 | 저장된 subject digest + registry revision |
| 완료 후 입력 변경·legacy 이력 | 종료 Run 재개 거절, 과거 결과로 명시, scope·Receipt 검사 | 실제 서비스·CLI 회귀 |
| TUI 결과 | CLI와 같은 Run·근거·다음 행동 | /workflow check·show·resume → 동일 service |

## 개발 범위

첫 실행은 `local-preflight`로 명시한다. `.woo/units.yaml`·로컬 원장·코드 symbol 참조를 실제로 읽어 검사한다. 기존 rpa-reconcile의 원격 네 표면 정합 수락을 로컬 검사로 대체하지 않는다. 따라서 원래 S3-07 중 **로컬 검증기·Runtime·TUI 연결**을 개발하고, **원격 네 표면 read-back과 전체 정합 수락**은 실사용 확장 전 별도 검증 대상으로 유지한다.

등록된 로컬 검증 결과로만 성공 Receipt를 생성하며, 일반 `finish --status succeeded --evidence <문장>`은 거절한다. 전체 RPA 성공을 발급할 별도 validator는 아직 등록하지 않는다.

## 실행 방법

- `www workflow check <RPA-ID>`: 현재 프로젝트 로컬 사전 검사.
- `www workflow show <Run-ID>`: 저장된 결과와 범위·다음 행동 조회.
- `www workflow resume <Run-ID>`: 동일 입력으로 중단된 읽기 전용 검사 재개.
- TUI: `/workflow check`, `/workflow show`, `/workflow resume`에 같은 인자를 사용.
- Skill CLI: `check-local --root <project> --process <RPA-ID>`, `show-local --root <project> --run <Run-ID>`, `resume-local`.

결과 실패는 CLI에서 nonzero이며, 성공 문구에도 원격 정합 미검증을 표시한다. 기록은 현재 canonical root에 결박되므로 프로젝트 폴더 이동은 자동 신뢰하지 않는다. 과거 무바인딩 JSON은 호환 읽기만으로 출처를 입증하지 않는다.

## 검증 기록

구현 테스트와 통합 결과는 `.www/scratchpad/reliability-implementation/`에 기록한다. 타입·아키텍처·전체 회귀 결과와 반대 provider 검토는 개발 인수인계에서 확정한다. 실사용·실제 Native 서버 화면·원격 변경은 로컬 fixture 통과와 구분한다.

완료·차단된 Run은 resume로 성공을 재사용할 수 없다. show는 저장 당시 결과이며 현재 입력 재검증이 아니다. full legacy 기록과 검증 Receipt 없는 완료 기록은 로컬 성공으로 표시하지 않는다.
