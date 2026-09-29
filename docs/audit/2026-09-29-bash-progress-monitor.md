# Native 직접 PROGRESS와 작업량 REPORT

## 최종 결정

사용자의 후속 설명에 따라 Bash 출력 뒤 별도 LLM이 재해석하는 방식을 철회했다. Native가 이미 생성하는 [www-runtime] 구조화된 WORK 보고의 summary를 PROGRESS가 직접 읽는다. 명령 전 public commentary는 의도, 명령 뒤 WORK.summary는 관측된 결과다. Bash 내장 도구의 알려지지 않은 키를 임의로 추가하지 않는다. 이미 등록된 report 스키마의 requestId/checkpoint/summary를 재사용한다.

PROGRESS는 현재 thread/turn/request와 같은 activity 중 Runtime이 수락한 보고만 최신5개 표시한다. Broker에서는 수락한 EXECUTE/VERIFY/GROUND 단계 보고를 읽는다. 형식이 틀렸거나 거부된 보고는 표시하지 않는다. 전체 7단계 상태·성공 Receipt 계약은 변경하지 않는다.

## 지연과 아이디어 검토

별도 Luna 해석 실험3회: 2933/3594/4551ms, 평균3693ms. 이 결과는 짧은 고정 입력의 독립 API 호출이며 실제 TUI 지연·혼잡·p95 측정이 아니다. 별도 모델 호출 경로가 필요하다는 가정의 탐색 결과로 보존하며, 최종 방식은 그 호출을 사용하지 않는다. Native 보고 생성에도 본문 토큰 생성 시간과 이벤트 전달/렌더 시간은 남으므로 0ms라고 주장하지 않는다.

별도 action 해석2slot/8초 큐는 임시 구현 뒤 회수했다. 기존 plan step narrator는 기존 책임으로 유지하지만 Chat 도구의 action narration은 스케줄하지 않는다. PROGRESS용 별도 모델 재해석·대기 큐를 추가하지 않는다. 명령 설명과 결과의 권위는 구분하며 결과가 오기 전 의도를 완료처럼 표시하지 않는다. 단점은 Native가 WORK를 누락하면 PROGRESS가 미보고 상태로 남는 것이다. 이때 또 다른 모델로 추측해 채우지 않는다.

## Chat와 REPORT

Chat은 Bash 명령/출력 원문 및 최종 해결 요약을 소유한다. 최종응답은 내용이 있는 ### 결과/검증/남은 사항만 사용하고 실제 검증 범위를 명시한다. 단순 질문에는 제목을 강제하지 않는다. 가재코드의 간결성·완료/검증 정직성 원칙을 반영했고 고정 제목은 WWW가 추가한 규칙이다.

사이드바 REPORT는 완료 Note4필드를 제거하고 현재 질문 상태·경과·도구 관측수·완료 file-change의 고유경로수·완료 Task수·단계 보고 모델을 표시한다. 질문 단위 토큰은 근거가 없어 미관측이다. 세션누적 토큰을 질문사용량으로 넣지 않는다. PROGRESS는 PLAN없이도 Native WORK보고를 읽으며 TEST는 기존 실제 관측을 유지한다.

## 출처와 검증

가재코드: https://github.com/Yeachan-Heo/gajae-code/blob/7e54f9cbcf712cfa7f633d3c8da58a6d89f7f301/packages/coding-agent/src/prompts/system/system-prompt.md

TypeScript·whitespace 검사 통과. import/table 검사는 woo-readability 저장소의 실제 검사기로 수행하며 최종 Receipt 참조. 행동 테스트·실제 TUI 재시작·부하측정 미실행. 임시 해석큐를 대상으로 실행한 독립 reviewer는 최종 Native 직접 방식의 수락 근거로 쓰지 않는다. Obsidian은 동일identity draft만 준비하며 최신Vault 대조 전 게시하지 않는다.
