# WWW 모델 정책과 소유권

이 문서는 WWW 오케스트레이션에서 어느 단계가 어떤 모델을 사용하고, 그 선택이 어디에서 결정되는지 고정한다.

## 단계별 정책

| 단계 | 런타임 소유자 | 기본 모델 | 프로젝트 조정 위치 |
|---|---|---|---|
| Interactive Execution | Native Codex Workbench | `gpt-5.6-sol` | `.www/workbench.yaml`의 `execution` |
| T-note 생성 | Detached Codex generator | `gpt-5.6-luna` | `tnote.model` |
| Activity Narrator | Detached Codex narrator | `gpt-5.6-luna` | `narrator.model` |
| 독립 Review | ReviewService | `claude-opus` alias 또는 Gemini | `review.provider/model` |
| 최종 외부 감사 | 운영 절차의 Opus CLI | `opus` 고정 | 코드 실행 정책과 분리된 증거 절차 |

## 소유권 규칙

- Codex 기본 진입은 legacy Settings의 모델을 startup 입력으로 전달하지 않는다. `execution` YAML이 단일 정책 원본이다.
- `/model` 변경은 `.www/workbench.yaml`에 atomic write한다. 기존 정책 필드는 보존하고 허용 목록 밖 모델은 거절한다.
- Pi compatibility lane만 legacy Settings를 명시 입력으로 사용한다.
- Snapshot은 실제 적용 모델과 `configurationSource`를 함께 노출한다. fallback은 프로젝트 정책으로 표시하지 않는다.
- 모델 alias와 허용 목록은 코드에서 검증한다. YAML은 임의 Provider/모델을 주입할 수 없다.

## 코드에 남는 불변식

redaction, 저장 무결성, 출력 길이, detached review의 tool-free/read-only 경계, 네트워크·권한 안전 상한은 YAML에서 완화할 수 없다. YAML은 프로젝트가 조정할 수 있는 모델 선택과 표시 선호만 소유한다.

## 검증

```sh
bun test test/workbench-config.test.ts test/project-workbench-session.test.ts test/activity-narrator.test.ts
bun run check
bun test
```

Opus 최종 감사와 Windows 운영 증거는 이 문서의 코드 테스트로 대체하지 않는다. 해당 증거가 없으면 Release gate는 BLOCKED로 남는다.
