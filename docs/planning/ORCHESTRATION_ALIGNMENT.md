# WWW 수행 관찰 구조 조정

## 목적과 범위

WWW는 개발에 특화된 수행 오케스트레이션이며 일반 질문도 처리한다. 사용자가 보는 공통 대상은 항상 **수행**이다. 맡긴 일이 있으면 목표·계획·진척을 함께 보여주고, 없으면 현재 요청과 수행 관측을 보여준다. 목표가 없다는 이유로 수행 기록을 숨기거나 가짜 Plan을 만들지 않는다.

이번 변경은 기존 Native 실행에 책임과 증거 연결을 추가한다. 일반 워크플로 엔진, 단계별 자율 모델 라우팅, 메모리 검색 확대, Linear/Obsidian 자동 게시를 구현했다고 주장하지 않는다.

## 개념을 코드에 투영하는 위치

| 역할 | 현재 코드의 소유 위치 | 이번 조정 / 유지 범위 |
|---|---|---|
| Reasoning | Native 실행 포트 및 outbound 실행 Adapter | Native가 한 단계의 추론·도구 사용 소유; 내부 추론을 수행 요약으로 표시하지 않음 |
| Planning | domain/work/workflow-projection, runtime/execution-run | Native checklist의 dplan-v1 식별·연결 규칙을 실행 Receipt와 공유; 문서 Plan은 실행 Todo가 아님 |
| Memory | ContextComposer 및 기존 Git/Obsidian 연결 | 기존 컨텍스트 공급 유지; 새 기억 엔진 없음 |
| Work State | 기존 Linear 연결 + 선택적 수행 목표 맥락 | Linear 업무 상태와 현재 실행 상태를 동일시하지 않음; 과거 목표를 다음 독립 질문에 자동 귀속하지 않음 |
| Tools | core/ports 및 outbound Adapter | 기존 실행·저장 계약 유지 |
| Execution | runtime/execution-run, application/orchestration/execution-journal | 실행 상태 전이와 기록 재생·Receipt 인증 책임 분리 |
| Observation | Activity + performance/delegation projection + Tracer | 독립 수행/맡긴 일 공통 관찰, 서브에이전트 트리와 선택 상세 |
| Evaluation | Receipt verification, 기존 Test/Review | 명령 성공·턴 종료를 검증 통과로 승격하지 않음 |
| Recovery | 기존 불확실 상태 처리 + 읽기 전용 기록 진단 | 손상 Receipt는 격리; 관측된 재시도만 표시; 자동 복구 엔진 없음 |
| Governance | application/orchestration/approval-dispatch | 승인 응답의 선행 기록→Native 전송→전달 관측; 불확실 결과 재전송 차단 |

이 표는 capability 대응이며 폴더를 10개로 분할하라는 의미가 아니다. 물리 의존 방향은 기존 LAYERS.md의 core/adapters 계약을 유지한다.

## 핵심 계약

1. Activity는 관측 원본이고 Snapshot은 읽기 모델이다. TUI가 독자적으로 실행 상태를 판정하지 않는다.
2. `PerformanceProjection.execution`은 공통 수행 대상, `workContext`는 명시적으로 해당 요청에 결박된 선택적 맥락이다. 세션의 역사적 목표와 현재 수행 목표를 구별한다.
3. Native checklist만 실행 Plan이다. 문서 제안·서술·일반 요청에서 실행 Todo를 만들어내지 않는다.
4. v3 Receipt의 task identity/활동 연결은 전체 journal prefix를 사용하는 dplan-v1과 일치해야 한다. v2 및 versionless Receipt는 당시 알고리즘으로 검증하며 새 digest로 덮어쓰지 않는다.
5. 승인 준비 기록 실패 시 전송하지 않는다. 전송 여부를 확정할 수 없으면 같은 요청의 결정 내용을 바꿔도 재전송하지 않는다. Native resolved 관측과 전송 성공 기록은 다른 사실이다.
6. 서브에이전트는 root에 연결된 관측만 노출한다. spawn 도구 호출 완료는 자식 실행 완료가 아니다. 미지원/미수신 상세를 만들어내지 않고 명시한다. 선택은 고유 Ref로 수행하며 `/agents clear`로 메인 관찰에 돌아온다.
7. 수행 종료와 결과 검증은 별도다. 검증 근거가 없으면 미검증, 연결할 수 없는 활동은 미연결로 표시한다. 이를 실패나 차단으로 추정하지 않는다.

## 검증과 후속 경계

타입 검사, 아키텍처 검사, Receipt 호환/변조, Plan 재정렬, 승인 선행기록·불확실성, 목표 귀속, 자식 수행 관찰·선택 회귀가 필요하다. 작성 후 별도 Sonnet 리뷰 및 Opus 감사 결과와 실제 실행 여부를 구별해 기록한다.

후속 단계는 이번 관찰·증거 계약 위에서 단계별 executor 선택, 검증 실패 시 정책 기반 재시도, 외부 업무 상태 반영을 하나씩 추가하는 것이다. 각 단계는 별도 승인·외부 쓰기 범위와 수락 시나리오가 필요하다.

## YAML 설정 전환 1단계

`.www/workbench.yaml`은 이제 `execution.provider/model/effort`, `approvalPolicy`, `sandbox`, `tnote.model`을 소유한다. `loadWorkbenchConfig`가 YAML을 읽고 허용 목록을 검증한 불변 Snapshot을 만든다. 프로젝트에서 명시한 `ProjectWorkbenchSessionOptions`가 있으면 그것이 YAML보다 우선한다.

현재 전환된 것은 세션 생성 기본값, Native context 예산, legacy SessionRuntime의 retry 정책·도구 라운드 제한, delegation 상세 활동 표시 한계, evaluation의 검증 필요 표시 정책, detached review provider/model, 설정 provenance의 Snapshot·Tracer 표시, HUD의 사용량·Context 표시 선호다. 실행 중인 turn·approval·delegation·receipt·activity는 계속 Journal과 Snapshot이 소유한다. redaction·journal 무결성 상한은 코드 불변식으로 남긴다. `requireVerification`은 근거 없는 완료를 만들지 않고 Tracer에 검증 필요를 표시하는 정책이며, 자동 검증 실행기는 아니다.

모든 값을 무조건 YAML로 옮기지는 않는다. 외부 입력으로 완화되면 redaction·저장 무결성·안전한 출력이 깨지는 보안/무결성 상한은 코드 불변식으로 남긴다. YAML은 프로젝트가 조정할 수 있는 실행 정책과 표시 선호만 소유한다.
