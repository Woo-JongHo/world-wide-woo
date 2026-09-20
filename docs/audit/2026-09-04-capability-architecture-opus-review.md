# Capability Architecture Opus Review

- Reviewer: Claude Opus 5
- Session: `13d03246-4755-4dee-83ee-e7cf318ccb11`
- Mode: read-only, high effort
- Verdict: `REJECT (현재 원안)`
- Review date: 2026-09-04

## 제품 목적 기준 판정

원안은 capability 응집 문제를 정확히 발견했지만, WWW의 실제 목적을 보존하지 못하는 새 추상화를 너무 일찍 만든다.

WWW의 Orchestration Harness는 runtime 호출 순서 모듈이 아니라 Work Chain·Contract·Progress·Approval·Evidence와 업무 수락을 통제하는 제품 전체다. Workflow는 step runner가 아니며 결과는 다음 step이 아니라 PASS/PARTIAL/BLOCKED 판정이다. Runtime은 모델·Tool loop·session·sandbox를 실행하지만 lifecycle 의미와 업무 완료를 소유하지 않는다.

## 수용할 내용

- 거대 파일과 capability 횡단 탐색 문제는 실제다.
- layer 내부에서 capability별 응집을 강화한다.
- Architecture test를 문자열 검색에서 실제 import graph 기반으로 교체한다.
- `ProjectWorkbench`를 공개 aggregate seam은 유지한 채 내부 협력자로 분해한다.
- presentation에 인라인된 Observability history port를 application port로 승격한다.
- Codex/Pi가 공유하는 실행 계약의 이름을 `NativeHarnessPort`보다 정확한 `ExecutorPort`로 정리한다.
- journal·behavior·scroll 성능 baseline을 이동 전에 고정한다.

## 거부할 내용

- top-level layer 구조 전면 폐기
- `kernel/platform/shell/runtimes/orchestration` 5개 계층의 일괄 신설
- `WWW-F-*`, `feature.yaml`, 별도 Feature Registry
- 존재하지 않는 범용 Workflow Engine과 Workflow Registry 구현
- Runtime Resolver에 모델 정책·허용 여부·완료 판단 위임
- 수동 수락 전인 EP-019를 pilot migration으로 사용

## 교정된 정의

- Capability: 사용자의 한 질문 묶음에 대해 관측→투영→표현→수락 근거까지 책임지는 제품 영역. 화면 하나와 같지 않다.
- Feature: capability 안에서 독립적으로 수락 가능한 사용자 가치. 현재 정본은 EP/ST와 Planning catalog다.
- Workflow: Stage 사이 실행기 선택·재시도·승인·검증·완료를 조정하고 PASS/PARTIAL/BLOCKED를 판정하는 lifecycle loop다.
- Runtime: 모델·Tool·Session·Sandbox 실행기이며 ProjectActivity로 정규화된 관측만 상위에 제공한다. 업무 수락을 결정하지 않는다.

## 교정된 migration

1. Baseline과 import graph 고정
2. Architecture guard 교체
3. ProjectWorkbench 내부 책임 분해
4. layer 내부 capability grouping
5. Executor port와 concrete adapter 경계 정리
6. 첫 제품 마일스톤 수락 뒤 Workflow data/engine 논의 재개

## 중단 조건

- 이동과 behavior 변경이 한 commit에 섞임
- 테스트 감소·skip·only 발생
- ProjectActivity 또는 journal schema 변경 필요
- 미수락 capability를 구조 pilot로 이동해야 함

이 기록은 Opus 전문의 실행 결정 요약이다. 원 응답 전문은 해당 Claude session과 현재 상위 세션 tool artifact가 소유한다.
