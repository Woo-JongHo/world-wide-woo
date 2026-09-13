# Provider 이미지 HUD 검증

- 공식 OpenAI ZIP, Claude favicon, Gemini 및 Z.ai 공식 CDN에서 받은 로고를 32×32 PNG로 축소하고 검사했다. 출처는 usage/assets/sources.json.
- HUD에 2열×1행 Kitty 이미지로 표시한다. 미지원 프로토콜·파일 누락은 이름으로 대체한다. 기존 한 줄 폭 축약을 유지한다.
- TypeScript 검사 통과. 관련 67 tests pass / 0 fail. PNG별 고유 내용·크기, 0~200열 단일 행, fallback, fullscreen 실제 출력, resize/숨김/종료 cleanup 검증.
- www 심볼릭 링크가 현재 저장소 src/cli.ts로 해석됨을 확인했다. 실행 중 프로세스의 코드 교체는 하지 않았으며 새 실행부터 적용된다.
- 문자열 생성 warm 1000회 median 0.668ms, p95 3.175ms, full HUD 9646 bytes. 터미널 paint 시간 제외.
- 실제 Ghostty 화면 확인은 CUA 도구가 보안 사유로 앱 접근을 거부해 미검증이다. 다른 UI 제어 경로로 우회하지 않았다.
- Claude Opus 최종 감사는 주간 한도 초과로 미실행. opus-review.txt에 결과를 보존했으며 다른 모델로 대체하지 않았다.
- docs/ASTRA_EXECUTION_CONSOLE.md를 수동으로 현재 동작에 맞춰 수정했다. Linear/Obsidian 자동 게시 증거는 없고 직접 게시하지 않았다. doc-sync-audit.md 참조.
