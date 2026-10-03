import * as before from "./before";
import * as after from "../../../../src/adapters/inbound/tui/features/project-map/view/www-map-view";
import { across, runGolden } from "../golden-lib";

const relation = (state: string, references: string[]) => ({ state, references, nextTransition: "다음 전환" });
const story = (id: string, status: string) => ({ id, title: `스토리 ${id}`, status, relations: { linear: relation("linked", ["WOO-1"]), obsidian: relation("unlinked", []) } });
const epic = (id: string) => ({ id, title: `에픽 ${id}`, status: "pending", stories: [story(`${id}-1`, "accepted"), story(`${id}-2`, "blocked")] });
const snapshots: any[] = [
	{ revision: 3, observedAt: "t", sourceHealth: { state: "available" }, initiatives: [{ id: "INIT-1", title: "이니셔티브", epics: [epic("EP-1"), epic("EP-2")] }], unlinkedEpics: [epic("EP-9")] },
	{ revision: 4, observedAt: "t", sourceHealth: { state: "stale", error: "오래됨" }, initiatives: [], unlinkedEpics: [] },
	{ revision: 5, observedAt: "t", sourceHealth: { state: "invalid", error: "깨짐" }, initiatives: [{ id: "I", title: "x", epics: [epic("E")] }], unlinkedEpics: [] },
	{ revision: 6, observedAt: "t", sourceHealth: { state: "unavailable" }, initiatives: [], unlinkedEpics: [] },
];
runGolden("www-map-view", across(snapshots, [1, 20, 60, 120]).map(({ input, width, label }) => ({
	label,
	before: () => new before.WwwMapView(() => input).render(width),
	after : () => new after.WwwMapView(() => input).render(width),
})));
