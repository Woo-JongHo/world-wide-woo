# Astra 복구 검증 · 2026-09-12

작업 위치: 99_www / astra/terminal-ui. 커밋·푸시·Linear 쓰기 없음. 기존 사용자 변경 보존.

## 반영

- 실행 중 indeterminate 그라데이션, 입력 focus/상하 경계, 실행·실패·펼친 Bash 경계, provider 잔여 한도와 하단 여백.
- Mac Control+G → 1–8 화면 전환. 초안 보존, F2–F8 보조 키 유지, 승인·로그인 입력 격리 유지.
- GPT-6 Astra Native 선택·자동완성·YAML 저장·전달. Native ultra와 xhigh 구분. 기존 Pi 설정 계약 유지. 누락된 Native effort는 medium.
- 기존 질문별 T-note 자동 생성 배선 유지, 넓은 화면의 최근 요약. 입력 중 본문 폭 유지, 실제 세로 공간에 맞춰 요약 미리보기 축약.

## 검증 근거

- `bun run check`: 통과.
- `bun test`: 1,086 pass / 0 fail / 8,235 expectations / 120 files. 전체 로그: astra-restoration-full-test.log.
- 아키텍처 테스트 11개 포함. `git diff --check` 통과.
- 실제 shell root + 실제 Editor를 통한 80×24 자동완성 50개 선택, 7줄 초안, 아래 경계/HUD; 112×30 자동완성 전·중·후 transcript 폭 74 유지; 112×38 요약 미리보기.
- 변경 TS와 새 Astra 파일의 TODO/FIXME/test.skip/test.only/미구현 표식 점검. 레거시 pane 이름 `TODO` 문자열 외 해당 없음.

## 독립 검토

모든 Claude 패스는 Read/Glob/Grep 또는 Read만 허용했으며 쓰기·명령 실행·위임을 허용하지 않았다.

- Sonnet 5: astra-restoration-sonnet.json. 긴 초안의 입력 경계, 사용량 상세의 비유한 숫자 문제를 수정.
- Opus: astra-restoration-opus.json. 모델 자동완성, composer 높이, Native/Pi 옵션 분리, 본문 높이 계산, null effort, 작은 모달 선택 표시 수정.
- Opus 재감사: astra-restoration-opus-followup.json. 입력 중 transcript 폭 흔들림과 Context NaN 표시 수정.
- Opus 최종 교정 감사: astra-restoration-opus-final.json. 두 잔여 결함 해결 확인, 남은 결함 없음. 극단적인 긴 입력에서는 보조 계획이 세로로 일부 가려질 수 있으나 입력을 침범하지 않는다. 전체 계획은 Control+G 2로 접근 가능.

## 검증 범위 밖

현재 계정의 Codex model/list 조회와 fake transport를 통한 Native 인자 전달은 검증했으나 실제 유료 추론 성공은 미검증. 물리적 Mac 키 입력은 미검증이며 실제 shell 입력 경로의 키 시퀀스를 검사했다. T-note 실제 모델 호출은 실행하지 않았다. 작업 기본 모델과 프로젝트 YAML은 자동 변경하지 않았다.
