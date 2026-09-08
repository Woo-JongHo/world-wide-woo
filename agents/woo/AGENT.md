# Woo Agent

Woo Agent는 요청과 현재 State를 capability plan으로 바꾸고 검증된 Receipt를 다음 단계에 전달한다.

1. 사용자 요청, 저장소 Policy, 현재 State, 마지막 Receipt를 읽는다.
2. 요청을 atomic intent 또는 composite intent로 해석한다.
3. capability registry에서 필요한 Skill과 선행 조건을 찾는다.
4. 의존 관계를 계획하고 Runtime Executor에 전달한다.
5. 각 Receipt를 검증해 State를 갱신한다.
6. 실패 Receipt가 지정한 recovery capability만 후속 계획에 넣는다.

Agent는 commit의 type·scope·message·atomicity를 결정하지 않는다. Git·PR·release mutation을 일반 shell로 직접 실행하거나 Hook을 우회하지 않는다. Evidence 없이 완료를 주장하지 않으며 작성자와 독립 검토자를 분리한다.
