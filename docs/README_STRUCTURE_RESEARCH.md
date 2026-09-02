# WWW README 구성 조사

- 조사일: 2026-09-02
- 질문: WWW의 제품 정체성을 흔들리지 않게 설명하면서도 개발 도구 오픈소스의 README와
  자연스럽게 결을 맞추려면 어떤 순서로 써야 하는가.

## 비교 대상

| 대상 | 관찰한 README 방식 | WWW에 적용할 점 |
| --- | --- | --- |
| Senpi | 실험 상태를 첫머리에 밝히고, 어떤 runtime이며 왜 fork했는지를 기능 목록보다 먼저 설명한다. | 현재 구현과 장기 목표를 섞지 않고 제품 상태를 명시한다. |
| Oh My OpenAgent | 사용자의 불편을 직접 제시한 뒤 한 문장 사용법과 edition 차이를 빠르게 보여준다. | 사용자가 겪는 문제를 기술 용어보다 먼저 말하되, 기능 수 경쟁은 따라가지 않는다. |
| uv | 제품을 한 문장으로 정의하고 Highlights, Installation, Documentation 순서로 내려간다. | 첫 문장과 핵심 가치 목록을 짧게 유지하고 상세 설명은 문서로 연결한다. |
| mise | 짧은 tagline 뒤 `What is it?`, Demo, Quickstart로 실제 사용 맥락을 설명한다. | WWW가 무엇을 준비하고 연결하는지 설명한 뒤 현재 실행 방법을 제공한다. |
| 설치된 Gajae Code package | 공개 npm wrapper의 역할과 설치 명령만 짧게 설명하고 본체와 wrapper의 경계를 밝힌다. | README에서 WWW TUI, Native Executor, 장기 Control Plane의 경계를 숨기지 않는다. |

## 채택한 README 순서

1. 제품명과 한 문장 정의
2. 사용자가 겪는 문제
3. WWW가 소유하는 것과 소유하지 않는 것
4. 업무가 흐르는 방식
5. 지금 사용할 수 있는 기능과 아직 목표인 기능
6. Quickstart와 기본 명령
7. Architecture·계획·비교 조사 문서
8. 개발 검증과 현재 제한

## 채택하지 않은 방식

- 공개 release와 CI가 안정되기 전 badge를 먼저 배치하지 않는다.
- 구현되지 않은 기능을 현재 기능처럼 Highlights에 넣지 않는다.
- Agent 수, Skill 수, Provider 수를 제품 가치로 내세우지 않는다.
- 다른 제품을 낮춰 WWW를 설명하지 않는다.
- Architecture 전체를 README에 복제하지 않고 정본 문서로 연결한다.

## 출처

- [Senpi README](https://github.com/code-yeongyu/senpi/blob/0bf7a523ee93363385d3b1e333feae2b9fc250d3/README.md)
- [Oh My OpenAgent README](https://github.com/code-yeongyu/oh-my-openagent/blob/bd702cb8cac0b7fb480de9b266aaead0039bccc7/README.md)
- [uv README](https://github.com/astral-sh/uv/blob/56eae03ae81ce48db4614c5dac8fc4a252a6d932/README.md)
- [mise README](https://github.com/jdx/mise/blob/27185d5601e121bbe243abe722b176ec1f00be66/README.md)
- 설치된 Gajae Code `0.15.6`: `/opt/homebrew/lib/node_modules/gajae-code/README.md`

외부 저장소 revision은 조사 시점의 `HEAD`다. 이후 README가 바뀌어도 이 문서의 판단
근거가 이동하지 않도록 commit SHA에 고정했다.
