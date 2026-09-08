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
├── .www/runtime/skills/<runId>.json
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

Linear·Obsidian·GitHub PR 쓰기는 전체 Artifact Candidate의 SHA-256 `candidateDigest`가 없는 Native mutation 후보를 버린다. 승인은 해당 digest와 actor에 결박되며, digest가 달라지면 `SKILL_AUTH_STALE`로 중단한다. 성공 Receipt는 최소 하나의 read-back evidence 없이는 만들 수 없다.

Receipt는 `schemas/woo-receipt.schema.json`의 상태 어휘만 사용한다. 저장 전과 조회 시 `receiptDigest`를 다시 계산한다. Run state는 revision CAS와 원자적 rename으로 갱신하며 Receipt는 덮어쓰지 않는다.

## CLI

`bun run skill:runtime -- <command>`로 실행한다. 명령은 `registry`, `classify`, `plan`, `start`, `begin`, `request-auth`, `authorize`, `finish`, `monitor`, `receipts`, `receipt`다. `monitor` 출력은 업무 데이터와 로그 원문 없이 Run ID, RPA ID, 현재 Skill, Candidate ID/digest, 승인 상태와 진척만 노출한다.
