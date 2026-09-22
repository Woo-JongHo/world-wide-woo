import type { WorkbenchCommandReceipt, WorkbenchSnapshot } from "../../../../core/domain/work/workbench";
import { CODEX_EFFORTS, DEFAULT_SETTINGS, PROVIDERS, type Effort, type Provider, type WwwSettings } from "../../../../core/domain/execution/model-settings";
import { DEFAULT_WORKBENCH_CONFIG } from "../../../../core/domain/execution/workbench-config";

export function workbenchReceiptNotice(receipt: WorkbenchCommandReceipt): string {
	if (receipt.state === "accepted") return receipt.message || "";
	if (receipt.state === "queued") return receipt.message || "메시지를 Chat에 올렸습니다. 현재 응답 뒤 바로 전송합니다.";
	if (receipt.state === "uncertain") return `${receipt.reason} 자동 재시도하지 않습니다. /cancel로 서버 상태를 확인하세요.`;
	return receipt.reason;
}

export function workbenchReceiptClearsComposer(receipt: WorkbenchCommandReceipt): boolean {
	return receipt.state !== "rejected";
}

export type WorkbenchRuntimeMode = "bypass" | "manual" | "plan";

export interface WorkbenchRuntimeConfiguration {
	readonly permission: "all" | "manual";
	readonly collaboration: "manual" | "plan";
}

export function workbenchRuntimeMode(source: Pick<WorkbenchSnapshot, "permissionMode" | "collaborationMode">): WorkbenchRuntimeMode {
	if (source.permissionMode === "all") return "bypass";
	return source.collaborationMode === "plan" ? "plan" : "manual";
}

export function nextWorkbenchRuntimeMode(source: Pick<WorkbenchSnapshot, "permissionMode" | "collaborationMode">): WorkbenchRuntimeMode {
	const current = workbenchRuntimeMode(source);
	return current === "bypass" ? "manual" : current === "manual" ? "plan" : "bypass";
}

export function workbenchRuntimeConfiguration(mode: WorkbenchRuntimeMode): WorkbenchRuntimeConfiguration {
	if (mode === "bypass") return { permission: "all", collaboration: "manual" };
	if (mode === "plan") return { permission: "manual", collaboration: "plan" };
	return { permission: "manual", collaboration: "manual" };
}

export function loginProviderFromInput(text: string): Provider | null {
	const value = text.trim().toLocaleLowerCase("en-US");
	const alias = value === "codex" || value === "chatgpt" ? "openai-codex"
		: value === "claude" ? "anthropic"
			: value === "gemini" ? "google" : value;
	return (PROVIDERS as readonly string[]).includes(alias) ? alias as Provider : null;
}

export function workbenchModelSettings(source: Pick<WorkbenchSnapshot, "model" | "effort">): WwwSettings {
	return {
		provider: "openai-codex",
		model: source.model ?? DEFAULT_SETTINGS.model,
		effort: CODEX_EFFORTS.includes(source.effort as Effort)
			? source.effort as Effort
			: DEFAULT_WORKBENCH_CONFIG.execution.effort,
	};
}

export function workbenchPaneNotice(pane: "chat" | "tnotes" | "todo"): string {
	const location = pane === "chat" ? "왼쪽 Chat · 질문과 공개 응답"
		: pane === "tnotes" ? "완료 질문 Report · Note" : "현재 Plan · Activity · Next";
	return `${location} pane은 현재 화면에 계속 표시됩니다.`;
}
