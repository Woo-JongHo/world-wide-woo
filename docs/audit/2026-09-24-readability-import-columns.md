# Readability import·열 정렬 후속 보고

## 질문

단일 named import가 여러 줄로 내려가고 `from`도 별도 행으로 밀린 이유를 확인해 고친다. 같은 역할의 선언 표에서는 `:`와 종결 `;`가 같은 열에 놓이도록 하고, 이 규칙이 Readability 스킬에서 다시 빠지지 않게 한다.

## Plan

1. ZCode GLM-5.3 Max에 import 전수 조사와 정규화기·fixture·안전한 표 정렬기 구현을 맡긴다.
2. Codex가 ZCode 산출물을 인수해 저장소 전체에 적용하고 타입·아키텍처·전체 회귀를 검증한다.
3. Claude Opus를 읽기 전용 반박 감사로 사용해 대량 변경의 의미 보존과 계약 누락을 확인한다.
4. WOO-911에 결속된 로컬 Evidence와 Linear Project Comment Candidate를 준비한다.

## 과정

- ZCode는 484개 TypeScript에서 908개 multiline import를 조사했고, 그중 단일 specifier 483개가 115개 파일에 있음을 확인했다.
- 정규화기는 단일 specifier를 항상 한 줄로 접고, 다중 specifier는 완성된 한 줄 표시 폭이 120 이하일 때만 한 줄로 둔다. 120을 넘는 multiline은 닫는 `}`와 `from`을 같은 행에 두고, 연속 한 줄 import의 `from` 열을 맞춘다.
- 주석·import attributes·CRLF·세미콜론 유무를 fixture로 고정했다. 같은 import 블록에서 세미콜론 스타일이 섞이면 쓰기 전에 실패하도록 회귀 방지 검사를 추가했다.
- `06_align-tables.ts`는 AST로 같은 역할의 연속 3행 이상만 골라 선언·인터페이스·클래스 멤버의 `:`·`;`와 객체 행의 `{`·`:`·`,`·`}`를 최소 폭으로 맞춘다. 조건식, `for` 헤더, 빈 문장, 한 줄 실행 블록, JSDoc·빈 줄로 끊긴 행은 제외한다.
- `DevelopmentStore`의 확인된 두 표를 적용하고 `misaligned=0`을 재확인했다. optional 멤버는 `?`를 유지하고 `exactOptionalPropertyTypes`에 맞게 `| undefined`를 함께 유지했다.
- 첫 Opus 감사가 ZCode 초기 출력에서 사라진 import 종결 세미콜론 265개를 발견했다. 전부 복구하고 세미콜론 없는 named from-import 0건을 확인했다.
- 수정 후 import 고정점은 484 files, changed 0, errors 0이다. TypeScript noEmit, 아키텍처 13/13, diff check와 전체 회귀 1,486/1,486가 통과했다.

## 결론

요청한 선언문 규칙은 코드·스킬·계약·fixture에 반영됐다. `obsidianWikiTarget` 같은 단일 import는 한 줄이고, 긴 import만 multiline이며 `} from`은 같은 행이다. `:`와 `;` 정렬은 텍스트 치환이 아니라 AST로 안전성이 확인된 표에만 적용된다. 런타임 import binding·side-effect 순서 변화는 Opus 감사에서 발견되지 않았다.

외부 Linear 게시와 Obsidian 쓰기는 수행하지 않았다. 이 작업은 기존 WOO-911의 Readability 수락 범위이며 제품 WHY나 공개 도메인 계약을 새로 결정하지 않으므로 Obsidian Candidate는 만들지 않는다.

## 선언 행 후속 적용

- 제품 인터페이스 20개 파일의 압축 멤버 286개 AST 경계를 한 멤버 한 행으로 복구했다.
- 연속 지역 선언 433개 후보 그룹을 재조사하고, 120열 이하의 같은 역할 표에 기존 `=` 경계 정렬을 적용했다.
- 120열을 넘는 긴 예외 선언은 표 폭 기준에서 제외해 종결 `;`가 과도하게 밀리지 않게 했다.
- 짧은 다중 행 `if → 단일 호출/return` 후보는 제품 코드에서 0건이어서 변환하지 않았다.
- 최종 검증은 Readability 도구 23/23, 전체 회귀 1,487/1,487, TypeScript와 diff check 통과다.
