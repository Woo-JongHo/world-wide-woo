## 변경

- 숨김 도구 폴더를 포함한 630개 코드·설정 파일을 집계하고, 의도적 fixture 28개와 실제 적용 대상 602개를 분리했다.
- TypeScript·JavaScript 575개를 전수 검사해 고유 실패 164개를 찾고 import 선언과 표형 공백을 결정론적으로 정규화했다.
- Claude Code readability-inspector가 대표 스크립트의 실제 diff를 읽기 전용으로 교차검토해 의미 변경 없는 공백·import 정규화임을 확인했다.

## 영향

- scripts·spikes·src·test의 정렬 후보가 동일한 가독성 축으로 수렴했고 JSON·YAML·TOML·Go 형식 검사는 모두 통과했다.
- readability 도구 자체 7개는 전역 정본과 동일한 상태에서 검사기 비수렴 또는 탐지 전용 예외가 남아 자동 수정 대상에서 제외했다.
- 기존 사용자 변경과 같은 파일의 토큰은 유지했으며 이번 패스는 공백과 import 선언 표현만 변경했다.

## 분류

Improvement · Refactor · Validation

## 검증

- bun run check와 git diff --check가 통과했다.
- 전체 테스트는 1564 pass, 15 fail, 2 errors였고 실패 13개는 시간 제한 초과였다.
- 비타임아웃 실패 중 execution heading은 단독 재실행에서 통과했고 SessionGoal spoof 1건은 단독 재현되어 기존 기능 변경 영역의 회귀로 분리했다.
- 변경 파일에서 신규 test.skip·test.only는 없고 TODO 검색 결과는 제품 라벨·검증 정규식·fixture 문자열이었다.

## 연결

- Linear: WOO-911 · UUID b00b02eb-2d80-4b10-9c9a-a29db4f1a74d
- Code: .agents, scripts, spikes, src, test, schemas와 루트 설정
- Evidence: .www/evidence/2026-09-27-full-readability-pass
- Branch: dev · HEAD 495f61c0f3d5e3c9c6d58340d315c06b4ad70cc0 · uncommitted
