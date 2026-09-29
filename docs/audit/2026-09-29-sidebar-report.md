# 사이드바 REPORT와 TOP 변경

## 현재 템플릿과 축약

request-report-v3는 제목·목적/접근·주요 작업·차단·잘된 점·모델/토큰·자체평가·다음 접근·변경 상태·Commit/Evidence를 저장하며 관측 Test를 추가한다. 저장 문법은 유지하고 사이드바만 결과/작업·변경·차단/잔여·근거 4필드로 축약했다. 각 필드는 최대 2행, 제목 1행, 원문 /output 안내 1행이다. REPORT 헤더 포함 약 11~12행이다. 사이드바는 44~64열이며 inset 2열이 빠진다. PROGRESS 5개는 항목 수 기준으로 줄바꿈 때문에 5행보다 길 수 있다.

## 변경

Chat의 전체 완료 Note와 단계 소요시간 블록을 제거했다. 전체 보고서는 /output에서 보존한다. 사이드바 순서는 PLAN→최신 PROGRESS 최대5→관측된 경우 TEST→현재 turn REPORT다. PROGRESS의 단계 작업 대체 경로도 5개로 제한했다. REPORT 렌더는 같은 Note 내용·폭·언어에서 재사용한다. TOP은 GOAL 왼쪽, LANGUAGE·경로 오른쪽 한 줄이다.

## 7단계 현행 로직

UNDERSTAND→DECOMPOSE→GROUND→DECIDE→EXECUTE→VERIFY→DELIVER. 앞 단계 completed/skipped 뒤 다음 보고를 수락한다. DECIDE는 공개 결정, EXECUTE/VERIFY는 성공 Runtime Receipt, DELIVER는 전달 Evidence가 필요하다. Native 종료 시 미정착 단계는 실패면 failed, 그 외 결과 미관측/중단이면 blocked가 된다. Chat은 completed ✓, running ●, failed/blocked ×, pending/skipped ·다. 모니터는 skipped도 ✓, blocked는 Ⅱ로 다르다. 여러 ×가 모두 개별 실행 실패를 의미하지 않는다. 이번 변경에서 이 로직은 유지했다.

## 검증과 제한

bun run check와 git diff --check 통과. 행동 테스트·실제 TUI 재시작·성능 실측은 미실행. Claude Sonnet/Opus 독립 검토 미실행으로 최종 수락 미완료다. 지정 가독성 00/06 검사기는 미발견. REPORT 4필드는 답변 없는 선택 질문의 권장안을 잠정 적용했다. 좁은 창은 기존 sidebar 숨김 정책을 유지하며 상세는 /output에서 접근한다. Obsidian draft는 기존 identity를 유지해 준비하며 fresh Vault 비교와 게시는 미실행이다.
