# woo-code-readability OMP 배포 구조

## 결론

첫 배포는 상주 extension이 아니라 **OMP skill + 독립 CLI**로 만든다.

- OMP가 읽는 얇은 `skills/code-readability/SKILL.md`
- 사람이 읽는 최소 규칙 `skills/code-readability/references/contract.md`
- 기계적 검사를 수행하는 단일 실행 파일 `bin/woo-readability`
- npm 설치와 OMP marketplace 설치를 같은 저장소에서 제공
- WWW 전용 Receipt, 에이전트 교대, 한 파일 승인 흐름은 배포 코어에서 제외

현재 로컬 스킬은 약 216 KB이고, 규칙 문서·TypeScript AST/LSP 도구·fixtures·WWW 전용 운영 계약이 한 디렉터리에 섞여 있다. 이 상태를 그대로 복사하면 설치는 가능해도 독립 제품의 인터페이스가 지나치게 넓다.

## 권장 제품 경계

공개 이름은 저장소 결합을 피해서 `woo-readability` 또는 `code-grid`처럼 잡는다. `woo-code-readability`는 WWW 내부 어댑터 이름으로 남긴다.

```text
woo-readability/
├── package.json
├── README.md
├── LICENSE
├── bin/
│   └── woo-readability.js
├── dist/
│   └── cli.js
├── skills/
│   └── code-readability/
│       ├── SKILL.md
│       └── references/
│           └── contract.md
├── src/
│   ├── core/                 # 행·축 탐지와 edit 계산
│   ├── adapters/typescript/  # TypeScript AST/LSP 입력
│   └── cli/                  # check, write, explain
└── test/
    └── fixtures/
```

공개 인터페이스는 우선 세 명령이면 충분하다.

```bash
woo-readability check <files...>
woo-readability write <files...>
woo-readability explain <file>[:line]
```

현재 번호별 스크립트 이름은 구현 세부사항으로 숨긴다. `normalize-imports`, `align-tables`, `audit-type-uncertainty`는 위 명령의 내부 단계나 선택 플래그가 된다. 호출자가 `.agents/skills/.../06_align-tables.ts` 같은 설치 경로를 알아야 한다면 얕은 모듈이다.

## OMP에서 가장 가벼운 형태

OMP는 플러그인 디렉터리의 `skills/<name>/SKILL.md`를 발견할 수 있고, 패키지가 runtime extension도 제공할 때만 `package.json`의 `omp.extensions`가 필요하다. 또한 extension 경로로 로드된 패키지에서는 형제 `skills/`, `hooks/`, `tools/`, `commands/`, `rules/`, `prompts/`도 발견한다. 따라서 첫 버전에 세션 이벤트, 사용자 UI, 도구 가로채기가 없다면 extension factory는 만들지 않는다. [OMP extension authoring guide](https://github.com/can1357/oh-my-pi/blob/main/docs/skills/authoring-extensions.md)

최소 `package.json`은 일반 npm CLI 패키지로 유지한다.

```json
{
  "name": "@woo/woo-readability",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "woo-readability": "./bin/woo-readability.js"
  },
  "files": ["bin", "dist", "skills", "README.md", "LICENSE"],
  "engines": { "node": ">=20" }
}
```

`omp.extensions`를 넣지 않는 이유는 보안과 무게다. OMP extension은 동일 프로세스에서 실행되며 sandbox가 아니다. 단순 검사기를 세션마다 상주시킬 이유가 없다. [OMP extension loading guide](https://github.com/can1357/oh-my-pi/blob/main/docs/extension-loading.md#failure-handling-and-isolation)

## 배포 경로

### 1. 먼저 GitHub marketplace

OMP marketplace는 플러그인 안의 `skills/`, `commands/`, `agents/`, hooks, tools, MCP, 그리고 선택적인 `omp.extensions`를 배포할 수 있다. 현재 공식 문서상 marketplace catalog의 npm source는 파싱되지만 설치가 거절되므로, OMP 전용 설치는 GitHub 또는 marketplace의 상대 경로 source로 시작하는 것이 안전하다. [OMP marketplace authoring guide](https://github.com/can1357/oh-my-pi/blob/main/docs/skills/authoring-marketplaces.md)

```text
woo-readability-marketplace/
├── .omp-plugin/
│   └── marketplace.json
└── plugins/
    └── woo-readability/     # 위 패키지 또는 git source
```

사용자 설치 인터페이스:

```bash
omp plugin marketplace add woo/woo-marketplace
omp plugin install woo-readability@woo
```

### 2. 같은 코어를 npm CLI로도 배포

OMP를 쓰지 않는 사용자는 다음처럼 설치한다.

```bash
npm install --global @woo/woo-readability
woo-readability check 'src/**/*.ts'
```

이렇게 하면 OMP는 배포 채널이자 얇은 agent 어댑터이고, 제품 코어는 OMP에 종속되지 않는다.

## 현재 코드에서 떼어낼 것과 남길 것

| 배포 코어로 이동 | WWW에 남김 |
|---|---|
| 표시 폭 계산 | Woo Receipt 생성 규칙 |
| TypeScript 행·축 탐지 | `.www/evidence` 경로 |
| import 정규화 | `CODE-READABILITY-MAINTAIN` capability |
| 표 정렬 edit 계산 | 한 파일씩 사용자 승인하는 운영 흐름 |
| 타입 불확실성 감사 | Codex/Claude 검사자 정의 |
| fixtures와 도구 테스트 | WWW의 `bun run check`, 아키텍처 게이트 |

현재 구현은 `typescript/unstable/*`와 Bun API에 결합되어 있다. 가장 가벼운 배포를 원하면 `typescript`를 사용자 저장소에서 우연히 찾도록 두지 말고 패키지의 명시적 dependency로 고정하고, Bun 전용 파일 쓰기와 spawn은 Node 표준 API로 바꾼 뒤 단일 JS 파일로 번들한다. 그러면 사용자는 별도 Bun 설치 없이 실행할 수 있다. OMP 자체는 Bun 설치도 지원하지만, 검사기 소비자까지 Bun으로 제한할 필요는 없다. [OMP installation options](https://github.com/can1357/oh-my-pi#install)

## 단계별 출시

1. **0.1 CLI** — `check`, `write`, `explain`; TypeScript만 지원한다.
2. **0.1 OMP skill** — CLI 호출 순서와 구조 판단 규칙만 제공한다.
3. **0.2 marketplace** — GitHub catalog로 설치·업데이트를 고정한다.
4. **필요할 때만 extension** — 파일 저장 후 자동 검사나 TUI 결과 카드가 실제 요구가 되면 추가한다.

extension을 추가할 기준은 “OMP 생명주기 이벤트가 없으면 구현할 수 없는가”다. 단지 명령을 실행하려는 목적이면 skill과 CLI로 충분하다. OMP의 extension은 명령·도구·이벤트·렌더러를 한 패키지가 함께 소유해야 할 때 쓰는 표면이다. [OMP extensions guide](https://github.com/can1357/oh-my-pi/blob/main/docs/extensions.md#extensions-vs-hooks-vs-custom-tools)

## 먼저 정해야 할 한 가지

공개 제품이 **사용자의 독특한 표형 스타일을 그대로 강제하는 formatter**인지, 아니면 **구조적 예외를 찾아주는 readability auditor**인지 정해야 한다. 배포성과 수용성은 후자가 더 높다. 권장은 기본 `check`가 진단만 하고, 공백 변경은 명시적인 `write`에서만 수행하는 auditor-first 제품이다.
