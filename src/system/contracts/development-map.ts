export interface DevelopmentMapStory {
	readonly id: string;
	readonly title: string;
	readonly status: "drafted" | "pending" | "accepted" | "blocked" | "legacy-completed" | "unknown";
	readonly relations: DevelopmentMapRelations;
}

export interface DevelopmentMapRelation {
	readonly state: "linked" | "unlinked" | "unknown";
	readonly references: readonly string[];
	readonly nextTransition: string;
}

export interface DevelopmentMapRelations {
	readonly run: DevelopmentMapRelation;
	readonly todo: DevelopmentMapRelation;
	readonly evidence: DevelopmentMapRelation;
}

export interface DevelopmentMapEpic {
	readonly id: string;
	readonly title: string;
	readonly status: string;
	readonly stories: readonly DevelopmentMapStory[];
}

export interface DevelopmentMapInitiative {
	readonly id: string;
	readonly title: string;
	readonly status: string;
	readonly epics: readonly DevelopmentMapEpic[];
}

export interface DevelopmentMapSnapshot {
	readonly revision: number;
	readonly observedAt: string;
	readonly sourceHealth: {
		readonly state: "available" | "stale" | "unavailable" | "invalid";
		readonly error?: string;
	};
	readonly initiatives: readonly DevelopmentMapInitiative[];
	readonly unlinkedEpics: readonly DevelopmentMapEpic[];
}

export const EMPTY_DEVELOPMENT_MAP: DevelopmentMapSnapshot = Object.freeze({
	revision: 0,
	observedAt: "",
	sourceHealth: Object.freeze({ state: "unavailable", error: "Development Map source has not been read." }),
	initiatives: Object.freeze([]),
	unlinkedEpics: Object.freeze([]),
});
