import { describe, expect, test } from "bun:test";
import { ContextComposer } from "../src/core/application/orchestration/context-composer";
import type { SkillRegistrySnapshot } from "../src/core/skills/skill-registry";

describe("ContextComposer Skill Registry", () => {
	test("검증된 registry revision과 각 Skill digest만 application context로 주입한다", () => {
		const registry: SkillRegistrySnapshot = {
			schemaVersion: 1,
			root: ".agents/skills",
			sourceRevision: "git:abc123:dirty",
			digest: "a".repeat(64),
			skills: [{ name: "rpa-intake", description: "민감한 상세 설명", path: ".agents/skills/rpa-intake/SKILL.md", digest: "b".repeat(64), sourceRevision: "git:abc123:dirty" }],
		};
		const turn = new ContextComposer().compose({ threadId: "thread", text: "개발 시작", cwd: "/workspace", approvalPolicy: "on-request" }, undefined, registry);
		const entry = turn.additionalContext?.www_skill_registry;
		expect(entry?.kind).toBe("application");
		const payload = JSON.parse(entry?.value ?? "{}");
		expect(payload).toEqual({ protocol: "www-skill-registry", version: 1, sourceRevision: registry.sourceRevision, registryDigest: registry.digest, skills: [{ name: "rpa-intake", digest: "b".repeat(64) }] });
		expect(entry?.value).not.toContain("민감한 상세 설명");
	});
});
