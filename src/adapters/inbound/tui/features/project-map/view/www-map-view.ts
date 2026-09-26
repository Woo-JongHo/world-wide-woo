import type { Component }                                  from "@earendil-works/pi-tui";
import type { DevelopmentMapEpic, DevelopmentMapSnapshot } from "@/core/domain/development/development-map";
import { a, mark, prose, safe, section }                   from "@/adapters/inbound/tui/foundation/theme/www-theme";

function document(rows: string[], width: number): string[] { return rows.flatMap(row => prose(row, width)); }

export class WwwMapView implements Component {
	constructor(private readonly get: () => DevelopmentMapSnapshot) {}
	invalidate(): void {}
	render(width: number): string[] {
		const s = this.get();
		const rows = section("개발 지도", width, `rev ${s.revision} / ${s.sourceHealth.state}`);
		if (s.sourceHealth.error) rows.push(a.attention(safe(s.sourceHealth.error)));
		if (!["available", "stale"].includes(s.sourceHealth.state)) return document([...rows, "계획 원본을 확인할 수 없습니다."], width);
		const epic = (e: DevelopmentMapEpic) => {
			rows.push("", `  ${a.strong(safe(e.title))} ${a.muted(safe(e.id))}`);
			for (const story of e.stories) {
				rows.push(`    ${mark(story.status)} ${safe(story.title)}`, a.muted(`      ${safe(story.id)} / ${story.status}`));
				for (const [label, relation] of Object.entries(story.relations)) rows.push(a.muted(`      ${label}: ${relation.state} / ${safe(relation.references.join(", ") || relation.nextTransition)}`));
			}
		};
		for (const i of s.initiatives) { rows.push(...section(safe(i.title), width, safe(i.id))); for (const e of i.epics) epic(e); }
		if (s.unlinkedEpics.length) { rows.push(...section("미연결 Epic", width)); for (const e of s.unlinkedEpics) epic(e); }
		rows.push("", a.muted("✓ accepted / · pending / ! blocked / Evidence ≠ acceptance"));
		return document(rows, width);
	}
}
