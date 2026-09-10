# 수행 관찰 구조 조정 검증 기록

날짜: 2026-09-10. 브랜치: dev. 기존 미커밋 변경을 보존한 상태에서 작업했다. 비교 기준 사본은 `/tmp/www-alignment-baseline.d0nr6o`다.

## 반영

- `PerformanceProjection`: 수행 상태를 공통으로 투영하고 명시적 요청에 연결된 목표만 선택적으로 제공한다.
- `ExecutionJournal`: 실행 관측 재생과 v3/v2/versionless Receipt 인증을 Workbench에서 분리했다. 손상·지원하지 않는 기록은 읽기 전용 진단으로 격리한다.
- v3 Plan: 현재 이벤트까지의 전체 journal prefix로 dplan-v1 task identity/association을 투영한다. 문서 Plan은 실행 Todo로 승격하지 않는다. 추적성 CLI도 버전별 원본 알고리즘으로 검증한다.
- 승인: 응답 스냅샷·digest·선행 기록을 먼저 확정한 뒤 Native로 전송한다. 전송 불확실 시 같은 요청의 다른 결정도 재전송하지 않는다.
- 위임: 전체 관측의 parent graph로 다른 turn의 자손을 연결한다. 도구/메시지 공개 활동, 상태, 결과를 선택 상세로 보여준다. `/agents <고유 ID 또는 Ref>`, `/agents clear`를 사용한다.
- Tracer: Plan 없는 수행도 표시한다. 수행 종료와 검증 통과를 구별하고 관측된 실패·재시도·미연결 활동만 표시한다.

## 검증 증거

| 검사 | 결과 | 전문 |
|---|---|---|
| TypeScript | 통과 | `/tmp/www-alignment-final-check.log` |
| 전체 테스트 | 1,034 통과, 실패 0 | `/tmp/www-alignment-final-tests.log` |
| Diff whitespace | 통과 | `/tmp/www-alignment-diff-check.log` |
| 실제 Native 일반 질문 | 9.6초, pong 응답·종료·v3 Receipt·workContext null 확인 | `/tmp/www-alignment-native-smoke-report.md` |
| 승인·선택·읽기 전용·Tracer 회귀 | 통과 | `/tmp/www-approval-audit-report.md` |
| Plan·Receipt·수행 맥락 회귀 | 통과 | `/tmp/www-runtime-alignment-report.md` |
| 서브에이전트 관측·트리 회귀 | 통과 | `/tmp/www-delegation-view-report.md` |

## 독립 리뷰

- Sonnet 5 읽기 전용 리뷰: 고·중 심각도 결함 없음, 저심각도 F1(승인 감사 기록이 승인 대기를 수행 중으로 조기 변경) 발견. 전문 `/tmp/www-alignment-sonnet.json`.
- F1 보정: v3의 governance 기록은 실행 phase/waitReason/activeActivity를 유지하고, Native `approval-resolved` 관측이 대기를 해제한다. legacy/v2 알고리즘은 그대로 유지했다. 관련 136개 테스트 통과, 전문 `/tmp/www-alignment-sonnet-fix.log`.
- 수정의 별도 Sonnet 재검토: PASS, 남은 결함 없음. 전문 `/tmp/www-alignment-sonnet-fix-review.json`.
- 최초 Opus 감사: 승인 감사 중복 제거 관련 BLOCKER 1건과 중간 지적 6건. 전문 `/tmp/www-alignment-opus.json`.
- BLOCKER: 승인 요청은 전송 시도부터 Native resolved까지 잠그고, 관측 digest에 commandId·operation·phase·payload를 포함하도록 수정했다. 정확한 responseDigest는 별도 payload에 유지한다. 실제 ActivityJournalStore 중복 제거 회귀를 추가했다.
- M1: 기존 reasoning 판정 함수의 예산 한계를 넘어 fail-closed라고 단언한 주석을 정확하게 수정했다. 인식된 reasoning 봉투를 제외하며 전체 helper의 의미를 바꾸지 않았다.
- M3: governance/request 제어 관측은 실행 실패 카운터에서 제외했다.
- M4: 저장된 승인 관측으로 재전송 잠금을 복원하는 경로를 추가했다.
- M5: child thread+turn을 유일한 attempt에 결박한다. 이전 turn의 지연 활동은 이전 attempt를 유지하고, 여러 후보 중 판정할 수 없는 신규 turn은 임의 귀속하지 않는다.
- M6: Tracer는 전체 트리를 순수 summary renderer로 렌더한다. 다른 turn의 task를 첫 turn의 source metadata로 위장한 중간 구조체를 제거했다.
- 보정 후 Opus 재감사: **미실행 blocker**. 실행 응답은 `You've hit your session limit · resets 4:20pm (Asia/Seoul)`, `is_error: true`, 모델 실행 사용량 없음이다. 전문 `/tmp/www-alignment-opus-recheck.json`. 다른 모델로 대체하지 않았다. 최초 BLOCKER 지적을 보정하고 전체 회귀는 통과했으나, 최종 독립 감사 PASS를 주장하지 않는다.
- 현재 설정 배선에 대한 Opus/Sonnet 재감사 시도도 동일한 CLI 세션 한도로 미실행되었다. 원문 `/tmp/www-opus-config-audit.txt`, `/tmp/www-sonnet-current-config-review.txt`. 외부 리뷰 PASS로 대체하지 않는다.
- Release gate 위생 판정이 정상 검증 코드의 `placeholder` 단어까지 미완성으로 오인하던 결함을 수정했다. 이제 실제 TODO/FIXME/skip/only/미구현 패턴만 차단하며, gate 재실행 결과 코드 위생 blocker는 사라지고 ST-011-06~13의 정식 evidence 부재만 남는다.
- ST-011-06~13 정식 evidence 경로를 복원했다. 06~11은 기존 smoke·현재 회귀를 가리키는 PASS receipt, 12는 Opus session-limit, 13은 Windows/operator 증거 부재를 명시한 BLOCKED receipt다. release gate가 누락이 아니라 실제 판정으로 읽도록 정리했다.
- 추적성 gate 재검증에서 기존 Vault export manifest가 현재 worktree의 존재하지 않는 canonical 파일을 가리키는 drift를 발견했다. manifest를 `BLOCKED`와 원인으로 갱신했으며, `units:check`와 `development-map:check`는 계속 통과한다. 원본 Vault가 복원되기 전까지 byte read-back PASS를 주장하지 않는다.
- 보존된 `obsidian-before-review-fixes.tar.gz`도 대조했다. 17개 이전 Traceability 문서만 포함하고 현재 manifest의 36개 대상 전체를 복원할 수 없으며 WOO-678도 없다. 이후 Git의 `87cd10e`에 남아 있던 36개 byte 원본을 정확한 manifest 경로로 복원해 digest는 맞췄지만, 현재 v3 ledger·Obsidian schema와 세대가 달라 `LINEAR_DETAILED_BY_CANONICAL_TARGET_REQUIRED`/`OBSIDIAN_CONTRACT_INVALID`가 남았다. 이 상태를 PASS로 승격하지 않고 manifest를 BLOCKED로 유지한다.
- traceability gate가 canonical/export 파일 부재를 저수준 `ENOENT` 대신 `VAULT_EXPORT_ACTUAL_FILE_MISSING:<noteId>:<path>`로 보고하도록 보강했다. 실제 재실행에서 첫 누락 WOO-678 경로를 식별했고, manifest는 다시 `BLOCKED`로 보존했다.
- traceability rebuild/drift/orphans도 재실행했다. 현재 `.www/vault`가 과거 Linear/Obsidian ledger가 요구하는 관계·entity를 포함하지 않아 `OBSIDIAN_PROPERTY_ENTITY_MISSING`, `OBSIDIAN_RELATION_EDGE_MISSING/UNDECLARED`가 다수 발생한다. 이는 코드 테스트로 숨길 수 없는 정본 drift이며 canonical Vault 원본 복구가 필요하다.
- 현재 worktree 기준 실제 OAuth Codex Native smoke를 재실행했다. `gpt-5.6-sol`/low에서 `ProjectWorkbench`가 assistant `연결 확인`을 받고 `activeTurnId: null`, `ready`, timeout false로 종료했다. 승인·child delegation·재시작·PTY는 이 smoke 범위가 아니다. 증거 `.www/evidence/2026-09-10-current-native-smoke/`.
- 최종 상태: **구현·회귀 검증 완료 / 보정 후 Opus 최종 감사 미완료**. 승인 잠금의 Workbench 재시작 연결까지 통합 테스트로 확인했다. Opus가 사용 가능한 시점에 보정 범위를 다시 감사해야 한다.
- YAML 전환 2단계: `workbench.yaml`의 execution/tnote 기본값과 `limits.contextCharacters`를 검증된 ConfigSnapshot으로 읽어 세션·ContextComposer에 주입했다. 관련 설정 테스트와 전체 회귀를 다시 실행했다.
- YAML 전환 3단계: `retry.enabled/maxRetries/baseDelayMs`를 검증·범위 제한해 legacy `SessionRuntime`에 주입했다. 코드에 고정된 retry 기본값을 제거하고, malformed/범위 초과 설정 테스트를 추가했다.
- YAML 전환 4단계: `delegation.detailActivities`를 검증·범위 제한해 Workbench Snapshot과 선택 에이전트 상세 renderer에 주입했다. 현재 고정 8개였던 공개 활동 표시 한계를 프로젝트 정책으로 조정할 수 있다.
- YAML 전환 5단계: `evaluation.requireVerification`을 Snapshot과 Tracer에 주입했다. 검증 Receipt가 없을 때 실행을 성공으로 위조하지 않고 `검증 필요`를 표시한다.
- YAML 전환 6단계: `orchestration.maxAgentRounds`를 `SessionRuntime`의 도구 라운드 제한에 주입하고, 지원하지 않는 `schemaVersion`은 기본 설정으로 fail-closed 처리한다.
- YAML 전환 7단계: detached review lane의 provider/model을 `review` 정책으로 명시해 production review adapter가 프로젝트 설정을 소비하도록 연결했다. interactive 실행 모델과 독립 검토 모델은 분리된다.
- YAML 전환 8단계: 설정 로더가 `project-yaml`/`defaults` provenance를 반환하고 Workbench Snapshot·Tracer가 현재 정책 출처를 표시한다. fallback을 프로젝트 정책으로 오인하지 않는다.
- YAML 전환 9단계: 조정 가능한 T-note 표시 상한 `display.tnoteVisibleLimit`을 YAML에서 읽어 Snapshot과 Source pane에 주입했다. redaction·무결성 상한은 계속 코드 불변식으로 보호한다.
- YAML 전환 10단계: `tnote.model`도 openai-codex 허용 모델 목록으로 검증해, 잘못된 provider/model 문자열이 detached generator까지 도달하지 않게 했다.
- YAML 전환 11단계: Workbench YAML의 알 수 없는 최상위 정책 키(예: `execusion`)를 조용히 무시하지 않고 기본값으로 fail-closed 처리하며 provenance도 `defaults`로 표시한다.
- YAML 전환 12단계: `hud.showUsage/showContext`를 검증된 ConfigSnapshot에서 Workbench snapshot과 Usage HUD까지 연결했다. YAML 정책으로 공급자 사용량과 Context 표시를 각각 끌 수 있으며, 기본값은 기존 표시를 유지한다.
- YAML 전환 13단계: `slash.mcp/clear/compact`도 검증된 정책으로 읽어 비활성화된 로컬 명령을 실행하지 않고 명시적인 안내를 표시한다. 선언만 읽고 무시하는 설정을 제거했다.
- YAML 전환 14단계: CLI `runApp`가 Codex 기본 진입에서 legacy Settings의 provider/model/effort를 명시 주입해 YAML을 덮어쓰던 배선 결함을 제거했다. 이제 Codex startup policy는 `.www/workbench.yaml`이 소유하고, 명시 입력이 필요한 Pi 레인만 Settings를 전달한다.
- YAML 전환 15단계: Codex `/model` 선택 저장도 legacy Settings가 아니라 `.www/workbench.yaml`의 execution policy를 atomic write하도록 연결했다. 기존 YAML의 다른 정책은 보존하고, 잘못된 모델은 파일을 변경하지 않고 거절한다.
- YAML 전환 16단계: 선택적 Activity Narrator의 모델도 `narrator.model` 정책으로 검증·주입해, T-note와 동일하게 보조 모델 상수를 런타임에서 덮어쓸 수 있게 했다.
- YAML 전환 17단계: Linear 연결 정보도 WorkbenchConfig의 검증된 `linear` snapshot으로 정규화해 Session이 YAML을 다시 파싱하지 않도록 했다. 유효하지 않은 연결 정보는 dashboard를 생성하지 않는다.
- 모델 정책 정본: 단계별 모델·YAML 소유권·코드 불변식·외부 감사 경계를 [`MODEL_POLICY.md`](MODEL_POLICY.md)에 고정했다.

## 미검증 및 제외

- 실제 Native smoke는 일반 질문 한 건이며 실제 승인, 자식 spawn, 외부 도구 쓰기, 연결 끊김과 재시작 시나리오를 실행하지 않았다. 해당 상태 분기는 회귀 테스트로만 확인했다.
- Linear 등록 연결의 원격 read-back은 현재 세션의 해당 MCP 부재로 미실행이다. Linear/Obsidian/GitHub에 게시하지 않았다.
- 범용 자율 워크플로 엔진과 기억 검색 확대는 이번 구현 범위가 아니다. 단계별 모델 역할은 interactive 실행과 detached review 경계까지 설정으로 연결했으며, Codex/Claude의 외부 독립 감사 호출 자체는 여전히 별도 승인·실행 경계다.
- M2 성능 실측: 동일 synthetic 전체 replay 1,000건 v2 347ms / v3 647ms, 2,000건 v2 1,406ms / v3 2,092ms. 기존 누적 checkpoint digest도 비선형 비용이 있고 v3 전체 journal 투영이 추가 비용을 만든다. 대용량 초기화 비용은 남은 한계이며, 증분 투영·checkpoint 최적화는 재생 동치 검증을 포함한 후속 작업이다. 전문 `/tmp/www-runtime-alignment-report.md`.
- 커밋·push는 하지 않았다. 테스트 수는 기존 사용자 변경까지 포함한 현재 워크트리 전체 기준이다. `/tmp` 전문은 임시 증거다.
