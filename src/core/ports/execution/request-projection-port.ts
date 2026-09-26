import type { RequestRuntimeRecord } from "@/core/domain/execution/request-runtime";

/**
 * Execution lifecycle sink for canonical Request Runtime records.
 * "Projection" here means emitting execution records to an observer, not a TUI
 * feature read projection, and capture never authorizes publication.
 */
export interface RequestProjectionPort {
	capture(record: RequestRuntimeRecord): Promise<void>;
}
