import type { ProjectActivity } from "@/core/domain/execution/project-activity";

export type RequestTestStatus = "running" | "passed" | "failed" | "unknown";
export interface ObservedFailedTest {
	readonly name: string;
	readonly rawError: string | null;
}
export interface ObservedTestSuite {
	readonly name       : string                        ;
	readonly pass       : number                        ;
	readonly fail       : number                        ;
	readonly skip       : number                        ;
	readonly durationMs : number | null                 ;
	readonly failures   : readonly ObservedFailedTest[] ;
}
export interface ObservedTestRun {
	readonly id              : string                       ;
	readonly turnId?         : string | null                ;
	readonly command         : string                       ;
	readonly executedCommand : string | null                ;
	readonly status          : RequestTestStatus            ;
	readonly exitCode        : number | null                ;
	readonly durationMs      : number | null                ;
	readonly pass            : number | null                ;
	readonly fail            : number | null                ;
	readonly skip            : number | null                ;
	readonly suites          : readonly ObservedTestSuite[] ;
	readonly failureNames    : readonly string[]            ;
	readonly totalsSource    : "command-output" | "log-readback" | "unobserved" ;
	readonly outputTruncated : boolean                      ;
	readonly sequence        : number                       ;
}
export interface RequestTestWorkspace { readonly runs: readonly ObservedTestRun[] }

const record              = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {} ;
const itemOf              = (activity: ProjectActivity): Record<string, unknown> => record(record(activity.payload.params).item)                                             ;
const actualCommand = (command: string): string => {
	const shell   = /^\/bin\/(?:zsh|bash)\s+-lcr?\s+(["'])([\s\S]*)\1$/u.exec(command.trim()) ;
	return shell?.[2] ?? command.trim();
};
export const verificationCommand = (command: string): boolean => {
	return /^(?:(?:bun|npm|pnpm|yarn)\s+(?:run\s+)?(?:test|check|lint|build|typecheck)(?:\s|$)|(?:npx\s+)?(?:tsc|eslint|pytest|vitest|jest)(?:\s|$)|(?:\.\/)?gradlew\s+(?:test|check|build)(?:\s|$))/u.test(actualCommand(command));
};
const redirectedLogPath = (command: string): string | null => />\s*([^\s;&|]+)\s+2>&1(?:\s|$)/u.exec(actualCommand(command))?.[1] ?? null;

function readbackOutput(activities: readonly ProjectActivity[], last: ProjectActivity, command: string): string {
	const path = redirectedLogPath(command);
	if (!path) return "";
	return activities.filter(activity => {
		if (activity.kind !== "tool" || activity.sequence <= last.sequence || activity.nativeRefs.turnId !== last.nativeRefs.turnId) return false;
		const item = itemOf(activity);
		const readCommand = typeof item.command === "string" ? actualCommand(item.command) : "";
		return /^(?:rg|cat|tail|sed)\s/u.test(readCommand) && readCommand.includes(path) && typeof item.aggregatedOutput === "string";
	}).map(activity => String(itemOf(activity).aggregatedOutput).replace(/^\d+:/gmu, "")).join("\n");
}

function parseBunOutput(output: string): Pick<ObservedTestRun, "suites" | "pass" | "fail" | "skip" | "durationMs" | "failureNames"> & { summaryObserved: boolean } {
	const suites      : { name: string; pass: number; fail: number; skip: number; durationMs: number | null; failures: ObservedFailedTest[] }[] = []   ;
	const failureNames: string[] = [];
	let suite         : (typeof suites)[number] | null                                                                                          = null ;
	let failed        : { name: string; lines: string[] } | null                                                                                = null ;
	let pass          : number | null                                                                                                           = null ;
	let fail          : number | null                                                                                                           = null ;
	let skip          : number | null                                                                                                           = null ;
	let durationMs    : number | null                                                                                                           = null ;
	let observedTotal : number | null                                                                                                           = null ;
	const flushFailure = () => {
		if (suite && failed) suite.failures.push({ name: failed.name, rawError: failed.lines.length ? failed.lines.join("\n") : null });
		failed = null;
	};
	for (const line of output.replace(/\x1b\[[0-9;]*m/gu, "").split(/\r?\n/u)) {
		const header = /^(.+\.(?:test|spec)\.[cm]?[jt]sx?):\s*$/u.exec(line);
		if (header) {
			flushFailure();
			suite = { name: header[1]!, pass: 0, fail: 0, skip: 0, durationMs: null, failures: [] };
			suites.push(suite);
			continue;
		}
		const caseLine = /^\((pass|fail|skip)\) (.*?)(?: \[([^\]]+)\])?\s*$/u.exec(line);
		if (caseLine?.[1] === "fail") failureNames.push(caseLine[2]!);
		if (caseLine && suite) {
			flushFailure();
			if (caseLine[1] === "pass") suite.pass += 1;
			if (caseLine[1] === "fail") { suite.fail += 1; failed = { name: caseLine[2]!, lines: [] }; }
			if (caseLine[1] === "skip") suite.skip += 1;
			continue;
		}
		const summary = /^\s*(\d+) (pass|fail|skip)\s*$/u.exec(line);
		if (summary) {
			flushFailure();
			const count = Number(summary[1]);
			if (summary[2] === "pass") pass = count;
			if (summary[2] === "fail") fail = count;
			if (summary[2] === "skip") skip = count;
			continue;
		}
		const endLine = /^Ran (\d+) tests? across \d+ files?\. \[([\d.]+)(ms|s)\]$/u.exec(line);
		if (endLine) {
			flushFailure();
			observedTotal = Number(endLine[1]);
			durationMs = Number(endLine[2]) * (endLine[3] === "s" ? 1000 : 1);
			continue;
		}
		if (failed && line.trim()) failed.lines.push(line);
	}
	flushFailure();
	if (suites.length) {
		pass ??= suites.reduce((total, current) => total + current.pass, 0);
		fail ??= suites.reduce((total, current) => total + current.fail, 0);
	}
	if (skip === null && observedTotal !== null && pass !== null && fail !== null) skip = observedTotal >= pass + fail ? observedTotal - pass - fail : null;
	if (skip === null && observedTotal === null && suites.length) skip = suites.reduce((total, current) => total + current.skip, 0);
	return { suites, pass, fail, skip, durationMs, failureNames: [...new Set(failureNames)], summaryObserved: observedTotal !== null && pass !== null && fail !== null };
}

/** Only commandExecution observations and literal runner output contribute to this projection. */
export function projectRequestTestWorkspace(input: { readonly activities: readonly ProjectActivity[]; readonly requireCodeChange?: boolean }): RequestTestWorkspace {
	const groups = new Map<string, ProjectActivity[]>();
	const changedTurns = new Map<string, number>();
	for (const activity of input.activities) {
		if (activity.kind !== "file-change" || activity.phase !== "completed") continue;
		const turnId = activity.nativeRefs.turnId;
		if (turnId) changedTurns.set(turnId, Math.min(changedTurns.get(turnId) ?? activity.sequence, activity.sequence));
	}
	for (const activity of input.activities) {
		if (activity.kind !== "tool") continue;
		const item    = itemOf(activity)                                       ;
		const command = typeof item.command === "string" ? item.command : null ;
		const changedAt = changedTurns.get(activity.nativeRefs.turnId ?? "") ;
		if (item.type !== "commandExecution" || !command || !verificationCommand(command) || input.requireCodeChange && (changedAt === undefined || activity.sequence <= changedAt)) continue;
		const key = [activity.nativeRefs.threadId ?? "", activity.nativeRefs.turnId ?? "", activity.nativeRefs.itemId ?? activity.id].join("/");
		groups.set(key, [...groups.get(key) ?? [], activity]);
	}
	const runs = [...groups.values()].map(events => {
		events.sort((a, b) => a.sequence - b.sequence);
		const first           = events[0]!                                                                                                                                     ;
		const last            = events.at(-1)!                                                                                                                                 ;
		const item            = itemOf(last)                                                                                                                                   ;
		const command         = String(item.command)                                                                                                                           ;
		const ownOutput       = typeof item.aggregatedOutput === "string" ? item.aggregatedOutput : ""                                                                         ;
		const readback        = readbackOutput(input.activities, last, command)                                                                                                 ;
		const output          = [ownOutput, readback].filter(Boolean).join("\n")                                                                                               ;
		const executedCommand = /^\$ ((?:tsc|eslint|vitest|jest|pytest)(?:\s+-[\w-]+)*)$/mu.exec(output)?.[1] ?? null                                                        ;
		const parsed          = parseBunOutput(output)                                                                                                                         ;
		const exitCode        = typeof item.exitCode === "number" ? item.exitCode : null                                                                                       ;
		const terminal        = last.phase === "completed" || last.phase === "failed" || last.phase === "cancelled"                                                            ;
		const start           = Date.parse(first.recordedAt)                                                                                                                   ;
		const end             = Date.parse(last.recordedAt)                                                                                                                    ;
		const durationMs      = terminal ? parsed.durationMs ?? (events.length > 1 && Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : null) : null ;
		const outputTruncated = events.some(event => event.payload.observationTruncated === true)                                                                              ;
		const totalsObserved = parsed.summaryObserved || !outputTruncated && !readback;
		const totalsSource = parsed.summaryObserved ? readback && !parseBunOutput(ownOutput).summaryObserved ? "log-readback" : "command-output" : "unobserved";
		return { id: first.nativeRefs.itemId ?? first.id, turnId: first.nativeRefs.turnId ?? null, command, executedCommand, status: !terminal ? "running" : exitCode === 0 ? "passed" : exitCode !== null || last.phase === "failed" ? "failed" : "unknown", exitCode, durationMs, pass: totalsObserved ? parsed.pass : null, fail: totalsObserved ? parsed.fail : null, skip: totalsObserved ? parsed.skip : null, suites: parsed.suites, failureNames: parsed.failureNames, totalsSource, outputTruncated, sequence: first.sequence } satisfies ObservedTestRun;
	});
	return { runs: runs.sort((a, b) => a.sequence - b.sequence) };
}
