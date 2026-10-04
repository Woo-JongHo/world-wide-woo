export const TABLE_NAMES = [
  "project_nodes", "relations", "views", "documents", "principles", "decisions",
  "commits", "implementation_links", "verification_runs", "raw_sessions", "raw_events",
] as const;

export type TableName      = (typeof TABLE_NAMES)[number]                                   ;
export type RecordRef      = { table: TableName; id: string }                               ;
export type ModuleSlug     = "monitor" | "chat" | "dashboard"                               ;
export type CheckStatus    = "passed" | "failed" | "needs-review" | "not-checked" | "stale" ;
export type DecisionStatus = "proposed" | "adopted" | "rejected" | "superseded"             ;

export interface BaseRecord {
  id: string;
  refs: RecordRef[];
}
export interface ProjectNode extends BaseRecord {
  project         : "WWW"                              ;
  kind            : "project" | "module" | "component" ;
  axis            : "service" | "assurance"            ;
  parentId        : string | null                      ;
  name            : string                             ;
  responsibility  : string                             ;
  input           : string                             ;
  output          : string                             ;
  slug?           : ModuleSlug                         ;
  implementation? : string                             ;
  displayLabel?   : string                             ;
}
export interface Relation extends BaseRecord {
  from   : RecordRef        ;
  to     : RecordRef        ;
  kind   : string           ;
  source : RecordRef | null ;
}

export interface ViewAnnotation {
  componentId  : string ;
  area         : string ;
  hotspotClass : string ;
}

export interface ChatPreviewContent {
  welcome  : { title: string; detail: string } ;
  messages : { actor: string; body: string }[] ;
  tool     : { label: string; result: string } ;
  result   : string                            ;
  rail: {
    plan     : { label: string; title: string; items: string[] }           ;
    progress : { label: string; items: string[] }                          ;
    test     : { label: string; rows: { label: string; value: string }[] } ;
  };
  stages              : { label: string; state: "done" | "current" | "pending" }[] ;
  composerPlaceholder : string                                                     ;
  adapter             : { label: string; mapping: string }                         ;
}

export interface MonitorPreviewContent {
  title        : string                                            ;
  snapshot     : string                                            ;
  runs         : { label: string; name: string; status: string }[] ;
  stageLabel   : string                                            ;
  currentStage : string                                            ;
  stages       : { state: "done" | "current" | "pending" }[]       ;
  usageLabel   : string                                            ;
  usage        : { value: string; label: string }[]                ;
}

export interface DashboardPreviewContent {
  title         : string                                            ;
  summary       : string                                            ;
  projects      : { index: string; name: string; status: string }[] ;
  todayLabel    : string                                            ;
  today         : string[]                                          ;
  evidenceLabel : string                                            ;
  evidence      : { label: string; value: string }[]                ;
  evidenceNote  : string                                            ;
}

export type ProjectView = BaseRecord & {
  nodeId      : string           ;
  revision    : string           ;
  annotations : ViewAnnotation[] ;
} & (
  | { previewKind: "native-chat"; preview: ChatPreviewContent }
  | { previewKind: "runtime-monitor"; preview: MonitorPreviewContent }
  | { previewKind: "project-dashboard"; preview: DashboardPreviewContent }
);
export interface DocumentRecord extends BaseRecord {
  path              : string         ;
  title             : string         ;
  body              : string         ;
  revision          : string         ;
  anchor            : string         ;
  includedInRuntime : boolean | null ;
}
export interface Principle extends BaseRecord {
  statement         : string   ;
  detail            : string   ;
  targetIds         : string[] ;
  documentId        : string   ;
  documentParagraph : number   ;
  active            : boolean  ;
}
export interface Decision extends BaseRecord {
  title        : string         ;
  content      : string         ;
  reason       : string         ;
  targetId     : string         ;
  status       : DecisionStatus ;
  adoptedBy    : string | null  ;
  adoptedAt    : string | null  ;
  sourceRawIds : string[]       ;
  supersededBy : string | null  ;
}
export interface CommitRecord extends BaseRecord {
  sha     : string   ;
  branch  : string   ;
  summary : string   ;
  paths   : string[] ;
  diff    : string   ;
}
export interface ImplementationLink extends BaseRecord {
  decisionId : string ;
  commitId   : string ;
  targetId   : string ;
  file       : string ;
  basis      : string ;
}
export interface VerificationRun extends BaseRecord {
  targetId        : string                             ;
  criterion       : string                             ;
  category        : "rule" | "implementation" | "view" ;
  status          : CheckStatus                        ;
  method          : string                             ;
  actor           : string                             ;
  checkedAt       : string | null                      ;
  checkedRevision : string | null                      ;
  currentRevision : string                             ;
  evidence        : string                             ;
  rationale       : string                             ;
  diff            : string | null                      ;
}
export interface RawSession extends BaseRecord {
  sourceKind        : string        ;
  projectId         : string        ;
  startedAt         : string | null ;
  sourceDescription : string        ;
}
export interface RawEvent extends BaseRecord {
  sessionId  : string                  ;
  turnId     : string | null           ;
  order      : number                  ;
  occurredAt : string | null           ;
  eventKind  : string                  ;
  raw        : Record<string, unknown> ;
  transcript : string | null           ;
}

export interface MockDb {
  project_nodes        : ProjectNode[]        ;
  relations            : Relation[]           ;
  views                : ProjectView[]        ;
  documents            : DocumentRecord[]     ;
  principles           : Principle[]          ;
  decisions            : Decision[]           ;
  commits              : CommitRecord[]       ;
  implementation_links : ImplementationLink[] ;
  verification_runs    : VerificationRun[]    ;
  raw_sessions         : RawSession[]         ;
  raw_events           : RawEvent[]           ;
}

export type DbRecord = MockDb[TableName][number];

export const moduleTabs = ["overview", "composition", "view", "principles", "decisions"] as const;
export type ModuleTab = (typeof moduleTabs)[number];
