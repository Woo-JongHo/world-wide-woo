# 로컬 확인

- `bun run check`: 종료 코드 0.
- `bun test test/workbench-config.test.ts`: 4 pass, 0 fail.
- `bun src/cli.ts --help`: 종료 코드 0. 기본 경로와 별도 Router 경계를 출력했다.
- `bun run www:preview`: 종료 코드 0. 합성 데이터의 SESSION OVERVIEW를 렌더했다.
- TTY에서 `bun src/cli.ts`: v0.0.22 시작 화면에서 Native session 연결 후 입력 가능한 Workbench를 표시했다. 실제 모델 응답은 실행하지 않았다. Ctrl+C로 종료했다.
- `bun run build`: 종료 코드 0. `dist/cli.js` 18.47 MB와 모델 목록 자산 2.0 MB를 생성했다. 이것은 경량 배포 완료의 근거가 아니다.
- `git diff --check`: 종료 코드 0.

기존 작업트리의 여러 UI 변경이 함께 로드됐다. 이 확인은 해당 변경들의 전체 수락이나 다중 provider 통합을 증명하지 않는다.
