import { randomUUID } from "node:crypto";
import { appendFile, chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ProjectActivity } from "../../../core/domain/execution/project-activity";

export function renderSessionTrace(activities: readonly ProjectActivity[]): string {
	const ordered = [...activities].sort((left, right) => left.sequence - right.sequence);
	const lines = [
		"# Tracer",
		"",
		"> 세션의 공개 Activity journal에서 재생성한 읽기 전용 실행 기록입니다.",
		"> 관계가 직접 제공되지 않은 Plan 연결은 inferred로 표시합니다.",
		"",
	];
	for (const activity of ordered) {
		lines.push(...traceActivityLines(activity));
	}
	if (ordered.length === 0) lines.push("- 관측된 공개 실행 없음");
	return `${lines.join("\n")}\n`;
}

/** Filesystem projection only. The Activity journal remains the canonical owner. */
export class FileTraceStore {
	public constructor(private readonly path: string) {}

	public async replace(activities: readonly ProjectActivity[]): Promise<void> {
		await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
		const temporary = `${this.path}.tmp-${process.pid}-${randomUUID()}`;
		try {
			await writeFile(temporary, renderSessionTrace(activities), { mode: 0o600 });
			await rename(temporary, this.path);
			await chmod(this.path, 0o600);
		} catch (error) {
			await rm(temporary, { force: true });
			throw error;
		}
	}

	public async append(activity: ProjectActivity): Promise<void> {
		await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
		await appendFile(this.path, `${traceActivityLines(activity).join("\n")}\n`, { mode: 0o600 });
		await chmod(this.path, 0o600);
	}
}

function traceActivityLines(activity: ProjectActivity): string[] {
	const refs = [
		activity.nativeRefs.threadId ? `thread=${activity.nativeRefs.threadId}` : null,
		activity.nativeRefs.turnId ? `turn=${activity.nativeRefs.turnId}` : null,
		activity.nativeRefs.itemId ? `item=${activity.nativeRefs.itemId}` : null,
		activity.nativeRefs.approvalRequestId ? `approval=${activity.nativeRefs.approvalRequestId}` : null,
	].filter((value): value is string => Boolean(value));
	return [
		`- [${traceMark(activity.phase)}] ${activity.sequence}. ${activity.kind} · ${activity.phase} · ${activity.id}`,
		`  - ${activity.recordedAt}${refs.length > 0 ? ` · ${refs.join(" · ")}` : ""}`,
		`  - Source: /trace ${activity.id}`,
	];
}

function traceMark(phase: ProjectActivity["phase"]): " " | "x" | "!" | "-" {
	if (phase === "completed") return "x";
	if (phase === "failed") return "!";
	if (phase === "cancelled") return "-";
	return " ";
}
