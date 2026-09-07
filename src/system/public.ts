/**
 * Stable read/command surface for TUI and Specialized Workflows.
 * Concrete adapters and service implementations are deliberately not exported.
 */
export * from "./contracts/canonical-document.js";
export * from "./contracts/development-map.js";
export * from "./contracts/development-traceability.js";
export * from "./contracts/model-settings.js";
export * from "./contracts/monitoring.js";
export * from "./contracts/narration.js";
export * from "./contracts/native-session.js";
export * from "./contracts/observability-dashboard.js";
export * from "./contracts/observability-metrics.js";
export * from "./contracts/output.js";
export * from "./contracts/planning.js";
export * from "./contracts/project-activity.js";
export * from "./contracts/project-workspace.js";
export * from "./contracts/redaction.js";
export * from "./contracts/repository.js";
export * from "./contracts/review.js";
export * from "./contracts/runtime-monitor.js";
export * from "./contracts/session-events.js";
export * from "./contracts/session-stats.js";
export * from "./contracts/t-notes.js";
export * from "./contracts/terminal.js";
export * from "./contracts/todos.js";
export * from "./contracts/trace-selection.js";
export * from "./contracts/work/index.js";
export * from "./contracts/workbench.js";
export * from "./contracts/ports/index.js";
export * from "./contracts/ports/executor-port.js";

import type { WorkbenchCommand, WorkbenchCommandReceipt, WorkbenchListener, WorkbenchSnapshot } from "./contracts/workbench.js";

/** Command and immutable read-model boundary consumed by the modern TUI. */
export interface ProjectWorkbenchController {
	readonly snapshot: WorkbenchSnapshot;
	dispatch(command: WorkbenchCommand): Promise<WorkbenchCommandReceipt>;
	subscribe(listener: WorkbenchListener): () => void;
	close(): Promise<void>;
}
