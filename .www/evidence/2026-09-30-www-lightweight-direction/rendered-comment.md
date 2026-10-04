## 변경

- README, 제품 방향, 기존 도구와의 경계 문서를 주 모델 선택·선택적 교차검토·전환 사유 관찰 중심으로 교체했다.
- 기본 검증 요구의 기본값과 프로젝트 YAML을 false로 바꾸고 CLI 도움말에서 7단계 기본 실행 설명을 제거했다.

## 영향

- 간단한 요청에 일곱 단계와 검증 절차를 기본 강제로 부과하지 않는 방향을 문서와 설정에 반영했다.
- 현재 기본 www는 Codex 경로, 다중 모델은 별도 router 경로임을 명시해 아직 완료하지 않은 통합을 홍보하지 않는다.

## 분류

Improvement

## 검증

- git diff --check 통과. 제품 테스트와 실제 TUI 확인은 이번 변경에서 실행하지 않았다.
- WES 스킬 이전, provider 통합, 공개 배포는 미완료이며 구현 상태를 제품 방향 문서에 분리해 기록했다.

## 연결

- README.md · docs/WWW_PRODUCT_DIRECTION.md · docs/OSS_POSITIONING.md
- src/core/domain/execution/workbench-config.ts · .www/workbench.yaml · src/adapters/inbound/cli/www-help.ts
- [WOO-910](https://linear.app/woo-world/issue/WOO-910/astra에서-요청계획현재-실행을-하나의-7단계-runtime으로-통제한다)
- [WOO-727](https://linear.app/woo-world/issue/WOO-727/login-provider-계정을-연결하고-현재-인증-상태를-이해한다)
- [WOO-912](https://linear.app/woo-world/issue/WOO-912/workbench-ui-모드모델계획구독-잔여-표기를-정리한다)
