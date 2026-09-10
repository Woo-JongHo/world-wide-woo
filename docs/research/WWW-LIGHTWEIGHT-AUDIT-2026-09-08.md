# WWW 경량화 조사 — 기능 보존과 강제된 실행 계약

2026-09-08 · 조사 기준 `45aec4adbebcc5abc902d33f8b29cfd6cd796068` · 0.0.16

## 결정 제안

TypeScript/Bun을 유지하면서 렌더링 무효화 범위와 배포 로딩 경계를 먼저 개선한다. 전체 Rust/Go rewrite를 정당화하는 실측은 없다. 사용자가 말한 목적은 자유로운 범용 Agent 확장이 아니라 정형화된 템플릿·실행 절차·검증·기록을 강제하는 서비스다. 이 목적을 Core 계약과 실행 Gate로 구현하고, 부가 실행기를 기본 화면의 비용과 분리한다.

이번 조사에서는 제품 코드를 수정하지 않았다. 이미 진행 중인 RPA 문서·구현·테스트 변경은 조사 대상 변경에 포함하지 않았다. 결과는 합성 시나리오 실측이며 사용자 cmux 세션의 지연 원인 확정이나 개선 완료 판정이 아니다.

## 측정 방법과 한계

- Apple M1, Bun 1.4.0, 현재 로컬 의존성. MB는 번들 표에서 decimal byte 기준이다.
- 기존 `scripts/chat-render-benchmark.ts`의 낡은 `core/domain/work-steps` import를 임시 측정본에서 현재 경로로 교정했다.
- 실제 WorkbenchChatView에 1,000/5,000개의 assistant message와 activity를 넣었다. 긴 본문 조건은 마지막 메시지의 TypeScript 코드 2,000줄이다.
- Chat 단독 30회, 긴 본문 제거 비교와 Dashboard 프레임은 10회. 소표본 탐색치이며 p95를 출시 성능 보장으로 쓰지 않는다.
- 활동 갱신은 `syncActivity`의 표시 문구를 바꾸어 실제 캐시 무효화 경로를 호출한다. 타이머 callback 자체의 종단 간 실측은 아니다.
- Dashboard는 실제 createDashboardLayout + renderLayoutFrame, 140×40에서 scrollTo와 프레임 생성까지 측정했다. Todo/Tracer는 고정 한 줄 fixture다. 터미널 출력·PTY·cmux·실제 Todo/Tracer 부하는 포함하지 않는다.
- 시작 시간은 매회 새 프로세스의 `--version`, 첫 실행 제외 10회다. OS 캐시를 비운 cold start나 Workbench 첫 상호작용 시간은 아니다.
- 로컬 재현 스크립트·번들 metafile·startup 결과: `.www/runtime/performance/2026-09-08/`. 스크립트 import는 조사 머신 경로에 고정되어 있다. 대용량 증거는 Git에서 제외한다.

## 번들 실측

| 방식 | JS entry | 전체 출력(모델 asset 포함) | --version p50 / p95 |
|---|---:|---:|---:|
| 소스 직접 실행 | 해당 없음 | 해당 없음 | 16.72 / 20.26 ms |
| 기본 Bun bundle | 17.60 MB | 19.61 MB | 462.63 / 567.53 ms |
| minify | 9.81 MB | 11.82 MB | 547.80 / 831.68 ms |
| splitting | 8.11 KB | 19.27 MB | 23.36 / 37.00 ms |

`bun build src/cli.ts --target=bun`에 각각 `--minify`, `--splitting`을 적용했다. 모두 --version 0.0.16, exit 0을 확인했다. minify는 전체 출력 약 39.7% 감소를 보였지만 이 실험에서 시작 속도를 개선하지 않았다. splitting의 entry가 작다는 것은 전체 설치가 8KB라는 뜻이 아니다. 두 옵션 결합 및 전체 제품 기능은 아직 검증하지 않았다.

node_modules는 `du -sh` 529M이며 개발 도구·플랫폼 파일 등을 포함한다. 이것을 제품 배포 필수 크기나 런타임 RSS로 해석하지 않는다. Bun executable에 런타임을 포함할 경우 크기도 별도로 측정해야 한다.

metafile의 출력 기여량: elkjs 3.23MB, jiti 2.36MB, pi-coding-agent 1.49MB, highlight.js 1.38MB, pi-ai 1.12MB, gajae AI 1.07MB, WWW src 1.02MB. 상대 규모이며 공유 의존성까지 포함한 삭제 가능 용량은 아니다.

`factory.ts`의 선택적 pi-coding-agent import로부터 extension loader(jiti), interactive rendering 및 Mermaid 관련 의존성이 포함된다. CLI 진입점에는 dynamic import가 이미 존재하므로, 단일 번들과 분할 번들의 비용 차이를 실제 제품 진입별로 검증할 가치가 높다. 기본 Codex lane, pi lane, legacy router, auth, development 명령별 로딩 경계를 감사한다.

## 렌더링 실측

| 조건 | 활동 갱신 p95 | snapshot/draft 갱신 p95 | 폭 70↔100 또는 40↔120 재배치 쌍 p95 |
|---|---:|---:|---:|
| 1,000 messages + 긴 코드 | 135.29 ms | 179.94 ms | 931.30 ms |
| 5,000 messages + 긴 코드 | 212.61 ms | 240.66 ms | 1,186.92 ms |
| 1,000 messages, 긴 코드 없음 | 14.81 ms | 8.44 ms | 58.19 ms |
| 5,000 messages, 긴 코드 없음 | 42.44 ms | 42.69 ms | 223.40 ms |

위 측정본의 resize는 render(70), render(100) 쌍이다. 초기 원본 benchmark의 폭과 혼동하지 않는다. 동일 snapshot/width의 Chat 캐시 조회 p95는 0.03ms 미만이었다. 이를 실제 스크롤 속도로 보고하면 안 된다.

실제 Dashboard 프레임:

| 1,000 messages | 스크롤 p50 / p95 | 활동 갱신 + 스크롤 p50 / p95 |
|---|---:|---:|
| 긴 코드 있음 | 17.66 / 37.52 ms | 161.56 / 252.22 ms |
| 긴 코드 없음 | 10.59 / 23.28 ms | 18.48 / 40.30 ms |

관측한 사실:

1. WorkbenchChatView.syncActivity의 timer는 매 프레임 cachedRows를 비운다. 표시 문구 변경도 같은 전체 캐시 무효화 경로를 탄다.
2. render는 miss 시 전체 activity 인덱스·summary·delegation·message rows를 다시 구성한다. Markdown 객체 캐시가 있어도 renderMessage의 transcriptRows는 각 줄의 폭 처리를 다시 한다.
3. update는 새 snapshot identity에서 전체 행 캐시를 무효화하고 모든 assistant message를 순회한다.
4. SectionDocument는 child array identity가 바뀌면 전체 행을 대조한다. 현재 scroll 모델은 전체 문서 행을 먼저 받아 viewport로 표현한다.
5. 입력 테두리 timer는 focus 중 90ms마다 requestRender한다. 실제 유휴 CPU 기여량은 미측정이다.

해석: 전체 무효화와 긴 본문 반복 처리는 확인된 개선 후보다. 정확히 어떤 함수가 시간을 가장 많이 쓰는지는 CPU profile로 확인해야 한다. O(n²) 반복 검색을 주요 원인으로 확정할 근거는 확보하지 못했다. 긴 코드를 없애는 비교는 원인 범위를 좁히기 위한 것이며 제품 기능 삭제 제안이 아니다.

## 기능을 보존하는 구현 순서

### 1. 활동 표시와 정적 transcript 갱신을 분리

- message ID/revision, width, theme, 공개 상태, 선택 및 summary 의존성별로 최종 행을 캐시한다. 내용·상태·선택이 바뀌면 정확히 무효화한다.
- animation frame 변경은 활동 표시 영역만 갱신한다. 완료·취소·승인 대기 전이를 기존 Runtime 상태에 연결한다.
- cache에는 제한과 eviction이 필요하다. 메모리를 무제한 사용해 속도를 얻지 않는다.
- 원본 message, 전체 history, 코드 블록, source 조회는 보존한다.

### 2. 화면에 보이는 범위를 중심으로 레이아웃

- 안정된 message/block별 높이와 prefix offset을 유지하고 viewport + overscan 범위만 합성한다.
- 화면 밖 기록은 원본에 남기고 스크롤·검색·resume으로 접근 가능해야 한다.
- resize 뒤 읽던 message ID와 block offset을 복원한다. 텍스트 전체 검색 기반 anchor 복원을 점진 대체한다.
- 이 단계는 pi-tui ScrollView 계약의 변경 비용이 있으므로 첫 단계 캐시 최적화 후 판단한다.

### 3. 실행과 표현의 갱신 주기를 분리

- runtime event·approval·receipt는 빠짐없이 순서대로 처리하고 저장한다.
- 표현용 snapshot만 프레임 단위로 병합한다. 중간 animation frame을 합칠 수 있어도 승인·취소·완료 사건을 버려서는 안 된다.
- 하나의 render scheduler에서 활동·테두리·streaming 갱신을 모은다. 비활성 화면 timer를 멈추고 활성 animation은 유지한다.

### 4. 배포와 의존성 로딩 경계

- splitting + minify 후보를 만들고 source/plain bundle과 동일 시나리오로 비교한다.
- 기본 Workbench에 불필요한 pi 확장 로더·legacy router·Mermaid 등을 별도 chunk로 지연 로드한다. 실행 경로에서 실제 필요한 시점에 모든 기존 기능이 동작해야 한다.
- module exports 범위, __dirname/import.meta asset 경로, native .node 및 모델 JSON, CLI auth, plugin discovery를 설치된 artifact에서 검증한다.
- 다른 provider SDK 통합·삭제는 이 작업의 단순 용량 최적화로 처리하지 않는다. 인증·quota·메시지 계약이 다를 수 있다.

## 강제된 템플릿과 제품 목적

정본 흐름은 `Request → 허용 Workflow → Skill Contract → Gate → Tool → Receipt`다. 모델이 요청을 자유롭게 해석해도 실제 실행 허가는 Runtime이 가진다.

- workflow·tool·template는 version이 있는 registry에서 선택한다.
- Gate는 검증 가능한 schema·필수 항목·상태 전이·권한·evidence를 검사한다. 문서에 MUST를 쓰는 것만으로 강제했다고 하지 않는다.
- 기존 선택 기능은 승인된 adapter로 남길 수 있다. 기본 프로세스가 모든 범용 확장기를 미리 로드할 필요는 없다.
- 임의 JS extension이나 임의 execution lane을 금지하는 것은 기능 보존 경량화와 구별되는 제품 정책 변경이다. 이번 조사만으로 제거하지 않는다.
- SQLite는 ID·관계·Receipt 상태를 연결하고, Obsidian은 상세 계약, Linear는 실행 현황을 소유한다. UI는 같은 데이터를 새 정본으로 만들지 않는다.
- 템플릿 강제는 TypeScript에서도 가능하다. Rust/Go의 타입만으로 Agent의 도구 우회나 의미적 정확성이 자동 통제되지는 않는다.

## Rust / Go 결정

| 후보 | 기대 효과 | 해결하지 못하는 부분 / 비용 | 현재 판정 |
|---|---|---|---|
| TS/Bun + 캐시/로딩 경계 | 관측된 재처리 비용과 bundle 부담 직접 감소 | terminal 비용은 별도 측정 | 먼저 수행 |
| TS + Rust hotspot | 측정으로 특정된 ANSI/width/parsing 연산을 native 처리 | FFI·배포·복사 비용, 전체 무효화는 잔존 | profile 뒤 비교 |
| Go Runtime/TUI | process supervision과 배포 모델을 새로 구성 가능 | provider·UI·취소·resume 계약 재구현, GC, terminal I/O | 보류 |
| Rust Runtime/TUI | 메모리·연산 통제와 native 배포 가능 | lifetime·async·FFI·빌드 및 UI migration 비용 | 보류 |
| 전체 rewrite | 경계 전면 재설계 | 의도 누락과 회귀 위험 최대, 성능 개선 수치 없음 | 현재 근거 부족 |

현 코드의 syntax highlighting은 이미 @gajae-code/natives 경계를 사용한다. 이 native 호출의 구현 언어나 비용을 본 조사에서 추가로 확정하지 않았으며, native가 있다는 사실만으로 병목 해결을 가정하지 않는다.

Ratatui도 렌더 시작 시점은 애플리케이션이 관리한다. Bubble Tea도 renderer/frame scheduling을 가진다. 따라서 언어 변경과 불필요한 전체 재계산 제거는 별개의 문제다.

## 다음 검증 Gate

첫 vertical slice: `긴 답변을 읽으며 스크롤 → 활동 표시 갱신 → streaming → 승인 대기 → 완료`. 원본 내용·선택·위치·Todo/Tracer·Summary가 유지되는지 동일 fixture에서 비교한다.

제안 목표(실측 달성값 아님): 140×40, 1,000 messages + 2,000줄 코드에서 프레임 생성 p95 ≤16.7ms, 실제 입력→표시 p95 ≤50ms. 5,000 messages도 측정하되 별도 목표 합의 없이 PASS를 선언하지 않는다.

실제 cmux에서 idle/working CPU, process tree RSS, PTY write bytes/frame, input latency, full startup, resize anchor, session restore를 추가 측정한다. 단위 harness의 RSS를 제품 idle RSS로 재사용하지 않는다. cold startup은 별도 절차가 필요하다.

TS 최적화 후에도 목표 미달이고 CPU profile이 특정 연산을 지목하며 native prototype의 왕복 비용을 포함한 개선이 확인될 때 Rust hotspot을 채택한다. 병목이 terminal I/O나 전체 상태 재계산이라면 먼저 해당 경계를 고친다.

성능 개선은 독립 기능 릴리스가 아니라 다음 기능 버전에 묶는 기존 0.0.N 정책을 따른다. 본 문서는 조사 보고서이며 구현·배포·실사용 검증 완료를 뜻하지 않는다.

## 공식 참고

- Bun bundler/minify/splitting: https://bun.sh/docs/bundler
- Ratatui rendering ownership: https://ratatui.rs/concepts/rendering/
- Ratatui intermediate buffer: https://ratatui.rs/concepts/rendering/under-the-hood/
- Bubble Tea renderer: https://github.com/charmbracelet/bubbletea/blob/main/renderer.go

외부 소스는 비교 구조의 근거다. Rust/Go migration의 WWW 성능 수치는 측정하지 않았다.
