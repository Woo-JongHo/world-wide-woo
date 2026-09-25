import type { ProjectActivity } from "@/core/domain/execution/project-activity.js";

export type WorkStepStatus =
	| "pending"
	| "running"
	| "completed"
	| "failed"
	| "cancelled";

export type NativePlanRevisionValidationCode =
	| "non_string_entry"
	| "blank_entry";

export interface NativePlanRevisionEntry {
	/** NFKC/whitespace canonical text used for identity hashing. Never redacted. */
	readonly identityText: string;
	/** Original parsed step text. The facade applies bounded public redaction. */
	readonly sourceTitle: string;
	readonly status: WorkStepStatus;
}

export type NativePlanRevisionRead =
	| { readonly kind: "not-plan-revision" }
	| {
		readonly kind: "invalid-plan-revision";
		readonly code: NativePlanRevisionValidationCode;
	}
	| {
		readonly kind: "valid-plan-revision";
		readonly entries: readonly NativePlanRevisionEntry[];
	};

interface RawPlanEntry {
	readonly step: string;
	readonly status: unknown;
}

type RawPlanRead =
	| { readonly entries: readonly RawPlanEntry[]; readonly error?: undefined }
	| { readonly error: NativePlanRevisionValidationCode; readonly entries?: undefined };

/** Recognizes and fail-closed decodes one provider activity without hashing or presentation. */
export function readNativePlanRevision(
	activity: ProjectActivity,
): NativePlanRevisionRead {
	if (!isPlanRevision(activity)) return { kind: "not-plan-revision" };
	const parsed = rawPlanEntries(activity);
	if (parsed.error) {
		return { kind: "invalid-plan-revision", code: parsed.error };
	}
	const entries: NativePlanRevisionEntry[] = [];
	for (const value of parsed.entries) {
		const identityText = canonicalIdentityText(value.step);
		if ([...value.step].length > 4_096 || !identityText) {
			return { kind: "invalid-plan-revision", code: "blank_entry" };
		}
		entries.push({
			identityText,
			sourceTitle: value.step,
			status: planStatus(value.status),
		});
	}
	return { kind: "valid-plan-revision", entries };
}

function isPlanRevision(activity: ProjectActivity): boolean {
	if (
		activity.payload.method === "turn/plan/updated" ||
		activity.payload.method === "turn/plan/public-fallback"
	) return true;
	if (activity.payload.method !== "item/completed") return false;
	const item = record(record(activity.payload.params)?.item);
	return typeof item?.type === "string" && item.type.toLowerCase() === "plan";
}

function rawPlanEntries(
	activity: ProjectActivity,
): RawPlanRead {
	const params = record(activity.payload.params);
	if (
		activity.payload.method === "turn/plan/updated" ||
		activity.payload.method === "turn/plan/public-fallback"
	) {
		if (!params || !Array.isArray(params.plan) || params.plan.length > 256) {
			return { error: "non_string_entry" };
		}
		const values = params.plan.map(record);
		if (values.some((entry) => typeof entry?.step !== "string")) {
			return { error: "non_string_entry" };
		}
		return {
			entries: values.map((entry) => ({
				step: entry?.step as string,
				status: entry?.status,
			})),
		};
	}
	const item = record(params?.item);
	if (!item || typeof item.text !== "string") {
		return { error: "non_string_entry" };
	}
	const numberedHeadings: RawPlanEntry[] = [];
	let headingNumber = 0;
	for (const line of item.text.replace(/\r\n?/gu, "\n").split("\n")) {
		const heading = /^\s*#{2,6}\s+(\d+)[.)]\s+(.+?)\s*$/u.exec(line);
		if (!heading) continue;
		const number = Number(heading[1]);
		if (number !== headingNumber + 1) return { error: "non_string_entry" };
		headingNumber = number;
		numberedHeadings.push({
			step: markdownPlanTitle(heading[2]),
			status: numberedHeadings.length === 0 ? "inProgress" : "pending",
		});
	}
	if (numberedHeadings.length > 0) return { entries: numberedHeadings };
	const plainNumbered = nativePlainNumberedPlanBlock(item.text);
	if (plainNumbered) return { entries: plainNumbered };
	const entries     : RawPlanEntry[] = []               ;
	let numberedCount                  = 0                ;
	let precedingStep : "numbered" | "bullet" | undefined ;
	for (const line of item.text.replace(/\r\n?/gu, "\n").split("\n")) {
		if (!line.trim() || /^\s*#{1,6}\s+/u.test(line)) {
			precedingStep = undefined;
			continue;
		}
		const numbered       = /^(\d+)\.\s+(.+?)\s*$/u.exec(line)   ;
		const bullet         = /^[-*+]\s+(.+?)\s*$/u.exec(line)     ;
		const indentedBullet = /^([ ]+)[-*+]\s+.+?\s*$/u.exec(line) ;
		if (indentedBullet) {
			if (precedingStep !== "numbered") return { error: "non_string_entry" };
			continue;
		}
		if (!numbered && !bullet) return { error: "non_string_entry" };
		if (numbered) {
			const number = Number(numbered[1]);
			if (number !== numberedCount + 1) return { error: "non_string_entry" };
			numberedCount = number;
		}
		const value = numbered?.[2] ?? bullet![1];
		const explicit = markdownPlanEntry(value);
		if (!explicit) return { error: "non_string_entry" };
		const status = markdownPlanStatus(explicit.status);
		if (!status) return { error: "non_string_entry" };
		if (entries.length >= 256) return { error: "non_string_entry" };
		entries.push({ step: explicit.step, status });
		precedingStep = numbered ? "numbered" : "bullet";
	}
	return entries.length ? { entries } : { error: "blank_entry" };
}

function nativePlainNumberedPlanBlock(text: string): RawPlanEntry[] | undefined {
	const entries: RawPlanEntry[] = [];
	let started = false;
	for (const line of text.replace(/\r\n?/gu, "\n").split("\n")) {
		if (/^\s*#{1,6}\s+.+?\s*$/u.test(line)) {
			if (started) break;
			continue;
		}
		if (!line.trim()) continue;
		if (/^[ ]+[-*+]\s+.+?\s*$/u.test(line)) {
			if (!started) return undefined;
			continue;
		}
		const numbered = /^(\d+)\.\s+(.+?)\s*$/u.exec(line);
		if (!numbered) return undefined;
		const number = Number(numbered[1]);
		if (number !== entries.length + 1 || number > 12) return undefined;
		const value = numbered[2];
		const explicit = markdownPlanEntry(value);
		if (explicit && markdownPlanStatus(explicit.status)) return undefined;
		entries.push({
			step: markdownPlanTitle(value),
			status: entries.length === 0 ? "inProgress" : "pending",
		});
		started = true;
	}
	return entries.length >= 2 ? entries : undefined;
}

function markdownPlanEntry(
	value: string,
): { step: string; status: string } | undefined {
	const outerBold = /^(?:\*\*|__)(.*)(?:\*\*|__)$/u.exec(value.trim()) ;
	const candidate = outerBold?.[1]?.trim() ?? value                    ;
	const prefix    = /^\[([^\]]+)\]\s+(.+)$/u.exec(candidate)           ;
	if (prefix) {
		return { step: markdownPlanTitle(prefix[2]), status: prefix[1] };
	}
	const suffix = /^(.+?)\s+\[([^\]]+)\]$/u.exec(candidate);
	if (suffix) {
		return { step: markdownPlanTitle(suffix[1]), status: suffix[2] };
	}
	const separated = /^(.+?)\s+[—-]\s+(.+)$/u.exec(candidate);
	if (separated) {
		return { step: markdownPlanTitle(separated[1]), status: separated[2] };
	}
	return undefined;
}

function markdownPlanTitle(value: string): string {
	const bold = /^\*\*(.+)\*\*$/u.exec(value.trim());
	return (bold?.[1] ?? value).trim();
}

function markdownPlanStatus(value: string | undefined): WorkStepStatus | undefined {
	const normalized = value?.normalize("NFKC").trim().toLowerCase().replace(
		/[ _-]+/gu,
		" ",
	);
	return normalized === "pending" || normalized === "대기"
		? "pending"
		: normalized === "in progress" || normalized === "running" || normalized === "진행 중"
		? "running"
		: normalized === "completed" || normalized === "complete" || normalized === "완료"
		? "completed"
		: normalized === "failed" || normalized === "실패"
		? "failed"
		: normalized === "cancelled" || normalized === "canceled" || normalized === "취소" || normalized === "취소됨"
		? "cancelled"
		: undefined;
}

function planStatus(value: unknown): WorkStepStatus {
	return value === "completed"
		? "completed"
		: value === "inProgress" || value === "inprogress" || value === "running"
		? "running"
		: value === "failed"
		? "failed"
		: value === "cancelled"
		? "cancelled"
		: "pending";
}

function canonicalIdentityText(value: string): string {
	return value.normalize("NFKC").replace(/\r\n?/gu, "\n").trim().replace(
		/\s+/gu,
		" ",
	);
}

function record(
	value: unknown,
): Readonly<Record<string, unknown>> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? value as Readonly<Record<string, unknown>>
		: undefined;
}
