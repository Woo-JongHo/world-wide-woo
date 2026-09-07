import { referenceKey, type TraceabilityLedger, type WorkReference, type WorkReferenceKind, type WorkTraceabilityManifest } from "../../../system/public.js";

const START = "<!-- traceability:generated:start -->";
const END = "<!-- traceability:generated:end -->";

function valuesFor(ledger: TraceabilityLedger, issueId: string, relation: string, prefix: string): string[] {
	return ledger.edges.filter(edge => edge.from === `issue:${issueId}` && edge.relation === relation && edge.to.startsWith(`${prefix}:`)).map(edge => edge.to.slice(prefix.length + 1)).sort();
}

function connectedWorkReferences(manifest: WorkTraceabilityManifest, start: WorkReference): WorkReference[] {
	const mapKinds = new Set<WorkReferenceKind>(["initiative", "epic", "story", "linear-issue", "evidence"]);
	const visited = new Map<string, WorkReference>([[referenceKey(start), start]]);
	for (let changed = true; changed;) {
		changed = false;
		for (const link of manifest.links) {
			const from = referenceKey(link.from), to = referenceKey(link.to);
			if (visited.has(from) && !visited.has(to) && mapKinds.has(link.to.kind)) { visited.set(to, link.to); changed = true; }
			if (visited.has(to) && !visited.has(from) && mapKinds.has(link.from.kind)) { visited.set(from, link.from); changed = true; }
		}
	}
	return [...visited.values()];
}

export function workReferencesForIssue(manifest: WorkTraceabilityManifest, issueId: string): WorkReference[] {
	const issue = manifest.references.find(reference => reference.kind === "linear-issue" && reference.id === issueId);
	return issue ? connectedWorkReferences(manifest, issue) : [];
}

export function issuesForWorkReference(manifest: WorkTraceabilityManifest, kind: WorkReferenceKind, id: string): string[] {
	const start = manifest.references.find(reference => reference.kind === kind && reference.id === id);
	return start ? connectedWorkReferences(manifest, start).filter(reference => reference.kind === "linear-issue").map(reference => reference.id).sort() : [];
}

/** @Unit Code-009 */
export function buildDevelopmentMap(existing: string, ledger: TraceabilityLedger, workManifest: WorkTraceabilityManifest = { schemaVersion: 1, references: [], links: [] }): string {
	const prefix = existing.includes(START) ? existing.slice(0, existing.indexOf(START)).trimEnd() : existing.trimEnd();
	const rows = ledger.issues.map(issue => {
		const work = workReferencesForIssue(workManifest, issue.id);
		const workValues = (kind: WorkReferenceKind) => work.filter(reference => reference.kind === kind).map(reference => reference.id).sort();
		const initiatives = workValues("initiative"), epics = workValues("epic"), stories = workValues("story"), workEvidence = workValues("evidence");
		const units = valuesFor(ledger, issue.id, "implemented-by", "unit");
		const notes = valuesFor(ledger, issue.id, "detailed-by", "note");
		const prs = valuesFor(ledger, issue.id, "code-evidenced-by", "pr");
		const runs = ledger.edges.filter(edge => edge.to === `issue:${issue.id}` && edge.relation === "verifies" && edge.from.startsWith("run:")).map(edge => edge.from.slice(4)).sort();
		const integrity = units.length && notes.length ? "연결됨" : "깨짐";
		const validationEvidence = runs.map(run => ledger.runs.find(value => value.id === run)?.evidencePath).filter((value): value is string => Boolean(value));
		return `| ${initiatives.join("<br>") || "미연결"} | ${epics.join("<br>") || "미연결"} | ${stories.join("<br>") || "미연결"} | ${[...new Set([...workEvidence, ...validationEvidence])].sort().join("<br>") || "미연결"} | ${issue.id} | ${units.join("<br>") || "미연결"} | ${notes.join("<br>") || "미연결"} | ${prs.map(id => `#${id} (Chat v0.1 code)`).join("<br>") || "미연결"} | ${runs.join("<br>") || "미관측"} | ${integrity} | ${integrity === "연결됨" ? "수락 상태 확인" : "누락 edge 복구"} |`;
	});
	return `${prefix}\n\n${START}\n## Linear–Code–Obsidian 추적 투영\n\n이 표는 schema v2 관계 원장과 work manifest에서 생성하며, traceability gate가 같은 그래프의 공용 SQLite 투영과 canonical digest를 대조한다. 상세 요구는 Linear와 Obsidian이 소유하며 여기에는 복제하지 않는다. Initiative·Epic·Story·Evidence는 실제 work manifest의 양방향 관계만 표시하며 ID를 추정하지 않는다.\n\n| Initiative | Epic | Story | Evidence | Linear | Code Unit | Obsidian | PR code evidence | Validation Run | 무결성 | 다음 전환 |\n|---|---|---|---|---|---|---|---|---|---|---|\n${rows.join("\n")}\n\n${END}\n`;
}

export const DEVELOPMENT_MAP_MARKERS = { start: START, end: END } as const;
