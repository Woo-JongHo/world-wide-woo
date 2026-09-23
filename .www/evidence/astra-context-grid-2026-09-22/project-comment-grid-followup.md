## 변경

- Demo Context 뒤에 Live Context Ledger와 상세 블록이 중복 연결되던 렌더 경로를 분리했다.
- 공통 monitoringTable의 실제 오른쪽 정렬을 교정하고 Context Composition·Diagnostics·Dependency·Top Items에 고정 열을 적용했다. 객체·배열 코드의 구분자 축도 실측했다.
- Figma 공통 프롬프트를 5개 페이지의 node·panel 순서·table axes·source·금지 항목으로 정형화하고 객체 배열 그리드 규칙을 woo-code-readability 스킬에 적재했다.

## 영향

- Context 하단이 우측 rail과 겹치는 것처럼 보이던 원인인 Demo/Live 내용 중복이 제거됐다.
- Context의 반복 행이 동일한 열 좌표를 사용하며 Usage·Cache·Workflow도 같은 renderer를 재사용할 수 있다.
- 페이지별 Figma 구현은 공통 시각 언어를 유지하면서 각 화면의 데이터 의미와 수락 조건을 독립적으로 관리할 수 있다.

## 분류

Improvement · Refactor · Fix · Validation

## 검증

- Context 중복 하단부 테스트를 red로 확인한 뒤 green으로 전환했다.
- Context·공통 layout·shell 20 pass / 0 fail. 추가 좌표 검증 후 Context·공통 layout·architecture 28 pass / 0 fail. 전체 테스트와 실제 터미널 픽셀 캡처 수락은 이 후속 패스에서 미완료다.
- bun run check와 git diff --check 통과. 객체 열 명세의 :, 쉼표, 닫는 중괄호 열을 measure-layout으로 실측했다.
- woo-code-readability 스킬 quick_validate 통과. 변경 대상에서 TODO·test.skip·test.only가 발견되지 않았다.

## 연결

- Linear issue: WOO-913 · UUID 8367530b-1a29-4983-994b-c2bf61ac687e
- Figma: Q7kGUdqiaQRJI8CZlPMRX7 · Context 50:967
- Prompt contract: docs/design/figma-context-cache-dashboard-prompt.md
- Evidence: .www/evidence/astra-context-grid-2026-09-22
- Branch: dev · HEAD a953dc8aae13573f1c92772efe747008a31940a4 · uncommitted
