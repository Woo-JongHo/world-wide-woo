Opus Native smoke Evidence 검토 — PASS

대상: eaaeafe244e78623abff831176ba783db8db8fff (제품 코드는 d35b2bb 그대로)
모델: claude-opus-5

## 판정: PASS (비차단 지적 4건)

README의 명시적 주장은 모두 첨부 JSON·소스로 대조 가능하며, 과대 주장은 발견되지 않았다.

### 대조 확인된 것

- **delta 3건 identity**: `raw`의 `item/agentMessage/delta` 3건이 keys `threadId·turnId·itemId`를 모두 포함하고, `adapted` 3건의 `refs`가 동일 값(thread `01a07751-1c7c…`, turn `…1dab-7f21…`, item `msg_0dc1fd6f…`)으로 일치. started/completed 4건도 같은 identity 유지.
- **reasoning 미관측 → 확대 주장 안 함**: `raw`에 reasoning 계열 method 없음. README가 이를 명시적으로 배제한 것은 정확.
- **maxUsers 1 / sawDraft true**: JSON 필드와 일치. 소스에서 subscribe가 dispatch 이전에 등록되어 전 구간 관측임을 확인.
- **overflow 0**: 3폭 모두 `overflow: 0`. 수동 폭 계산도 일치 — 80열 사용자 행 = 가시폭 77 + 우측 공백 3, 40열은 "한 줄 / 만 출력…"에서 정확히 40열 경계 wrap. 👋(U+1F44B)를 폭 2로 처리한 패딩이 세 폭에서 일관됨.
- **wrap 무손실**: 40열 2행을 이으면 원문 입력과 자모 단위까지 동일.
- **경로 주장**: 소스가 `CodexAppServer` → `ExecutorPort` → `ProjectWorkbench` → 실제 `WorkbenchChatView.render()`를 타는 것과 일치. ephemeral·read-only·gpt-5.6-sol도 두 probe 소스에서 확인.

### 지적 (모두 비차단, 문서 한 줄 수정 수준)

1. **날짜 표기**: 문서·파일명은 `2026-09-07`인데 `recordedAt`은 `2026-09-06T15:23:29Z` / `15:24:54Z`. KST 환산 시 09-07 00시대로 맞지만 README에 시간대 언급이 없다. "recordedAt은 UTC, 문서 날짜는 KST" 한 줄 추가 권장.
2. **파일명 불일치**: 두 probe 소스는 `2026-09-07-native-*-probe.json`을 쓰는데 첨부본은 `native-*-probe.json`. 저장소 실제 경로와 소스의 write 경로가 같은지 확인 필요(리뷰 번들 리네이밍이면 무시 가능).
3. **`activityId` vs 렌더 "기록 0개"**: chat JSON의 activityId가 `probe-19`, `probe-50`인데 Journal은 append마다 1씩 증가하므로 한 턴에 50건 이상 append됐다는 뜻이다. 반면 렌더 박스는 "실행 기록 0개". 두 카운트의 의미가 다르다면(활동 저널 vs 실행/도구 기록) README나 scope에 한 줄 구분이 있어야 오독을 막는다. 현재 JSON에 `records` 본문이 없어 이 부분은 재현 불가.
4. **`sawDraft`의 순서 주장**: JSON은 boolean만 남기고 타임스탬프가 없다. "live draft가 관측된 뒤 완료 답변으로 전환됐다"의 *순서*는 소스 의미상 타당한 추론이지만 아티팩트가 직접 기록한 사실은 아니다. "draft 관측됨 + 최종 completed 1건"으로 표현을 낮추거나, 다음 실행에서 전이 시각을 기록할 것.

### 참고 관측 (주장 위반 아님)

- 40열 박스에서 "• Native Turn · 완료 확인 · 실행" 다음 줄이 `│ 기록 0개` 로 bullet 들여쓰기를 잃는다. overflow는 0이므로 README 주장은 유지되나, 좁은 폭 연속행 정렬은 미해결 상태로 남는다.
- started/completed의 `itemId`는 raw 페이로드 최상위 키가 아니라 probe가 `p.item?.id`로 파생한 값이다(`keys` 배열이 이를 드러냄). 어댑터 `refs`와의 일치 주장에는 영향 없지만, "raw에 itemId가 있었다"로 읽히지 않게 표현 주의.

### 한계 (README 서술 유지 적절)

PTY·키보드·scroll/focus·재개·child thread·실패/취소·장기 세션·전체 TUI 수락은 이 근거로 판정하지 않는다. journal은 in-memory이며, 두 probe는 각 1회 실행·1턴·1메시지 표본이다. 제품 코드 `d35b2bb`의 PASS와는 별개 근거라는 README의 구분도 유지되어야 한다.

비차단 문서 지적: KST/UTC, 결과 파일 복사 이름, 카드 집계와 journal 건수, draft 중간 전이 시각 미보존을 README에 명시했습니다.
