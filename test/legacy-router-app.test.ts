import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WwwSettings } from "../src/domain/model-settings";
import { FileCredentialStore } from "../src/infrastructure/credential-store";
import { FileSettingsStore } from "../src/infrastructure/settings-store";
import {
	runLegacyRouter,
	type LegacyRouterAppDependencies,
} from "../src/legacy-router-app";
import type { TuiShellDependencies } from "../src/presentation/tui/legacy-session-shell";

const codex: WwwSettings = { provider: "openai-codex", model: "gpt-5.6-terra", effort: "high" };
const claude: WwwSettings = { provider: "anthropic", model: "claude-sonnet-4-6", effort: "medium" };

describe("legacy Router composition", () => {
	test("uses isolated Router settings and releases a failed shell handoff before resume", async () => {
		const root = await mkdtemp(join(tmpdir(), "www-legacy-router-"));
		const config = join(root, "config");
		const nativeSettings = new FileSettingsStore(join(config, "settings.json"));
		const routerSettings = new FileSettingsStore(join(config, "router-settings.json"));
		await nativeSettings.save(codex);
		await routerSettings.save(claude);

		const captured: TuiShellDependencies[] = [];
		const dependencies: LegacyRouterAppDependencies = {
			cwd: () => root,
			createSettingsStore: () => new FileSettingsStore(routerSettings.path),
			createCredentialStore: () => new FileCredentialStore(join(config, "auth.json")),
			runShell: (shell) => {
				captured.push(shell);
				throw new Error("stop after composition");
			},
		};

		try {
			await expect(runLegacyRouter({}, dependencies)).rejects.toThrow("stop after composition");
			expect(captured).toHaveLength(1);
			const first = captured[0]!;
			expect(first.runtime.snapshot.settings).toEqual(claude);
			expect(await nativeSettings.load()).toEqual(codex);
			const sessionId = first.runtime.id;

			await expect(runLegacyRouter({ resumeSessionId: sessionId }, dependencies)).rejects.toThrow("stop after composition");
			expect(captured).toHaveLength(2);
			const resumed = captured[1]!;
			expect(resumed.runtime.id).toBe(sessionId);
			expect(resumed.runtime.snapshot.settings).toEqual(claude);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
