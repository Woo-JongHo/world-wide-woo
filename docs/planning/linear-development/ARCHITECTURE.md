# 제품 구조

상태: v0.1.0 구현 기준. 전수 경로와 rollback은 [V010_CAPABILITY_MIGRATION_PLAN.md](V010_CAPABILITY_MIGRATION_PLAN.md)가 소유한다.

## 설계 기준

WWW는 프로젝트와 도구가 바뀌어도 업무 의미·인수인계·근거를 유지한다. 개발자가 기능을 찾는 최상위 축은 `tui / system / workflows`다. Linear Parent Issue의 분류나 파일 이름이 아니라 실제 책임과 import graph로 하위 위치를 정한다.

```text
src/
├── tui/                  # 사용자 입력·표시·탐색·조작
│   ├── auth/
│   ├── chat/
│   ├── layout/
│   ├── observability/
│   ├── overlays/
│   ├── shell/
│   ├── theme/
│   ├── work/
│   ├── workbench/
│   └── legacy/
├── system/               # 공통 실행·기록·통제
│   ├── contracts/        # 순수 계약·projection·port
│   ├── services/         # adapter를 모르는 공통 정책
│   ├── adapters/         # executor·파일·프로세스·provider IO
│   └── public.ts
├── workflows/
│   └── tui-development/  # 현재 존재하는 개발 기록 업무
│       ├── contracts/
│       ├── adapters/
│       ├── service.ts
│       └── index.ts
├── app.ts                # 유일한 concrete composition root
├── cli.ts
└── product-version.ts
```

빈 폴더를 선제 생성하지 않는다. 기존 legacy 기능은 `tui/legacy/`에 격리하되 삭제하지 않는다. v0.1.0에서는 실제 개발 기록 업무만 `workflows/tui-development`로 옮기며 범용 Workflow Engine을 만들지 않는다.

## 책임과 Interface

| 영역 | 소유 | 소유하지 않음 |
| --- | --- | --- |
| TUI | 입력 편집, 화면 크기·색·focus, source 탐색, 공개 명령 호출 | 업무 수락 판정·executor wire 해석 |
| System | 실행 요청·취소·재개, 관측 정규화·기록, 승인 전달, 근거 보존, 공통 projection | 특정 Workflow의 단계 완료 조건 |
| Workflow | 실행 순서·재시도·사람 승인 조건, 업무 진행 의미, 근거 충분성·수락 판단 | 외부 executor 프로토콜·파일 저장 형식 |

계약은 책임 가까이에 두되 순수 계약과 IO adapter를 분리한다. `system/public.ts`는 TUI와 Workflow가 공유하는 읽기 projection과 command interface만 노출한다. `workflows/tui-development/index.ts`는 Workflow 서비스와 공개 record만 노출하며 concrete adapter를 export하지 않는다.

- System은 TUI와 Workflow를 import하지 않는다.
- System service는 adapter를 import하지 않는다.
- Workflow 서비스는 `system/public.ts`만 사용하고 concrete executor/store를 import하지 않는다.
- 현대 TUI는 `system/public.ts`와 Workflow 공개 entry만 사용한다.
- legacy TUI의 concrete 조립도 `app.ts`가 소유한다.
- `app.ts`만 concrete implementation을 선택하고 수명을 조립한다.
- TUI의 줄바꿈·축약·표시용 가공은 허용하지만 업무 상태와 수락은 재판정하지 않는다.
- System 관측은 미관측 값과 관측된 0을 구분한다.

## 업무 한 건의 흐름

요청 → 관련 Unit/Linear Work 확인 → Workflow가 입력·완료 조건 결정 → System이 실행·승인·관측 기록 → Workflow가 근거 확인·수락 판정 → TUI에서 결과·출처 확인.

System의 일반 실행·관측 기능은 전문 Workflow 없이도 사용할 수 있다. Native Plan projection은 실행 관측 계약이며 Workflow Engine이 아니다.

## 기록과 판단

System은 Evidence identity·외부 출처·revision·보존 위치를 관리한다. Workflow는 어떤 주장에 어떤 Evidence가 충분한지 판단한다. Evidence는 Journal뿐 아니라 Git·테스트·외부 원본에서도 온다.

Approval의 요청·응답·대상 revision은 System이 기록한다. 어떤 승인이 필요한지는 Workflow 정책이 정한다. 승인 이후 대상이 바뀌면 이전 승인의 유효성을 재검사한다.

## 이관·회귀 검증

[architecture.test.ts](../../../test/architecture.test.ts)는 새 최상위 축, 계약 순수성, System/Workflow/TUI 경계, app-only concrete wiring, legacy 격리, cycle 부재를 검사한다. 기존 동작 테스트는 새 경로를 직접 import한다. 원장의 Code-ID location, 실제 Vault 상세, Linear ID, SQLite projection, Development Map은 같은 logical identity를 가리켜야 한다.
