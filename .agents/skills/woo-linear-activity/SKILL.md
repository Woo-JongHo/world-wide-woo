---
name: woo-linear-activity
description: WWW Project Activity에 작업 경과 Comment를 남기거나, 그 Comment를 근거로 기능 릴리스 Update를 준비할 때 사용한다.
---

# Linear Project Activity

World Wide Woo Project의 Activity는 두 층으로 기록한다.

- **Comment**는 요구 하나에 따라 수행한 작업 단위의 짧은 원본 기록이다.
- **Update**는 직전 Update 이후 Comment와 실제 근거를 묶은 `0.0.N` 기능 릴리스 기록이다. Update 작성은 `woo-linear-version-update`가 소유한다.

## Comment 작성

작업 단위가 이슈 생성·구현·검증·설계 결정·차단 상태처럼 프로젝트 경과를 바꿨을 때 Activity에 Comment를 하나 남긴다. 읽기만 한 조사와 반복적인 중간 조작은 같은 작업 단위의 Comment에 합친다.

새 Comment는 Candidate schema `1.1`의 다음 다섯 항목을 짧게 쓴다. `1.0`의 요구·작업·유형·상태 형식은 게시된 과거 기록의 읽기·검증 호환에만 남긴다.

```md
## 변경

- 실제 작성·수정·검증한 결과

## 영향

- 이 변경이 막는 문제 또는 만드는 동작

## 분류

Feature · Improvement · Refactor · Fix · Validation · Operation

## 검증

- 실행한 명령과 실제 read-back 결과

## 연결

- Linear 이슈, PR, Evidence, Obsidian 중 실제 연결된 항목
```

완료: 변경·영향·분류·검증·연결이 실제 대상과 일치하고, 독자가 연결을 열어 상세를 확인할 수 있다.

## 게시 순서

1. 현재 Project Activity와 대상 이슈를 읽어 같은 작업 단위 Comment가 이미 있는지 확인한다.
2. 실제 변경·검증·연결만 사용해 `linear-project-comment` Candidate를 만들고 `bun run artifact:control -- validate --candidate <candidate.json>`와 `render`를 실행한다. 완료: 현재 상태와 연결이 확인 가능하다.
3. 게시 직전에 Activity를 다시 읽어 중복 여부를 확인하고, 승인된 Candidate 한 건만 Comment로 게시한다.
4. 게시 뒤 Activity에서 작성자·시각·본문·연결을 read-back한다.

## Update 종합

기능 릴리스 경계가 생기면 직전 Update 이후의 Comment를 수집한다. Comment가 가리키는 실제 diff·이슈·PR·Evidence를 재검증한 후 `linear-project-update` Candidate를 만들고 `woo-linear-version-update` 형식으로 종합한다. Comment에 적힌 계획이나 미검증 주장을 Update의 검증 근거로 승격하지 않는다.
