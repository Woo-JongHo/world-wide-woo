import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { CodexAppServer, type JsonLineTransport } from "../src/adapters/outbound/execution/codex-app-server";
import { ProjectWorkbench, type WorkbenchActivityJournal } from "../src/core/application/orchestration/project-workbench";
import { fallbackNativeModelCatalog, type NativeModelCatalog, type WwwSettings } from "../src/core/domain/execution/model-settings";
import { loadWorkbenchConfig, saveWorkbenchExecutionSelection } from "../src/adapters/outbound/workspace/workbench-config";
import { ModelPickerOverlay } from "../src/adapters/inbound/tui/features/model-selection/model-picker-overlay";
import { AstraSheet } from "../src/adapters/inbound/tui/shell/astra-surface";
import { parseWorkbenchShellCommand, withNativeModelCompletions, WORKBENCH_SLASH_COMMANDS } from "../src/adapters/inbound/tui/commands/slash-commands";
import { workbenchModelSettings } from "../src/adapters/inbound/tui/shell/workbench-input.controller";

const futureModel = "native-future-fixture";
function row(model: string, efforts = ["high", "ultra"]) {
	return { model, displayName: model, hidden: false, supportedReasoningEfforts: efforts.map(reasoningEffort => ({ reasoningEffort })), defaultReasoningEffort: "high" };
}
class CatalogTransport implements JsonLineTransport {
	requests: Array<{ id?: number; method: string; params?: any }> = [];
	private listeners = new Set<(line: string) => void>();
	page: (params: any) => unknown = () => ({ data: [row(futureModel)], nextCursor: null });
	stallModels = false;
	async send(line: string) {
		const request = JSON.parse(line); this.requests.push(request);
		if (request.id === undefined) return;
		if (request.method === "model/list" && this.stallModels) return;
		const result = request.method === "model/list" ? this.page(request.params)
			: request.method === "mcpServerStatus/list" ? { data: [], nextCursor: null }
			: request.method === "thread/start" ? { thread: { id: "future-thread", cwd: "/fixture", turns: [] }, model: request.params.model, reasoningEffort: request.params.config?.model_reasoning_effort }
			: request.method === "turn/start" ? { turn: { id: "future-turn", status: "inProgress", items: [] } } : {};
		queueMicrotask(() => this.listeners.forEach(listener => listener(JSON.stringify({ id: request.id, result }))));
	}
	onLine(listener: (line: string) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
	onClose() { return () => {}; }
	async close() { this.listeners.clear(); }
}
function journal(): WorkbenchActivityJournal {
	const entries: any[] = [];
	return { readAll: async () => entries, append: async input => {
		const activity = { ...input, schemaVersion: 1 as const, id: `catalog-${entries.length}`, sequence: entries.length + 1, recordedAt: new Date().toISOString() };
		entries.push(activity); return { activity, appended: true };
	} };
}

test("Native catalog follows all pages, filters hidden entries and uses host efforts instead of hardcoded capabilities", async () => {
	const transport = new CatalogTransport();
	transport.page = params => params.cursor === "next" ? { data: [row("gpt-5.6-luna", ["ultra"]), { ...row("secret"), hidden: true }], nextCursor: null }
		: { data: [row("gpt-6-astra"), row(futureModel)], nextCursor: "next" };
	const native = await CodexAppServer.connectTransport(transport);
	try {
		const models = await native.listModels();
		expect(models.map(model => model.model)).toEqual(["gpt-6-astra", futureModel, "gpt-5.6-luna"]);
		expect(models[2]!.efforts).toEqual(["ultra"]);
		expect(transport.requests.filter(request => request.method === "model/list").map(request => request.params)).toEqual([
			{ limit: 100, includeHidden: false }, { cursor: "next", limit: 100, includeHidden: false },
		]);
	} finally { await native.close(); }
});

test.each(["empty", "malformed", "cycle", "unknown-effort"])("Native catalog rejects %s instead of claiming a successful refresh", async kind => {
	const transport = new CatalogTransport();
	transport.page = () => kind === "empty" ? { data: [] } : kind === "malformed" ? {} : kind === "cycle" ? { data: [row(futureModel)], nextCursor: "loop" } : { data: [row(futureModel, ["unimplemented-effort"])] };
	const native = await CodexAppServer.connectTransport(transport);
	try { await expect(native.listModels()).rejects.toThrow(); } finally { await native.close(); }
});

test("an unresponsive model endpoint times out without poisoning other Native requests", async () => {
	const transport = new CatalogTransport(); transport.stallModels = true;
	const native = await CodexAppServer.connectTransport(transport, { requestTimeoutMs: 15 });
	try {
		await expect(native.listModels()).rejects.toThrow("timed out");
		transport.stallModels = false;
		expect((await native.listModels())[0]?.model).toBe(futureModel);
	} finally { await native.close(); }
});

test("Workbench automatically loads and refreshes its session catalog, retaining the last good list on failure", async () => {
	const transport = new CatalogTransport();
	const workbench = new ProjectWorkbench(await CodexAppServer.connectTransport(transport), journal(), { projectId: "fixture", cwd: "/fixture", model: "gpt-5.6-sol", effort: "medium" });
	try {
		await workbench.waitUntilReady();
		expect(workbench.snapshot.modelCatalog).toMatchObject({ source: "native", error: null, models: [{ model: futureModel }] });
		expect(workbench.snapshot.model).toBe("gpt-5.6-sol"); // discovery never changes the selection
		transport.page = () => ({ data: [row("second-fixture", ["max"])] });
		const first = workbench.refreshModels(), second = workbench.refreshModels();
		expect(first).toBe(second);
		await first;
		expect(workbench.snapshot.modelCatalog?.models[0]!.model).toBe("second-fixture");
		transport.page = () => ({});
		await workbench.refreshModels();
		expect(workbench.snapshot.modelCatalog).toMatchObject({ source: "native", models: [{ model: "second-fixture" }] });
		expect(workbench.snapshot.modelCatalog?.error).toBeTruthy();
		expect(workbench.snapshot.phase).toBe("ready");
	} finally { await workbench.close(); }
});

test("first discovery failure uses explicitly labelled fallback without blocking the Workbench", async () => {
	const transport = new CatalogTransport(); transport.page = () => ({});
	const workbench = new ProjectWorkbench(await CodexAppServer.connectTransport(transport), journal(), { projectId: "fixture", cwd: "/fixture" });
	try {
		await workbench.waitUntilReady();
		expect(workbench.snapshot.modelCatalog?.source).toBe("fallback");
		expect(workbench.snapshot.modelCatalog?.error).toBeTruthy();
		expect(workbench.snapshot.phase).toBe("ready");
	} finally { await workbench.close(); }
});

test("a newly discovered model crosses completion, command, picker, persistence, reload and Native execution without a code allowlist update", async () => {
	const root = await mkdtemp(join(tmpdir(), "www-catalog-")); await mkdir(join(root, ".www"));
	const transport = new CatalogTransport();
	const workbench = new ProjectWorkbench(await CodexAppServer.connectTransport(transport), journal(), {
		projectId: "fixture", cwd: root, model: "gpt-5.6-sol", effort: "medium",
		persistModelSelection: (selection, catalog) => saveWorkbenchExecutionSelection(root, { provider: "openai-codex", ...selection }, catalog),
	});
	try {
		await workbench.waitUntilReady();
		const catalog = workbench.snapshot.modelCatalog!;
		expect(parseWorkbenchShellCommand(`/model ${futureModel} ultra`, catalog)).toEqual({ type: "model.set", model: futureModel, effort: "ultra" });
		expect(parseWorkbenchShellCommand(`/model ${futureModel} low`, catalog)?.type).toBe("error");
		let currentCatalog: NativeModelCatalog = fallbackNativeModelCatalog();
		const command = withNativeModelCompletions(WORKBENCH_SLASH_COMMANDS, () => currentCatalog).find(command => command.name === "model")!;
		expect((await command.getArgumentCompletions!(""))?.some(item => item.value === futureModel)).toBe(false);
		currentCatalog = catalog;
		expect((await command.getArgumentCompletions!(""))?.map(item => item.value)).toEqual([futureModel]);
		expect((await command.getArgumentCompletions!(`${futureModel} `))?.map(item => item.label)).toEqual(["high", "ultra"]);
		let applied: WwwSettings | undefined;
		const current = workbenchModelSettings(workbench.snapshot);
		const picker = new ModelPickerOverlay(current, async provider => ({ state: "configured", provider, source: "fixture", type: "oauth" }), () => {}, async settings => {
			applied = settings;
			expect((await workbench.dispatch({ type: "session.model", selection: settings })).state).toBe("accepted");
		}, () => {}, () => {}, current, false, { providers: ["openai-codex"], startAtModel: true, nativeCodex: true, appearance: "astra", loadCatalog: () => workbench.refreshModels() });
		picker.start();
		expect(stripTerminalSequences(picker.render(76).join("\n"))).toContain("갱신 중");
		await Bun.sleep(0);
		expect(stripTerminalSequences(picker.render(76).join("\n"))).toContain(futureModel);
		picker.handleInput("\r"); picker.handleInput("\x1b[B"); picker.handleInput("\r"); picker.handleInput("\r");
		for (let i = 0; i < 100 && workbench.snapshot.model !== futureModel; i++) await Bun.sleep(1);
		expect(applied).toEqual({ provider: "openai-codex", model: futureModel, effort: "ultra" });
		expect((await loadWorkbenchConfig(root)).execution).toMatchObject(applied!);
		expect(workbenchModelSettings(workbench.snapshot)).toEqual(applied!);
		expect((await workbench.dispatch({ type: "chat.send", text: "fixture" })).state).toBe("accepted");
		expect(transport.requests.findLast(request => request.method === "turn/start")?.params).toMatchObject({ model: futureModel, effort: "ultra" });
		expect((await workbench.dispatch({ type: "session.model", selection: { model: "not-in-native", effort: "high" } })).state).toBe("rejected");
	} finally { await workbench.close(); await rm(root, { recursive: true, force: true }); }
});

test("a long refreshed model list keeps the selected last item visible in a small Astra sheet", async () => {
	const catalog: NativeModelCatalog = { source: "native", checkedAt: "2026-09-12T00:00:00Z", error: null, models: Array.from({ length: 30 }, (_, index) => ({ model: `fixture-${index}`, displayName: `fixture-${index}`, efforts: ["high"], defaultEffort: "high" })) };
	const current: WwwSettings = { provider: "openai-codex", model: "fixture-29", effort: "high" };
	const picker = new ModelPickerOverlay(current, async provider => ({ state: "configured", provider, source: "fixture", type: "oauth" }), () => {}, async () => {}, () => {}, () => {}, current, false, { providers: ["openai-codex"], startAtModel: true, nativeCodex: true, appearance: "astra", catalog });
	const sheet = new AstraSheet(picker, () => 12, { followSelection: true });
	const rendered = stripTerminalSequences(sheet.render(76).join("\n"));
	expect(rendered).toMatch(/›\s+fixture-29/u);
});

test.each(["astra", "workbench"])("%s bounds long option lists and wraps selection without hiding it at 80x24", appearance => {
	const catalog: NativeModelCatalog = { source: "native", checkedAt: null, error: null, models: Array.from({ length: 30 }, (_, index) => ({ model: `fixture-${index}`, displayName: `fixture-${index}`, efforts: ["high"], defaultEffort: "high" })) };
	const current: WwwSettings = { provider: "openai-codex", model: "fixture-29", effort: "high" };
	const picker = new ModelPickerOverlay(current, async provider => ({ state: "configured", provider, source: "fixture", type: "oauth" }), () => {}, async () => {}, () => {}, () => {}, current, false, { providers: ["openai-codex"], startAtModel: true, nativeCodex: true, ...(appearance === "astra" ? { appearance: "astra" as const } : {}), catalog, maxVisibleOptions: () => 4 });
	const lines = picker.render(46);
	const plain = stripTerminalSequences(lines.join("\n"));
	// Includes room for wrapper borders inside a 70%-height overlay.
		expect(lines.length + 2).toBeLessThanOrEqual(Math.floor(24 * 0.7));
		expect(plain).toMatch(/›\s+fixture-29/u);
		expect(plain).toContain("30/30");
	picker.handleInput("\x1b[B");
	expect(stripTerminalSequences(picker.render(46).join("\n"))).toMatch(/›\s+fixture-0\b/u);
});
