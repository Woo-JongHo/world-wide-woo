import type {
	ObservabilityActivityStream,
	ObservabilityCoverage,
} from "@/core/domain/observability/observability-dashboard";

export interface ObservabilityHistory {
	readonly coverage: ObservabilityCoverage;
	readonly streams: readonly ObservabilityActivityStream[];
}

export interface ObservabilityHistoryReader {
	read(): Promise<ObservabilityHistory>;
}
