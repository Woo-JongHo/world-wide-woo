# 네이티브 계획과 실행 추적 연결 계획

상태: 구현 승인, 검증 보류(사용자 요청). 기준 dev 45aec4a, 2026-09-08.
Linear: WOO-700 / WOO-717. 부모: WOO-682 / WOO-681, v0.1.0.

## 목표

Chat은 실행 전 목적과 결과 후 확인사항을 공개 메시지로 보여준다. Todo는 네이티브가 명시적으로 제출한 작업 계획을 세션별 Todo.md와 화면에 보존한다. Tracer는 해당 계획에 연결되는 실제 실행·승인·실패·결과를 보여준다. 명령 횟수를 Todo로 바꾸거나 설명 모델이 원본 계획을 재작성하지 않는다.

## 확인된 전제

- 로컬 codex-cli 0.153.4. Codex 0.152.0에서 update_plan은 opt-in으로 변경됐다.
- 0.153.4 Plan 모드에서 update_plan 호출은 거부된다. Plan 모드의 proposed_plan 문서와 실행 체크리스트는 별개다.
- 현재 WWW는 plan/default collaborationMode를 전달한다. 구조화된 계획이 없으면 완료 답변의 번호 목록에서 public-fallback을 만든다. 이것을 원본 구조화 계획으로 표시하면 안 된다.
- PlanAssociation은 inferred이며 임의의 native plan item ID가 모든 tool event에 존재한다고 가정할 수 없다.
- 별도 PiActivityNarrator가 Luna를 호출한다. 기본 관측 경로에 필수인 것으로 취급하지 않는다.

## 구현 범위와 순서

1. Native 실행 계약: WWW가 생성하는 Codex app-server에 tools.update_plan.enabled=true를 명시한다. 전역 사용자 설정 파일은 변경하지 않는다. 기존 사용자 지정 command/외부 주입 transport와 호환시킨다. default 실행 모드에는 다단계 작업의 update_plan 등록·상태 갱신, 묶인 도구 실행 전 한국어 목적, 결과 후 짧은 관측 설명을 요구한다. 단순 질문에는 가짜 계획을 만들지 않는다. plan 모드에는 금지된 update_plan을 요구하지 않고 계획 문서를 작성하게 한다. 프롬프트 요구를 기술적 실행 차단으로 주장하지 않는다.
2. 계획 출처: native checklist / public plan document / not received를 구분한다. 과거 public-fallback 파일은 보존하되 native authority로 승격하지 않는다. 새 request/started 또는 item/started만으로 Todo 항목이나 완료율을 만들지 않는다. 계획 없음·미수신은 안내 상태이며 가짜 task가 아니다.
3. Todo 상태와 저장: 기존 thread 기반 경로와 source revision·안정 ID를 재사용한다. native 상태가 계획 상태를 소유한다. 도구 종료나 turn 종료만으로 모든 항목을 completed로 올리지 않는다. 기존 두 계층 표시를 보존하되 flat native plan에 없는 하위를 발명하지 않는다. 계획 도착 뒤 session Todo를 갱신하고 같은 session resume에서 원본 참조를 복원한다.
4. Tracer 연결: 원본 thread/turn/item/activity identity를 보존한다. 직접 참조가 없으면 관측된 실행과 추론한 Plan 관계를 별도로 표시한다. 단일 running 항목에 대한 기존 revision 구간 추론은 inferred로 표시한다. 병렬·여러 running·계획 교체·선행 tool·다른 turn은 무리하게 결속하지 않고 미연결 실행으로 남긴다. plan 생성 전에도 실제 실행은 Tracer에서 볼 수 있어야 한다. 기존 Source 왕복·승인 대기·실패·취소 표현을 유지한다.
5. 설명 비용: 기본 경로는 실행 AI의 공개 commentary와 구조화 Plan을 사용한다. 별도 Narrator의 매 단계 AI 재호출은 기본적으로 끄거나 명시 opt-in으로 만든다. narration은 계획 제목·상태·identity를 변경할 권한이 없다. 설명 미수신은 추측하지 않는다.
6. 최소 리팩터링: 공통 Plan source 판정과 association 규칙은 core/domain/work가 소유하고 TUI는 표현만 한다. 같은 journal을 화면별로 다시 해석하는 새 경로를 추가하지 않는다. 대규모 viewport 재작성·Rust/Go 전환은 별도 논의로 남긴다.

## 파일 책임과 작업 방식

- 구현자는 src/의 native executor, workbench orchestration, work projection, Todo/Tracer presentation 및 필요한 composition 변경을 소유한다.
- 기존 코드·계약·테스트를 읽을 수 있으나 이번 패스에서는 test/typecheck/build/benchmark/외부 AI review를 실행하지 않는다. 변경된 API로 기존 테스트가 깨질 것으로 명백하면 최소한의 fixture 수정은 가능하되 실행하지 않았음을 기록한다.
- Git commit/push/PR/merge와 Linear/Obsidian 변경은 구현자의 범위가 아니다.
- 원래 작업 폴더의 RPA dirty 변경과 별도 경량화 보고서를 건드리지 않는다. 격리 브랜치 fix/native-plan-todo-tracer에서 작업한다.
- 저장 포맷이 달라지면 호환 읽기를 유지하며 기존 사용자 문서를 덮어쓰지 않는다.

## 이후 검증할 수락 시나리오 — 전부 NOT RUN

1. default 다단계 작업: update_plan → Todo 반영 → 도구 이벤트 → Tracer 연결 → native 상태 변경.
2. Plan 모드: 공개 계획 문서와 실행 checklist를 구분하며 update_plan 금지 오류를 유도하지 않는다.
3. 계획 미수신/단순 질문: 가짜 항목 없이 실제 활동은 관측된다.
4. 도구 성공이 계획 완료로 자동 승격되지 않는다.
5. 병렬/plan rewrite/다른 turn의 동일 itemId에서 잘못 연결하지 않는다.
6. 승인 대기·실패·취소 시 Chat 입력과 기존 Todo/Tracer가 보존된다.
7. 세션 재개와 외부 편집 충돌에서 계획·실행 identity가 보존된다.
8. 기본 경로가 추가 Narrator 모델을 호출하지 않는다.
9. 상태 갱신 시 화면과 Todo.md가 일치하며 원본 없는 2계층을 만들지 않는다.

## 완료 표기

이번 산출물은 구현 패치와 미검증 인수인계다. 빌드 가능·실사용 완료·회귀 없음으로 표현하지 않는다. Linear는 In Progress를 유지한다. 검증은 WOO-722/WOO-724와 연결해 다음 패스에서 수행한다. 버전은 이번 수정만으로 올리지 않는다.

## 리팩터링 후속 질문

- 계획·실행 상태와 화면 설명을 한 projection 소유자로 모을 수 있는가?
- 변경 없는 완료 message/plan을 다시 처리하지 않는 revision 기반 갱신 경계는 어디인가?
- Native executor가 제공하는 관측·승인 권한으로 어디까지 강제할 수 있는가? 기술적 차단이 없는 부분은 지침으로 명시한다.
- 기능 보존 경량화와 임의 extension 금지라는 제품 정책 변경을 별도 결정으로 다룬다.

참고: https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/core/src/tools/handlers/plan.rs
참고: https://github.com/openai/codex/releases/tag/rust-v0.152.0
