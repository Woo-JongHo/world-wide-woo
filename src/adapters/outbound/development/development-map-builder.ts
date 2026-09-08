import type { TraceabilityLedger } from "../../../core/domain/development/development-traceability.js";
import { referenceKey, type WorkReference, type WorkReferenceKind, type WorkTraceabilityManifest } from "../../../core/domain/work/traceability.js";

const START = "<!-- traceability:generated:start -->";
const END = "<!-- traceability:generated:end -->";

function connectedWorkReferences(manifest: WorkTraceabilityManifest, start: WorkReference): WorkReference[] {
	const kinds = new Set<WorkReferenceKind>(["initiative", "epic", "story", "linear-issue", "evidence"]);
	const visited = new Map<string, WorkReference>([[referenceKey(start), start]]);
	for (let changed = true; changed;) {
		changed = false;
		for (const link of manifest.links) {
			const from = referenceKey(link.from), to = referenceKey(link.to);
			if (visited.has(from) && !visited.has(to) && kinds.has(link.to.kind)) { visited.set(to, link.to); changed = true; }
			if (visited.has(to) && !visited.has(from) && kinds.has(link.from.kind)) { visited.set(from, link.from); changed = true; }
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

const related = (ledger: TraceabilityLedger, from: string, relation: string, kind: string) => ledger.edges
	.filter(edge => edge.from === from && edge.relation === relation && edge.to.startsWith(`${kind}:`))
	.map(edge => edge.to.slice(kind.length + 1).replace(/@v\d+$/u, "")).sort();

/** @Unit Code-009 */
export function buildDevelopmentMap(existing: string, ledger: TraceabilityLedger, workManifest: WorkTraceabilityManifest = { schemaVersion: 1, references: [], links: [] }): string {
	const prefix = existing.includes(START) ? existing.slice(0, existing.indexOf(START)).trimEnd() : existing.trimEnd();
	const issues = ledger.entities.filter(entity => entity.kind === "issue").map(entity => entity.id).sort();
	const rows = issues.map(issueId => {
		const work = workReferencesForIssue(workManifest, issueId);
		const workValues = (kind: WorkReferenceKind) => work.filter(reference => reference.kind === kind).map(reference => reference.id).sort();
		const code = related(ledger, `issue:${issueId}`, "implemented-by", "unit");
		const notes = related(ledger, `issue:${issueId}`, "detailed-by", "note");
		const prs = related(ledger, `issue:${issueId}`, "code-evidenced-by", "pr");
		const specs = ledger.edges.filter(edge => edge.relation === "tracks" && edge.to === `issue:${issueId}`).map(edge => edge.from);
		const acceptances = ledger.edges.filter(edge => specs.includes(edge.from) && edge.relation === "has-acceptance").map(edge => edge.to);
		const receipts = ledger.edges.filter(edge => edge.relation === "covers" && acceptances.includes(edge.to) && edge.from.startsWith("receipt:")).map(edge => edge.from.slice("receipt:".length)).sort();
		const integrity = code.length && notes.length ? "연결됨" : "깨짐";
		return `| ${workValues("initiative").join("<br>") || "미연결"} | ${workValues("epic").join("<br>") || "미연결"} | ${workValues("story").join("<br>") || "미연결"} | ${workValues("evidence").join("<br>") || "미연결"} | ${issueId} | ${code.join("<br>") || "미연결"} | ${notes.join("<br>") || "미연결"} | ${prs.map(id => `#${id} (Chat v0.1 code)`).join("<br>") || "미연결"} | ${receipts.join("<br>") || "미관측"} | ${integrity} | ${integrity === "연결됨" ? "수락 상태 확인" : "누락 edge 복구"} |`;
	});
	return `${prefix}\n\n${START}\n## Linear–Code–Obsidian 추적 투영\n\n이 표는 schema v3 그래프 원장과 work manifest에서 생성하며, SQLite 투영과 canonical digest를 대조한다. 상세 요구와 검증 증거는 registry/evidence source가 소유하며 여기에는 복제하지 않는다.\n\n| Initiative | Epic | Story | Evidence | Linear | Code Unit | Obsidian | PR code evidence | Validation Receipt | 무결성 | 다음 전환 |\n|---|---|---|---|---|---|---|---|---|---|---|\n${rows.join("\n")}\n\n${END}\n`;
}

export const DEVELOPMENT_MAP_MARKERS = { start: START, end: END } as const;
