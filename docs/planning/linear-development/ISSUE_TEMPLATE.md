# Linear 기능 이슈 템플릿

Linear는 개발자가 해야 할 결과를 빠르게 읽는 얇은 계층이다. 구현 이유·대화·예외 분석·테스트 출력은 실제 Obsidian Vault가 소유한다. 구조와 필드의 정본은 [ISSUE_CONTRACT.yaml](ISSUE_CONTRACT.yaml)이다.

RPA 고객 업무 Project·Task Description은 [RPA Description 계약 v1](../../workflows/RPA_DESCRIPTION_CONTRACT.md)을 사용한다. 해당 프로필의 기술·코드·Step·케이스를 아래 일반 템플릿으로 축약하지 않는다.

```md
## 목적

사용자가 겪는 문제를 한 문단으로 설명한다.

## 결과

완성 뒤 사용자가 관측하는 변화를 쓴다.

## 범위

### 포함

- 이번 이슈가 책임지는 결과

### 제외

- 별도 이슈가 책임지는 결과

## 동작

1. 입력부터 결과까지 사용자가 보는 순서로 쓴다.

## 완료 조건

- [ ] 실행으로 참·거짓을 판정할 수 있는 문장

## 연결

- Code-ID: Code-001
- GitHub: [#46](https://github.com/Woo-JongHo/world-wide-woo/pull/46)
- Obsidian: [상세 기록](obsidian://open?vault=5521cc40c75eb293&file=<encoded-path>)
```

Code-ID는 링크가 아니다. 코드의 실제 이름 있는 최상위 class/function 선언에 `@Unit Code-001`을 한 번 붙인다. 원장은 내부 Unit UUID와 Code-NNN을 일대일로 연결하며 SQLite와 Development Map은 원장에서 재생성한다.

반영 전에는 완전한 MCP snapshot과 draft를 `bun scripts/linear-contract.ts`로 검사한다. 반영 후에는 새 readback으로 같은 검사를 다시 실행한다. 이 gate는 MCP·웹의 직접 편집을 차단하지 않고 차이를 발견한다.
