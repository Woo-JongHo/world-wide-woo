# Chat 파일럿 기준선

조회일: 2026-09-06. 기준 Git HEAD: `19bad6c00b2dbb4f8c58fd632eb362aae6d31d8d`.

Linear 프로젝트 `5639ee1c-a6cd-44cf-9ed6-82ee9c5fc3db`를 `includeArchived=true, limit=250`으로 조회하고 Chat 라벨이 있는 12개 항목을 선택했다. `hasNextPage=false`를 확인했다. 각 ID에 get_issue 및 list_comments(limit=250)를 실행하여 본문과 코멘트를 조회했다. 모든 코멘트 응답도 `hasNextPage=false`였다. 모두 코멘트 0개였으며, 진행 기록은 이슈 본문의 “개발 현황”과 원래 로컬 작업 트리의 Evidence에 있었다. 아래 표는 **기존 기록에서 확인한 남은 요구**이고 이 PR에서 제품 코드를 새로 검증한 결과가 아니다.

| 이슈 | 범위 | 기록된 남은 작업 |
| --- | --- | --- |
| [WOO-679](https://linear.app/woo-world/issue/WOO-679) | Chat 통합 | 실행 카드→Tracer·원본 부재 안내·전체 화면 수락 |
| [WOO-683](https://linear.app/woo-world/issue/WOO-683) | Message 통합 | 하위 보존·격리·예외 조건과 실제 화면 수락 |
| [WOO-684](https://linear.app/woo-world/issue/WOO-684) | Git Bash 카드 | 반복 실행·취소·출력 없는 완료 및 근거 이동 |
| [WOO-686](https://linear.app/woo-world/issue/WOO-686) | 문서·코드 가독성 | 표/코드/미완성 fence와 좁은 폭·강조 실패 검증 |
| [WOO-687](https://linear.app/woo-world/issue/WOO-687) | 주체·상태 구분 | unknown role과 무채색 상태 표시 |
| [WOO-688](https://linear.app/woo-world/issue/WOO-688) | 답변 생성·종료 | 부분 답변 소실 및 완료 뒤 late delta 재현 기록 존재 |
| [WOO-689](https://linear.app/woo-world/issue/WOO-689) | 긴 결과 탐색 | resize·읽던 위치·다국어·실제 focus 수락 |
| [WOO-690](https://linear.app/woo-world/issue/WOO-690) | 재개·identity | child/root 동일 itemId 혼입 재현 기록 존재 |
| [WOO-691](https://linear.app/woo-world/issue/WOO-691) | 비정상 응답 | 빈/unknown 응답·항목별 오류 격리 |
| [WOO-692](https://linear.app/woo-world/issue/WOO-692) | 실제 TUI 수락 | 실제 Native TUI 시나리오 및 화면 근거 미완료 |
| [WOO-693](https://linear.app/woo-world/issue/WOO-693) | # T-note | 질문별 완료 요약의 탐색·재개·근거 이동 수락 |
| [WOO-694](https://linear.app/woo-world/issue/WOO-694) | Composer | 입력·전송·중단·세션 설정의 실제 조작 수락 |

## 첫 구현 순서

1. WOO-690: root/child 및 thread/turn/item identity 격리와 resume 대상 검증. 다른 작업의 출력이 내 대화를 덮어쓰지 않게 한다.
2. WOO-688: final 미수신·실패·중단의 부분 답변 보존, 완료 뒤 late delta 차단.
3. WOO-691·687: 빈 응답과 알 수 없는 역할·상태를 정상 답변으로 추정하지 않는 안내.
4. WOO-686 문서/코드 가독성, WOO-689 긴 결과 탐색, WOO-684 명령 카드의 남은 조건을 각각 독립 PR로 검증한다. 공통 화면 변경은 WOO-680과 연결한다.
5. WOO-693의 # T-note 탐색, WOO-694 Composer 조작을 각각 PR로 완성한다.
6. WOO-704~706 및 후속 실행 트리 이슈로 Tracer 왕복을 구현하고 WOO-700~703의 Todo와 연결한다. 독립 PR별 실제 선행 SHA를 지정한다.
7. WOO-679/683 통합 조건을 확인하고 WOO-692에서 실제 Native 연결·40/80/120열·무채색·resize/focus 시나리오를 수락한다.

같은 파일을 건드리는 변경은 선행 PR의 정확한 commit 위에서 후속 PR을 만들고 base 관계를 명시한다. 기존 dirty 작업을 통째로 PR에 실어 독립 구현처럼 보이지 않게 한다.

## 근거의 한계

이전 로컬 Evidence는 `.www/evidence/2026-09-06-chat-development/assessment.md`에 있으며 해당 문서는 당시 미커밋 트리의 테스트·fixture 결과다. 이 문서가 기존 dirty 파일을 공개 배포·검증 완료로 승격하지 않는다. 각 구현 PR은 자신의 재현·테스트·Opus 리뷰·남은 수락을 새로 기록한다.

이 문서의 완료 범위는 진행 기준선 정리다. Chat 전체 완료나 실제 TUI 수락을 주장하지 않는다. 운영 절차는 [Linear–PR 흐름](LINEAR_PR_WORKFLOW.md)을 따른다.

