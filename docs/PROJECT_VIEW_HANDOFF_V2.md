# WWW Project View — Frontend MVP Handoff v2

> 기능 명세와 독립 디자인 명세를 통합한 v2. 구현 에이전트에게 이 문서 하나를 전달한다.
> 목표는 **실제 실행 가능한 프런트엔드 MVP**다. 설계 설명이나 랜딩 페이지를 만드는 작업이 아니다.
> 실제 DB·Native 연결은 이번 범위에서 제외한다. 단일 목업 데이터 소스를 사용하되, 화면 간 관계와 탐색은 실제로 동작해야 한다.

---

## 0. 구현 지시

기존 저장소가 제공되면 먼저 현재 프런트엔드 구조, 디자인 토큰, 실행 명령을 확인하고 그 환경에 맞춰 구현한다. 기존 TUI 실행 코어는 변경하지 않는다. 새 프런트엔드가 필요한 경우 React + TypeScript를 기본 선택으로 삼되, 이 문서의 목적은 특정 라이브러리를 도입하는 것이 아니다.

계획만 제출하고 멈추지 말고 화면과 상호작용을 구현한다. 정보가 부족한 부분은 아래 목업 시나리오를 사용하고, 실제 프로젝트에서 확인한 사실처럼 표현하지 않는다. 기존 화면·코드가 제공되지 않으면 이를 읽었다거나 그대로 재현했다고 주장하지 않는다.

완성 우선순위는 다음과 같다.

1. 사용자가 제시한 프로젝트 계층과 두 작업 공간을 정확히 표현한다.
2. 정교한 시각 디자인과 편안한 정보 밀도를 확보한다.
3. 구조 → 문서·원칙 → 결정·변경 → 근거 → DB 레코드의 연결이 끊기지 않게 한다.
4. 그다음에 컴포넌트 정리, 반응형 처리, 상태별 마감을 진행한다.

이번에 만드는 것은 범용 관리자 페이지, AI 회사 운영 게임, 일반적인 KPI 대시보드, 또 다른 채팅 앱이 아니다.

---

## 1. 제품 정의와 문제

### 제품 정의

**프로젝트의 큰 축에서 기능·구성·View·구현으로 내려가고, 문서와 원칙의 적용 관계, 감리 결과, DB의 원본 근거를 함께 탐색하는 프로젝트 뷰.**

프로젝트의 일부를 수정할 때 다음 질문에 답할 수 있어야 한다.

- 지금 수정하는 부분은 전체의 어디에 있는가?
- 무엇으로 구성되고, 화면과 코드에 어떻게 연결되는가?
- 어떤 문서와 원칙이 적용 대상으로 지정되어 있는가?
- 어떤 결정이 채택됐으며, 실제 변경과 확인 결과는 무엇인가?
- 이 설명의 근거가 되는 DB 레코드와 RAW 전문은 무엇인가?

### 듀얼 모니터에서의 역할

| 작업 공간 | 역할 |
|---|---|
| 이번에 만드는 Project View | 프로젝트 구조·View·원칙·감리·DB 내용을 이해하고 확인한다. |
| 기존 Native TUI | Native와 소통하고 실제 작업을 요청·실행한다. |

Project View에는 작업용 채팅 입력창이나 에이전트 지휘 기능을 추가하지 않는다. TUI의 화면 미리보기는 제공할 수 있지만, 그것을 또 하나의 실행 가능한 TUI로 만들지 않는다.

---

## 2. 1계층: 세 개의 최상위 진입점

**Service / Assurance / Database**를 항상 보이는 동일한 높이의 최상위 내비게이션으로 둔다.

| 진입점 | 한국어 의미 | 핵심 질문 |
|---|---|---|
| Service | 실제 서비스 | 무엇이 어떻게 구성되어 있는가? |
| Assurance | 감지·감리 | 무엇을 어떤 기준으로 확인했고, 어떤 문제가 있는가? |
| Database | DB 탐색 | 구조화된 데이터와 원문이 실제로 어떻게 저장되어 있는가? |

중요한 구분:

- 프로젝트의 논리적 두 축은 **실제 서비스**와 **감지 시스템**이다.
- **DB 탐색은 이 두 축의 공통 데이터를 직접 보는 1계층 화면**이다. 별도의 세 번째 비즈니스 축으로 오해하게 그리지 않는다.
- 실제 서비스의 `Monitor`는 사용자 기능이다. 프로젝트를 감리하는 `Assurance`와 동일한 시스템으로 합치지 않는다.
- Database를 Settings 안에 숨기거나 작은 디버그 팝업으로 축소하지 않는다.

### 계층 예시

```text
Project: WWW
|
+-- Service
|   +-- Monitor
|   |   +-- Composition
|   |   +-- View
|   |   +-- Implementation
|   +-- Chat
|   |   +-- Composition
|   |   +-- View
|   |   +-- Implementation
|   +-- Dashboard
|       +-- Composition
|       +-- View
|       +-- Implementation
|
+-- Assurance
|   +-- Rule checks
|   +-- Implementation checks
|   +-- View checks
|
+-- Database
    +-- Structure
    +-- Rules & Decisions
    +-- Evidence
    +-- RAW
```

`Composition / View / Implementation`은 기능 영역을 보는 상세 관점이다. 코드 폴더가 실제로 이 이름으로 나뉘어 있다는 뜻은 아니다. Assurance 하위 분류도 이번 MVP의 제안 구조이며 실제 검사기가 이미 있다는 뜻은 아니다.

탐색은 계층적으로 하되 데이터 관계를 단일 부모·자식 트리로 제한하지 않는다. 원칙 하나가 여러 기능에 적용되고, 검사 하나가 여러 영역을 확인할 수 있다.

---

## 3. 이번 MVP의 범위

### 반드시 구현

- 일관된 앱 셸과 최상위 세 진입점.
- Service 전체 구조와 Monitor·Chat·Dashboard의 상세 탐색.
- 구성, 화면 미리보기, 구현 연결, 문서·원칙, 결정의 조회.
- Assurance의 검사 목록·상태·대상·근거 조회.
- Database의 테이블 목록·행 목록·레코드·JSON·RAW 전문 조회.
- 공통 인스펙터와 화면 간 근거 이동.
- 목업 데이터 기반 필터·정렬·선택·복사·탭·앞뒤 이동.
- 데이터가 없거나, 근거가 없거나, 현재 기준과 검사 기준이 다른 상태의 표현.

### 구현하지 않음

- 실제 DB 서버, SQL 마이그레이션, 실제 JSONL 수집기.
- Native 프로세스 실행·중단, Git 훅, 실제 저장소 분석.
- LLM을 이용한 결정 자동 추출·자동 승인.
- 실제 코드 검증 엔진이나 런타임 지침 로딩 추적.
- 로그인, 권한 관리, 협업, 댓글, 알림, 결제, 배포 시스템.
- DB 레코드 편집·삭제, SQL 실행 콘솔.
- 복잡한 자유 배치 그래프 편집기, 3D 조직도.

설계는 향후 연결을 막지 않도록 하되, 미래 기능을 구현하느라 뷰 MVP가 커지지 않게 한다.

---

## 4. 디자인 명세 — Structure Desk

> v2 제안 디자인. 첨부된 스타일 레퍼런스는 명세 형식과 상세도만 참고한다.
> 레퍼런스의 팔레트·폰트 크기·검은 배경·파티클·브랜드 이미지를 복제하지 않는다.
> 아래 명세가 이전 버전의 디자인 방향·토큰·공통 셸을 전부 대체한다.
> 본문의 크기와 색상은 이번 MVP를 위한 제안 수치다. 제품 기능·데이터 의미·구현 범위는 다른 절을 유지한다.

### 4.1. Design thesis — 무엇이 달라 보여야 하는가

**카드로 정보를 요약하는 대시보드가 아니라, 프로젝트의 구조를 펼쳐 놓은 정교한 편집 작업대.**

따뜻한 회백색 바탕 위에서 단정한 글자, 정렬된 열, 작은 인덱스, 책임 범위를 나타내는 괄호선이 계층을 만든다. 강조색은 선택과 이동에만 제한적으로 사용한다. 화면의 개성은 색상 효과가 아니라 **구조가 곧 레이아웃이 되는 방식**에서 나온다.

브랜드 인상을 설명하는 세 단어는 **정밀함 / 여유 / 근거**다. 장식적인 도면, SF 관제실, 일반적인 관리자 템플릿이 아니다. 종이 질감·노이즈·격자무늬를 배경에 넣어 분위기를 만들지 않는다.

#### 사용 맥락

한쪽 모니터에서는 이 뷰로 프로젝트를 확인하고, 다른 모니터에서는 기존 TUI로 Native와 소통한다. 이 앱에는 채팅 입력창, 에이전트 실행 버튼, 비용 카드, 팀 조직도를 추가하지 않는다.

#### 눈에 남아야 할 세 가지 표현

1. **Structure bands:** Service의 기능을 동일한 둥근 카드가 아니라 인덱스와 열이 정렬된 넓은 구조 행으로 표현한다.
2. **Scope brackets:** 괄호선과 들여쓰기로 소속·책임 범위를 표현한다. 실제 데이터 관계가 없는 연결선은 그리지 않는다.
3. **Evidence anchors:** 문서·원칙·결정·검사·RAW의 ID를 조용하지만 명확한 탐색 링크로 표현한다. 장식 배지가 아니다.

색을 제거해도 선택한 대상과 계층이 식별되어야 한다. 색상을 바꿨을 뿐인 기본 컴포넌트 모음은 목표가 아니다.

---

### 4.2. Information grammar — 디자인이 지켜야 할 의미

#### 최상위 내비게이션

`01 Service` / `02 Assurance` / `03 Database`를 같은 위계의 텍스트 탭으로 항상 노출한다.

- 논리적인 두 축은 실제 서비스와 감지·감리 시스템이다.
- Database는 두 축의 공통 데이터에 접근하는 최상위 화면이다. 세 번째 사업 영역이나 하위 모듈로 그리지 않는다.
- Service의 `Monitor`와 Assurance를 동일한 대상으로 묶지 않는다.

#### 화면 제목과 용어

앱 셸·탭·테이블명·ID는 영어를 기본으로 한다. 책임 설명·판정 이유·문서·전문은 한국어를 자연스럽게 읽을 수 있도록 설계한다. 레이블을 맞추려고 원문을 번역하거나 요약해서 대체하지 않는다.

`Composition / View / Implementation`은 구성·화면·구현이라는 상세 관점이다. 모듈 상세의 기본 탭은 기능 명세대로 `Overview / Composition / View / Principles / Decisions`를 유지하고, 구현 참조는 Overview·Composition·인스펙터에서 확인한다.

#### 합치면 안 되는 상태

| 정보 | 서로 구분해서 표시할 상태 |
|---|---|
| 결정 | 제안 / 채택 / 기각 / 대체됨 |
| 구현 연결 | 연결된 변경 없음 / 변경 연결됨 |
| 확인 결과 | 미확인 / 통과 / 실패 / 재확인 필요 |
| 원칙의 흐름 | 문서 참조 / 적용 대상 지정 / 실행 입력 포함 근거 / 구현 확인 결과 |

`채택됨 · 변경 연결됨 · 확인 실패`가 한 화면에서 모순 없이 보이도록 한다. Commit이 있다는 이유로 전체를 녹색 완료 상태로 만들지 않는다.

---

### 4.3. Tokens — Colors

이번 안은 **라이트 테마 한 가지**다. 코드·JSON·RAW 기술 출력·TUI 프리뷰에만 어두운 기술 표면을 사용한다. 테마 전환 기능은 만들지 않는다.

| Token | Value | Role |
|---|---|---|
| `--canvas` | `#F4F3EE` | 앱 전체의 중성적인 배경 |
| `--surface` | `#FDFCF9` | 주요 읽기 영역과 테이블 |
| `--surface-muted` | `#ECEEE8` | 열 헤더, 짧은 보조 영역 |
| `--surface-hover` | `#E9EDE6` | 행·텍스트 내비게이션의 hover |
| `--ink` | `#252D28` | 본문·제목·핵심 수치 |
| `--ink-secondary` | `#566159` | 설명과 중요한 보조 정보 |
| `--ink-muted` | `#657068` | 시각·경로 보조·메타데이터 |
| `--line` | `#D7DCD2` | 장식적 구분선, 표의 행 분리 |
| `--control-border` | `#7C897E` | 입력 필드처럼 경계가 필요한 요소 |
| `--accent` | `#245C4F` | 선택, 활성 탭, 주요 탐색 동작 |
| `--accent-soft` | `#E0ECE4` | 선택한 행·프리뷰 영역 |
| `--focus` | `#245C4F` | 키보드 포커스 |
| `--pass` / `--pass-bg` | `#2F684B` / `#E8F1E9` | 통과한 검사에 한정 |
| `--review` / `--review-bg` | `#805616` / `#F5EEDC` | 검토가 필요한 항목 |
| `--fail` / `--fail-bg` | `#A13D32` / `#F8E8E4` | 확인된 검사 실패 |
| `--stale` / `--stale-bg` | `#4E6375` / `#E8EEF3` | 현재와 검사 리비전이 다름 |
| `--unknown` / `--unknown-bg` | `#606B64` / `#ECEEE8` | 미확인·근거 없음 |
| `--code-bg` | `#19221E` | JSON·코드·TUI 프리뷰 |
| `--code-ink` | `#E7EEE7` | 기술 표면의 기본 글자 |
| `--code-muted` | `#A8B7AB` | 기술 표면의 줄 번호·설명 |
| `--code-focus` | `#A9D0B6` | 기술 표면의 포커스·선택 윤곽 |

#### 색상 사용 규칙

- 화면의 대부분은 중성색으로 유지한다. 큰 영역을 강조색으로 채우지 않는다.
- 모듈마다 다른 브랜드 색상을 부여하지 않는다. Monitor·Chat·Dashboard는 같은 제품이다.
- 선택은 색뿐 아니라 세로 표시선·밑줄·선택 문구로도 드러낸다.
- 문서의 원칙 적용과 검사 통과를 같은 초록 표시로 표현하지 않는다.
- 실패는 해당 검사·증거 위치에 표시한다. 실패 한 건 때문에 모듈 전체 배경을 빨갛게 칠하지 않는다.
- `--line`은 컨트롤의 유일한 식별 수단이나 포커스 표시로 쓰지 않는다.
- 일반 크기의 글자는 배경 대비 4.5:1 이상, 중요한 컨트롤 식별·포커스는 3:1 이상을 구현 검수 기준으로 삼는다. 실제 조합을 확인한다.

---

### 4.4. Tokens — Typography

#### Font families

| Role | Family |
|---|---|
| UI·한국어 설명 | `'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` |
| ID·경로·리비전·JSON·명령 | `'JetBrains Mono', 'SFMono-Regular', Consolas, monospace` |

기존 프로젝트에 적절한 폰트가 있으면 먼저 사용한다. 위 폰트가 없더라도 시스템 폰트로 즉시 동작해야 한다. 폰트 파일은 설치·사용 조건을 확인한 후 프로젝트 방식으로 제공하며, 외부 CDN 로딩을 실행의 필수 조건으로 만들지 않는다.

#### Type scale

| Token | Size / Line height | Weight | Tracking | Usage |
|---|---|---|---|---|
| `--type-project` | 40 / 46px | 500 | -0.025em | Service 최초 구조 화면의 제목 |
| `--type-page` | 30 / 38px | 500 | -0.02em | Chat·Assurance 상세 제목 |
| `--type-module` | 23 / 30px | 500 | -0.015em | 구조 행의 Monitor·Chat·Dashboard |
| `--type-section` | 17 / 24px | 600 | -0.01em | 구성·문서·검사 상세 구획 |
| `--type-body` | 14 / 22px | 400 | 0 | 책임 설명·판정 이유 |
| `--type-reading` | 15 / 25px | 400 | 0 | 긴 문서·한국어 전문 |
| `--type-table` | 13 / 20px | 400 | 0 | 그리드·필드·RAW 메타데이터 |
| `--type-label` | 12 / 18px | 500 | 0.01em | 작은 인덱스·열 제목 |
| `--type-code` | 13 / 21px | 400 | 0 | 코드·JSON |

#### Typography rules

- 제목은 약간 큰 크기와 배치로 구분한다. 모든 제목을 700 이상으로 굵게 만들지 않는다.
- 한국어 본문은 200·300처럼 얇게 만들지 않는다. 큰 영문 제목 규칙을 작은 한국어에 그대로 적용하지 않는다.
- 테이블의 시각·수치에는 `font-variant-numeric: tabular-nums`를 사용한다.
- 본문을 전부 고정폭으로 만들지 않는다. 기술 값과 설명 문장의 질감을 구분한다.
- 긴 경로는 목록에서 생략할 수 있지만 전체 경로는 상세·키보드 접근 가능한 정보에서 읽고 복사할 수 있어야 한다.
- 장문의 RAW가 사람 대화라면 UI 폰트와 `white-space: pre-wrap`으로 표시한다. JSON·명령·diff는 고정폭이다. 어느 경우에도 원본 문자열을 바꾸지 않는다.

---

### 4.5. Tokens — Spacing, Shapes, Surfaces

#### Spacing scale

기본 단위는 4px이다. `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`를 사용한다.

| Usage | Value |
|---|---|
| 값과 작은 상태 표시 | 4–8px |
| 관련 필드·액션 사이 | 8–12px |
| 목록 행 내부 | 12–16px |
| 구획 내부 여백 | 16–24px |
| 주요 구획 사이 | 24–32px |
| Service 바깥 여백 | 32px, 넓은 화면에서는 최대 48px |

#### Density

**구조를 볼 때는 여유 있게, 데이터를 읽을 때는 촘촘하게.** 두 화면에 동일한 패딩을 강제하지 않는다.

- Structure band: 높이 120–152px. 모바일에서는 내용 높이에 맞게 늘린다.
- Database row: 기본 40px, 긴 값이 필요한 행은 48px 이상 또는 상세로 분리한다.
- 메타데이터 key/value: 행 높이 최소 32px, 긴 내용은 자동 높이.
- 본문 설명: 한 줄 너비 60–78ch. 화면이 넓다고 전문을 끝까지 가로로 늘리지 않는다.

#### Shapes

| Element | Radius |
|---|---|
| 구조 행·테이블·구획 | 0px, 기본적으로 별도 둥근 용기 없음 |
| 버튼·입력 | 6px |
| 작은 상태 레이블 | 4px |
| 프리뷰 프레임·기술 영역 | 8px |
| 메뉴·다이얼로그 | 8px |

#### Surfaces and elevation

| Level | Expression | Purpose |
|---|---|---|
| Base | `--canvas`, shadow 없음 | 앱 전체 |
| Reading | `--surface`, 필요할 때 얇은 선 | 문서·구조·표 |
| Selected | `--accent-soft` + 2px 표시선 | 선택된 행과 대상 |
| Technical | `--code-bg` | 코드·JSON·TUI |
| Overlay | `--surface` + 경계 + 작은 그림자 | 메뉴·좁은 화면의 인스펙터 |

기본 카드 그림자를 만들지 않는다. 오버레이에만 `0 12px 36px rgb(25 34 30 / 12%)` 정도를 허용한다. 글래스모피즘, 배경 블러, 글로우, 그라데이션 테두리는 사용하지 않는다.

---

### 4.6. Layout — 같은 셸, 서로 다른 작업 공간

#### Common shell

검토 기준은 **1440 × 900 / 1920 × 1080**이다. 아래 크기는 화면 배치의 기준이며 글자 확대나 내용 길이에 따른 확장은 허용한다.

- Context bar: 기본 56px. 왼쪽에 `WWW / Project View`, 오른쪽에 `MOCK · READ ONLY`, 브랜치·리비전.
- Primary navigation: 기본 44px. `01 Service / 02 Assurance / 03 Database`. 텍스트 탭과 활성 밑줄.
- Status footer: 기본 28px. 데이터 스냅샷과 타임존 등 꼭 필요한 정보만 표시.
- 본문은 남는 높이를 사용한다. 장식용 히어로·환영 문구를 넣지 않는다.
- Service 전체에는 고정 왼쪽 사이드바를 두지 않는다. 대상별 내비게이션은 필요한 화면에서만 나타난다.
- 인스펙터는 선택했을 때만 나타난다. 선택 전 빈 패널을 상시 예약하지 않는다.
- 1440px에서는 인스펙터 폭 352px, 1920px에서는 384px를 기준으로 한다. 중앙 작업 영역이 지나치게 좁아지면 서랍으로 전환한다.

#### Responsive behavior

1280px 이하에서는 인스펙터를 모달 서랍으로 전환하고 문맥 내비게이션을 접을 수 있게 한다. 900px 이하에서는 Service 구조 행을 세로로 재배치하고, Database는 테이블 → 행 → 상세 순차 탐색으로 바꾼다. 앱 전체의 가로 스크롤 대신 테이블·코드처럼 필요한 영역에만 내부 스크롤을 허용한다.

본문 확대 시 겹침을 막기 위해 고정 높이를 강제하지 않는다. 넓은 화면에서는 콘텐츠 면적을 늘리되 본문 문장 너비는 제한한다.

#### A. Service — Structural index

**첫 화면의 주인공은 구조다. KPI가 아니다.**

```text
WWW / Project View                                   MOCK · main / 4f2c9a1
01 Service          02 Assurance          03 Database

Service                               Business logic · 3 modules

     MODULE             RESPONSIBILITY / COMPOSITION          EVIDENCE
 ┌   01 Monitor         Run state, usage, execution list       CHK-012
 │                      Runs · Status · Usage                  Checked scope passed
 │
 ├   02 Chat            Conversation and tool activity         CHK-014
 │                      Input · Stream · Activity · Rail       Verification failed
 │
 └   03 Dashboard       Cross-project summaries                No current check
                        Projects · Today · Summary             Not checked

Recent structural change          DEC-014 → COM-014 → CHK-014
```

레이아웃 지시:

- 40px 제목과 한 줄 책임 설명 다음에 모듈 세 개의 구조 행을 배치한다.
- 화면 너비에 따라 인덱스 48px, 모듈 이름 180–220px, 구성 설명 가변, 근거 200–240px로 정렬한다.
- 구성요소는 작은 텍스트와 가벼운 구분점으로 표시한다. 둥근 칩 수십 개를 만들지 않는다.
- 괄호선은 Service 소속을 나타낸다. 모듈 간 데이터 흐름처럼 화살표를 붙이지 않는다.
- 행 전체를 중첩 버튼으로 만들지 않는다. 모듈 제목은 상세 이동 링크, 근거 ID는 인스펙터를 여는 별도 버튼이다.
- 아래 변경 목록은 두세 건의 보조 정보다. 타임라인이 메인 구조를 압도하지 않는다.

#### B. Module detail — Chat

상단에 `Service / Chat` 경로, 모듈 제목, 책임을 둔다. 작은 문맥 내비게이션으로 Monitor·Chat·Dashboard를 전환하고, 그 아래에 상세 탭을 둔다.

- Overview: 책임·입출력·경계를 문서형으로 배치한다. 필드를 각각 카드로 감싸지 않는다.
- Composition: 왼쪽 240px 내외의 구성 인덱스 + 오른쪽 관계와 구현 정보. 행 선택은 같은 component ID를 사용한다.
- View: 프리뷰가 본문의 약 2/3 이상을 사용하고, 오른쪽에 폭 240–280px의 Annotation rail을 둔다. 기술 인스펙터를 동시에 열면 Annotation을 인스펙터와 합치거나 서랍으로 바꾼다. 4개 패널을 좁게 밀어 넣지 않는다.
- Principles: 문서와 적용 관계를 읽는 화면. 아래 C 규칙을 따른다.
- Decisions: 결정 제목·범위·이유, 채택/변경/확인의 세 줄, 근거 링크. 노란색·녹색 배지 덩어리로 만들지 않는다.

##### View의 시그니처

TUI 프리뷰는 단 하나의 큰 프레임이다. 브라우저 목업의 빨강·노랑·초록 창 버튼은 넣지 않는다. 상단에 `Chat / Mock preview / revision`만 작은 기술 레이블로 표시한다.

구성요소를 선택하면 해당 영역에 1px 윤곽과 작은 번호를 표시한다. 옆 주석의 번호도 같이 강조한다. 전체를 네온색으로 칠하거나 별도 미니카드로 분해하지 않는다.

실제 실행을 조작할 수 있다는 오해를 피하기 위해 프리뷰 내부 입력은 비활성 도형으로 표현한다. 구성요소 선택은 외부 Annotation 버튼으로 제공하고, 캡처된 실제 화면이 없다면 Mock preview임을 명시한다.

#### C. Principles — Document and application map

문서 발췌, 적용 대상, 검사 근거를 나란히 읽는 문서형 레이아웃이다.

- 위쪽: 선택된 원칙 문장과 문서 위치·리비전.
- 왼쪽 또는 가운데 넓은 영역: 실제 목업 문단. 관련 범위만 아주 옅게 강조한다.
- 오른쪽: 적용 대상 목록, 구현 참조, 검사·실행 근거.
- 아래쪽: `참조됨 → 적용 대상으로 지정됨 → 구현과 연결됨 → 검사 결과 있음`의 관계를 보여주되 각 연결에 관계 종류를 명시한다.
- 실행 입력 포함 여부는 별도 근거 행으로 표시한다. 문서 참조가 곧 런타임 로딩이라는 식으로 그리지 않는다.

실선은 저장된 관계, 점선은 제안된 관계를 뜻하도록 범례를 둔다. 점선도 실제 제안 레코드가 있을 때만 그린다. **선 모양이 통과/실패 판정을 뜻하지는 않는다.**

#### D. Assurance — Findings desk

일반 대시보드가 아니라 검사 기록과 증거를 검토하는 작업대다.

- 왼쪽 300–336px: 필터와 검사 목록. 각 행은 상태 문구·대상·검사명·리비전.
- 가운데 남은 영역: 선택한 검사의 실제 근거. 코드 참조·diff·문서 문단·판정 이유.
- 상세 상단: `검사한 리비전`과 `현재 보고 있는 리비전`을 함께 표시한다.
- 상세 아래: 적용된 기준, 관련 결정, RAW·DB 링크를 세로로 읽는다.
- 별도의 큰 오른쪽 인스펙터를 항상 추가하지 않는다. 선택한 검사 상세가 그 역할을 한다.
- 통과·실패 건수는 목록 도구 모음의 작은 텍스트 집계다. 원형 게이지·도넛·4개 KPI 카드는 없다.

실패 결과의 제목만 색으로 명확히 표시하고 근거는 읽기 좋은 중성 배경을 유지한다. diff는 변경된 줄에만 추가·삭제 표시와 배경을 적용한다.

#### E. Database — Records workspace

이 화면만은 테이블 중심의 3분할을 적극적으로 사용한다.

```text
Tables / 216px          Records / flexible                 Detail / 352px
──────────────────     ───────────────────────────────    ─────────────────────
Structure              raw_events                         RAW-014
  project_nodes        Search       Filter       Schema   Fields JSON Relations
  relations            12 records                         Transcript
Rules & Decisions      ID       Kind       Session        
Evidence               RAW-013  assistant  SES-001         Raw text, preserved
RAW                    RAW-014  user       SES-001   ←     Source order: 14
  raw_sessions                                            Related: DEC-014
  raw_events                                              Copy raw
```

- 테이블 목록·레코드 그리드·레코드 상세가 동일한 데이터 선택 상태를 공유한다.
- 선택 전에는 상세 패널을 닫고 그리드를 넓게 쓴다.
- 테이블에는 필요에 따른 구분선을 사용한다. 카드 없는 디자인을 이유로 열과 행의 식별을 없애지 않는다.
- 열 제목은 작은 대문자가 아니라 실제 컬럼명으로 표시한다. ID·시각·nullable 값을 정렬한다.
- `null`, 빈 문자열, 0, false를 서로 다른 값으로 표시한다.
- 상세에는 JSON·필드·관계·전문을 제공한다. 전체 화면에 또 다른 별도 인스펙터를 추가하지 않는다.
- JSON은 기술 표면, 긴 한국어 전문은 읽기 표면을 기본으로 한다. 본문은 원문 그대로 유지한다.
- 검색 결과 없음·전문 없음·끊긴 참조를 각각 다르게 디자인한다.
- Schema는 목업 타입·참조 정보를 보여주는 읽기 전용 화면이며 SQL 입력창을 넣지 않는다.

---

### 4.7. Components — 구체적인 계약

#### 7.1 Primary navigation

**Role:** 최상위 세 화면 이동.

높이 44px 기준, 탭 사이 32px, 각 탭은 인덱스와 이름으로 구성한다. 활성 탭은 진한 글자와 아래 2px 선, 비활성은 보조 글자다. 배경을 채운 pill이나 분리된 버튼 세 개로 만들지 않는다. 실제 페이지 이동에는 링크와 `aria-current="page"`를 사용한다.

#### 7.2 Structure band

**Role:** 모듈 한 개의 책임과 하위 구성을 비교 가능한 행으로 표시.

기본은 투명 배경과 아래 구분선. hover에는 작은 표면 변화만, 선택에는 왼쪽 2px 표시선과 소프트 배경을 사용한다. 경계선은 소속 구조이고 작은 상태 문구는 감리 결과다. 둘을 같은 색상 체계로 합치지 않는다.

#### 7.3 Evidence anchor

**Role:** 원칙·결정·Commit·검사·RAW의 근거 이동.

`PRN-003`, `DEC-014`, `RAW-014`처럼 고정폭 ID와 짧은 설명을 표시한다. 색상만으로 클릭 가능함을 전달하지 않고 기본 밑줄 또는 일관된 링크 표시를 사용한다. hover·focus에서는 출처 종류와 제목을 보여줄 수 있지만 핵심 정보가 tooltip에만 있으면 안 된다.

인스펙터를 여는 동작은 버튼, 다른 페이지로 이동하는 동작은 링크로 구현한다. 끊긴 참조는 가짜 링크가 아니라 ID와 확인 불가 문구를 표시한다.

#### 7.4 Decision triad

**Role:** 채택·코드 연결·검사 결과를 합치지 않고 읽게 한다.

세 개의 KPI 카드가 아니라 왼쪽 레이블과 오른쪽 값의 세 줄이다. 레이블 열 너비 80–96px, 행 간격 8px. `채택됨 / COM-014 연결 / CHK-014 실패`가 기본 목업 사례다. 한 개의 상태 배경으로 전체를 감싸지 않는다.

#### 7.5 View annotation

**Role:** 프리뷰의 구성과 구현 관계 확인.

2자리 번호, 구성명, 한 줄 책임으로 이루어진 목록. 선택 번호가 프리뷰 영역 번호와 대응한다. 핫스폿 좌표는 view 데이터에서 제공하고 하드코딩한 설명 문자열을 여러 컴포넌트에 반복하지 않는다.

#### 7.6 Record grid

**Role:** 실제 목업 행을 비교·선택.

기본 행 높이 40px, ID 왼쪽 정렬, 수치 오른쪽 정렬, 시각 고정폭. 헤더 고정과 내부 가로 스크롤을 지원한다. 첫 구현은 의미 있는 HTML table을 우선하고, 스프레드시트처럼 보이게 하려고 검증하지 않은 grid 키보드 모델을 얹지 않는다.

행 선택 링크/버튼은 키보드로 접근 가능하게 한다. 페이지 이동 ID와 행 선택 동작을 중첩시키지 않는다. 검색어·정렬·행 선택은 뒤로 이동 후 복구한다.

#### 7.7 Inspector / reading panel

**Role:** 선택한 대상의 근거를 현재 문맥 옆에서 읽기.

헤더에는 대상 종류, 제목, ID, 닫기. 본문에는 핵심 설명 → 필드 → 관계 → 원문 이동 순서. 기본적으로 높이에 맞춰 내부 스크롤한다. 화면별로 인스펙터는 하나만 사용한다.

넓은 화면의 고정 보조 패널은 강제로 포커스를 가두지 않는다. 좁은 화면의 모달 서랍은 포커스를 관리하고 Escape로 닫은 뒤 원래 버튼으로 돌린다.

#### 7.8 Read-only marker

**Role:** 데이터 출처와 조작 범위의 정직한 표현.

`MOCK`, `READ ONLY`, snapshot revision은 작은 글자지만 충분히 읽히게 표시한다. 가짜 `Live` 점, 자동으로 오르는 카운터, 가짜 수집 중 애니메이션은 넣지 않는다.

---

### 4.8. Interaction, Motion, and States

#### Interaction

- 링크는 이동, 버튼은 선택·열기·복사 같은 동작에 사용한다.
- 복사 성공을 확인한 후에만 완료 메시지를 표시한다. 실패하면 복사 실패를 알린다.
- 문서·원칙·RAW 이동 후 돌아오면 원래 선택과 스크롤 문맥을 복원한다.
- 토글·정렬·필터를 만들었으면 실제로 동작해야 한다. 구현하지 않는 기능은 비활성 버튼으로 장식하지 않는다.

#### Motion

hover/focus 색 전환 100–140ms, 인스펙터 전환 160–200ms를 기준으로 한다. 화면 전체 등장 애니메이션, 순차 카드 팝업, 부유하는 점은 없다. 모션 축소 설정에서는 불필요한 전환을 제거한다. 포커스 표시와 내용 노출을 애니메이션 종료까지 지연시키지 않는다.

#### State copy

| State | Copy and treatment |
|---|---|
| 선택 없음 | 무엇을 선택하면 어떤 근거를 볼 수 있는지 짧게 안내 |
| 결과 없음 | 검색어·필터를 표시하고 초기화 동작 제공 |
| 전문 없음 | `이 레코드에는 전문이 없습니다.` 요약으로 바꿔 넣지 않음 |
| 미확인 | `확인 기록 없음` — 중성 표시 |
| 오래된 검사 | `재확인 필요` + 두 리비전 |
| 연결 끊김 | 원래 ID와 확인 불가 사유 유지 |
| 오류 | 실패한 작업 범위와 재시도 가능한 실제 동작만 표시 |

---

### 4.9. Do / Don't — 안티 템플릿 규칙

#### Do

- 기능 계층은 여백·인덱스·괄호선으로, 데이터는 열·정렬·구분선으로 보여준다.
- 모듈 구성, 검사 근거, 테이블을 서로 다른 레이아웃으로 표현한다.
- 큰 View 하나와 그에 연결된 주석을 정교하게 만든다.
- 중요한 값은 충분한 대비로 표시하고, 장식선만 조용하게 처리한다.
- 원문·경로·한국어·실패·미확인 같은 실제 길이와 상태를 디자인 검토에 사용한다.
- 사용자가 해당 설명의 원본까지 이동할 수 있도록 ID를 실제 연결한다.

#### Don't

- 기존 관리자 템플릿에 색상만 바꾸고 끝내지 않는다.
- 상단에 KPI 카드 4개, 원형 차트, 최근 활동 피드를 기본 공식처럼 넣지 않는다.
- 모든 화면을 동일한 사이드바 + 카드 그리드로 만들지 않는다.
- 큰 모서리·두꺼운 그림자·아이콘 배경 사각형을 모든 항목에 반복하지 않는다.
- 검은 배경·보라색·파티클 등 첨부 레퍼런스의 비주얼을 차용하지 않는다.
- 랜딩 페이지형 초대형 문구나 필요 없는 스크롤 섹션을 만들지 않는다.
- 읽어야 할 내용을 지나치게 흐리게 해서 고급스러움을 흉내 내지 않는다.
- 조직도·무제한 그래프·3D를 더해 제품 목적을 바꾸지 않는다.
- 사진·장식 일러스트·로봇 아이콘·반짝이·그라데이션을 도입하지 않는다.
- 출처 없이 만든 그래프 연결, 실제로 수집하지 않은 실시간 상태를 표시하지 않는다.

---

### 4.10. Agent Prompt Guide — 구현 지시 예시

#### Overall prompt

> WWW Project View를 라이트 테마의 ‘Structure Desk’로 구현한다. 일반 대시보드가 아니라 프로젝트 구조와 증거를 읽는 도구다. 중성적인 회백색 바탕, 진한 글자, 절제된 녹색 선택색, 인덱스·열 정렬·괄호선으로 계층을 표현한다. 기본 카드 그리드는 사용하지 않는다. 최상위 Service·Assurance·Database는 유지하되 Service는 구조 행, Assurance는 검사 목록과 증거, Database는 테이블 탐색기로 각각 다른 읽기 방식을 가진다. 모든 정보는 기존 단일 목업 소스에서 가져오며 기존 Native TUI 코어는 변경하지 않는다. 디자인 시안 이미지가 아니라 탐색 가능한 프런트엔드를 구현한다.

#### Service screen prompt

> 1440×900 앱 화면. 56px context bar, 44px top navigation, 32px 본문 여백. 제목 Service는 40px/500. Monitor·Chat·Dashboard를 세 개의 넓은 구조 행으로 배치한다. 각 행은 인덱스, 모듈 이름, 책임·구성, 검사 근거의 정렬된 열을 가진다. 왼쪽 괄호선은 동일 Service 소속을 보여준다. 큰 카드 테두리나 그림자는 없다. Chat의 검사 실패를 작은 텍스트·표시로 보여주고 전체를 빨갛게 칠하지 않는다. 실제 근거 버튼과 상세 링크가 동작해야 한다.

#### Chat View prompt

> 상단에 Service / Chat 경로와 책임을 표시하고, View 탭 아래에 큰 TUI Mock preview를 배치한다. 프리뷰의 왼쪽은 대화·도구 작업, 오른쪽은 PLAN / PROGRESS / TEST 레일이다. 7단계는 입력 영역 가까이에 둔다. 어두운 프리뷰 밖에는 밝은 주석 레일이 있으며 같은 component ID 선택으로 영역을 강조한다. 제목·문서·근거를 보기 좋게 정렬하되 또 다른 작동하는 채팅 앱을 만들지 않는다.

#### Principles prompt

> 원칙 PRN-003을 중심으로 실제 목업 문서 발췌와 적용 대상을 연결한다. 문서 참조, 적용 대상 지정, 실행 입력 포함 근거, 구현 검사 결과를 각각 별도 필드로 표시한다. 부드러운 종이색 읽기 영역, 줄 번호·리비전·ID의 기술 레이블, 얇은 관계선으로 구성한다. 글로우나 파티클은 없다. 흐름도에 표시된 모든 연결은 관계 레코드를 가져야 한다.

#### Assurance prompt

> 왼쪽 검사 인덱스와 가운데 넓은 증거 영역으로 구성한다. CHK-014 실패를 선택하면 현재 리비전과 검사 리비전, 남아 있는 Native 필드 직접 참조의 목업 diff, 관련 PRN-003·DEC-014 링크가 나타난다. 통과율 도넛이나 큰 통계 카드는 만들지 않는다. 검사하지 않은 영역을 정상으로 표시하지 않는다.

#### Database prompt

> 테이블 216px, 레코드 가변, 선택 상세 352px로 구성한 밝은 데이터 탐색기. raw_events에서 RAW-014가 선택된 상태를 만든다. 실제 컬럼 헤더, 40px 행 높이, 충분한 본문 대비, 얇은 구분선을 사용한다. 오른쪽은 Fields / JSON / Relations / Transcript 탭이며 전문은 원문을 보존한다. 객체·null·false·빈 문자열을 구분한다. 검색·정렬·선택·복사·참조 이동은 실제로 동작해야 한다. SQL 콘솔이나 DB 편집 기능은 만들지 않는다.

---

### 4.11. Quick Start — CSS and semantic component examples

아래 코드는 CSS 프레임워크에 종속되지 않는 시작점이다. 현재 저장소의 토큰·컴포넌트 체계에 맞춰 적용한다. 예시는 완성 앱이나 확정된 파일 구조가 아니다.

#### CSS tokens and base components

```css
:root {
  color-scheme: light;
  --canvas: #F4F3EE;
  --surface: #FDFCF9;
  --surface-muted: #ECEEE8;
  --surface-hover: #E9EDE6;
  --ink: #252D28;
  --ink-secondary: #566159;
  --ink-muted: #657068;
  --line: #D7DCD2;
  --control-border: #7C897E;
  --accent: #245C4F;
  --accent-soft: #E0ECE4;
  --focus: #245C4F;
  --pass: #2F684B;
  --pass-bg: #E8F1E9;
  --review: #805616;
  --review-bg: #F5EEDC;
  --fail: #A13D32;
  --fail-bg: #F8E8E4;
  --stale: #4E6375;
  --stale-bg: #E8EEF3;
  --unknown: #606B64;
  --unknown-bg: #ECEEE8;
  --code-bg: #19221E;
  --code-ink: #E7EEE7;
  --code-muted: #A8B7AB;
  --code-focus: #A9D0B6;
  --font-ui: 'Pretendard Variable', Pretendard, -apple-system,
    BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --space-16: 64px;
  --radius-control: 6px;
  --radius-frame: 8px;
  --radius-label: 4px;
  --motion-fast: 120ms;
  --motion-panel: 180ms;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--canvas);
  color: var(--ink);
  font: 400 14px/1.57 var(--font-ui);
}
button, input, select { font: inherit; }
button, a, input, select { touch-action: manipulation; }
:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 3px;
}
.app-shell {
  min-height: 100dvh;
  display: grid;
  grid-template-rows: minmax(56px, auto) minmax(44px, auto) 1fr auto;
}
.app-context, .primary-nav, .status-footer { padding-inline: 32px; }
.app-context {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 24px;
}
.primary-nav {
  display: flex;
  gap: 32px;
  border-bottom: 1px solid var(--line);
}
.primary-nav a {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding-block: 10px;
  color: var(--ink-secondary);
  text-decoration: none;
  border-bottom: 2px solid transparent;
}
.primary-nav a[aria-current='page'] {
  color: var(--ink);
  border-bottom-color: var(--accent);
}
.primary-nav .index {
  font: 400 12px/1 var(--font-mono);
  color: var(--ink-muted);
}
.workspace { min-width: 0; padding: 32px; }
.page-title {
  margin: 0;
  font-size: 40px;
  font-weight: 500;
  line-height: 1.15;
  letter-spacing: -0.025em;
}
.structure-band {
  position: relative;
  display: grid;
  grid-template-columns: 48px 200px minmax(0, 1fr) 220px;
  align-items: start;
  gap: 24px;
  min-height: 128px;
  padding: 24px 16px;
  border-bottom: 1px solid var(--line);
  border-inline-start: 2px solid transparent;
}
.structure-band:hover { background: var(--surface-hover); }
.structure-band[data-selected='true'] {
  background: var(--accent-soft);
  border-inline-start-color: var(--accent);
}
.structure-band h2 {
  margin: 0;
  font-size: 23px;
  font-weight: 500;
  line-height: 1.3;
  letter-spacing: -0.015em;
}
.module-link { color: var(--ink); text-underline-offset: 5px; }
.evidence-link {
  color: var(--accent);
  font: 400 13px/1.5 var(--font-mono);
  text-decoration: underline;
  text-underline-offset: 3px;
}
button.evidence-link {
  border: 0;
  padding: 4px 0;
  background: transparent;
  cursor: pointer;
}
.status-text {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
.status-text[data-state='failed'] { color: var(--fail); }
.status-text[data-state='passed'] { color: var(--pass); }
.status-text[data-state='not-checked'] { color: var(--unknown); }
.decision-triad {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 8px 16px;
}
.decision-triad dt { color: var(--ink-secondary); }
.decision-triad dd { margin: 0; }
.record-table {
  width: 100%;
  border-collapse: collapse;
  background: var(--surface);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.record-table th, .record-table td {
  height: 40px;
  padding: 8px 12px;
  text-align: left;
  border-bottom: 1px solid var(--line);
}
.record-table th {
  color: var(--ink-secondary);
  background: var(--surface-muted);
  font-weight: 500;
}
.record-table tr[data-selected='true'] { background: var(--accent-soft); }
.record-table tr[data-selected='true'] td:first-child {
  box-shadow: inset 2px 0 var(--accent);
}
.technical-surface {
  --focus: var(--code-focus);
  color-scheme: dark;
  border-radius: var(--radius-frame);
  background: var(--code-bg);
  color: var(--code-ink);
  padding: 20px;
}
.technical-surface pre {
  overflow: auto;
  margin: 0;
  font: 400 13px/1.62 var(--font-mono);
}
.raw-transcript {
  margin: 0;
  max-width: 78ch;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: 400 15px/1.67 var(--font-ui);
}
.status-footer {
  min-height: 28px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  border-top: 1px solid var(--line);
  color: var(--ink-muted);
  font-size: 12px;
}
@media (max-width: 1279px) {
  .workspace { padding: 24px; }
  .structure-band {
    grid-template-columns: 36px 168px minmax(0, 1fr) 180px;
    gap: 16px;
  }
}
@media (max-width: 899px) {
  .app-context, .primary-nav, .status-footer { padding-inline: 16px; }
  .primary-nav { gap: 20px; flex-wrap: wrap; }
  .workspace { padding: 20px 16px; }
  .page-title { font-size: 32px; }
  .structure-band { grid-template-columns: 32px minmax(0, 1fr); }
  .structure-band .composition, .structure-band .evidence { grid-column: 2; }
}
@media (prefers-reduced-motion: reduce) {
  :root { --motion-fast: 0ms; --motion-panel: 0ms; }
}
```

#### Semantic structure band example

각 행을 버튼으로 감싼 뒤 내부에 버튼을 다시 넣지 않는다. 아래 이벤트·링크는 실제 라우팅과 데이터 선택에 연결한다. CSS의 범위 괄호선은 별도 장식 요소로 구현하고 접근성 트리에서 제외한다.

```html
<article class="structure-band" data-selected="true" aria-labelledby="module-chat">
  <span class="index" aria-hidden="true">02</span>
  <h2 id="module-chat">
    <a class="module-link" href="/projects/www/service/chat?tab=composition">Chat</a>
  </h2>
  <div class="composition">
    <p>대화와 도구 실행 내용을 표현한다.</p>
    <p>Input · Stream · Activity · Rail</p>
  </div>
  <div class="evidence">
    <button type="button" class="evidence-link"
      data-check="CHK-014" aria-controls="evidence-inspector"
      aria-expanded="false">CHK-014</button>
    <p class="status-text" data-state="failed">
      <span aria-hidden="true">×</span> 확인 실패
    </p>
  </div>
</article>
```

인스펙터를 구현할 때 실제 `evidence-inspector` ID를 제공하고 열린 상태에 맞춰 `aria-expanded`를 갱신한다. 선택된 행 상태만을 보조기술의 유일한 정보로 삼지 않는다.

---

### 4.12. Review gate — 디자인 완료 판정

#### First impression

- [ ] 첫 화면이 카드형 KPI 대시보드가 아니라 프로젝트 구조로 읽힌다.
- [ ] Service·Assurance·Database가 같은 위계로 보이면서 각 화면의 읽는 방식은 다르다.
- [ ] 첨부 레퍼런스의 비주얼을 복제하지 않았다.
- [ ] 카드를 제거해도 계층이 흐트러지지 않는다.

#### Actual use

- [ ] Chat 구성요소를 선택하면 프리뷰·구현·근거의 동일 대상을 따라간다.
- [ ] 문서 참조·원칙 적용·실행 포함·검사 결과가 구분된다.
- [ ] DEC-014는 채택됨 / 변경 연결됨 / 확인 실패로 표시된다.
- [ ] RAW-014 전문을 열고 돌아오면 이전 화면과 선택이 유지된다.
- [ ] Database가 장식적 화면이 아니라 행·필드·JSON·전문을 읽을 수 있는 공간이다.

#### Visual polish

- [ ] 1440×900, 1920×1080, 1024px 너비에서 실제 렌더를 확인한다.
- [ ] 200% 확대에서 글자가 겹치거나 핵심 조작이 사라지지 않는다.
- [ ] 한국어 설명, 긴 경로, null 값, 긴 JSON, 여러 줄 전문으로 점검한다.
- [ ] 기본·hover·focus·선택·실패·미확인의 상태가 식별된다.
- [ ] 낮은 대비·작은 본문으로 시각적 세련됨을 대신하지 않았다.
- [ ] 실제 목업 값에서 계산한 건수와 표시 상태가 일치한다.
- [ ] 기능이 없는 장식 버튼·가짜 Live·불필요한 애니메이션이 없다.

#### Deliverables

구현 에이전트는 Service 전체 / Chat View / Principles / Assurance 실패 근거 / Database RAW 상세의 **다섯 화면**을 캡처해 확인한다. 실행 명령과 검사 결과를 제공하고, 구현하지 않았거나 확인하지 못한 것은 명시한다.

**합격 기준: 예쁜 용기 안에 정보를 넣는 것이 아니라, 구조·선택·근거가 그 자체로 화면의 질서를 만들어야 한다.**


---

## 5. 화면 A — Service 전체 구조

### 첫 인상

앱을 처음 열면 숫자 카드가 아니라 **실제 서비스가 어떻게 구성되어 있는지** 보여야 한다.

상단에는 `Service` 제목, 간단한 책임 설명, 현재 기준 리비전을 둔다. 본문에는 Monitor·Chat·Dashboard를 읽기 쉬운 구조로 배치한다.

### 구조 표현

- `Service` 경계 안에 세 모듈을 배치한다.
- 각 모듈은 이름, 한 문장 책임, 주요 구성요소, 감리 요약을 보여준다.
- 모듈 사이 선은 목업 `relations`에 실제 관계가 있는 경우에만 그린다.
- 자유로운 힘 기반 그래프 대신 정돈된 열·행 또는 중첩 프레임을 사용한다.
- 긴 곡선, 무의미한 애니메이션, 드래그 편집은 필요 없다.
- 구성요소 수·검사 수는 목업 데이터를 계산해서 표시한다. 임의로 별도 숫자를 적지 않는다.

### 기본 내용

| 기능 영역 | 책임의 목업 예시 | 상태 표현 예시 |
|---|---|---|
| Monitor | 현재 실행과 상태를 보여준다. | 확인된 검사 통과 |
| Chat | 대화와 도구 실행 내용을 표현한다. | 검토할 문제 있음 |
| Dashboard | 프로젝트별 실행 요약을 보여준다. | 일부 확인 근거 없음 |

`검사 통과`를 `시스템에 문제가 전혀 없음`으로 바꾸어 표현하지 않는다.

각 모듈 클릭은 상세 페이지로 이동한다. 각 영역 옆의 작은 근거 표시를 누르면 관련 검사를 인스펙터에서 확인할 수 있다.

### 보조 정보

아래쪽에는 최근 구조 변경 또는 관련 결정 2–3건만 조용하게 배치한다. 변경 이력이 첫 화면을 장악하지 않게 한다.

---

## 6. 화면 B — 기능 상세, 특히 Chat

Chat을 대표 시나리오로 가장 완성도 높게 구현한다. Monitor와 Dashboard도 같은 레이아웃을 재사용해 실제로 열리고, 각자 다른 구성·미리보기·근거를 보여야 한다.

### 상세 헤더

- Breadcrumb: `WWW / Service / Chat`.
- 제목, 책임, 연결된 구현 위치.
- 현재 스냅샷과 검사 기준을 구분하는 보조 표시.
- 본문 탭: **Overview / Composition / View / Principles / Decisions**.

### Overview

책임, 입력·출력, 인접 영역, 연결된 문서, 관련 검사 상태를 보여준다. 무엇을 맡지 않는지도 짧게 표현할 수 있다.

### Composition

Chat을 이루는 구성요소를 계층과 관계로 보여준다. 목업 예시:

- Input Composer.
- Conversation Stream.
- Tool Activity Block.
- Plan / Progress / Test Rail.
- Chat Event Adapter.

각 항목에서 책임, 구현 파일 참조, 연결된 원칙, 검사 근거를 확인할 수 있다. 파일 트리를 그대로 복사한 화면으로 만들지 않는다.

### View

실제 화면을 이해할 수 있는 충분히 큰 TUI 미리보기를 중앙에 둔다.

- 기존 TUI 코드나 캡처가 제공되면 이용 가능 여부를 확인해 우선 사용한다.
- 자료가 없으면 HTML/CSS로 목업 프리뷰를 만들고 **Mock preview**라고 표시한다.
- 실제 Native를 실행하거나 TUI의 모든 기능을 다시 구현하지 않는다.
- 프리뷰 옆의 구성요소 목록을 선택하면 관련 영역을 가볍게 강조한다.
- 강조 영역과 `Composition`의 항목은 같은 ID를 사용한다.
- 프리뷰는 캔버스를 가득 채우는 장식 이미지가 아니라 영역과 구조를 이해하는 자료다.

기존 요구를 반영한 Chat 목업 방향:

- 왼쪽은 대화·작업, 오른쪽은 좁은 보조 레일.
- 오른쪽에 PLAN / PROGRESS / TEST.
- PROGRESS는 PLAN의 세부 내역이라는 관계가 드러난다.
- TEST에는 검사 종류, 소요 시간, 통과·실패 수의 목업을 표시한다.
- 7단계 상태는 상단 대시보드에 중복 배치하지 않고 입력 영역 가까이에 표시한다.
- 프리뷰 안의 박스와 고정폭 텍스트는 영어 레이블을 우선 사용한다.

이 프리뷰는 현재 사용자 구현의 정확한 재현이라고 주장하지 않는다.

### Principles

문서 → 원칙 → 적용 대상 → 구현 참조 → 확인 근거를 따라간다.

목업 연결 예시:

```text
CLAUDE.md
  -> docs/ui-principles.md
    -> PRN-003: Keep Native parsing outside View
      -> Chat
        -> ChatMessageView
          -> CHK-014
```

이 연결은 **목업 DB에 정의된 관계**다. `CLAUDE.md`가 임의 문서에 자동 상속된다거나 Native가 실제로 해당 문서를 읽었다는 의미로 표현하지 않는다.

다음 네 가지는 구분한다.

1. 문서 간 참조가 정의되어 있음.
2. 원칙의 적용 대상으로 지정되어 있음.
3. 해당 실행의 입력에 문서가 포함됐다는 근거가 있음.
4. 실제 구현의 준수 여부를 확인한 결과가 있음.

근거가 없으면 `확인 안 됨`으로 표시한다. 보기 좋은 흐름도 하나로 네 상태를 모두 `적용됨`이라고 묶지 않는다.

문서를 선택하면 우측에서 해당 문단·위치·리비전을 읽고, 원문 레코드로 이동할 수 있어야 한다.

### Decisions

해당 기능과 관련된 결정만 보여준다. 결정 이력은 프로젝트를 설명하는 한 관점이지 앱 전체의 중심 화면이 아니다.

한 결정에는 상태를 최소 세 칸으로 나누어 보여준다.

| 구분 | 표시 예시 |
|---|---|
| 채택 | 제안 / 채택 / 기각 / 대체됨 |
| 코드 연결 | 연결된 변경 없음 / 변경 연결됨 |
| 확인 | 미확인 / 통과 / 실패 / 재확인 필요 |

한 개의 녹색 `완료` 배지로 합치지 않는다.

---

## 7. 화면 C — Assurance

### 목적

서비스를 만드는 영역과 그 서비스의 구성·원칙·구현을 확인하는 영역을 별도로 보여준다.

### 화면 구성

- 왼쪽에는 `All checks`, `Rule checks`, `Implementation checks`, `View checks`.
- 중앙에는 검사별 목록과 선택한 검사의 상세.
- 상세에는 대상, 기준, 상태, 검사 리비전, 근거, 관련 구조·문서·결정이 나타난다.
- 문제가 있는 영역을 클릭하면 Service의 정확한 모듈·구성요소로 이동한다.

### 상태

- `Passed`: 지정된 검사가 해당 기준에서 통과한 목업 결과.
- `Failed`: 지정된 검사에서 문제가 확인된 목업 결과.
- `Needs review`: 의미 판단이나 수동 검토가 필요한 상태.
- `Not checked`: 확인 기록이 없는 상태.
- `Stale`: 검사한 리비전과 현재 보고 있는 기준이 달라 재확인이 필요한 상태.

실제 검사 엔진을 붙이지 않으므로 이 화면에도 목업 표식을 유지한다. 리비전이 다르다는 이유만으로 반드시 코드가 틀렸다고 표시하지 않는다.

검사 통과 범위와 미확인 범위를 분리한다. 결과가 없는데 녹색으로 채우지 않는다.

---

## 8. 화면 D — Database: 1계층의 읽기 전용 DB 탐색기

### 목적

단순 테이블 이름 목록이 아니라, **현재 프로젝트 뷰의 근거가 되는 데이터를 실제로 읽는 공간**이다.

SQL을 작성해야만 볼 수 있는 개발자 콘솔로 만들지 않는다. 다만 테이블·컬럼·행·JSON이라는 데이터 구조는 숨기지 않는다.

### 기본 3분할

```text
+--------------------+--------------------------------+------------------+
| Tables             | Records                        | Record detail    |
|                    |                                |                  |
| Structure          | Search / filters / row count   | Fields           |
| Rules & Decisions  | Column header                  | JSON             |
| Evidence           | Selected row                   | Raw text         |
| RAW                | Other rows                     | Relations        |
+--------------------+--------------------------------+------------------+
```

### 왼쪽: 테이블 목록

테이블을 아래 논리 그룹으로 묶는다. 실제 DB 제품이나 물리적 분리 방식은 확정하지 않는다.

| 그룹 | 목업 테이블 |
|---|---|
| Structure | `project_nodes`, `relations`, `views` |
| Rules & Decisions | `documents`, `principles`, `decisions` |
| Evidence | `commits`, `implementation_links`, `verification_runs` |
| RAW | `raw_sessions`, `raw_events` |

테이블별 실제 목업 레코드 수를 표시한다. 선택 테이블의 역할을 짧게 보여준다.

### 중앙: 레코드 그리드

- 테이블에 맞는 컬럼 헤더.
- 텍스트 검색, 필요한 상태 필터, ID·시각 등 기본 정렬.
- 검색 결과 수와 전체 행 수.
- 행 선택, 선택 상태 유지, 길이가 긴 값의 잘림 처리.
- 참조 ID를 누르면 해당 테이블과 행으로 이동.
- 넓은 컬럼은 그리드 내부에서 가로 스크롤한다. 앱 전체를 옆으로 밀지 않는다.
- 객체나 배열을 `[object Object]`로 출력하지 않는다. 간단한 요약을 보여주고 상세에서 펼친다.
- 테이블별 `Schema` 보기에서 컬럼명, 목업 타입, nullable 여부, 참조 대상을 읽을 수 있게 한다.
- 스키마는 목업 메타데이터라는 표식을 유지하고 실제 DB introspection 결과라고 표시하지 않는다.

### 오른쪽: 레코드 상세

가능한 탭은 `Fields / JSON / Relations`이며, RAW 레코드에는 `Transcript`를 추가한다.

- Fields: 사람이 읽기 쉬운 키·값.
- JSON: 선택한 실제 목업 객체의 JSON, 복사 기능.
- Relations: 이 행을 사용하는 프로젝트 노드·문서·결정·검사.
- Transcript: 요약이 아닌 실제 목업 원문 전문. 줄바꿈 보존, 줄바꿈 모드 전환, 스크롤.
- 원문이 없으면 빈 내용을 창작하지 않고 `이 레코드에는 전문이 없습니다`라고 표시한다.
- 원본에 순서 정보만 있고 시각이 없다면 순서를 표시한다. 시각을 추정해서 채우지 않는다.

실제 비밀정보를 목업에 넣지 않는다. 민감정보 보호가 이미 구현된 제품인 것처럼 광고하지 않는다.

### 다른 화면과의 연결

- Decision의 `Source RAW` → Database의 해당 `raw_events` 행.
- Principle의 `Document record` → Database의 해당 `documents` 행.
- Assurance의 `Verification record` → Database의 해당 `verification_runs` 행.
- 어떤 행의 `Related component` → Service의 해당 구성요소.

이 경로에서 같은 데이터는 반드시 같은 ID와 내용으로 보인다.

### 금지

SQL 실행, 수정, 삭제, 운영 DB 연결 입력창, 출처 없는 `Live` 표시, 가짜 자동 동기화 애니메이션을 넣지 않는다.

---

## 9. 데이터 의미 — RAW와 확인된 구조를 섞지 않는다

이번 구현은 프런트엔드 목업이지만 다음 의미 구분은 지킨다.

```text
Raw conversation / Native events
             |
             +-- evidence for a decision
                         |
                         +-- adoption status
                         |
                         +-- related code change
                                      |
                                      +-- verification result
```

화살표는 자동 승격을 의미하지 않는다. 원문이 있다는 이유로 채택된 결정이 생기지 않고, Commit이 있다는 이유로 원칙대로 구현됐다고 판정하지 않는다.

### 논리 데이터 모델

아래 테이블은 뷰 검증을 위한 제안 모델이다. 최종 운영 스키마나 SQL DDL을 확정하는 작업은 이번 범위가 아니다.

| 테이블 | 최소 필드 또는 역할 |
|---|---|
| `project_nodes` | ID, 프로젝트, 노드 종류, 논리 축, 부모, 이름, 책임, 입력·출력 |
| `relations` | ID, 출발 레코드 참조, 도착 레코드 참조, 관계 종류, 출처 참조 |
| `views` | ID, 대상 노드, 미리보기 종류, 구성요소 매핑, 기준 리비전 |
| `documents` | ID, 경로, 제목, 본문, 리비전, 앵커 또는 줄 범위 |
| `principles` | ID, 원칙 문장, 적용 대상, 문서 참조, 현재 유효 상태 |
| `decisions` | ID, 제목, 내용, 이유, 대상 노드, 채택 상태, 채택 주체·시각, 출처 RAW, 대체 관계 |
| `commits` | ID, 목업 SHA, 브랜치, 요약, 변경 경로, 목업 diff 또는 변경 근거 |
| `implementation_links` | ID, 결정, Commit, 대상 노드·파일, 연결 근거 |
| `verification_runs` | ID, 대상, 기준, 상태, 확인 방식·주체, 검사 시각, 검사 리비전, 근거, 판정 설명 |
| `raw_sessions` | ID, 출처 종류, 프로젝트 참조, 시작 정보, 원본 출처 설명 |
| `raw_events` | ID, 세션, 선택적 턴 ID, 원본 순서, 선택적 시각, 이벤트 종류, RAW 객체, 전문 |

권장 공통 참조 형태:

```ts
type RecordRef = {
  table: TableName;
  id: string;
};
```

- 출처·타입별로 존재하지 않는 Native 식별자는 nullable로 둔다.
- 프로젝트 노드의 설명과 실제 구현 확인 결과는 별도 데이터로 유지한다.
- 문서가 선언한 적용 범위와 실제 실행에 포함됐다는 근거는 구분한다.
- `implementation_links`는 변경이 연결되었다는 기록이지 성공 판정이 아니다.
- 파생된 상태와 집계는 selector에서 계산하고, 화면마다 별도 문자열을 작성하지 않는다.
- 순환 대체 관계, 없는 ID 참조, 중복 ID를 검출한다.
- 실제 RAW 보관과 구조화 데이터가 물리적으로 같은 DB인지 다른 DB인지는 이 MVP에서 결정하지 않는다.

---

## 10. 필수 목업 스토리 — “Commit은 있지만 확인은 실패”

모든 예시는 가상 데이터다. 화면 상단과 상세에 적절한 `Mock` 표식을 유지한다.

### 중심 시나리오

| 레코드 | 내용 |
|---|---|
| `PRN-003` | Native 이벤트 형식 해석은 Adapter가 담당하고 View가 직접 해석하지 않는다. |
| `RAW-013` | 에이전트가 Chat 이벤트 해석을 Adapter로 옮기는 방안을 제안한 원문. |
| `RAW-014` | 사용자가 “Chat에서 Native 이벤트를 직접 해석하지 않고 Adapter를 통하도록 하자. 이 방식으로 진행하자.”라고 범위를 명확히 승인한 원문. |
| `DEC-014` | 해당 변경 방안을 채택한 결정. 출처는 RAW-013과 RAW-014. |
| `COM-014` | 목업 Commit `4f2c9a1`. Adapter 추가와 Chat 관련 변경이 있음. |
| `IMPL-014` | DEC-014와 COM-014의 연결. 성공 판정은 포함하지 않음. |
| `CHK-014` | 같은 리비전의 목업 검사에서 View에 Native 필드 직접 참조가 남아 있음을 확인. 상태 Failed. |

목업 코드 근거는 `ChatMessageView.tsx`의 가상 위치와 작은 diff로 제공한다. 실제 저장소의 문제를 발견했다고 주장하지 않는다.

이 결정은 다음처럼 보여야 한다.

**채택됨 / 변경 연결됨 / 확인 실패**

`완료`, `반영 및 검증 완료`, 녹색 한 개 배지로 표시하면 안 된다.

### 추가 시나리오

- `DEC-015`: 제안만 존재하고 채택·Commit 근거가 없다.
- `DEC-016`: 채택됐지만 연결된 코드 변경이 없다.
- `DEC-011`: DEC-014에 의해 대체된 과거 결정. 삭제하지 않고 대체 관계를 보여준다.
- 통과한 검사 하나.
- 확인 기록이 없는 대상 하나.
- 현재 기준보다 오래된 리비전에서 수행한 검사 하나.
- 매우 긴 경로와 여러 줄 전문이 있는 RAW 하나.

### 데이터 규모

- Monitor·Chat·Dashboard 각각에 서로 다른 하위 구성요소를 둔다.
- 문서 3개 이상, 원칙 3개 이상, 결정 4개 이상.
- Commit 2개 이상, 검사 4개 이상, RAW 세션 2개 이상, RAW 이벤트 12개 이상.
- 각 테이블을 탐색할 의미가 있는 정도만 만들고 수백 건의 장식용 데이터를 만들지 않는다.
- 표시하는 건수는 항상 실제 목업에서 계산한다.
- 시간은 명시적인 타임존이 있는 값으로 저장하며 UI에는 Asia/Seoul 기준 표시임을 알린다.
- 원본 순서는 세션 내부에서만 보장되는 것으로 취급한다. 여러 세션의 전역 인과 순서를 임의로 만들지 않는다.

---

## 11. 데이터·컴포넌트 구현 구조

목업을 컴포넌트 JSX 안에 흩뿌리지 않는다. 다른 화면에서 같은 결정을 수정해야 하는 상태가 생기지 않게 한다.

기존 저장소에 맞게 조정할 수 있는 예시:

```text
src/features/project-view/
  model/
    types.ts
    table-schema.ts
  data/
    mock-db.ts
    selectors.ts
    project-data-source.ts
  components/
    AppShell.tsx
    PrimaryNavigation.tsx
    ContextNavigation.tsx
    Breadcrumbs.tsx
    StructureMap.tsx
    ComponentPreview.tsx
    PrincipleFlow.tsx
    DecisionStatus.tsx
    RecordGrid.tsx
    RecordInspector.tsx
    RawTranscript.tsx
    EvidenceLink.tsx
    StatusLabel.tsx
  pages/
    ServiceOverview.tsx
    ModuleDetail.tsx
    AssurancePage.tsx
    DatabasePage.tsx
```

- 한 목업 저장소와 selector를 사용한다.
- 데이터 접근 경계만 분리해 나중에 API로 바꿀 수 있게 한다. 아직 없는 서버를 가정한 복잡한 캐시·동기화 구조를 만들지 않는다.
- 선택 레코드·현재 모듈·탭은 안정된 ID로 관리한다.
- 기존 라우터·컴포넌트가 있으면 활용한다. 사소한 도형을 위해 무거운 그래프 라이브러리를 추가하지 않는다.
- 패널, 그리드, 상태, 근거 링크의 표현을 공유한다.
- 모듈별 목업 View는 서로 다르게 만들되, 공통 프리뷰 프레임과 선택 매핑을 재사용한다.

---

## 12. 탐색과 인터랙션

### URL 예시

아래는 제안 경로다. 기존 라우터가 있으면 같은 의미를 유지해 조정한다.

```text
/projects/www/service
/projects/www/service/chat?tab=composition
/projects/www/service/chat?tab=principles&principle=PRN-003
/projects/www/service/chat?tab=decisions&decision=DEC-014
/projects/www/assurance?check=CHK-014
/projects/www/database?table=raw_events&row=RAW-014
```

브라우저 뒤로·앞으로 이동할 때 선택 문맥을 회복한다. DB 근거를 보고 돌아왔을 때 선택한 Chat 탭을 잃지 않게 한다.

### 필수 동작

- 최상위 세 진입점 전환.
- Monitor·Chat·Dashboard 선택.
- 상세 탭 전환.
- 구성요소 선택 → 프리뷰 강조 → 구현·근거 확인.
- 문서·원칙·결정·검사의 연결 이동.
- DB 테이블 선택, 검색, 정렬, 행 선택.
- 레코드의 참조 ID 이동.
- JSON·전문·참조 ID 복사.
- 인스펙터 닫기와 다시 열기.

버튼처럼 보이는 요소는 실제로 동작해야 한다. 이번 범위에 없는 기능은 버튼을 만들어 놓지 않는다.

클립보드 복사 성공을 확인한 뒤에만 `복사됨`을 표시한다. 실패하면 짧은 오류 안내를 표시한다.

---

## 13. 상태와 접근성

### 상태 디자인

- 선택 전: 유용한 안내 또는 요약을 표시한다.
- 검색 결과 없음: 현재 검색어와 필터 초기화를 제공한다.
- 원문 없음: 요약을 전문 대신 보여주지 않는다.
- 끊긴 참조: 원래 ID와 확인 불가 사유를 표시한다.
- 오래된 검사: 현재 기준과 검사 기준을 나란히 보여준다.
- 긴 RAW: 줄바꿈 전환과 스크롤로 읽을 수 있게 한다.
- 로딩용 skeleton이 필요하면 스타일을 준비하되, 정적 목업에 가짜 대기 시간을 넣지 않는다.

### 접근성

- 탭·행·링크·서랍을 키보드로 사용할 수 있게 한다.
- 명확한 포커스 표시를 제공한다.
- 상태는 글자와 아이콘 또는 형태로도 구분한다.
- 인스펙터가 모달이면 포커스를 관리하고 닫은 후 원래 요소로 돌린다.
- 본문과 중요한 메타데이터의 대비를 실제 화면에서 확인한다.
- 페이지의 주요 역할과 테이블 헤더 의미를 유지한다.

---

## 14. 구현 순서

1. 데이터 타입과 단일 목업 관계를 만든다. 중심 시나리오의 ID 연결을 먼저 검증한다.
2. 앱 셸, 타이포그래피, 탐색 체계, 패널의 밀도를 완성한다.
3. Service 전체와 Chat 상세의 Composition·View를 구현한다.
4. Principles·Decisions와 공통 인스펙터를 연결한다.
5. Assurance와 Database를 구현하고 모든 근거 링크를 연결한다.
6. Monitor·Dashboard에 서로 다른 목업을 채우고 전체 탐색을 확인한다.
7. 긴 데이터·미확인·오래된 검사 상태를 점검한다.
8. 실제 렌더 화면을 보고 시각적으로 다듬는다.

첫 버전부터 “DB 연동 중”, “추후 구현” 카드로 주요 화면을 비워 두지 않는다. 연결 없는 목업이어도 뷰의 정보와 탐색은 완성한다.

---

## 15. 완료 기준

### 제품 이해

- [ ] 최상위에 Service·Assurance·Database가 동등하게 노출된다.
- [ ] DB는 공통 데이터 진입점이며 세 번째 비즈니스 축으로 그려지지 않는다.
- [ ] Service의 Monitor와 Assurance의 감리 역할이 구분된다.
- [ ] 첫 화면에서 큰 구조를 보고 기능·구성·View로 내려갈 수 있다.
- [ ] 별도의 작업용 채팅 앱으로 변질되지 않았다.

### 데이터와 의미

- [ ] 모든 주요 내용이 단일 목업 데이터 소스에서 나온다.
- [ ] 같은 ID의 설명과 상태가 모든 화면에서 일치한다.
- [ ] Commit 연결과 검증 통과를 분리한다.
- [ ] 문서 참조·적용 범위·입력 포함·구현 준수를 구분한다.
- [ ] RAW 전문과 요약을 구분한다.
- [ ] 출처 없는 연결이나 가짜 실시간 상태가 없다.
- [ ] 참조 무결성·중복 ID·파생 집계를 검증한다.

### 사용자 흐름

- [ ] Service → Chat → Principles → 문서 원문 → Database 이동이 된다.
- [ ] Service → Chat → Decisions → DEC-014 → RAW-014 전문 조회가 된다.
- [ ] Assurance → CHK-014 → Chat 구성요소 및 코드 근거 이동이 된다.
- [ ] Database에서 테이블·레코드·JSON·관련 객체를 탐색할 수 있다.
- [ ] 앞뒤 이동, 검색·정렬, 선택, 복사가 실제로 동작한다.

### 화면 완성도

- [ ] 1440 × 900과 더 넓은 데스크톱 화면에서 직접 확인했다.
- [ ] 좁은 화면에서 인스펙터와 내비게이션이 본문을 압박하지 않는다.
- [ ] 긴 한국어·경로·JSON·전문이 레이아웃을 깨지 않는다.
- [ ] 키보드 포커스와 상태 대비가 명확하다.
- [ ] 실제 내용 없이 장식만 큰 영역이 없다.
- [ ] Mock / Read-only / 기준 리비전이 적절히 드러난다.

---

## 16. 구현 에이전트 최종 전달물

- 실행 가능한 프런트엔드와 실행 명령.
- 데이터 소스와 핵심 파일 위치.
- 목업 데이터이며 실제 연결하지 않은 범위의 명시.
- 구현한 화면과 주요 탐색 경로.
- 실제 실행한 빌드·검사 결과. 미실행 검사를 통과했다고 적지 않는다.
- Service 전체, Chat의 View, Principles, Assurance 실패 근거, Database RAW 상세의 다섯 화면 캡처.
- 남아 있는 한계와 미완료 항목의 구체적인 설명.

**완성 기준은 “보기 좋은 카드가 있다”가 아니다. 사용자가 프로젝트의 큰 축에서 시작해 구성·화면·원칙·확인 결과·RAW 근거까지 맥락을 잃지 않고 내려갈 수 있어야 한다.**
