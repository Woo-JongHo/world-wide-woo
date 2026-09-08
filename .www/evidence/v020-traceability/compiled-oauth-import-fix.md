# Compiled OpenAI Codex OAuth import blocker 수정 증거

작성일: 2026-09-07

## 실제 증상과 원인

최종 compiled Workbench의 T-note 생성 경계에서 다음 오류가 발생했다.

```text
OAuth auth derivation failed for openai-codex: Cannot find module './openai-codex.js' imported from /$bunfs/root/www-pre-user-test
```

Artifact: `.www/evidence/2026-09-07-test2/compiled-openai-codex-import-failure.txt`.

`@earendil-works/pi-ai`는 browser build와 Node 전용 OAuth flow를 분리하기 위해 OAuth 구현을 variable dynamic import로 읽는다. Bun standalone compile은 이 상대 모듈을 자동 포함할 수 없다. 패키지는 이 경계를 위해 `@earendil-works/pi-ai/bun-oauth`의 `registerBunOAuthFlows()`를 제공하고 있었지만 WWW model registry는 이를 등록하지 않았다.

## Red 재현

Invocation:

```sh
bun build --compile --target=bun-darwin-arm64 scripts/compiled-oauth-smoke.ts --outfile /tmp/www-compiled-oauth-smoke
/tmp/www-compiled-oauth-smoke
```

Observable: build exit 0 뒤 run exit 1, 실제 captured 오류와 같은 `Cannot find module './openai-codex.js'`.

Artifacts: `compiled-oauth-smoke-build-red.log`, `compiled-oauth-smoke-red.log`.

## 수정

`src/infrastructure/model-router.ts`가 `registerBunOAuthFlows()`를 정적으로 import하고 registry 생성 전에 한 번 등록한다. source runtime도 같은 공식 loader를 사용하며 provider/model 선택 계약은 바뀌지 않는다.

`scripts/compiled-oauth-smoke.ts`는 실제 저장된 OAuth credential로 `getAuth("openai-codex")`의 derivation을 실행한다. 이어 T-note와 같은 `streamSimple` provider 경계를 호출하되 fetch를 결정론적 401 응답으로 대체해 외부 요청 없이 lazy API module까지 load되는지 확인한다. 토큰은 출력하지 않는다.

## Green 검증

Source invocation:

```sh
bun scripts/compiled-oauth-smoke.ts
```

Compiled invocation:

```sh
bun build --compile --target=bun-darwin-arm64 scripts/compiled-oauth-smoke.ts --outfile /tmp/www-compiled-oauth-smoke
/tmp/www-compiled-oauth-smoke
```

두 실행의 observable:

```text
openai-codex OAuth auth derivation: PASS
openai-codex T-note provider module load: PASS
```

Artifacts: `compiled-oauth-smoke-source-green.log`, `compiled-oauth-smoke-build-green.log`, `compiled-oauth-smoke-green.log`.

집중 회귀 invocation:

```sh
bun test test/model-router.test.ts test/detached-codex-generator.test.ts
bun run check
git diff --check
```

Observable: `7 pass`, `0 fail`, `102 expect()`; `tsc --noEmit` exit 0; diff check PASS; debug instrumentation 0.

Artifacts: `compiled-oauth-source-regression.log`, `compiled-oauth-typecheck.log`, `compiled-oauth-diff-check.log`, `compiled-oauth-debug-scan.log`.

## 최종 dist

Invocation:

```sh
bun build --compile --target=bun-darwin-arm64 src/cli.ts --outfile dist/www-pre-user-test
file dist/www-pre-user-test
./dist/www-pre-user-test --version
./dist/www-pre-user-test auth status
shasum -a 256 dist/www-pre-user-test
```

Observables:

- build: `bundle 2722 modules`, compile exit 0.
- binary: `Mach-O 64-bit executable arm64`.
- version: `0.0.15`.
- auth status: `openai-codex: 연결됨 (OAuth)`, `anthropic: 연결됨 (OAuth)`.
- SHA-256: `c9ec34d640865b99a7db55e5942e994b55586f98027d85cc5ad1a2a9611f54d9`.

Artifacts: `compiled-oauth-final-build.log`, `compiled-oauth-final-file.log`, `compiled-oauth-final-version.log`, `compiled-oauth-final-auth-status.log`, `compiled-oauth-final-sha256.log`.

실제 provider 응답을 받는 T-note 전체 재실행은 Test2에서 수행한다. 이 수정에서는 module load와 OAuth derivation을 실제 arm64 compiled runtime에서 검증했고 외부 모델 요청은 smoke에 포함하지 않았다. commit, push, PR은 수행하지 않았다.
