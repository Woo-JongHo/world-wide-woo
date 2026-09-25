## 변경

- Google SRE Four Golden Signals를 WWW 실행 계층에 번역한 Layer Monitoring 원칙을 작성했다.
- Native Receive부터 Terminal Write까지 7계층을 정의하고 각 계층의 waitMs와 workMs를 분리했다.
- 관측값만 표시하고 synthetic·unobserved·현재 snapshot·시간 추세를 구분하는 화면 계약을 고정했다.
- Context 전체 점유율을 연속 bar에서 동일 크기 cell로 바꾸고 source별 token 비율을 만들지 않았다.
- Figma Monitoring 섹션에 7계층·Golden Signals 기준 화면 06 MONITOR — Layer Performance를 생성했다.

## 영향

- /monitor는 현재 trace waterfall, /dashboard는 window별 Golden Signals, /cache는 기존 cache slice를 각각 독립적으로 소유한다.
- Context bucket은 전체 Native context 점유율만 나타내며 source별 token 비율을 추정하지 않는다.

## 분류

Feature · Improvement

## 검증

- Google SRE 공식 Monitoring Distributed Systems, SRE Workbook Monitoring, Google Cloud Observability의 Golden Signals와 percentile·freshness 지침을 대조했다.
- 기존 WOO-913 publish Receipt와 Figma Monitoring audit를 대조해 같은 책임 범위임을 확인했다.
- Context UI 대상 테스트 69건이 통과했고 Figma node 77:2의 1440×900 read-back을 확인했다.
- 문서와 Artifact Candidate의 git diff --check 및 artifact:control validate/render를 수행한다.

## 연결

- Linear: WOO-913 · UUID 8367530b-1a29-4983-994b-c2bf61ac687e
- Research: docs/research/2026-09-24-www-layer-monitoring-principles.md
- Obsidian Candidate: .www/evidence/2026-09-24-www-layer-monitoring-principles/obsidian-canonical-candidate.json
- Figma: Q7kGUdqiaQRJI8CZlPMRX7 · section 50:609 · monitor node 77:2
