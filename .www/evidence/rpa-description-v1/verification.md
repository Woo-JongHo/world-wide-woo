# RPA Description v1 검증

- 사용자 결정: 2026-09-08 Project → Task → Unit → Step 템플릿 고정 및 dev 커밋·푸시 요청.
- 구현: 정규화 입력, 고정 렌더, 필드·날짜·identity·참조 검증, CLI read-back 비교, 공통 Artifact Candidate 연결, 관련 RPA/Linear 스킬 라우팅.
- 자동검증: 관련 테스트 49개 통과, 실패 0개. TypeScript 검사와 아키텍처 검사 통과.
- 스킬 frontmatter 검사, 문서 상대 링크 검사, git diff --check 통과.
- 자리표시 검색: TODO는 거부 정규식과 부정 테스트 입력에만 존재. skip/only 없음.
- 예시는 가상 fixture다. 실제 업무 WBS·코드 원본의 사실 확인이나 Linear 게시를 수행한 결과가 아니다.

## 실행한 검증

```text
bun test test/rpa-description.test.ts test/rpa-artifact-control.test.ts test/artifact-control.test.ts test/architecture.test.ts
34 pass / 0 fail
bun test test/skill-runtime.test.ts test/linear-contract-v2.test.ts
15 pass / 0 fail
bun run check
exit 0
```

## 독립 검토

- Claude Sonnet 5 문서 리뷰: 미실행 blocker. CLI API 429, session limit.
- Claude Opus 최종 감사: 미실행 blocker. CLI API 429, session limit.
- provider 안내 재개 시각: 2026-09-08 19:20 Asia/Seoul. 낮은 모델로 대체하지 않았다.
- 원문은 로컬 scratchpad `.www/scratchpad/rpa-description-v1/sonnet-review.json`, `opus-review.json`에 보존했다.
- 구현 위임 전문은 `/tmp/rpa-template-engine-evidence.md`에 보존했다.
- 사용자 처리 결정: 2026-09-08 감사 미실행을 기록한 상태로 이번 변경의 dev 커밋·푸시 진행을 명시적으로 승인했다.

감사 미실행을 감사 통과로 표시하지 않는다. 이번 게시 범위의 완료 근거는 자동검증 결과와 사용자의 명시적 예외 승인이다.
