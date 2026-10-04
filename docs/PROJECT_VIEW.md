# WWW Project View 실행 안내

Project View는 노드 그래프 캔버스에서 프로젝트 구조·원칙·결정·검사·원문을 탐색하는 브라우저 화면이다.
요구사항과 디자인의 기준은 [통합 핸드오프 v2](PROJECT_VIEW_HANDOFF_V2.md)와
[디자인 명세](PROJECT_VIEW_DESIGN_SPEC.md)다.
사용자의 노드 형식 요청에 따라 첫 화면을 자유 배치·확대·이동이 가능한 캔버스로 바꿨다.
현재 동작은 [노드 캔버스 안내](PROJECT_VIEW_NODE_CANVAS.md)에 정리했다.
이전 표·문서 중심 버전의 기록은 [초기 MVP 구현 결과](PROJECT_VIEW_MVP_RESULT.md)다.

## 구현한 화면

| 화면 | 탐색 기능 |
|---|---|
| 구조 맵 | WWW·Monitor·Chat·Dashboard 노드와 선택한 모듈의 구성요소, 자유 배치·이동·확대 |
| 근거 맵 | DEC-014·COM-014·CHK-014·PRN-003·문서·RAW의 실제 관계, 노드 상세 패널 |
| 모듈 상세 | Overview·Composition·View·Principles·Decisions, 구성요소 선택과 근거 연결 |
| View | TUI 목업과 구성요소 주석, 코드 참조, 연결된 원칙·검사 |
| Principles | 문서 원문과 해당 문단, 적용 대상, 실행 입력 포함 근거, 검사 결과 |
| Decisions | 채택·코드 연결·검사 결과를 독립 표시, 대체 결정과 출처 RAW |
| 검사 상세 | 근거 맵에서 연결한 검사의 판정 이유, 검사 리비전과 현재 리비전, diff·근거 |
| Database | 11개 목업 테이블, 검색·정렬·행 선택, Schema·Fields·JSON·Relations·RAW Transcript |

상단 메뉴와 레코드 참조는 공유 가능한 URL을 사용한다. 작은 화면에서는 상세를
서랍으로 열고, 넓은 화면에서는 본문과 나란히 표시한다.

### 바로 열기

- [Service 구조](http://127.0.0.1:4173/projects/www/service)
- [Chat View](http://127.0.0.1:4173/projects/www/service/chat?tab=view&component=CMP-CHAT-STREAM)
- [Chat 원칙](http://127.0.0.1:4173/projects/www/service/chat?tab=principles&principle=PRN-003)
- [채택된 결정 DEC-014](http://127.0.0.1:4173/projects/www/service/chat?tab=decisions&decision=DEC-014)
- [실패 검사 CHK-014](http://127.0.0.1:4173/projects/www/assurance?check=CHK-014)
- [출처 RAW-014 전문](http://127.0.0.1:4173/projects/www/database?table=raw_events&row=RAW-014&detail=transcript)

## 실행

저장소 루트에서 최초 한 번 의존성을 설치한다.

```sh
npm --prefix apps/project-view ci
bun run project-view:dev
```

브라우저에서 <http://127.0.0.1:4173>을 연다. 개발 서버는 로컬 인터페이스에서만
접속을 받으며, 4173 포트가 이미 사용 중이면 다른 포트로 조용히 바꾸지 않고 종료한다.
Node.js 22.12 이상 또는 Vite 8이 지원하는 Node.js 버전이 필요하다.

## 검사와 빌드

```sh
bun run project-view:check
bun run project-view:build
bun run project-view:test
```

브라우저 검사는 설치된 Google Chrome을 사용한다. Chrome이 없는 환경에서는
`npx playwright install chrome`으로 테스트 브라우저를 준비한다.
빌드 결과는 `apps/project-view/dist`이며, SPA 경로로 직접 접근할 때
호스팅 서버에서 `index.html`로 되돌리는 처리가 필요하다.

## 데이터와 사용 범위

상단의 `MOCK / READ ONLY`는 이 화면이 가상 스냅샷을 보여준다는 뜻이다.
실제 DB 접속, Native 실행, Git 분석, 운영 데이터 변경은 연결하지 않는다.
기존 TUI는 별도로 실행하며, 웹 화면의 TUI 프리뷰는 탐색 가능한 목업이다.

핵심 검증 사례는 `DEC-014`다. 채택된 결정과 연결된 Commit이 있어도
`CHK-014`가 실패하면 검사 결과는 실패로 남는다. `RAW-014`에서
그 결정의 근거 전문을 읽을 수 있다. 문서 참조·적용 대상 지정·실행 입력 포함
근거·구현 검사 결과도 각각 별도로 표시한다.

## 패키지 경계

브라우저 제품은 `apps/project-view`에 있고 전용 의존성·TypeScript 설정을 사용한다.
루트의 Native/TUI 소스를 실행하거나 가져오지 않는다. 목업 스키마는 프런트엔드
동작을 확인하기 위한 자료이며, 향후 운영 DB의 스키마를 확정하지 않는다.
