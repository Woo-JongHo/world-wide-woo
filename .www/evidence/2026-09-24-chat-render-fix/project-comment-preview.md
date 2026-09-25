## 변경

- WOO-915를 생성하고 원격 이슈·부모·본문을 read-back했다. 긴 draft의 단순 문자 폭·토큰·ANSI clip·선형 wrap 경로와 immutable execution heading 파생값 재사용을 구현했다.
- 벤치를 깊은 불변 snapshot과 실제 heading으로 교정하고 기존 프레임 기준을 유지했다. patch 적용 형식과 이슈 Artifact 6절 호환도 복구했다.

## 영향

- 완료 history를 그대로 둔 37KB draft의 불필요한 반복 계산을 줄인다. 복잡한 Unicode는 기존 경로를 사용한다.
- 새 코드의 합성 벤치는 GREEN이다. 공유 머신 고부하에서는 RED도 관측했다. 기존 www 프로세스는 진행 중인 별도 작업 때문에 재시작하지 않았으며 실제 사용자 세션 해결 완료를 주장하지 않는다.

## 분류

Fix · Validation

## 검증

- 1,000-message benchmark: warm p95 0.89ms, short draft 1.37ms, long draft 9.94ms(20 samples), input→MemoryTerminal frame write 2.19ms(50 samples), idle writes 0; exit 0. terminal pixel latency는 제외한다.
- 최신 관련 43 tests / 6,122 assertions PASS. 앞선 전체 suite 1,468 pass / 3 fail은 timeout 2건·traceability 등록 1건이며 수정 후 관련 65개 재검사 PASS. typecheck와 frozen install PASS.
- CMux 별도 오프라인 재생 탭에서 한국어 입력·스크롤·Home/End·입력 dispatch·정상 종료를 확인했다. 실제 journal 5,514 records/238 messages 재생은 cold 311ms, warm 2.73~3.22ms(3 samples), 처음 보는 폭 222ms였다.

## 연결

- Linear: https://linear.app/woo-world/issue/WOO-915
- Audit: docs/audit/2026-09-24-chat-render-fix.md
- Evidence: .www/evidence/2026-09-24-chat-render-fix
