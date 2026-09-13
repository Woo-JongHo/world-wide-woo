# 전체 함수 수준 리팩토링 범위

기준: `50fbfa11d420965a83d1fff1f5b15fdee541e2fa`, `astra/terminal-ui`.

사용자 요청: 전체 코드를 함수 수준에서 명확하게 정리하고 하드코딩을 제거한다.

## 수락 기준

- `src`와 `scripts`의 함수 구현을 AST로 수집해 조사 범위를 남긴다.
- 긴 함수는 길이 자체가 아니라 입력 해석, 순수 계산, 상태 변경, 외부 효과가 섞인 지점을 기준으로 분리한다.
- 같은 정책의 복수 구현은 실제 소유 모듈로 모은다. 프로토콜 상수, UI 표식, 안정된 제품 기본값은 책임 안에 유지할 수 있다.
- 사용하지 않는 확장점, 값마다 설정 키, 한 줄 forwarding 함수, 전역 utils 모음은 추가하지 않는다.
- 공개 export와 Code-ID, 상태 전이와 효과 순서, 승인 및 비밀정보 경계, 기본 `www` 진입 동작을 보존한다.
- 모든 함수를 반드시 변경하는 것이 수락 기준은 아니다. 조사 후 유지한 이유와 남은 큰 함수도 기록한다.
- 기존 행동 테스트, 타입 검사, 의존 방향과 import cycle, Code-ID 및 Unit 검사를 실행한다.
- 구현과 검토는 별도 패스다. Claude Sonnet/Opus 미실행이면 그 사실을 별도 blocker로 기록하고 통과로 대체하지 않는다.

## 역할

- Luna: 전체 AST 인벤토리
- Sol: Core, Inbound, Outbound, CLI·Scripts 영역별 저작
- Astra: 통합, 범위 및 구현 대조, 결과 정리
- Claude Sonnet: 읽기 전용 독립 리뷰
- Claude Opus: 읽기 전용 최종 감사

## 정본 확인

제품 저장소의 AGENTS.md와 LAYERS.md를 적용한다. `~/.codex/woo.yaml`이 가리키는 WES 본사에는 AGENTS.md가 있으나 LAYERS.md는 없다. 포인터나 본사 문서를 임의로 변경하지 않는다. Linear 프로젝트 UUID와 Woo-World URL을 원격 재조회했다.
