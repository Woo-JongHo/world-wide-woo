## 변경

- src/test.jsp에 주문 더미 데이터를 받는 createOrderRow 함수와 동일 데이터 3건을 추가했다.
- 각 함수 호출을 한 줄로 유지하면서 일반 공백 형태와 인자 열 정렬 형태를 함께 배치했다.

## 영향

- 함수 인자가 많은 반복 호출에서 한 줄 compact 표현과 표형 열 정렬의 위아래 비교 효용을 같은 데이터로 확인할 수 있다.

## 분류

Improvement · Validation

## 검증

- node --check < src/test.jsp로 JavaScript 문법을 확인했다.
- measure-layout.ts로 정렬된 세 호출의 닫는 괄호가 모두 119열인지 실측했다.
- git diff --check를 통과했고 변경 파일에서 TODO·test.skip·test.only가 발견되지 않았다.

## 연결

- Linear issue: WOO-911 · UUID b00b02eb-2d80-4b10-9c9a-a29db4f1a74d
- Code: src/test.jsp
- Evidence: .www/evidence/2026-09-23-test-jsp-readability
- Branch: dev · HEAD 954f6b3721350447daa9708a87f102ee536896fb · uncommitted
