# PRD-001 — Project-local Planning Package v1

## Problem

장기 Epic·Story, 구조 결정, 현재 session Todo가 분리되어 있지만 새 작업을 안전하게 Planning에 저장하는 정본과 동작이 없다. 새 요청이 대화나 Todo에만 남으면 session 종료 뒤 의도와 acceptance를 잃고, 기존 Story를 직접 고치면 프로젝트 이력이 사라진다.

## Users

- 프로젝트 목표와 우선순위를 관리하는 사용자
- 수락된 Story 범위 안에서 실행하는 WWW Agent

## Goals

- Why·How·Outcome·Work·Runtime을 서로 다른 정본으로 분리한다.
- Epic·Story를 stable ID와 immutable artifact로 누적한다.
- 명시적 Slash 명령으로 새 Epic·Story 초안을 저장한다.
- 의미 변경은 기존 artifact 수정이 아니라 superseding artifact로 남긴다.
- session Todo는 선택된 Story의 현재 실행 단계만 소유한다.

## Scope

- Project-local Initiative manifest와 PRD·Architecture
- append-only Planning catalog
- immutable Epic·Story Markdown artifact
- legacy Epic·Story ID와 충돌하지 않는 ID 할당
- `.www/Epics.md`·`.www/Stories.md` managed projection
- `/epic`, `/story` 명시적 저장 동작
- 현재 Planning 요약을 session system context에 주입

## Non-goals

- Story 자동 수락 또는 완료
- Agent의 독립 review·governor·verifier 역할 완성
- Obsidian·Linear·Atlas 연동
- `01_www` Governance 전체 복제
- 기존 EP-001~EP-009와 Story를 새 catalog로 소급 변환

## Acceptance

- 동시 writer에서도 ID가 중복되지 않는다.
- 기존 catalog record와 immutable artifact를 덮어쓰지 않는다.
- 알 수 없는 parent, 잘못된 supersedes, relation cycle을 fail-closed한다.
- credential·control sequence·HTML comment가 artifact에 남지 않는다.
- projection marker 밖의 사람이 작성한 문서를 보존한다.
- 사용자가 Slash 저장 명령을 실행하지 않으면 Planning 파일이 변경되지 않는다.
- 새 Story는 session 재시작 후에도 catalog와 artifact에서 복원된다.
