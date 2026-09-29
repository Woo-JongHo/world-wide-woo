# 누적 증거의 Git 보관 범위 축소

사용자 요청에 따라 직전 전체 회수 커밋의 evidence 695개 중 223개를 Git 추적에서 제외한다. 나머지472개와 사람이 읽는 docs 문서는 유지한다. 이번 정리의 manifest와 게시 Receipt는 추가로 남긴다.

## 제외 기준과 확인

- 동일 게시 본문과 candidateDigest를 확인한 중복 backfill Receipt73개. 중앙 `2026-09-29-linear-recording-backfill/receipts/`는 유지한다.
- Candidate·Receipt 또는 이전 Git revision에서 확인할 수 있는 미리보기와 backfill 중간 Candidate.
- 원격 조회 원문, 임시 리뷰 입력, 측정 중간 프레임·스크립트. 최종 검증 요약과 before/after 벤치마크는 유지한다.
- 기존 원본 Candidate, 게시·read-back Receipt, recording-decision, manifest, 최종 검증 결과, 미게시 Obsidian draft는 유지한다. 과거 문서 및 Receipt 안의 경로는 당시 기록이므로 본문과 digest를 변경하지 않는다.

## 복구와 적용 범위

제외한 파일의 경로·SHA-256·크기·중복 Receipt의 정본 경로는 `.www/evidence/2026-09-29-evidence-retention/manifest.json`에 있다. 모든223개를 `.www/scratchpad/evidence-retention/2026-09-29/`에 복사하고 해시 일치를 확인한 뒤 현재 경로에서 제거했다. gitignored 로컬 보존이다.

과거 경로의 원문은 `git show 8ee4999c78d20ac188b74e6a4c74156ecaf5d81a:<path>`로 조회할 수 있다. `.gitignore`에는 제외한 정확한 경로만 등록한다. 기존 이력 재작성은 하지 않으므로 과거 Git object와 clone 크기는 줄어들지 않는다. 현재 checkout의 파일223개, 약1.39MB를 줄이는 작업이다.

제품 코드·제품 계약·Obsidian 정본은 변경하지 않는다. 저장소 자료의 추적 범위 정리이며 외부 정본의 삭제가 아니다. 제품 테스트와 성능 측정은 수행하지 않았다. JSON 구문·복사본 해시·중복 Receipt 본문/digest·git diff --check를 확인한다.
