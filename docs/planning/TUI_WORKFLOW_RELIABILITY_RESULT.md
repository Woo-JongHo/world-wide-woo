# TUI·Workflow 신뢰성 개발 결과

2026-09-08. 범위: TUI 신뢰성, Workflow 성공·저장 계약, 두 프로젝트 로컬 실행 연결. WES는 제외한다. 코드 구현과 로컬 자동 검증을 완료했으며 실제 업무 수락·원격 정합·실사용 완료를 주장하지 않는다.

## 변경 결과

1. Native Plan이 Todo·Tracer 항목 상태의 정본이다. 도구 종료로 계획을 완료하지 않는다. 명령의 exitCode·실패·취소·미확인을 commandResults에 보존하고 업무 검증·수락과 구분한다. 새 Receipt는 algorithmVersion 2, 구형 Receipt는 구형 규칙으로 검증해 원본 digest를 유지한다. CLI와 Workbench 재개에서 변조를 거절한다.
2. 성공 Receipt에는 등록된 로컬 검증기의 대상·Run·Skill revision·입력 digest·근거가 필요하다. 임의 evidence 문자열로 성공을 발급하지 않는다. 상태와 Receipt는 immutable JSON commit envelope 하나로 확정한다. Receipt 없는 stage-only 완료와 고정 scope·subject·scenario·Skill 변경을 저장 API에서도 거절한다. fsync 뒤 exclusive hard-link publication을 CAS 지점으로 사용한다. 기존 JSON 경로는 다시 만들 수 있는 export이며 SQLite를 정본으로 승격하지 않았다.
3. 실제 manifest·코드 symbol·로컬 원장 검사를 Runtime·CLI·TUI에 연결했다. 두 임시 Git 프로젝트에서 검증·저장·새 프로세스 조회·중단 재개·stale 거절을 실행했다. 신규 state/Receipt는 canonical root에 결박돼 다른 프로젝트 복사를 거절한다.

추가 독립 반증에서 완료 Run 재개가 과거 성공을 반환하는 문제와 full legacy 기록을 로컬 성공으로 표시하는 문제를 확인하고 회귀 테스트로 수정했다. 완료·차단된 Run은 새 검사를 안내하며, show는 저장 당시 결과라고 명시한다. 로컬 완료 기록에 해당 검증 Receipt가 없으면 성공 표시를 거절한다.

## 사용 경로와 범위

```text
www workflow check <RPA-ID>
www workflow show <Run-ID>
www workflow resume <Run-ID>
```

TUI에서는 같은 명령 앞에 `/`를 사용한다. Native 실행이 진행 중이거나 불확실하면 Workflow 변경을 차단한다. 결과에는 Run·단계·근거·실패 원인·다음 행동을 표시한다.

이는 **local-preflight**다. `.woo/units.yaml`, 로컬 traceability v3/v2 원장, 참조 코드와 존재하는 로컬 노트를 검사한다. 없는 노트는 검사 제외로 명시한다. Linear·Obsidian 원격 read-back, 업무 로직의 정확성, 전체 rpa-reconcile 수락은 미검증이다. 전체 수락용 validator는 등록하지 않았고 일반 `finish --status succeeded`는 거절된다. RPA-ID는 실행의 업무 표식이며 원격 업무 identity를 증명하지 않는다.

## 검증과 기록

- 실패 기준선: 2단계 3 통과·5 실패, 3단계 4 통과·2 실패·1 미구현. 원본은 `.www/scratchpad/2026-09-08-reliability-scenarios/`.
- 통합 전 전체 회귀: 948 통과·0 실패. 이후 Receipt 부재 거절 시나리오를 추가하고 해당 서비스 8개 테스트 통과.
- 기본 작업 공간 최종 전체 회귀 **953 통과·0 실패·6,716 assertions(106개 파일, 44.12초)**. `bun run check` 종료 코드 0. 원문은 `.www/scratchpad/2026-09-08-reliability-scenarios/accepted-tests.log`, `accepted-check.log`.
- 저장 검증은 실제 두 Bun 프로세스 경쟁, export 장애 후 재조회 복구, 중복 commit·다른 프로젝트 복사·불일치 Receipt 거절을 포함한다.
- 저작과 별도 Codex 반증 검토에서 발견한 두 문제 모두 수정했다. Sonnet 5 읽기 전용 검토를 완료했고 실제 잔여 지적(stage-only write·scope 변경)을 수정했다. 나머지 지적은 선행 수정·명시된 한계와 대조한 sonnet-resolution.md에 기록했다. Opus 최초 감사의 추가 지적도 수정했고 현재 파일 재검토에서 **잔여 blocker 없음**을 확인했다. 원문은 opus-review.json·opus-final.json, 대조 기록은 opus-resolution.md. 두 provider 검토는 정적 읽기 전용 검토이며 실제 테스트 실행은 Codex가 소유한다. Codex 검토를 반대 provider 검토로 대체하지 않는다.
- 변경 파일을 직접 검색해 미구현 TODO·test.skip·test.only가 없음을 확인했다. 검색된 TODO는 화면 문자열·파일명·기존 문서 링크뿐이다. `git diff --check` 통과.

## 통합과 남은 확인

기준 HEAD `45aec4adbebcc5abc902d33f8b29cfd6cd796068` 및 기존 dirty 파일의 SHA256을 고정하고 별도 worktree에서 구현했다. 기본 `dev` 작업 공간과 baseline을 대조해 충돌 없는 변경 34개 파일만 반영했다. 다른 세션의 Native Plan·RPA 변경은 보존했다. 통합 manifest와 구현 전문은 `.www/scratchpad/reliability-implementation/`에 둔다. 커밋·push는 수행하지 않았다.

Registry revision에 저장소 HEAD를 포함하므로 Skill과 무관한 커밋도 재개를 보수적으로 거절할 수 있다. 이때 원인을 레지스트리 스냅샷 변경으로 명시한다. 프로젝트 경로 이동에 대한 자동 재결박은 없다. 과거 무바인딩 JSON의 출처를 소급 보증하지 않는다. 로컬 파일시스템의 hard-link/fsync를 전제하며 실제 전원 장애·publish 직후 강제 종료는 실측하지 않았다. 동시 변경 탐지는 신뢰된 로컬 파일시스템 범위이며 적대적 ABA 변경을 차단하는 sandbox가 아니다.

실제 Native 서버·터미널 화면을 통한 end-to-end, 원격 네 표면 정합, 실제 두 프로젝트의 읽기 전용 pilot은 다음 실사용 단계다. 이번 fixture와 통합 테스트로 그 단계까지 통과했다고 판단하지 않는다.
