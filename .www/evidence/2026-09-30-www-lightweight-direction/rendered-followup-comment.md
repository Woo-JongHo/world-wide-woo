## 변경

- docs/README.md에서 현재 제품 정본과 과거 연구·내부 개발 기록의 경계를 명시했다.
- CLI 공개 도움말에서 아직 호출 가능한 실험용 lane, 내부 workflow·development 명령, 레거시 세션 목록 안내를 숨겼다. 설정 테스트의 기본 검증 기대값을 새 기본값에 맞췄다.

## 영향

- 사용자가 과거 7단계 문서와 내부 명령을 현재 제품 계약으로 오해할 가능성을 줄인다.
- www 기본 실행은 실제 TTY에서 열렸지만 주 모델·다중 provider 통합과 배포 경량화는 아직 완료되지 않았다.

## 분류

Improvement · Validation

## 검증

- bun run check와 git diff --check 통과. bun test test/workbench-config.test.ts: 4 pass, 0 fail.
- bun src/cli.ts --help와 bun run www:preview가 종료 코드 0. 실제 TTY에서 bun src/cli.ts가 입력 가능한 화면까지 열렸고 모델 응답 실행 없이 종료했다.
- bun run build 성공. dist/cli.js 18.47 MB와 모델 목록 자산 2.0 MB로, 경량 배포 수락 근거는 아니다.

## 연결

- docs/README.md · src/adapters/inbound/cli/www-help.ts · test/workbench-config.test.ts
- .www/evidence/2026-09-30-www-lightweight-direction/local-verification.md
- [이전 Project Comment](https://linear.app/woo-world/project/world-wide-woo-9c0e7963f1ff/activity#comment-aacd5a30-e1d6-48df-99da-40388169704c)
- [WOO-910](https://linear.app/woo-world/issue/WOO-910/astra에서-요청계획현재-실행을-하나의-7단계-runtime으로-통제한다)
