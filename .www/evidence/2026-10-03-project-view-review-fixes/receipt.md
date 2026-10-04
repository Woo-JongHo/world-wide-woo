# Project View MVP 최종 기록

- 대상: `99_www`, `dev`, `apps/project-view`
- 기준: 다운로드한 handoff V2와 design spec의 저장소 사본
- 소스: `final-source-sha256.txt`
- 빌드: `final-build.log`, exit 0, TypeScript + Vite 24 modules
- 구현/가독성 기록: `semantics/receipt.md`, `navigation/receipt.md`
- 최신 변경 이후 테스트 추가·재실행 없음
- 이전 테스트 기록: `../2026-10-02-project-view-mvp/navigation/{navigation-junit.xml,data-junit.xml}`
- 최신 화면: `../2026-10-02-project-view-mvp/{service,chat-view,principles,assurance,database-raw}-{1440,1920,1024}.png`
- 캡처 크기 기록: `../2026-10-02-project-view-mvp/final-capture-sizes.json`
- Sonnet 실행 모델: `claude-sonnet-5`, 범위 내 정적 리뷰 PASS
- Opus 요청 모델: `opus`, 응답 모델 `claude-opus-5-5`, 통합 정적 감사 및 마지막 3건 재검토 PASS
- 독립 리뷰 원문: `.www/scratchpad/2026-10-02-project-view-mvp/{sonnet-final,opus-final,opus-closeout}.{json,md}`
- 한계: 실제 200% 확대, IME 조합, 전체 접근성 감사 미확인. 운영 DB·Native 연결은 MVP 범위 밖.
- 사용자 안내: `docs/PROJECT_VIEW.md`, `docs/PROJECT_VIEW_MVP_RESULT.md`

캡처는 브라우저의 현재 확대 비율을 유지한 채 viewport를 조절해 실제 CSS 너비를
1440/1920/1024로 맞췄다. 임시 viewport는 저장 후 원래대로 복원했다.
이 캡처를 별도 200% 확대 검사의 근거로 쓰지 않는다.
