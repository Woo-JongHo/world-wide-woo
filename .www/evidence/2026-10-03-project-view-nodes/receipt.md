# Project View 노드 캔버스 전환 기록

- 날짜: 2026-10-03
- 저장소: 99_www, dev 브랜치. 커밋·푸시 없음.
- 사용자 선택: 노드 그래프 캔버스 — 자유 배치·확대·이동.
- 결과: 구조 맵과 근거 맵, 노드 드래그, 캔버스 팬/줌, 미니맵, 검색, URL 선택과 상세 패널.
- 기본 구조: WWW + 3개 모듈 + Chat의 5개 구성요소. 전체 모듈 선택 시 WWW + 3개 모듈.
- 근거: 실제 mock record, parentId, relation 또는 refs 필드. 채택 상태와 검사 실패는 별도 노드 상태.

## 실행·정적 검사

- `npm run project-view:build`: exit 0. TypeScript `--noEmit` + Vite 8.3.2, 28 modules. [build.log](build.log).
- 가독성 import/table 정렬: 작성자와 통합 패스 모두 오류 없음.
- 변경된 그래프 소스의 TODO/FIXME, test.skip/only, 미구현 throw 검색: 일치 없음.
- `git diff --check` 해당 경로: 오류 없음. 새 파일도 가독성 도구 및 타입 검사 대상에 포함.
- 자동테스트: 사용자 요청이 없어 추가·실행하지 않음. 이전 행 UI 테스트 결과를 이번 그래프의 근거로 사용하지 않음.
- 최종 소스 지문: [source-sha256.txt](source-sha256.txt).

## 독립 검토

읽기 전용 CLI, Read/Glob/Grep만 허용. 브라우저 상호작용 테스트를 수행한 검토가 아니다.

- Sonnet 5 최종: PASS. root parentId 필터, Escape 전파, 중복 selection history, focus 복원 확인.
- Opus 최종(`claude-opus-5-5`): PASS. R1~R5 해결, 차단 결함 없음.
- 전문: ../../scratchpad/2026-10-03-project-view-nodes/sonnet-closeout.md 및 opus-closeout.md.
- 이전 리뷰와 원본 JSON, prompt, stderr, 위임 결과도 같은 scratchpad에 보존.

Opus가 남긴 비차단 한계: 노드를 가로로 겹치는 대각선으로 배치하면 연결 곡선이 되꺾일 수 있다.
모듈 클릭 지연은 220ms이며 이보다 느린 더블클릭은 상세가 먼저 열릴 수 있다. 상세의 구성요소 펼치기 버튼으로도 이동 가능하다.
포트 점은 좌우 고정이며 상하 연결선에는 별도 점이 없다.

## 화면 기록

- [구조 맵 1440×900](structure-1440.png)
- [근거 맵과 CHK-014 상세 1440×900](evidence-1440.png)
- [구조 맵 1024×900](structure-1024.png) — 마지막 키보드·edge 보정 전 캡처이며 최종 화면 증거는 위 두 장.
- CUA로 로컬 화면을 열어 캡처했다. 임시 viewport override는 해제했다.

## 범위

읽기 전용 목업. 노드 위치는 현재 맵에서 유지되고 새로고침·맵 전환 시 초기화한다.
위치 저장, 노드 생성·삭제, 연결 편집, 운영 DB/Native 실행 연동은 포함하지 않는다.
