import { homedir }                               from "node:os";
import type { CommandStatus }                    from "@/core/domain/execution/output";
import { isReasoningActivityPayload }            from "@/core/domain/execution/project-activity";
import type { ProjectActivity }                  from "@/core/domain/execution/project-activity";
import { sanitizeTerminalTextExcerpt }           from "@/core/domain/execution/terminal";
import type { WorkbenchLiveActivity }            from "@/core/domain/work/workbench";
import type { WorkStepNarration }                from "@/core/domain/work";
import { highlightStructured, structuredOutput } from "@/adapters/inbound/tui/features/chat/work-step-output-renderer";
import { CHAT_PUBLIC_OUTPUT_MAX_CHARS }          from "@/adapters/inbound/tui/features/chat/chat-output-policy";

export interface WorkStepProjectionOptions {
	activity?     : ProjectActivity       ;
	liveActivity? : WorkbenchLiveActivity ;
	status?       : CommandStatus         ;
	narration?    : WorkStepNarration     ;
}

export interface PublicStepProjection {
	what        : string            ;
	why         : string            ;
	command?    : string            ;
	exitCode?   : number            ;
	durationMs? : number            ;
	input       : readonly string[] ;
	output      : readonly string[] ;
}

interface Field {
	label: string;
	value: unknown;
}

function clean(value: string): string {
	return sanitizeTerminalTextExcerpt(value, CHAT_PUBLIC_OUTPUT_MAX_CHARS, "head-tail").replace(/\t/gu, "    ");
}

function replacePathPrefix(value: string, path: string, replacement: string): string {
	const normalizedPath = path.replace(/[\\/]+$/gu, "");
	if (!normalizedPath) return value;
	const escaped = normalizedPath.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
	const boundary = "[\\s/\\\\\"':,;=()\\[\\]{}]";
	return value.replace(new RegExp(`(^|${boundary})${escaped}(?=$|${boundary})`, "gu"), `$1${replacement}`);
}

/** Shortens local paths only in terminal projections; persisted native activity remains raw. */
export function projectNativePathText(value: string, projectCwd?: string, home = homedir()): string {
	const project = projectCwd?.replace(/[\\/]+$/gu, "");
	const withProject = project ? replacePathPrefix(value, project, "$PROJECT") : value;
	return replacePathPrefix(withProject, home, "~");
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
	return isRecord(value) ? value : undefined;
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

function mcpContent(value: unknown): string | undefined {
	if (typeof value === "string") return value;
	if (!Array.isArray(value)) return undefined;
	const text = value.flatMap((part) => {
		if (typeof part === "string") return [part];
		const source = record(part);
		return typeof source?.text === "string" ? [source.text] : [];
	}).join("\n");
	return text || undefined;
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
			"id", "threadid", "turnid", "itemid", "requestid", "approvalid", "callbackid",
			"processid", "commandid", "sessionid", "pluginid",
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
	if (depth >= 4) return "[공개 결과 일부 생략]";
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

function displayValue(value: unknown, projectCwd?: string): string {
	const safe = publicValue(value);
	if (typeof safe === "string") return projectNativePathText(safe, projectCwd);
	return projectNativePathText(clean(JSON.stringify(safe)), projectCwd);
}

export function resolveWorkStepStatus(options: WorkStepProjectionOptions): CommandStatus {
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

export function projectWorkStep(options: WorkStepProjectionOptions): PublicStepProjection {
	const payload        = options.activity?.payload                                                                 ;
	const params         = record(payload?.params)                                                                   ;
	const item           = record(params?.item)                                                                      ;
	const sources        = [item, params, payload]                                                                   ;
	const method         = options.liveActivity?.method ?? stringValue(payload?.method) ?? "native-tool"             ;
	const normalized     = `${method} ${stringValue(item?.type) ?? ""}`.toLowerCase()                                ;
	const rawCommand     = stringValue(firstValue(sources, ["command", "cmd"]))                                      ;
	const cwd            = stringValue(firstValue(sources, ["cwd", "workingDirectory"]))                             ;
	const command        = rawCommand && projectNativePathText(rawCommand, cwd)                                      ;
	const args           = firstValue(sources, ["arguments", "args", "input"])                                       ;
	const argumentRecord = record(args)                                                                              ;
	const mcpResult      = normalized.includes("mcptoolcall") ? record(item?.result) : undefined                     ;
	const mcpOutput      = mcpResult?.structuredContent ?? mcpContent(mcpResult?.content)                            ;
	const exitCode       = numberValue(firstValue(sources, ["exitCode"]))                                            ;
	const durationMs     = numberValue(firstValue(sources, ["durationMs"]))                                          ;
	const rawPath        = stringValue(firstValue([...sources, argumentRecord], ["path", "filePath", "targetPath"])) ;
	const path           = rawPath && projectNativePathText(rawPath, cwd)                                            ;
	const query          = stringValue(firstValue(sources, ["query", "searchQuery", "pattern"]))                     ;
	const isCommand      = (
		command !== undefined
		|| normalized.includes("command")
		|| normalized.includes("bash")
		|| normalized.includes("shell")
	)        ;
	const isFileChange = options.activity?.kind === "file-change" || options.liveActivity?.kind === "file-change" || normalized.includes("filechange") ;
	const isSearch     = query !== undefined || normalized.includes("search") || normalized.includes("query")                                          ;
	const isRead       = path !== undefined && (normalized.includes("read") || normalized.includes("get"))                                             ;
	const tool         = toolLabel(sources, method)                                                                                                    ;

	const what = isCommand
		? `명령 실행${command ? ` · ${command.replace(/\s+/gu, " ")}` : ""}`
		: isFileChange ? `파일 변경${path ? ` · ${path}` : ""}`
			: isSearch ? `검색${query ? ` · ${query.replace(/\s+/gu, " ")}` : ` · ${tool}`}`
				: isRead ? `파일 확인 · ${path}` : `도구 호출 · ${tool}`;
	const why = isCommand
		? "명령 결과를 확인해 다음 작업을 안전하게 진행합니다."
		: isFileChange ? "요청한 변경을 작업 파일에 반영하고 결과를 확인합니다."
			: isSearch ? "관련 항목을 찾아 다음 작업의 대상을 좁힙니다."
				: isRead ? "대상 내용을 확인해 필요한 변경 범위를 판단합니다."
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
		if (mcpOutput !== undefined) {
			outputFields.push({ label: "output", value: mcpOutput });
		} else {
			const outputFieldKeys: ReadonlyArray<readonly [string, readonly string[]]> = [
				["output", ["aggregatedOutput", "output", "stdout", "content"]],
				["stderr", ["stderr"]],
				["result", ["result", "changes", "diff"]],
				["error", ["error", "message"]],
				["exit", ["exitCode"]],
			];
			for (const [label, keys] of outputFieldKeys) {
				const value = firstValue(sources, keys);
				if (value !== undefined) outputFields.push({ label, value });
			}
		}
	}
	if (outputFields.length === 0 && options.activity?.phase === "failed") {
		outputFields.push({ label: "error", value: "Native 도구 실행에 실패했습니다." });
	}

	const status = resolveWorkStepStatus(options);
	const projected: PublicStepProjection = {
		what,
		why,
		...(command ? { command } : {}),
		...(exitCode === undefined ? {} : { exitCode }),
		...(durationMs === undefined ? {} : { durationMs }),
		input: inputFields.length > 0
			? inputFields.map(({ label, value }) => `${label}: ${displayValue(value, cwd)}`)
			: ["공개 입력 없음"],
		output: outputFields.length > 0
			? outputFields.flatMap(({ label, value }) => {
				const rendered = displayValue(value, cwd);
				const display = /^(?:output|stdout|result)$/iu.test(label)
					? structuredOutput(rawPath ?? path ?? "", rendered)
					: { value: rendered };
				const lines = display.language
					? highlightStructured(display.value, display.language)
					: display.value.split(/\r?\n/gu);
				return lines.length === 1 ? [`${label}: ${lines[0]}`] : [label, ...lines];
			})
			: [status === "running" || status === "pending" ? "결과를 기다리는 중" : "공개 출력 없음"],
	};
	if (!options.narration) return projected;
	const narratedCommand = options.narration.inputSummary
		.map((line) => /^command\s*:\s*(.*)$/iu.exec(line)?.[1])
		.find((value): value is string => Boolean(value));
	return {
		...projected,
		...(narratedCommand ? { command: projectNativePathText(narratedCommand, cwd) } : {}),
		what: projectNativePathText(options.narration.what, cwd),
		why: projectNativePathText(options.narration.why ?? "", cwd),
		input: options.narration.inputSummary.length > 0
			? options.narration.inputSummary.map((line) => projectNativePathText(line, cwd))
			: projected.input,
	};
}

export function workStepActionLabel(options: WorkStepProjectionOptions): "Bash" | "Edit" | "Tool" {
	if (options.activity?.kind === "file-change" || options.liveActivity?.kind === "file-change") return "Edit";
	const payload    = options.activity?.payload                                          ;
	const params     = record(payload?.params)                                            ;
	const item       = record(params?.item)                                               ;
	const nativeType = stringValue(item?.type) ?? ""                                      ;
	const method     = options.liveActivity?.method ?? stringValue(payload?.method) ?? "" ;
	if (/command|bash|shell/iu.test(`${nativeType} ${method}`)) return "Bash";
	return "Tool";
}
