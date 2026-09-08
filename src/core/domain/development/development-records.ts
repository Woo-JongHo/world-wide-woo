import type { WorkReference, WorkTraceabilityLink } from "../work/traceability.js";

export interface DevelopmentUnit { id: string; name: string; createdAt: string }
export interface DevelopmentIssue { id: string; uuid: string; url: string }
export interface DevelopmentBinding { id: string; runId: string; version: number; issueIds: string[]; unitIds: string[]; createdAt: string }
export interface DevelopmentRecord extends DevelopmentBindingAttribution {
 id: string; runId: string; sourceEventId: string; kind: string; body: string; metadata: Record<string, unknown>; createdAt: string;
}
export interface DevelopmentBindingAttribution { bindingId: string; issueIds: string[]; unitIds: string[] }
export interface DevelopmentTest extends DevelopmentBindingAttribution {
 id: string; runId: string; sourceEventId: string; command: string; cwd: string; exitCode: number | null;
 status: "passed" | "failed" | "cancelled" | "not-run"; output: string; snapshot?: unknown; createdAt: string;
}
export interface CaptureDevelopmentRecordInput { bindingId?: string; id?: string; runId: string; sourceEventId: string; kind: string; body: string; metadata?: Record<string, unknown> }
export interface RecordDevelopmentTestInput { bindingId?: string; id?: string; runId: string; sourceEventId: string; command: string; cwd: string; exitCode: number | null; status: DevelopmentTest["status"]; output: string; snapshot?: unknown }
export interface DevelopmentContext {
 projectId: string; units: DevelopmentUnit[]; issues: DevelopmentIssue[]; bindings: DevelopmentBinding[];
 records: DevelopmentRecord[]; tests: DevelopmentTest[]; legacyReferences: readonly WorkReference[]; legacyLinks: readonly WorkTraceabilityLink[];
 integrity: { status: "current" | "stale" | "corrupt"; errors: string[] }; sourceRoot: string; indexPath: string;
}
