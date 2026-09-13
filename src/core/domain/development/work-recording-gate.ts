export interface WorkRecordingSnapshot {
	readonly entries: Readonly<Record<string, string>>;
}

export type WorkRecordingGateDecision =
	| { readonly state: "clear"; readonly changedPaths: readonly string[] }
	| { readonly state: "continue"; readonly changedPaths: readonly string[]; readonly reason: string };

const IGNORED_PREFIXES = [
	".git/",
	".www/runtime/",
	".www/development/index.sqlite",
] as const;

export function isWorkRecordingPath(path: string): boolean {
	const normalized = path.replaceAll("\\", "/").replace(/^\.\//u, "");
	return normalized.length > 0 && !IGNORED_PREFIXES.some(prefix => normalized === prefix.replace(/\/$/u, "") || normalized.startsWith(prefix));
}

export function changedWorkRecordingPaths(
	before: WorkRecordingSnapshot,
	after: WorkRecordingSnapshot,
): readonly string[] {
	return [...new Set([...Object.keys(before.entries), ...Object.keys(after.entries)])]
		.filter(isWorkRecordingPath)
		.filter(path => before.entries[path] !== after.entries[path])
		.sort((left, right) => left.localeCompare(right));
}

export function evaluateWorkRecordingGate(input: {
	readonly before: WorkRecordingSnapshot;
	readonly after: WorkRecordingSnapshot;
	readonly stopHookActive: boolean;
}): WorkRecordingGateDecision {
	const changedPaths = changedWorkRecordingPaths(input.before, input.after);
	if (input.stopHookActive || changedPaths.length === 0) return { state: "clear", changedPaths };
	const shown = changedPaths.slice(0, 8);
	const omitted = changedPaths.length - shown.length;
	return {
		state: "continue",
		changedPaths,
		reason: [
			"현재 turn에서 아직 기록 판정이 끝나지 않은 변경이 감지되었습니다.",
			`변경: ${shown.join(", ")}${omitted > 0 ? ` 외 ${omitted}개` : ""}`,
			"종료 전에 다음을 수행하세요.",
			"1. 현재 작업과 결속된 WOO 이슈를 확인합니다. 없다면 woo-linear-issue-intake로 이슈 Candidate를 준비합니다.",
			"2. woo-linear-activity로 Project Comment Candidate를 준비합니다.",
			"3. WHY·계약·결정이 바뀌었다면 woo-obsidian-canonical로 Obsidian Candidate도 준비합니다.",
			"4. 외부 쓰기는 AskUserQuestion으로 항목별 승인을 받은 뒤 각 publish 스킬로 게시하고 read-back합니다.",
			"이미 기록됐거나 기록 대상이 아니라면 실제 근거와 이유를 확인해 최종 보고에 명시합니다.",
		].join("\n"),
	};
}
