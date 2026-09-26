import type { Component }                            from "@earendil-works/pi-tui";
import type { CommandStatus }                        from "@/core/domain/execution/output";
import type { ProjectActivity, ProjectActivityKind } from "@/core/domain/execution/project-activity";
import type { WorkbenchLiveActivity }                from "@/core/domain/work/workbench";
import type { WorkStepNarration }                    from "@/core/domain/work";
import { colors, semantic }                          from "@/adapters/inbound/tui/foundation/theme/theme";
import { CHAT_PUBLIC_OUTPUT_MAX_CHARS }              from "@/adapters/inbound/tui/features/chat/view/chat-output-policy";
import {
	boundedExecutionRows,
	fitExecutionText,
	renderBashExecutionBlock,
	renderExecutionLine,
	workStepStatusPresentation,
} from "@/adapters/inbound/tui/features/chat/view/work-step-output-renderer";
import {
	projectWorkStep,
	resolveWorkStepStatus,
	workStepActionLabel,
} from "@/adapters/inbound/tui/features/chat/view/work-step-public-projection";
import type { WorkStepProjectionOptions }            from "@/adapters/inbound/tui/features/chat/view/work-step-public-projection";

const INPUT_MAX_LINES  = 4     ;
const INPUT_MAX_CHARS  = 1_200 ;
const OUTPUT_MAX_LINES = 10    ;

interface WorkStepCardOptions extends WorkStepProjectionOptions {
	stepNumber    : number                ;
	activity?     : ProjectActivity       ;
	liveActivity? : WorkbenchLiveActivity ;
	status?       : CommandStatus         ;
	narration?    : WorkStepNarration     ;
}

export interface ObservationCardOptions {
	activity?: ProjectActivity;
	liveActivity?: WorkbenchLiveActivity;
	/** Labels a native action as executable/editing work instead of a read-only observation. */
	mode?: "observation" | "action";
	/** Preserves plan context when this is an intermediate action within a larger step. */
	parentStepNumber?: number;
}

/** Compact, public projection of one native work item; it never renders the raw envelope. */
export class WorkStepCard implements Component {
	constructor(private readonly options: WorkStepCardOptions) {}

	invalidate(): void {}

	render(width: number): string[] {
		const projected    = projectWorkStep(this.options)       ;
		const status       = resolveWorkStepStatus(this.options) ;
		const presentation = workStepStatusPresentation(status)  ;
		if (width < 4) return [fitExecutionText(`단계 ${this.options.stepNumber} · ${presentation.label}`, width)];
		if (projected.command) {
			return [
				fitExecutionText(`${semantic.assistantLabel(`단계 ${this.options.stepNumber}`)} · ${presentation.text}`, width),
				...renderBashExecutionBlock(projected, status, width),
			];
		}
		const contentWidth = width - 4                                                                                                          ;
		const input        = boundedExecutionRows(projected.input, contentWidth, INPUT_MAX_LINES, INPUT_MAX_CHARS, false, "입력")               ;
		const output       = boundedExecutionRows(projected.output, contentWidth, OUTPUT_MAX_LINES, CHAT_PUBLIC_OUTPUT_MAX_CHARS, true, "출력") ;
		const rows = [
			`${semantic.assistantLabel(`단계 ${this.options.stepNumber}`)} · ${presentation.text}`,
			colors.success(projected.what),
			...(projected.why ? [colors.warm(`왜 하는지: ${projected.why}`)] : []),
			...input.map((line) => renderExecutionLine(line, "input")),
			...output.map((line) => renderExecutionLine(line, "output")),
		];
		return [
			presentation.border("─".repeat(width)),
			...rows.map((row) => presentation.surface(` ${fitExecutionText(row, width - 1)}`)),
			presentation.border("─".repeat(width)),
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
		const stepOptions : WorkStepCardOptions = { stepNumber: 0, ...this.options }                   ;
		const projected                         = projectWorkStep(stepOptions)                         ;
		const status                            = resolveWorkStepStatus(stepOptions)                   ;
		const presentation                      = workStepStatusPresentation(status)                   ;
		const changes                           = fileChangeRows(this.options.activity, status, width) ;
		if (changes) return changes.map((line) => presentation.surface(fitExecutionText(` ${line}`, Math.max(1, width - 1))));
		const label                             = activityLabel(this.options, projected.command, stepOptions)                               ;
		const header                            = `${presentation.symbol} ${colors.text(label)} ${colors.muted(`· ${presentation.label}`)}` ;
		if (projected.command) {
			return [presentation.surface(fitExecutionText(` ${header}`, width)), ...renderBashExecutionBlock(projected, status, width)];
		}
		const lines: string[] = [header];
		lines.push(...projected.input.map((line) => renderExecutionLine(line, "input")));
		const output = compactObservationOutput(projected.output, status);
		lines.push(...boundedExecutionRows(output, Math.max(1, width - 2), 8, CHAT_PUBLIC_OUTPUT_MAX_CHARS, true, "출력")
			.map((line) => renderExecutionLine(line, "output")));
		return lines.map((line) => presentation.surface(` ${fitExecutionText(line, Math.max(1, width - 1))}`));
	}
}

function fileChangeRows(activity: ProjectActivity | undefined, status: CommandStatus, width: number): string[] | null {
	if (activity?.kind !== "file-change") return null;
	const params  = object(activity.payload.params)                                                               ;
	const item    = object(params?.item)                                                                          ;
	const changes = Array.isArray(item?.changes) ? item.changes.flatMap(change => projectFileChange(change)) : [] ;
	if (!changes.length) return null;
	const nameWidth = Math.max(...changes.map(change => change.name.length));
	return changes.map(change => {
		const counts = [
			change.added === null ? "" : colors.success(`+${change.added}`),
			change.removed === null ? "" : colors.error(`-${change.removed}`),
		].filter(Boolean).join("  ");
		const row = `${fileChangeSymbol(status)} ${colors.text("CHANGE")}  ${change.name.padEnd(nameWidth)}${counts ? `  ${counts}` : ""}`;
		return fitExecutionText(row, Math.max(1, width - 1));
	});
}

function projectFileChange(value: unknown): { name: string; added: number | null; removed: number | null }[] {
	const change = object(value);
	const path   = typeof change?.path === "string" ? change.path.replace(/\\/gu, "/") : "";
	if (!path) return [];
	const diff    = typeof change?.diff === "string" ? change.diff.split(/\r?\n/u) : null                ;
	const added   = diff?.filter(line => line.startsWith("+") && !line.startsWith("+++")).length ?? null ;
	const removed = diff?.filter(line => line.startsWith("-") && !line.startsWith("---")).length ?? null ;
	return [{ name: path.split("/").at(-1) ?? path, added, removed }];
}

function fileChangeSymbol(status: CommandStatus): string {
	if (status === "passed") return colors.success("✓");
	if (status === "failed") return colors.error("✕");
	if (status === "cancelled") return colors.warning("−");
	return colors.warning("•");
}

function object(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function activityLabel(
	options: ObservationCardOptions,
	command: string | undefined,
	stepOptions: WorkStepCardOptions,
): string {
	if ((options.mode ?? "observation") !== "action") return observationLabel(command);
	const label = workStepActionLabel(stepOptions);
	return options.parentStepNumber === undefined ? label : `단계 ${options.parentStepNumber} › ${label}`;
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
