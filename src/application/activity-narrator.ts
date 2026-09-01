export interface ActivityNarrationRequest {
	readonly goal: string;
	readonly stepTitle: string;
	readonly inputSummary: readonly string[];
}

export interface ActivityNarrationResult {
	readonly what: string;
	readonly why?: string;
	readonly inputSummary: readonly string[];
}

/** Replaceable, non-authoritative interpretation of one semantic work step. */
export interface ActivityNarrator {
	narrate(request: ActivityNarrationRequest, signal?: AbortSignal): Promise<ActivityNarrationResult>;
}
