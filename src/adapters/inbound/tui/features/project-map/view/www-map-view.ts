import type { Component                                  } from "@earendil-works/pi-tui"                            ;
import type { DevelopmentMapEpic, DevelopmentMapSnapshot } from "@/core/domain/development/development-map"         ;
import      { a, mark, prose, safe, section              } from "@/adapters/inbound/tui/foundation/theme/www-theme" ;

export class WwwMapView implements Component {
	constructor(private readonly get: () => DevelopmentMapSnapshot) {}
	invalidate(): void {}
	render(width: number): string[] {
		const s    = this.get()                                                                                                                                                  ;
		const rows = [...section("개발 지도", width, `rev ${s.revision} / ${s.sourceHealth.state}`), ...(s.sourceHealth.error ? [a.attention(safe(s.sourceHealth.error))] : [])] ;
		if (!["available", "stale"].includes(s.sourceHealth.state)) return document([...rows, "계획 원본을 확인할 수 없습니다."], width);
		return document([...rows, ...planRows(s, width), "", a.muted("✓ accepted / · pending / ! blocked / Evidence ≠ acceptance")], width);
	}
}

function document(rows: string[], width: number): string[] { return rows.flatMap(row => prose(row, width)); }

/** Initiatives with their epics, then epics that belong to no initiative. */
function planRows(snapshot: DevelopmentMapSnapshot, width: number): string[] {
	return [
		...snapshot.initiatives.flatMap(initiative => [...section(safe(initiative.title), width, safe(initiative.id)), ...initiative.epics.flatMap(epic => epicRows(epic))]),
		...(snapshot.unlinkedEpics.length ? [...section("미연결 Epic", width), ...snapshot.unlinkedEpics.flatMap(epic => epicRows(epic))] : []),
	];
}

function epicRows(epic: DevelopmentMapEpic): string[] {
	return ["", `  ${a.strong(safe(epic.title))} ${a.muted(safe(epic.id))}`, ...epic.stories.flatMap(story => [
		`    ${mark(story.status)} ${safe(story.title)}`,
		a.muted(`      ${safe(story.id)} / ${story.status}`),
		...Object.entries(story.relations).map(([label, relation]) => a.muted(`      ${label}: ${relation.state} / ${safe(relation.references.join(", ") || relation.nextTransition)}`)),
	])];
}
