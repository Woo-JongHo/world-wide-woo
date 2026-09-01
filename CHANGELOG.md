# Changelog

## 0.1.4 — 2026-09-01

Windows CI에서 드러난 파일·경로·셸 경계를 수정했습니다.

### 수정

- Windows에서는 Git Bash를 사용해 `!command` 터미널 실행기를 시작하도록 변경
- Git Bash의 POSIX 경로 표현과 Windows 네이티브 경로를 모두 수용하도록 테스트 정리
- Windows가 제공하지 않는 POSIX 파일 mode 비트는 제외하되 저장·원자성 검증은 그대로 유지

## 0.1.3 — 2026-09-01

Native 계획과 실제 실행 상태를 각 화면의 역할에 맞게 분리했습니다.

### 수정

- `Todo.md`에 Native 계획을 1계층, 단계별 실행 요약을 2계층으로 자동 동기화
- Chat은 계획 수신 시 pending Step을 미리 펼치지 않고 실제 실행 활동이 들어올 때만 Step 카드를 표시
- Todo 파일 저장은 별도 직렬 큐에서 처리해 Native Chat의 실시간 갱신을 지연하지 않도록 격리
- T-notes는 실시간 진행 표시 없이 작업 후 명시적으로 캡처한 요약만 계속 표시

## 0.1.2 — 2026-09-01

재개한 다중 턴 세션의 Step 경계를 바로잡고 TUI 의미 색상을 정돈했습니다.

### 수정

- `www --resume`에서 이전 턴의 Step ID와 실행 기록이 최신 계획에 합쳐지던 문제 수정
- 채팅 기록은 스레드 전체를 유지하면서 목표·Step·입력 요약은 최신 Native turn만 투영
- 보라 중심 테마를 차콜·청록·스틸·호박색 관제 콘솔 팔레트로 교체
- 초록색은 성공 상태와 추가 diff에만 제한해 상태 의미를 명확히 구분

## 0.1.1 — 2026-09-01

첫 실사용에서 확인된 프로젝트 Workbench의 응답성과 Pane 역할을 바로잡았습니다.

### 수정

- 첫 메시지를 Native thread 생성보다 먼저 표시해 초기 대기 중에도 접수 상태가 즉시 보이도록 수정 (#7)
- Step 카드의 `무엇을 하고 있는지:` 라벨을 제거하고 해석된 문장을 바로 표시 (#5)
- T-notes의 실시간 목표·진행률·Step 표시를 제거하고 완료 후 캡처된 요약만 표시 (#6)
- CLI와 Codex App Server handshake가 같은 package version을 사용하도록 버전 정본 통합

## 0.1.0 — 2026-09-01

첫 번째 프로젝트 레벨 릴리스 기준선입니다. 이전 `0.2.0`은 배포 버전이 아니라
프로토타입 표기였으므로, 제품 버전을 `0.1.0`으로 재기준화했습니다.

### 포함

- 로컬 `www` CLI/TUI 실행 기준선
- 프로젝트별 `.www` 데이터 경계와 세션 보관
- Codex App Server 기반 네이티브 대화 경로 및 3-pane 작업 표면
- T-notes range capture, 프로젝트 `Todo.md` command, 활동 journal과 읽기 전용 교차 검토 경계
- preview/token 뒤 confirm하는 canonical promotion과 exact-digest 외부 review command
- release hygiene의 tracked·untracked product/test scan 및 `test.skip`/`test.only` 차단
- Linux/macOS/Windows core CI와 Windows 플랫폼 검증 진입점

### 릴리스 차단 조건

- macOS 13단계 실제 E2E 증거
- Windows Terminal 실제 입력/렌더링 smoke 증거
- 각 EP-011 Story의 읽기 전용 검토 및 evidence 파일
- Claude Opus 최종 re-review (1차 FAIL 후속 수정은 완료됐으나 최종 판정은 대기)

위 항목은 자동으로 완료 처리하지 않습니다. [v0.1.0 릴리스 절차](docs/RELEASE_V010.md)의
수동 체크를 통과한 뒤에만 배포 가능한 상태로 봅니다.
