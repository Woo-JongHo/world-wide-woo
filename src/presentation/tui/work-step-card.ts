import {
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
	type Component,
} from "@earendil-works/pi-tui";
import type { CommandStatus } from "../../domain/output";
import { isReasoningActivityPayload, type ProjectActivity, type ProjectActivityKind } from "../../domain/project-activity";
import { sanitizeTerminalTextExcerpt } from "../../domain/terminal";
import type { WorkbenchLiveActivity } from "../../domain/workbench";
import type { WorkStepNarration } from "../../domain/work-steps";
import { colors, semantic, syntaxHighlightPlugin } from "./theme";

const INPUT_MAX_LINES = 4;
const INPUT_MAX_CHARS = 1_200;
const OUTPUT_MAX_LINES = 10;
const OUTPUT_MAX_CHARS = 2_400;

const STATUS_LABEL: Record<CommandStatus, string> = {
	pending: "PENDING",
	running: "RUNNING",
	passed: "PASSED",
	failed: "FAILED",
	cancelled: "CANCELLED",
};

const STATUS_COLOR: Record<CommandStatus, (text: string) => string> = {
	pending: semantic.toolPending,
	running: semantic.toolRunning,
	passed: semantic.toolPassed,
	failed: semantic.toolFailed,
	cancelled: semantic.toolCancelled,
};

const STATUS_SYMBOL: Record<CommandStatus, string> = {
	pending: "•",
	running: "•",
	passed: "✔",
	failed: "✘",
	cancelled: "⚠",
};

const STATUS_SURFACE: Record<CommandStatus, (text: string) => string> = {
	pending: semantic.executionSurfacePending,
	running: semantic.executionSurfacePending,
	passed: semantic.executionSurfacePassed,
	failed: semantic.executionSurfaceFailed,
	cancelled: semantic.executionSurfaceCancelled,
};

interface WorkStepCardOptions {
	stepNumber: number;
	activity?: ProjectActivity;
	liveActivity?: WorkbenchLiveActivity;
	status?: CommandStatus;
	narration?: WorkStepNarration;
}

interface ObservationCardOptions {
	activity?: ProjectActivity;
	liveActivity?: WorkbenchLiveActivity;
}

interface PublicStepProjection {
	what: string;
	why: string;
	command?: string;
	exitCode?: number;
	durationMs?: number;
	input: readonly string[];
	output: readonly string[];
}

export type ExecutionLineTone =
	| "command"
	| "meta"
	| "output"
	| "success"
	| "warning"
	| "error"
	| "diff-added"
	| "diff-removed"
	| "diff-header"
	| "git-modified"
	| "git-untracked";

interface Field {
	label: string;
	value: unknown;
}

function clean(value: string): string {
	return sanitizeTerminalTextExcerpt(value, OUTPUT_MAX_CHARS, "head-tail").replace(/\t/gu, "    ");
}

function fit(text: string, width: number): string {
	const clipped = truncateToWidth(text, Math.max(0, width));
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? value as Readonly<Record<string, unknown>>
		: undefined;
}

function firstValue(sources: readonly (Readonly<Record<string, unknown>> | undefined)[], keys: readonly string[]): unknown {
	for (const source of sources) {
		if (!source) continue;
		for (const key of keys) {
			const value = source[key];
			if (value !== undefined && value !== null && value !== "") return value;
		}
	}
	return undefined;
}

function stringValue(value: unknown): string | undefined {
	if (typeof value === "string") return clean(value);
	if (Array.isArray(value) && value.every((part) => typeof part === "string")) return clean(value.join(" "));
	return undefined;
}

function numberValue(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function hiddenKey(key: string): boolean {
	const normalized = key.replace(/[-_]/gu, "").toLowerCase();
	return normalized.includes("reasoning")
		|| normalized.includes("thought")
		|| normalized.includes("analysis")
		|| normalized.startsWith("raw")
		|| normalized === "nativerefs"
		|| [
			"id",
			"threadid",
			"turnid",
			"itemid",
			"requestid",
			"approvalid",
			"callbackid",
			"processid",
			"commandid",
			"sessionid",
			"pluginid",
		].includes(normalized)
		|| normalized === "sourcedigest"
		|| normalized.endsWith("token")
		|| normalized.endsWith("secret")
		|| normalized.endsWith("password")
		|| normalized.endsWith("credential")
		|| normalized.endsWith("authorization")
		|| normalized.endsWith("apikey");
}

function publicValue(value: unknown, depth = 0): unknown {
	if (value === null || typeof value === "boolean" || typeof value === "number") return value;
	if (typeof value === "string") return clean(value);
	if (isReasoningActivityPayload(value)) return { classification: "reasoning", content: "[비공개 내용 생략]" };
	if (depth >= 4) return "[요약 제한]";
	if (Array.isArray(value)) return value.slice(0, 20).map((item) => publicValue(item, depth + 1));
	const source = record(value);
	if (!source) return String(value);
	return Object.fromEntries(Object.entries(source)
		.filter(([key]) => !hiddenKey(key))
		.slice(0, 30)
		.map(([key, item]) => [key, publicValue(item, depth + 1)]));
}

/** Removes native identifiers, hidden reasoning, raw envelopes, and secret-bearing fields for UI projections. */
export function publicPayloadProjection(value: unknown): unknown {
	return publicValue(value);
}

function displayValue(value: unknown): string {
	const safe = publicValue(value);
	if (typeof safe === "string") return safe;
	return clean(JSON.stringify(safe));
}

function statusOf(options: WorkStepCardOptions): CommandStatus {
	if (options.status) return options.status;
	const { activity, liveActivity: live } = options;
	if (live) return "running";
	if (!activity) return "running";
	if (activity.phase === "failed") return "failed";
	if (activity.phase === "cancelled") return "cancelled";
	const item = record(record(activity.payload.params)?.item);
	const publicStatus = stringValue(item?.status)?.toLowerCase();
	if (publicStatus?.includes("fail") || publicStatus?.includes("error")) return "failed";
	if (publicStatus?.includes("cancel") || publicStatus?.includes("declin")) return "cancelled";
	if (activity.phase === "started" || activity.phase === "updated") return "running";
	return "passed";
}

function methodLabel(method: string): string {
	const parts = clean(method).split("/").filter(Boolean);
	return parts.at(-1)?.replace(/(?:started|completed|updated)$/iu, "").replace(/[_-]+/gu, " ").trim() || "도구";
}

function toolLabel(sources: readonly (Readonly<Record<string, unknown>> | undefined)[], method: string): string {
	const direct = stringValue(firstValue(sources, ["toolName", "tool", "name"]));
	const server = stringValue(firstValue(sources, ["server", "serverName"]));
	if (server && direct) return `${server}.${direct}`;
	return direct || methodLabel(method);
}

function projection(options: WorkStepCardOptions): PublicStepProjection {
	const payload = options.activity?.payload;
	const params = record(payload?.params);
	const item = record(params?.item);
	const sources = [item, params, payload] as const;
	const method = options.liveActivity?.method
		?? stringValue(payload?.method)
		?? "native-tool";
	const normalized = `${method} ${stringValue(item?.type) ?? ""}`.toLowerCase();
	const command = stringValue(firstValue(sources, ["command", "cmd"]));
	const cwd = stringValue(firstValue(sources, ["cwd", "workingDirectory"]));
	const args = firstValue(sources, ["arguments", "args", "input"]);
	const exitCode = numberValue(firstValue(sources, ["exitCode"]));
	const durationMs = numberValue(firstValue(sources, ["durationMs"]));
	const path = stringValue(firstValue(sources, ["path", "filePath", "targetPath"]));
	const query = stringValue(firstValue(sources, ["query", "searchQuery", "pattern"]));
	const isCommand = command !== undefined || normalized.includes("command") || normalized.includes("bash") || normalized.includes("shell");
	const isFileChange = options.activity?.kind === "file-change" || options.liveActivity?.kind === "file-change" || normalized.includes("filechange");
	const isSearch = query !== undefined || normalized.includes("search") || normalized.includes("query");
	const isRead = path !== undefined && (normalized.includes("read") || normalized.includes("get"));
	const tool = toolLabel(sources, method);

	const what = isCommand
		? `명령 실행${command ? ` · ${command.replace(/\s+/gu, " ")}` : ""}`
		: isFileChange
			? `파일 변경${path ? ` · ${path}` : ""}`
			: isSearch
				? `검색${query ? ` · ${query.replace(/\s+/gu, " ")}` : ` · ${tool}`}`
				: isRead
					? `파일 확인 · ${path}`
					: `도구 호출 · ${tool}`;
	const why = isCommand
		? "명령 결과를 확인해 다음 작업을 안전하게 진행합니다."
		: isFileChange
			? "요청한 변경을 작업 파일에 반영하고 결과를 확인합니다."
			: isSearch
				? "관련 항목을 찾아 다음 작업의 대상을 좁힙니다."
				: isRead
					? "대상 내용을 확인해 필요한 변경 범위를 판단합니다."
					: "연결된 도구로 현재 단계에 필요한 작업을 수행합니다.";

	const inputFields: Field[] = [];
	if (command) inputFields.push({ label: "command", value: command });
	if (cwd) inputFields.push({ label: "cwd", value: cwd });
	if (args !== undefined) inputFields.push({ label: "args", value: args });
	if (path) inputFields.push({ label: "path", value: path });
	if (query) inputFields.push({ label: "query", value: query });

	const outputFields: Field[] = [];
	if (options.liveActivity?.text) outputFields.push({ label: "output", value: options.liveActivity.text });
	if (!options.liveActivity) {
		for (const [label, keys] of [
			["output", ["aggregatedOutput", "output", "stdout", "content"]],
			["stderr", ["stderr"]],
			["result", ["result", "changes", "diff"]],
			["error", ["error", "message"]],
			["exit", ["exitCode"]],
		] as const) {
			const value = firstValue(sources, keys);
			if (value !== undefined) outputFields.push({ label, value });
		}
	}
	if (outputFields.length === 0 && options.activity?.phase === "failed") {
		outputFields.push({ label: "error", value: "Native 도구 실행에 실패했습니다." });
	}

	const projected: PublicStepProjection = {
		what,
		why,
		command,
		exitCode,
		durationMs,
		input: inputFields.length > 0
			? inputFields.map(({ label, value }) => `${label}: ${displayValue(value)}`)
			: ["공개 입력 없음"],
		output: outputFields.length > 0
			? outputFields.flatMap(({ label, value }) => {
				const rendered = displayValue(value);
				const lines = rendered.split(/\r?\n/gu);
				return lines.length === 1 ? [`${label}: ${rendered}`] : [label, ...lines];
			})
			: [statusOf(options) === "running" || statusOf(options) === "pending" ? "결과를 기다리는 중" : "공개 출력 없음"],
	};
	if (!options.narration) return projected;
	const narratedCommand = options.narration.inputSummary
		.map((line) => /^command\s*:\s*(.*)$/iu.exec(line)?.[1])
		.find((value): value is string => Boolean(value));
	return {
		...projected,
		command: narratedCommand ?? projected.command,
		what: options.narration.what,
		why: options.narration.why ?? "",
		input: options.narration.inputSummary.length > 0
			? options.narration.inputSummary
			: projected.input,
	};
}

const BASH_OUTPUT_MAX_LINES = 10;
const BASH_SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

function bashStatusSymbol(status: CommandStatus): string {
	if (status === "running") return BASH_SPINNER[Math.floor(Date.now() / 80) % BASH_SPINNER.length] ?? "⠋";
	return STATUS_SYMBOL[status];
}

function bashBar(
	left: "┌" | "├",
	right: "┐" | "┤",
	label: string,
	width: number,
	border: (text: string) => string,
): string {
	const leftPart = border(`${left}───`);
	const rightPart = border(right);
	const available = Math.max(0, width - visibleWidth(leftPart) - visibleWidth(rightPart));
	const renderedLabel = truncateToWidth(` ${label} `, available);
	const fill = Math.max(0, width - visibleWidth(leftPart) - visibleWidth(renderedLabel) - visibleWidth(rightPart));
	return `${leftPart}${renderedLabel}${border("─".repeat(fill))}${rightPart}`;
}

function bashContent(line: string, width: number, border: (text: string) => string): string {
	if (width < 4) return fit(line, width);
	return `${border("│")} ${fit(line, width - 4)} ${border("│")}`;
}

function bashOutputLines(projected: PublicStepProjection, width: number): string[] {
	const contentWidth = Math.max(1, width - 4);
	const logical = projected.output.flatMap((line) => {
		if (/^(?:output|stdout|result)$/iu.test(line.trim()) || /^exit\s*:/iu.test(line.trim())) return [];
		return [line.replace(/^(?:output|stdout|result)\s*:\s*/iu, "")];
	});
	const visual = logical.flatMap((line) => wrapTextWithAnsi(line, contentWidth));
	if (visual.length <= BASH_OUTPUT_MAX_LINES) return visual;
	const shown = visual.slice(-BASH_OUTPUT_MAX_LINES);
	return [
		colors.muted(`… (${visual.length - shown.length} earlier lines, showing ${shown.length} of ${visual.length})`),
		...shown,
	];
}

function renderBashExecutionBlock(
	projected: PublicStepProjection,
	status: CommandStatus,
	width: number,
): string[] {
	if (!projected.command || width < 12) return [fit(projected.command ? `$ ${projected.command}` : "Bash", width)];
	const border = status === "running" || status === "pending"
		? colors.accent
		: status === "failed"
			? colors.error
			: status === "cancelled"
				? colors.warning
				: colors.muted;
	const surface = STATUS_SURFACE[status];
	const header = `${STATUS_COLOR[status](bashStatusSymbol(status))} ${colors.secondary("Bash")}`;
	const commandRows = wrapTextWithAnsi(`${colors.muted("$")} ${highlightedSource(projected.command, "bash")}`, width - 4);
	const outputRows = bashOutputLines(projected, width).map((line) => renderExecutionLine(line, "output"));
	const metadata: string[] = [];
	if (projected.exitCode !== undefined) metadata.push(`Exit: ${projected.exitCode}`);
	if (projected.durationMs !== undefined) metadata.push(`Duration: ${Math.max(0, Math.round(projected.durationMs))}ms`);
	const rows = [
		bashBar("┌", "┐", header, width, border),
		...commandRows.map((line) => bashContent(line, width, border)),
		bashBar("├", "┤", colors.secondary("Output"), width, border),
		...outputRows.map((line) => bashContent(line, width, border)),
		...metadata.map((value) => bashContent(colors.muted(`⟦${value}⟧`), width, border)),
		`${border("└───")}${border("─".repeat(Math.max(0, width - 5)))}${border("┘")}`,
	];
	return rows.map((row) => surface(fit(row, width)));
}

/** Semantic tone for executor lines. Kept independent from ANSI rendering so the visual rule is testable. */
export function executionLineTone(line: string, section: "input" | "output"): ExecutionLineTone {
	const value = line.trim();
	if (section === "input") {
		if (/^command\s*:/iu.test(value)) return "command";
		if (/^(?:args|cwd|path|query)\s*:/iu.test(value)) return "meta";
		return "output";
	}
	if (/^(?:stderr|error)\s*:/iu.test(value)) return "error";
	if (/^exit\s*:\s*(?!0(?:\D|$))\d+/iu.test(value)) return "error";
	if (/^exit\s*:\s*0(?:\D|$)/iu.test(value)) return "success";
	const gitStatus = /^([ MADRCU?!]{2})\s+.+$/u.exec(line);
	if (gitStatus?.[1] === "??") return "git-untracked";
	if (gitStatus?.[1]?.includes("A")) return "diff-added";
	if (gitStatus?.[1]?.includes("D")) return "diff-removed";
	if (gitStatus) return "git-modified";
	if (/^(?:diff --git\b|index\s+[\da-f]+\.\.[\da-f]+\b|@@\s)/iu.test(value)) return "diff-header";
	if (/^\+\+\+\s/u.test(value)) return "diff-added";
	if (/^---\s/u.test(value)) return "diff-removed";
	if (/^\+(?!\+\+)/u.test(value)) return "diff-added";
	if (/^-(?!---)/u.test(value)) return "diff-removed";
	if (/^(?:warn(?:ing)?s?\b|\d+\s+warn(?:ing)?s?\b)/iu.test(value)) return "warning";
	if (/^(?:fail(?:ed|ure|ures)?\b|error(?:s)?\b|\d+\s+(?:fail(?:ed|ure|ures)?|error(?:s)?)\b)/iu.test(value)) {
		return "error";
	}
	if (/^(?:pass(?:ed)?\b|success(?:es|ful)?\b|ok\b|\d+\s+(?:pass(?:ed)?|success(?:es)?|ok)\b)/iu.test(value)) {
		return "success";
	}
	if (/^(?:output|result|stdout)\s*:?$/iu.test(value)) return "meta";
	return "output";
}

function highlightedSource(source: string, language: "bash" | "json"): string {
	try {
		return syntaxHighlightPlugin.highlight(source, language).join("\n");
	} catch {
		return language === "bash" ? semantic.executionCommand(source) : colors.text(source);
	}
}

function highlightedWhat(projected: PublicStepProjection): string {
	return colors.success(projected.what);
}

export function renderExecutionLine(line: string, section: "input" | "output"): string {
	if (line.startsWith("… ")) return line;
	const tone = executionLineTone(line, section);
	if (tone === "command") {
		const match = /^(command\s*:\s*)(.*)$/iu.exec(line);
		return match ? `${colors.muted(match[1])}${highlightedSource(match[2], "bash")}` : semantic.executionCommand(line);
	}
	if (section === "input" && tone === "meta") {
		const match = /^([^:]+:\s*)(.*)$/u.exec(line);
		if (!match) return colors.muted(line);
		const value = match[2];
		const renderedValue = match[1].trimStart().startsWith("args:") && /^[{[]/u.test(value.trimStart())
			? highlightedSource(value, "json")
			: colors.text(value);
		return `${colors.muted(match[1])}${renderedValue}`;
	}
	const color = tone === "success"
		? colors.success
		: tone === "warning"
			? colors.warning
			: tone === "error"
				? colors.error
				: tone === "diff-added"
					? semantic.diffAdded
					: tone === "diff-removed"
						? semantic.diffRemoved
						: tone === "diff-header"
							? colors.accent
							: tone === "git-modified"
								? colors.warning
								: tone === "git-untracked"
									? colors.secondary
						: semantic.executionOutput;
	return color(line);
}

function boundedRows(
	lines: readonly string[],
	width: number,
	maximumLines: number,
	maximumChars: number,
	preserveTail: boolean,
	label: "입력" | "출력",
): string[] {
	const joined = clean(lines.join("\n"));
	const clippedByChars = joined.length > maximumChars;
	const clipped = clippedByChars
		? preserveTail ? joined.slice(-maximumChars) : joined.slice(0, maximumChars)
		: joined;
	const wrapped = clipped.split(/\r?\n/gu)
		.flatMap((line) => wrapTextWithAnsi(line, Math.max(1, width)));
	const omittedLines = Math.max(0, wrapped.length - maximumLines + 1);
	if (!clippedByChars && wrapped.length <= maximumLines) return wrapped;
	const marker = colors.muted(`… ${preserveTail ? "이전 " : "나머지 "}${label} ${Math.max(1, omittedLines)}줄 생략`);
	if (maximumLines <= 1) return [marker];
	return preserveTail
		? [marker, ...wrapped.slice(-(maximumLines - 1))]
		: [...wrapped.slice(0, maximumLines - 1), marker];
}

/** Compact, public projection of one native work item; it never renders the raw envelope. */
export class WorkStepCard implements Component {
	constructor(private readonly options: WorkStepCardOptions) {}

	invalidate(): void {}

	render(width: number): string[] {
		const projected = projection(this.options);
		const status = statusOf(this.options);
		const statusText = STATUS_COLOR[status](STATUS_LABEL[status]);
		if (width < 4) return [fit(`단계 ${this.options.stepNumber} · ${STATUS_LABEL[status]}`, width)];
		if (projected.command) {
			return [
				fit(`${semantic.assistantLabel(`단계 ${this.options.stepNumber}`)} · ${statusText}`, width),
				fit(highlightedWhat(projected), width),
				...(projected.why ? [fit(colors.warm(`왜 하는지: ${projected.why}`), width)] : []),
				...renderBashExecutionBlock(projected, status, width),
			];
		}
		const contentWidth = width - 4;
		const input = boundedRows(projected.input, contentWidth, INPUT_MAX_LINES, INPUT_MAX_CHARS, false, "입력");
		const output = boundedRows(projected.output, contentWidth, OUTPUT_MAX_LINES, OUTPUT_MAX_CHARS, true, "출력");
		const border = STATUS_COLOR[status];
		const surface = STATUS_SURFACE[status];
		const rows = [
			`${semantic.assistantLabel(`단계 ${this.options.stepNumber}`)} · ${statusText}`,
			highlightedWhat(projected),
			...(projected.why ? [colors.warm(`왜 하는지: ${projected.why}`)] : []),
			colors.border("─".repeat(contentWidth)),
			semantic.userLabel("입력 요약"),
			...input.map((line) => `  ${renderExecutionLine(line, "input")}`),
			semantic.assistantLabel("출력 요약"),
			...output.map((line) => `  ${renderExecutionLine(line, "output")}`),
		];
		return [
			border("─".repeat(width)),
			...rows.map((row) => surface(` ${fit(row, width - 1)}`)),
			border("─".repeat(width)),
		];
	}
}

/**
 * Gajae-style compact observation block. Read/Search/Inspect stay visible in
 * Chat without becoming semantic Steps or duplicating Todo progress.
 */
export class ObservationCard implements Component {
	constructor(private readonly options: ObservationCardOptions) {}

	invalidate(): void {}

	render(width: number): string[] {
		const stepOptions: WorkStepCardOptions = { stepNumber: 0, ...this.options };
		const projected = projection(stepOptions);
		const status = statusOf(stepOptions);
		if (projected.command) {
			const surface = STATUS_SURFACE[status];
			const header = `${STATUS_COLOR[status](STATUS_SYMBOL[status])} ${colors.text(observationLabel(projected.command))} ${colors.muted(`· ${STATUS_LABEL[status]}`)}`;
			return [surface(fit(` ${header}`, width)), ...renderBashExecutionBlock(projected, status, width)];
		}
		const surface = STATUS_SURFACE[status];
		const header = `${STATUS_COLOR[status](STATUS_SYMBOL[status])} ${colors.text(observationLabel(projected.command))} ${colors.muted(`· ${STATUS_LABEL[status]}`)}`;
		const lines: string[] = [header];
		if (projected.command) {
			lines.push(`${colors.muted("$")} ${highlightedSource(projected.command, "bash")}`);
		} else {
			lines.push(...projected.input.map((line) => renderExecutionLine(line, "input")));
		}
		const output = compactObservationOutput(projected.output, status);
		lines.push(...boundedRows(output, Math.max(1, width - 2), 8, OUTPUT_MAX_CHARS, true, "출력")
			.map((line) => renderExecutionLine(line, "output")));
		return lines.map((line) => surface(` ${fit(line, Math.max(1, width - 1))}`));
	}
}

function observationLabel(command: string | undefined): string {
	if (!command) return "Read";
	if (/\b(?:rg|grep|find)\b/iu.test(command)) return "Search";
	if (/\b(?:cat|head|tail)\b|\bsed\s+-n\b/iu.test(command)) return "Read";
	if (/\b(?:pwd|ls|eza|tree|stat|file|readlink|realpath)\b|\bgit\s+(?:status|diff|log|show|rev-parse)\b/iu.test(command)) return "Inspect";
	return "Observe";
}

function compactObservationOutput(lines: readonly string[], status: CommandStatus): string[] {
	const output = lines.flatMap((line) => {
		if (/^exit:\s*0\s*$/iu.test(line) || line === "공개 출력 없음") return [];
		if (/^(?:output|stdout|result):\s+/iu.test(line)) return [line.replace(/^(?:output|stdout|result):\s+/iu, "")];
		if (/^(?:output|stdout|result)$/iu.test(line)) return [];
		return [line];
	});
	if (output.length > 0) return output;
	return status === "running" || status === "pending" ? ["Running…"] : [];
}

export function isVisibleWorkStep(kind: ProjectActivityKind | WorkbenchLiveActivity["kind"]): boolean {
	return kind === "tool" || kind === "file-change";
}
