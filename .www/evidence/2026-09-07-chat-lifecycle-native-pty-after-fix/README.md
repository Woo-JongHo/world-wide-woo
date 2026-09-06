# WOO-688 실제 Native·PTY 수정 후 검증

- Linear: `WOO-688`
- Linear UUID: `6336cca1-a828-45b9-ac62-cbaa3b35b7d8`
- 실행일: 2026-09-07 (Asia/Seoul)
- 실행 모델: 실제 `gpt-5.6-sol`, low
- 실행 경로: Codex App Server → ProjectWorkbench → `runProjectWorkbenchShell`

임시 프로젝트와 ephemeral thread, read-only sandbox를 사용했다. 실제 80×36 PTY에 키보드 입력을 보내고 `pyte 0.8.2`로 ANSI 화면을 해석했다. 40·80·120열 resize는 `ioctl`과 `SIGWINCH`로 수행했다. journal은 메모리 구현이므로 재시작 수락 증거는 아니다.

## 결과

- 정상 요청은 사용자 메시지 1개와 assistant 완료 메시지 1개만 만들었다. Native `item/completed`의 `userMessage`는 답변 미수신 메시지로 오인되지 않았다.
- 정상 답변 `안녕하세요 👋 연결 확인`은 40·80·120열에서 유지됐다.
- 두 번째 요청의 live draft를 확인한 뒤 실제 Esc를 입력했다. Native는 `turn/completed`와 내부 `turn.status=interrupted`를 보냈다.
- 최종 Chat projection은 사용자 메시지 뒤에 assistant `cancelled`, `partial=true`, 내용 `1.`을 남겼다. 80열 화면에는 `bori  중단됨`과 부분 본문이 함께 보였다.
- Ctrl+D 종료 후 `steps.json`의 마지막 결과는 `exitCode: 0`이다.

따라서 수정 전 실제 실행에서 확인한 거짓 미수신 bubble과 중단의 incomplete 오분류는 같은 시나리오에서 재현되지 않았다. 실제 provider가 body 없는 agent terminal, late delta, failed terminal을 임의로 발생시키지는 못했으므로 해당 경계는 자동 회귀 범위다. 재시작·스크롤·focus·IME 전체 수락과 최종 Opus 감사도 남아 있다.

원 ANSI, 화면 프레임, 공개 Native refs·종류·상태만 남긴 JSONL, 실행 harness를 함께 보존했다. 내부 reasoning 본문은 기록하지 않았다.

## 보존 하네스 재실행

이 디렉터리에서 아래 명령을 실행한다. `uv`가 격리 환경에 `pyte 0.8.2`를 설치하고, Python runner는 이 디렉터리에 보존된 TypeScript probe를 직접 실행한다.

```sh
uv run --with pyte==0.8.2 -- python 2026-09-07-run-native-pty.py
```

runner는 현재 작업 디렉터리에 의존하지 않고 자신의 파일 위치에서 repository root와 probe를 찾는다. 결과는 기존 관측을 덮어쓰지 않도록 이 디렉터리 아래의 새 `replay-NNN/`에 저장한다. 각 replay의 `source-fingerprints.txt`는 실행 HEAD와 다음 경로를 실행 직전에 기록한다.

- 보존된 TypeScript probe와 Python runner
- Native executor와 application executor port
- `ProjectWorkbench`와 journal activity domain
- Chat status/redaction domain
- 실제 workbench shell과 Chat view

Terra REVISE 뒤의 자체 검증 포함 재실행 정본은 `replay-002/`다. runner는 정상 user/assistant 각각 1개, assistant completed 본문, 40·80·120열 본문 유지, Esc 뒤 cancelled partial과 `중단됨`, 거짓 미수신 문구 부재, Native terminal status `completed → interrupted`, `userMessage` payload shape, probe exit 0을 assertion으로 확인했다.

`replay-001/`은 archive 경로와 고유 출력 생성을 처음 확인한 실행이다. 이후 runner 자체에 위 acceptance assertion을 추가했으므로 최종 재현 판정에는 `replay-002/`를 사용한다.
