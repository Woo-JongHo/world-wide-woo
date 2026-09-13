import type { RequestRuntimeRecord } from "../../domain/execution/request-runtime";

/** Observes canonical lifecycle events through record.events. Does not authorize publication. */
export interface RequestProjectionPort {
	capture(record: RequestRuntimeRecord): Promise<void>;
}
