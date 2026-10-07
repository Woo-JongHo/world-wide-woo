# Artifact Control Contract

GitHub Issue와 GitHub PR은 검증된 Candidate로 게시한다.

1. 대상 저장소·기존 이슈/PR·base/head와 중복을 읽는다.
2. 실제 변경·검증·로컬 근거·위험과 복구를 Candidate에 작성한다.
3. `artifact:control validate`와 `render`로 전체 내용을 검증하고 digest를 고정한다.
4. 사용자 승인은 해당 대상과 Candidate digest에만 결박한다. Push/Merge/Release는 별도 권한이다.
5. 게시 직전 `expectedBefore`와 실제 상태를 대조하고 일치할 때 한 번 적용한다.
6. 대상의 ID·본문·상태를 재조회해 Candidate와 일치하는지 확인하고 Receipt를 남긴다.

미실행·불확실한 결과는 성공으로 기록하지 않는다. 외부 업무 원장의 연결이나 상세 문서 게시를 GitHub 작업의 필수 조건으로 요구하지 않는다.
