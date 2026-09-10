# Skill Runtime Contract v1

## 소유 구조

```text
[Environment]
└── 프로젝트 workspace / Git revision / Native 실행 환경

[Skills]
└── .agents/skills/*/SKILL.md
    └── FileSkillRegistry → 이름·경로·bytes digest·source revision

[Agents]
└── agents/rpa/AGENT.md
    └── RPA intent → 고정 Skill chain → Skill Run state machine

[Runtime]
├── .www/runtime/skills/commits/<runId>/<sequence>.json # JSON 정본: state + receipts
├── .www/runtime/skills/<runId>.json # 호환 export
├── .www/receipts/skills/<runId>/<receiptId>.json
└── Monitor protocol www-skill-monitor@0.1.0
```

Agent와 Skill은 분리한다. Agent는 intent 분류와 순서만 소유하고, Skill은 한 단계의 계약을 소유한다. 런타임은 어느 쪽의 산문도 재해석하지 않고 Registry digest와 고정 chain을 사용한다.

## 상태 계약

`ready → running → authorize → execute → ready|completed`가 정상 경로다. 외부 쓰기 Candidate가 없으면 `running → ready|completed`가 가능하다. 실패·차단·취소·불확실은 각각 `failed`, `blocked`, `canceled`, `uncertain` terminal 상태다.

- 신규 개발: `rpa-intake → rpa-map → rpa-build → rpa-safety → rpa-publish → rpa-reconcile`
- 신규 개발 테스트: `rpa-safety → rpa-publish → rpa-reconcile`
- 유지보수: `rpa-intake → rpa-maintenance → rpa-safety → rpa-publish → rpa-reconcile`
- 문서 정합: `rpa-reconcile`
- Monitor: 쓰기 Skill 없이 저장된 Run과 Receipt만 조회한다.

의도가 둘 이상으로 분류되거나 Process ID가 필요한데 없으면 실행하지 않는다. 대화 계층은 한 초점의 선택지로 질문하고 결정된 intent와 Process ID로 새 계획을 만든다.

## 승인·증거 계약

Linear·Obsidian·GitHub PR 쓰기는 전체 Artifact Candidate의 SHA-256 `candidateDigest`가 없는 Native mutation 후보를 버린다. 승인은 해당 digest와 actor에 결박되며, digest가 달라지면 `SKILL_AUTH_STALE`로 중단한다. 성공 Receipt는 대상·Run·Skill·registry revision·검사 시각·실제 read-back에 결속된 구조화된 검증 결과 없이는 만들 수 없다. `finish --status succeeded --evidence ...`만으로 성공을 선언할 수 없다. 현재 등록된 결정론 검사기는 `local-unit-references@1`이며 `local-preflight` 범위만 수락한다. full 범위의 자동 성공 validator는 아직 없으므로 성공을 추정하지 않는다.

Receipt는 `schemas/woo-receipt.schema.json`의 상태 어휘만 사용한다. 저장 전과 조회 시 `receiptDigest`를 다시 계산한다. Run state와 Receipt의 정본은 같은 immutable JSON commit envelope다. `commitStep(state, receipt, expectedRevision)`은 두 값을 함께 기록하고, 임시 파일 fsync 후 다음 sequence 경로에 hard-link를 배타 생성한다. 같은 revision의 독립 프로세스가 경합하면 하나만 성공하며 나머지는 `SKILL_RUN_CONFLICT`다. state 변경은 revision이 정확히 1 증가해야 하고, 신규 생성 이외에는 expectedRevision이 필수다. step 종료 상태는 별도 state write로 저장할 수 없다.

`runtime/skills/<runId>.json`과 `receipts/skills/<runId>/<receiptId>.json`은 호환 export다. export 실패나 publish 후 프로세스 중단에도 공개 store API는 committed envelope에서 상태와 Receipt를 함께 읽는다. 재조회는 export 복구를 시도한다. export는 동시 읽기·쓰기에 최신성을 보장하는 정본이 아니며, 반환된 Receipt 경로만으로 저장 성공을 판단하지 않는다. publish 이전 중단의 임시 파일은 조회에서 제외한다. 로컬 파일시스템의 hard-link 원자성과 fsync를 전제로 하며 네트워크 파일시스템·디스크 자체 손상까지 보장하지 않는다.

새 envelope와 export에는 canonical root의 SHA-256 결박이 있으며 다른 root로 복사한 새 기록은 `SKILL_RUN_PROJECT_MISMATCH`로 거절한다. export의 `_storeRootDigest`는 store 메타데이터다. Receipt 소비자는 store API를 통해 메타데이터를 분리한 Receipt를 검증한다. 과거 무바인딩 JSON은 호환 조회가 가능하지만 프로젝트 출처를 입증하지 않는다. 첫 mutation에서 현재 root에 결박하고 이후 envelope를 정본으로 사용한다. 기존 파일을 수정해 새 envelope를 덮어쓰지 않는다.

## CLI

`bun run skill:runtime -- <command>`로 실행한다. 명령은 `registry`, `classify`, `plan`, `start`, `begin`, `request-auth`, `authorize`, `finish`, `monitor`, `receipts`, `receipt`다. `monitor` 출력은 업무 데이터와 로그 원문 없이 Run ID, RPA ID, 현재 Skill, Candidate ID/digest, 승인 상태와 진척만 노출한다.


## 로컬 Workflow 연결

`www workflow check <RPA-ID>` 또는 `bun run skill:runtime -- check-local --root <project> --process <RPA-ID>`는 로컬 참조 사전 검사를 실행한다. `.woo/units.yaml`, 로컬 traceability 원장, 선언된 실제 코드 symbol과 참조를 검사한다. 원격 Linear·Obsidian 및 전체 RPA map 정합을 확인한 것으로 해석하지 않는다. capability에 `_LOCAL_PREFLIGHT`, Receipt context/result에 scope를 남긴다.

`www workflow show <Run-ID>`와 `resume <Run-ID>`는 같은 프로젝트의 결과 조회와 읽기 전용 검사 재개다. TUI에는 `/workflow check`, `/workflow show`, `/workflow resume`으로 연결한다. 중단된 검사는 저장된 subject digest와 Skill registry revision을 다시 확인하고, 바뀌었으면 실패 결과와 새 검사 안내를 남긴다. terminal Run 재개는 거절하고 새 검사를 안내한다. 기존 결과는 show로만 조회하며 외부 효과를 반복하지 않는다. 로컬 검사 실패의 CLI exit status는 nonzero다.

사전 검사의 완료는 로컬 코드 참조 검사에만 해당한다. 기존 rpa-reconcile Skill의 네 표면 확인·복구 후 read-back 수락 계약을 대체하지 않는다. 실제 프로젝트 적용은 로컬 fixture·회귀 검증을 통과한 뒤 별도 읽기 전용 실사용으로 진행한다.

로컬 검사의 registryDigest는 기존 Registry 계약에 따라 저장소 HEAD를 포함한다. 무관한 커밋도 중단 Run의 재개를 보수적으로 거절할 수 있다. 이 경우 Skill 파일 자체가 변경됐다고 단정하지 않고 레지스트리 스냅샷 변경으로 설명한다.
