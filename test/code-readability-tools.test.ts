import { describe, expect, test }  from "bun:test";
import { lstatSync, realpathSync } from "node:fs";
import { resolve }                 from "node:path";

const root          = resolve(import.meta.dir, "..")                            ;
const skill         = resolve(root, ".agents/skills/woo-code-readability")      ;
const pluginSkill   = resolve(root, "../98_Plugin/skills/woo-code-readability") ;
const regionsScript = resolve(skill, "scripts/typescript/01_group-regions.ts")  ;

describe("dual-repository code readability integration", () => {
	test("projects the standalone skill as the single source through a symlink", () => {
		expect(lstatSync(skill).isSymbolicLink()).toBe(true);
		expect(realpathSync(skill)              ).toBe(realpathSync(pluginSkill));
	});

	test("runs the installed inspector against a repository file", () => {
		const result = Bun.spawnSync(
			["bun", regionsScript, "--file", "test/code-readability-tools.test.ts", "--min-rows", "2"],
			{ cwd: root, stdout: "pipe", stderr: "pipe" },
		);

		expect(result.exitCode).toBe(0);
		expect(result.stderr.toString()).toBe("");
	});
});
