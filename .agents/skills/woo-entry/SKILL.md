---
name: woo-entry
description: 99_www 작업 시작·재개 시 저장소 위치·브랜치·기존 변경을 확인한다.
---

# WWW Entry

1. `pwd`, `git status --short --branch`, `git rev-parse --show-toplevel`로 작업 위치·브랜치·기존 변경을 확인한다.
2. 저장소 `AGENTS.md`와 기본 코딩 지침을 읽고 요청에 필요한 로컬 스킬만 적용한다.
3. 모듈·의존 경계 변경은 `LAYERS.md`, 여러 모듈의 계약 변경은 `docs/workflows/DESIGN_DOCUMENT_CONTRACT.md`를 적용한다.
4. 성공 조건을 정하고 작업을 실행·검증한다. 설계와 결정은 `docs/`, 검증 증거는 `.www/evidence/`에 둔다.

작업 진입은 외부 작업 관리 서비스의 연결·조회·게시를 요구하지 않는다. 현재 위치와 요청을 확인한 뒤 작업을 계속한다.
