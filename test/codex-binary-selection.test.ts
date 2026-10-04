import      { expect, test       } from "bun:test"                                                      ;
import      { createRequire      } from "node:module"                                                   ;
import      { resolveCodexBinary } from "../src/adapters/outbound/execution/codex-app-server-transport" ;

test("WWW starts the Codex CLI version installed with the project", () => {
	const managed = createRequire(import.meta.url).resolve("@openai/codex/bin/codex.js");
	expect(resolveCodexBinary()).toBe(managed);
	const result = Bun.spawnSync([resolveCodexBinary(), "--version"], { stdout: "pipe" });
	expect(result.exitCode).toBe(0);
	expect(new TextDecoder().decode(result.stdout).trim()).toBe("codex-cli 0.160.0");
});
