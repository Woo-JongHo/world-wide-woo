import { expect, test }                                         from "bun:test";
import { mkdtemp, mkdir, rm }                                   from "node:fs/promises";
import { tmpdir }                                               from "node:os";
import { join }                                                 from "node:path";
import { CombinedAutocompleteProvider, stripTerminalSequences } from "@earendil-works/pi-tui";
import { DEFAULT_SETTINGS, modelEfforts, normalizeSettings }    from "../src/core/domain/execution/model-settings";
import type { Effort, WwwSettings }                             from "../src/core/domain/execution/model-settings";
import { DEFAULT_WORKBENCH_CONFIG }                             from "../src/core/domain/execution/workbench-config";
import {
	loadWorkbenchConfig,
	saveWorkbenchExecutionSelection,
} from "../src/adapters/outbound/workspace/workbench-config";
import {
	parseShellCommand,
	parseWorkbenchShellCommand,
	WORKBENCH_SLASH_COMMANDS,
} from "../src/adapters/inbound/tui/commands/slash-commands";
import { workbenchModelSettings }                               from "../src/adapters/inbound/tui/shell/workbench-input.controller";
import { AstraSheet }                                           from "../src/adapters/inbound/tui/shell/astra-surface";
import { ModelPickerOverlay }                                   from "../src/adapters/inbound/tui/features/model-selection/model-picker-overlay";
import { CodexAppServer }                                       from "../src/adapters/outbound/execution/codex-app-server";
import type { JsonLineTransport }                               from "../src/adapters/outbound/execution/codex-app-server";
import { ProjectWorkbench }                                     from "../src/core/application/orchestration/project-workbench";
import type { WorkbenchActivityJournal }                        from "../src/core/application/orchestration/project-workbench";
import type { ProjectActivity, ProjectActivityInput }           from "../src/core/domain/execution/project-activity";

test("Astra model selections survive YAML reload without changing workload defaults", async () => {
	const root = await mkdtemp(join(tmpdir(), "astra-model-")); await mkdir(join(root, ".www"));
	try {
		for (const effort of modelEfforts("openai-codex", "gpt-6-astra")) {
			const selection = { provider: "openai-codex" as const, model: "gpt-6-astra", effort };
			expect(workbenchModelSettings(selection)).toEqual(selection);
			await saveWorkbenchExecutionSelection(root, selection);
			expect((await loadWorkbenchConfig(root)).execution).toMatchObject(selection);
			expect(parseWorkbenchShellCommand(`/model gpt-6-astra ${effort}`)).toEqual({ type: "model.set", model: "gpt-6-astra", effort });
		}
		expect(DEFAULT_SETTINGS.model).toBe("gpt-5.6-sol"); expect(DEFAULT_WORKBENCH_CONFIG.tnote.model).toBe("gpt-5.6-luna");
		expect(parseWorkbenchShellCommand("/model gpt-6-astra none")?.type).toBe("error");
		expect(parseWorkbenchShellCommand("/model gpt-5.6-luna ultra")?.type).toBe("error");
		await expect(saveWorkbenchExecutionSelection(root, { provider: "openai-codex", model: "gpt-5.6-luna", effort: "ultra" })).rejects.toThrow("추론 강도");
		const suggestions = await WORKBENCH_SLASH_COMMANDS.find(c => c.name === "model")?.getArgumentCompletions?.("gpt-6-astra ");
		expect(suggestions?.map(x => x.label)).toEqual(["Low", "Middle", "High", "xHigh", "Max", "Ultra"]);
	} finally { await rm(root, { recursive: true, force: true }); }
});

test("the picker applies Astra max explicitly and keeps Ultra distinct", async () => {
	let applied   : WwwSettings | undefined                                                                                                                                                                                                                                                                                                                             ;
	const current : WwwSettings = { provider: "openai-codex", model: "gpt-5.6-sol", effort: "medium" }                                                                                                                                                                                                                                                                  ;
	const picker                = new ModelPickerOverlay(current, async provider => ({ state: "configured", provider, source: "fixture", type: "oauth" }), () => {}, async value => { applied = value; }, () => {}, () => {}, { ...current, model: "gpt-6-astra" }, false, { providers: ["openai-codex"], startAtModel: true, appearance: "astra", nativeCodex: true }) ;
	picker.start(); await Bun.sleep(0); picker.handleInput("\r");
	expect(picker.render(80).join("\n")).toContain("자동 위임 포함");
	for (let i = 0; i < 3; i++) picker.handleInput("\x1b[B");
	picker.handleInput("\r"); expect(applied).toBeUndefined(); picker.handleInput("\r"); await Bun.sleep(0);
	expect(applied).toEqual({ ...current, model: "gpt-6-astra", effort: "max" });
});

test("actual argument completion retains model identity for every native effort", async () => {
	const provider = new CombinedAutocompleteProvider(WORKBENCH_SLASH_COMMANDS, "/fixture");
	for (const model of ["gpt-6-astra", "openai-codex/gpt-6-astra", "gpt-5.6-luna"]) {
		const input = `/model ${model} `;
		const result = await provider.getSuggestions([input], 0, input.length, { signal: new AbortController().signal });
		expect(result).not.toBeNull();
		for (const item of result!.items) {
			const completed = provider.applyCompletion([input], 0, input.length, item, result!.prefix);
			expect(completed.lines[0]).toBe(`/model ${item.value}`);
			expect(parseWorkbenchShellCommand(completed.lines[0]!)?.type).toBe("model.set");
		}
	}
	const input     = "/model gpt-6-astra ma"                                                                           ;
	const result    = await provider.getSuggestions([input], 0, input.length, { signal: new AbortController().signal }) ;
	const completed = provider.applyCompletion([input], 0, input.length, result!.items[0]!, result!.prefix)             ;
		expect(completed.lines[0]).toBe("/model gpt-6-astra max");
});

test("Native capabilities stay separate from compatibility effort settings and null defaults", async () => {
	const legacy: WwwSettings = { provider: "openai-codex", model: "gpt-5.6-luna", effort: "ultra" };
	for (const model of ["gpt-5.6-luna", "gpt-5.6-sol", "gpt-5.4"]) {
		const selection = { ...legacy, model };
		expect(normalizeSettings(selection)).toEqual(selection);
		expect(parseShellCommand(`/model openai-codex/${model}`, legacy)).toEqual({ type: "model.set", settings: selection });
	}
	const picker = new ModelPickerOverlay(legacy, async provider => ({ state: "configured", provider, source: "fixture", type: "oauth" }), () => {}, async () => {}, () => {}, () => {}, legacy, false, { providers: ["openai-codex"], startAtModel: true });
	picker.start(); await Bun.sleep(0); picker.handleInput("\r");
	const output = picker.render(80).join("\n");
	expect(output).toContain("Ultra"); expect(output).not.toContain("xHigh"); expect(output).not.toContain("Max"); expect(output).not.toContain("자동 위임");
	expect(normalizeSettings({ ...legacy, effort: "max" }).effort).toBe("ultra");
	expect(parseShellCommand("/effort max", legacy)?.type).toBe("error");
	expect(parseWorkbenchShellCommand("/model gpt-5.4 ultra")?.type).toBe("error");
	expect(parseWorkbenchShellCommand("/model gpt-5.4 xhigh")?.type).toBe("model.set");
	for (const model of ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-6-astra"]) expect(workbenchModelSettings({ model, effort: null }).effort).toBe("medium");
});

test("a small model sheet reveals the current effort immediately after advancing", async () => {
	const current: WwwSettings = { provider: "openai-codex", model: "gpt-6-astra", effort: "ultra" };
	const picker = new ModelPickerOverlay(current, async provider => ({ state: "configured", provider, source: "fixture", type: "oauth" }), () => {}, async () => {}, () => {}, () => {}, current, false, { providers: ["openai-codex"], startAtModel: true, appearance: "astra", nativeCodex: true });
	picker.start(); await Bun.sleep(0);
	const sheet = new AstraSheet(picker, () => 12); sheet.render(60); sheet.handleInput("\r");
	expect(stripTerminalSequences(sheet.render(60).join("\n"))).toMatch(/›\s+Ultra/u);
});

class NativeModelTransport implements JsonLineTransport {
	readonly sent: Array<{ id?: number; method: string; params?: any }> = [];
	private listeners = new Set<(line: string) => void>();
	async send(line: string): Promise<void> {
		const message = JSON.parse(line); this.sent.push(message);
		if (message.id === undefined) return;
		const result = message.method === "thread/start" || message.method === "thread/resume" ? { thread: { id: "thread-model", cwd: "/fixture", turns: [] }, model: message.params.model, reasoningEffort: message.params.config?.model_reasoning_effort }
			: message.method === "turn/start" ? { turn: { id: "turn-model", status: "inProgress", items: [] } }
			: message.method === "mcpServerStatus/list" ? { data: [], nextCursor: null } : {};
		queueMicrotask(() => { for (const listener of this.listeners) listener(JSON.stringify({ id: message.id, result })); });
	}
	onLine     (listener: (line: string) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
	onClose    () { return () => {}; }
	async close() { this.listeners.clear(); }
}

test.each(["xhigh", "max", "ultra"] as Effort[])("Workbench passes Astra %s to Native without aliasing or changing a running model", async effort => {
	const transport = new NativeModelTransport(), native = await CodexAppServer.connectTransport(transport);
	const activities : ProjectActivity[]        = []                                                                                                                                                                                                                                                                                                                ;
	const journal    : WorkbenchActivityJournal = { readAll: async () => activities, async append(input: ProjectActivityInput) { const activity = { ...input, schemaVersion: 1 as const, id: `m-${activities.length}`, sequence: activities.length + 1, recordedAt: new Date().toISOString() }; activities.push(activity); return { activity, appended: true }; } } ;
	const persisted  : unknown[]                = []                                                                                                                                                                                                                                                                                                                ;
	const workbench                             = new ProjectWorkbench(native, journal, { projectId: "fixture", cwd: "/fixture", model: "gpt-5.6-sol", effort: "medium", persistModelSelection: async s => { persisted.push(s); } })                                                                                                                                ;
	try {
		if (workbench.snapshot.phase === "loading") await new Promise<void>(resolve => { const stop = workbench.subscribe(s => { if (s.phase !== "loading") { stop(); resolve(); } }); });
		expect(workbench.snapshot.error).toBeNull(); expect(workbench.snapshot.phase).toBe("ready");
		const selection = { model: "gpt-6-astra", effort };
		expect((await workbench.dispatch({ type: "session.model", selection })).state).toBe("accepted");
		expect(persisted).toEqual([selection]);
		expect((await workbench.dispatch({ type: "chat.send", text: "fixture request" })).state).toBe("accepted");
		expect(transport.sent.findLast(x => x.method === "thread/start")?.params).toMatchObject({ model: "gpt-6-astra", config: { model_reasoning_effort: effort } });
		expect(transport.sent.findLast(x => x.method === "turn/start")?.params).toMatchObject({ model: "gpt-6-astra", effort });
		expect((await workbench.dispatch({ type: "session.model", selection: { model: "gpt-5.6-sol", effort: "medium" } })).state).toBe("rejected");
	} finally { await workbench.close(); }
});
