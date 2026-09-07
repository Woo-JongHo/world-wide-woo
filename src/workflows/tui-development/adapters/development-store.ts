import { Database } from "bun:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, linkSync, mkdirSync, openSync, readFileSync, readdirSync, unlinkSync, writeFileSync, chmodSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";
import type { CaptureDevelopmentRecordInput, DevelopmentBinding, DevelopmentContext, DevelopmentIssue, DevelopmentRecord, DevelopmentTest, DevelopmentUnit, RecordDevelopmentTestInput } from "../contracts/development-records.js";
import { entityRefs, parseWorkTraceabilityManifest, referenceKey, validateLedger, type TraceabilityEdge, type TraceabilityLedger, type TraceRef, type WorkReference, type WorkReferenceKind, type WorkTraceabilityLink, type WorkTraceabilityManifest } from "../../../system/public.js";
import { digestLedger, stableJson } from "./traceability-digest.js";

type Entity = DevelopmentUnit | DevelopmentBinding | DevelopmentRecord | DevelopmentTest | { id: string; unitId: string; issue: DevelopmentIssue };
type Kind = "unit" | "link" | "binding" | "record" | "test";
interface Envelope { schemaVersion: 1; projectId: string; kind: Kind; payload: Entity; digest: string }
interface Source { path: string; envelope: Envelope; rawDigest: string }
export interface TraceabilityGraph {
 logicalDigest: string; units: string[]; issues: string[]; notes: string[]; pullRequests: string[]; runs: string[]; edges: TraceabilityEdge[];
}
type TraceabilityQueryKind = "issue" | "unit" | "run" | "note" | "pr";
interface TraceabilityEntityRow { ref: string; kind: string; externalId: string; payload: string; payloadDigest: string }
interface TraceabilityEdgeRow { source: TraceRef; relation: TraceabilityEdge["relation"]; target: TraceRef }
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function conflictingLinearIssue(left: DevelopmentIssue, right: DevelopmentIssue): boolean {
 return (left.id === right.id || left.uuid === right.uuid) && left.url !== right.url;
}
function assertConsistentLinearIssues(issues: readonly DevelopmentIssue[]): void {
 for (let index = 0; index < issues.length; index += 1) {
  for (let other = index + 1; other < issues.length; other += 1) {
   if (conflictingLinearIssue(issues[index], issues[other])) throw new Error("Conflicting Linear identity");
  }
 }
}
function nonempty(value: string, label: string) { if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`); }
function assertUuid(value: string) { if (!uuid.test(value)) throw new Error(`Invalid UUID: ${value}`); }
function durableCreate(path: string, content: string): boolean {
 const temp = `${path}.${randomUUID()}.tmp`;
 const fd = openSync(temp, "wx", 0o600);
 try { writeFileSync(fd, content); fsyncSync(fd); } finally { closeSync(fd); }
 try { linkSync(temp, path); } catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") return false; throw error; }
 finally { unlinkSync(temp); }
 if (platform() !== "win32") {
  const dir = openSync(resolve(path, ".."), "r"); try { fsyncSync(dir); } finally { closeSync(dir); }
 }
 return true;
}

/** @linear WOO-696 */
/** SQLite is a disposable projection. Immutable source envelopes are written and synced first. */
/** @Unit Code-008 */
export class DevelopmentStore {
 readonly projectRoot: string;
 readonly projectId: string;
 readonly sourceRoot: string;
 readonly indexPath: string;
 private readonly metadataRoot: string;
 private readonly db: Database;
 constructor(options: { projectRoot: string; dataRoot?: string }) {
  this.projectRoot = resolve(options.projectRoot);
  this.metadataRoot = join(this.projectRoot, ".www/control-ledger/development");
  mkdirSync(this.metadataRoot, { recursive: true });
  const identityPath = join(this.metadataRoot, "project.json");
  const relationLedgerPath = join(this.projectRoot, ".www/control-ledger/traceability-v2.json");
  const relationProjectId = existsSync(relationLedgerPath) ? (JSON.parse(readFileSync(relationLedgerPath, "utf8")) as { projectId?: string }).projectId : undefined;
  if (relationProjectId) assertUuid(relationProjectId);
  durableCreate(identityPath, `${JSON.stringify({ schemaVersion: 1, id: relationProjectId ?? randomUUID() })}\n`);
  const identity = JSON.parse(readFileSync(identityPath, "utf8"));
  assertUuid(identity.id); this.projectId = identity.id;
  if (relationProjectId && relationProjectId !== this.projectId) throw new Error("Traceability project identity differs from DevelopmentStore");
  const developmentRoot = join(resolve(options.dataRoot ?? process.env.WWW_DATA_DIR ?? join(homedir(), ".local/share/www")), "development");
  this.sourceRoot = join(developmentRoot, "sources", this.projectId);
  mkdirSync(this.sourceRoot, { recursive: true, mode: 0o700 });
  this.indexPath = join(developmentRoot, "index.sqlite");
  this.db = new Database(this.indexPath, { create: true, strict: true });
  chmodSync(this.indexPath, 0o600);
  this.db.run("PRAGMA busy_timeout = 10000");
  this.db.run("PRAGMA journal_mode = WAL");
  this.db.run("PRAGMA synchronous = FULL");
  this.db.run("PRAGMA foreign_keys = ON");
  this.db.run("CREATE TABLE IF NOT EXISTS development_sources (project TEXT NOT NULL, path TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, digest TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(project,path), UNIQUE(project,kind,id))");
  this.db.run("CREATE TABLE IF NOT EXISTS traceability_meta (project TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(project,key))");
  this.db.run("CREATE TABLE IF NOT EXISTS traceability_entities (project TEXT NOT NULL, ref TEXT NOT NULL, kind TEXT NOT NULL, external_id TEXT NOT NULL, payload TEXT NOT NULL, payload_digest TEXT NOT NULL, PRIMARY KEY(project,ref))");
  this.db.run("CREATE TABLE IF NOT EXISTS traceability_edges (project TEXT NOT NULL, source TEXT NOT NULL, relation TEXT NOT NULL, target TEXT NOT NULL, PRIMARY KEY(project,source,relation,target), FOREIGN KEY(project,source) REFERENCES traceability_entities(project,ref), FOREIGN KEY(project,target) REFERENCES traceability_entities(project,ref))");
 }
 close() { this.db.close(); }
 private scan(): { sources: Source[]; errors: string[] } {
  const sources: Source[] = [], errors: string[] = [];
  for (const root of [this.metadataRoot, this.sourceRoot]) for (const name of readdirSync(root).sort()) {
   if (!name.endsWith(".json") || name === "project.json") continue;
   const path = join(root, name);
   try {
    const raw = readFileSync(path, "utf8"), envelope = JSON.parse(raw) as Envelope;
    if (envelope.schemaVersion !== 1 || envelope.projectId !== this.projectId || !["unit", "link", "binding", "record", "test"].includes(envelope.kind) || !envelope.payload || typeof envelope.payload.id !== "string" || envelope.digest !== hash(JSON.stringify(envelope.payload))) throw new Error("Invalid envelope or source digest");
    assertUuid(envelope.payload.id);
    if (name !== `${envelope.kind}-${envelope.payload.id}.json`) throw new Error("Source identity/path mismatch");
    sources.push({ path, envelope, rawDigest: hash(raw) });
   } catch (error) { errors.push(`${path}: ${String(error)}`); }
  }
  const seen = new Set<string>();
  const units = this.entities<DevelopmentUnit>(sources, "unit");
  const bindings = this.entities<DevelopmentBinding>(sources, "binding");
  const links = this.entities<{id: string; unitId: string; issue: DevelopmentIssue}>(sources, "link");
  let issueIds = links.map(link => link.issue?.id);
  let legacyIssues: DevelopmentIssue[] = [];
  try {
   legacyIssues = this.legacy().references.filter(x => x.kind === "linear-issue");
   issueIds = [...issueIds, ...legacyIssues.map(x => x.id)];
   assertConsistentLinearIssues([...links.map(link => link.issue), ...legacyIssues]);
  } catch (error) { errors.push(String(error)); }
  for (const source of sources) try {
   const { kind, payload } = source.envelope;
   const key = `${kind}:${payload.id}`; if (seen.has(key)) throw new Error("Duplicate source identity"); seen.add(key);
   if (kind === "unit") nonempty((payload as DevelopmentUnit).name, "Unit name");
   if (kind === "link") {
    const link = payload as typeof links[number];
    if (!units.some(unit => unit.id === link.unitId)) throw new Error("Dangling Unit link");
    parseWorkTraceabilityManifest({schemaVersion:1,references:[{kind:"linear-issue",...link.issue}],links:[]});
   }
   if (["binding", "record", "test"].includes(kind)) {
    const value = payload as DevelopmentBinding | DevelopmentRecord | DevelopmentTest;
    nonempty(value.runId, "Run ID");
    if (!Array.isArray(value.unitIds) || !Array.isArray(value.issueIds) || !value.issueIds.length || value.unitIds.some(id => !units.some(unit => unit.id === id)) || value.issueIds.some(id => !issueIds.includes(id))) throw new Error("Invalid or dangling attribution");
    if (kind === "binding") {
     const binding = value as DevelopmentBinding; const versionKey = `binding-version:${binding.runId}:${binding.version}`;
     if (!Number.isInteger(binding.version) || binding.version < 1 || seen.has(versionKey)) throw new Error("Invalid binding version"); seen.add(versionKey);
    } else {
     const record = value as DevelopmentRecord | DevelopmentTest;
     nonempty(record.sourceEventId, "Source event ID");
     const eventKey = `${kind}-event:${record.runId}:${record.sourceEventId}`;
     if (seen.has(eventKey)) throw new Error("Duplicate source event"); seen.add(eventKey);
     const binding = bindings.find(item => item.id === record.bindingId && item.runId === record.runId);
     if (!binding || JSON.stringify(binding.issueIds) !== JSON.stringify(record.issueIds) || JSON.stringify(binding.unitIds) !== JSON.stringify(record.unitIds)) throw new Error("Record attribution differs from binding");
     if (kind === "record") { const message = record as DevelopmentRecord; nonempty(message.kind, "Record kind"); if (typeof message.body !== "string" || !message.metadata || typeof message.metadata !== "object") throw new Error("Invalid record body or metadata"); }
     else { const test = record as DevelopmentTest; nonempty(test.command, "Test command"); nonempty(test.cwd, "Test cwd"); if (typeof test.output !== "string" || !["passed", "failed", "cancelled", "not-run"].includes(test.status) || (test.status === "passed" && test.exitCode !== 0) || (test.status === "failed" && (test.exitCode === null || test.exitCode === 0))) throw new Error("Invalid test result"); }
    }
   }
  } catch (error) { errors.push(`${source.path}: ${String(error)}`); }
  return { sources, errors };
 }
 private projection(sources: Source[]) {
  this.db.query("DELETE FROM development_sources WHERE project = ?").run(this.projectId);
  const insert = this.db.query("INSERT INTO development_sources(project,path,kind,id,digest,payload) VALUES (?,?,?,?,?,?)");
  for (const source of sources) insert.run(this.projectId, source.path, source.envelope.kind, source.envelope.payload.id, source.rawDigest, JSON.stringify(source.envelope.payload));
 }
 private transaction<T>(action: (sources: Source[]) => T): T {
  this.db.run("BEGIN IMMEDIATE");
  try {
   const state = this.scan(); if (state.errors.length) throw new Error(state.errors.join("\n"));
   const result = action(state.sources);
   const after = this.scan(); if (after.errors.length) throw new Error(after.errors.join("\n"));
   this.projection(after.sources); this.db.run("COMMIT"); return result;
  } catch (error) { this.db.run("ROLLBACK"); throw error; }
 }
 private persist(kind: Kind, payload: Entity) {
  const root = kind === "unit" || kind === "link" ? this.metadataRoot : this.sourceRoot;
  const envelope: Envelope = { schemaVersion: 1, projectId: this.projectId, kind, payload, digest: hash(JSON.stringify(payload)) };
  if (!durableCreate(join(root, `${kind}-${payload.id}.json`), `${JSON.stringify(envelope)}\n`)) throw new Error(`Identity already exists: ${kind}/${payload.id}`);
 }
 private entities<T extends Entity>(sources: Source[], kind: Kind): T[] { return sources.filter(s => s.envelope.kind === kind).map(s => s.envelope.payload as T); }
 private hasTraceabilityV2(): boolean { return existsSync(join(this.projectRoot, ".www/control-ledger/traceability-v2.json")); }

 private loadTraceabilityLedger(): TraceabilityLedger {
  const path = join(this.projectRoot, ".www/control-ledger/traceability-v2.json");
  if (!existsSync(path)) throw new Error(`Traceability relation ledger is missing: ${path}`);
  const ledger = JSON.parse(readFileSync(path, "utf8")) as TraceabilityLedger;
  const errors = validateLedger(ledger, digestLedger(ledger));
  if (errors.length) throw new Error(errors.join("\n"));
  if (ledger.projectId !== this.projectId) throw new Error("Traceability project identity differs from DevelopmentStore");
  return ledger;
 }

 private expectedTraceability(ledger: TraceabilityLedger) {
  const entities: TraceabilityEntityRow[] = [
   ...ledger.units.map(value => ({ ref: `unit:${value.key}`, kind: "unit", externalId: value.key, payload: stableJson(value), payloadDigest: hash(stableJson(value)) })),
   ...ledger.issues.map(value => ({ ref: `issue:${value.id}`, kind: "issue", externalId: value.id, payload: stableJson(value), payloadDigest: hash(stableJson(value)) })),
   ...ledger.notes.map(value => ({ ref: `note:${value.id}`, kind: "note", externalId: value.id, payload: stableJson(value), payloadDigest: hash(stableJson(value)) })),
   ...ledger.pullRequests.map(value => ({ ref: `pr:${value.id}`, kind: "pr", externalId: value.id, payload: stableJson(value), payloadDigest: hash(stableJson(value)) })),
   ...ledger.runs.map(value => ({ ref: `run:${value.id}`, kind: "run", externalId: value.id, payload: stableJson(value), payloadDigest: hash(stableJson(value)) })),
  ].sort((left, right) => left.ref.localeCompare(right.ref));
  const edges: TraceabilityEdgeRow[] = ledger.edges.map(edge => ({ source: edge.from, relation: edge.relation, target: edge.to }))
   .sort((left, right) => left.source.localeCompare(right.source) || left.relation.localeCompare(right.relation) || left.target.localeCompare(right.target));
  const logicalDigest = digestLedger(ledger);
  const projectionDigest = hash(stableJson({ schemaVersion: 2, projectId: this.projectId, logicalDigest, entities, edges }));
  const meta = [
   { key: "logical_digest", value: logicalDigest },
   { key: "project_id", value: this.projectId },
   { key: "projection_digest", value: projectionDigest },
   { key: "schema_version", value: "2" },
  ];
  return { entities, edges, meta, logicalDigest, projectionDigest };
 }

 rebuildTraceability(): { logicalDigest: string; projectionDigest: string; entities: number; edges: number } {
  const ledger = this.loadTraceabilityLedger();
  const expected = this.expectedTraceability(ledger);
  this.db.run("BEGIN IMMEDIATE");
  try {
   this.db.query("DELETE FROM traceability_edges WHERE project = ?").run(this.projectId);
   this.db.query("DELETE FROM traceability_entities WHERE project = ?").run(this.projectId);
   this.db.query("DELETE FROM traceability_meta WHERE project = ?").run(this.projectId);
   const insertEntity = this.db.query("INSERT INTO traceability_entities(project,ref,kind,external_id,payload,payload_digest) VALUES (?,?,?,?,?,?)");
   for (const row of expected.entities) insertEntity.run(this.projectId, row.ref, row.kind, row.externalId, row.payload, row.payloadDigest);
   const insertEdge = this.db.query("INSERT INTO traceability_edges(project,source,relation,target) VALUES (?,?,?,?)");
   for (const row of expected.edges) insertEdge.run(this.projectId, row.source, row.relation, row.target);
   const insertMeta = this.db.query("INSERT INTO traceability_meta(project,key,value) VALUES (?,?,?)");
   for (const row of expected.meta) insertMeta.run(this.projectId, row.key, row.value);
   this.db.run("COMMIT");
  } catch (error) { this.db.run("ROLLBACK"); throw error; }
  this.assertTraceabilityCurrent();
  return { logicalDigest: expected.logicalDigest, projectionDigest: expected.projectionDigest, entities: entityRefs(ledger).size, edges: ledger.edges.length };
 }

 assertTraceabilityCurrent(): { logicalDigest: string; projectionDigest: string } {
  const ledger = this.loadTraceabilityLedger();
  const expected = this.expectedTraceability(ledger);
  const integrity = this.db.query("PRAGMA integrity_check").all() as Array<Record<string, string>>;
  const foreignKeys = this.db.query("PRAGMA foreign_key_check").all();
  const entities = (this.db.query("SELECT ref,kind,external_id,payload,payload_digest FROM traceability_entities WHERE project = ? ORDER BY ref").all(this.projectId) as Array<{ ref: string; kind: string; external_id: string; payload: string; payload_digest: string }>).map(row => ({ ref: row.ref, kind: row.kind, externalId: row.external_id, payload: row.payload, payloadDigest: row.payload_digest }));
  const edges = this.db.query("SELECT source,relation,target FROM traceability_edges WHERE project = ? ORDER BY source,relation,target").all(this.projectId) as TraceabilityEdgeRow[];
  const meta = this.db.query("SELECT key,value FROM traceability_meta WHERE project = ? ORDER BY key").all(this.projectId) as Array<{ key: string; value: string }>;
  const actualProjectionDigest = hash(stableJson({ schemaVersion: 2, projectId: this.projectId, logicalDigest: expected.logicalDigest, entities, edges }));
  const errors: string[] = [];
  if (integrity.some(row => Object.values(row).some(value => value !== "ok"))) errors.push("SQLite integrity check failed");
  if (foreignKeys.length) errors.push("SQLite foreign-key check failed");
  if (stableJson(entities) !== stableJson(expected.entities)) errors.push("traceability entity projection differs from relation ledger");
  if (stableJson(edges) !== stableJson(expected.edges)) errors.push("traceability edge projection differs from relation ledger");
  if (stableJson(meta) !== stableJson(expected.meta)) errors.push("traceability metadata projection differs from relation ledger");
  if (actualProjectionDigest !== expected.projectionDigest) errors.push("traceability canonical projection digest differs from relation ledger");
  if (errors.length) throw new Error(`${errors.join("\n")}\nrun \`bun run traceability:rebuild\``);
  return { logicalDigest: expected.logicalDigest, projectionDigest: expected.projectionDigest };
 }

 queryTraceability(kind: TraceabilityQueryKind, id: string): TraceabilityGraph {
  const { logicalDigest } = this.assertTraceabilityCurrent();
  const start = `${kind}:${id}` as TraceRef;
  const entities = this.db.query("SELECT ref,kind,external_id FROM traceability_entities WHERE project = ?").all(this.projectId) as Array<{ ref: string; kind: string; external_id: string }>;
  if (!entities.some(entity => entity.ref === start)) throw new Error(`Unknown traceability id: ${start}`);
  const edges = this.db.query("SELECT source,relation,target FROM traceability_edges WHERE project = ? ORDER BY source,relation,target").all(this.projectId) as TraceabilityEdgeRow[];
  const visited = new Set<string>([start]);
  const include = (edge: TraceabilityEdgeRow) => { visited.add(edge.source); visited.add(edge.target); };
  for (const edge of edges) if (edge.source === start || edge.target === start) include(edge);
  for (let changed = true; changed;) {
   changed = false;
   for (const issueRef of [...visited].filter(ref => ref.startsWith("issue:"))) {
    for (const edge of edges) if (edge.source === issueRef || edge.target === issueRef) {
     const size = visited.size; include(edge); if (visited.size !== size) changed = true;
    }
   }
  }
  const collect = (entityKind: string) => entities.filter(entity => entity.kind === entityKind && visited.has(entity.ref)).map(entity => entity.external_id).sort();
  return { logicalDigest, units: collect("unit"), issues: collect("issue"), notes: collect("note"), pullRequests: collect("pr"), runs: collect("run"), edges: edges.filter(edge => visited.has(edge.source) && visited.has(edge.target)).map(edge => ({ from: edge.source, relation: edge.relation, to: edge.target })) };
 }
 registerUnit(input: { id?: string; name: string }): DevelopmentUnit {
  if (this.hasTraceabilityV2()) throw new Error("Unit creation is owned by the traceability-v2 relation ledger; refusing a competing source envelope");
  nonempty(input.name, "Unit name"); const id = input.id ?? randomUUID(); assertUuid(id);
  return this.transaction(sources => {
   const old = this.entities<DevelopmentUnit>(sources, "unit").find(x => x.id === id);
   if (old) { if (old.name !== input.name) throw new Error("Unit identity already has another name"); return old; }
   const unit = { id, name: input.name, createdAt: new Date().toISOString() }; this.persist("unit", unit); return unit;
  });
 }
 linkIssue(input: { unitId: string; issue: DevelopmentIssue }) {
  if (this.hasTraceabilityV2()) throw new Error("Unit–Issue links are owned by the traceability-v2 relation ledger; refusing a competing source envelope");
  parseWorkTraceabilityManifest({ schemaVersion: 1, references: [{ kind: "linear-issue", ...input.issue }], links: [] });
  return this.transaction(sources => {
   if (!this.entities<DevelopmentUnit>(sources, "unit").some(x => x.id === input.unitId)) throw new Error("Unknown Unit");
   const links = this.entities<{ id: string; unitId: string; issue: DevelopmentIssue }>(sources, "link");
   const legacy = this.legacy().references.filter(x => x.kind === "linear-issue");
   for (const issue of [...links.map(x => x.issue), ...legacy]) if (conflictingLinearIssue(issue, input.issue)) throw new Error("Linear identity conflict");
   const old = links.find(x => x.unitId === input.unitId && x.issue.uuid === input.issue.uuid); if (old) return old;
   const link = { id: randomUUID(), unitId: input.unitId, issue: input.issue }; this.persist("link", link); return link;
  });
 }
 bindRun(input: { runId: string; issueIds: string[]; unitIds: string[] }): DevelopmentBinding {
  nonempty(input.runId, "Run ID");
  if (!input.issueIds.length) throw new Error("At least one explicit Issue is required");
  return this.transaction(sources => {
   const units = this.entities<DevelopmentUnit>(sources, "unit");
   const issues = [...this.entities<{ id: string; unitId: string; issue: DevelopmentIssue }>(sources, "link").map(x => x.issue.id), ...this.legacy().references.filter(x => x.kind === "linear-issue").map(x => x.id)];
   if (input.unitIds.some(id => !units.some(x => x.id === id)) || input.issueIds.some(id => !issues.includes(id))) throw new Error("Unknown binding Unit or Issue");
   const previous = this.entities<DevelopmentBinding>(sources, "binding").filter(x => x.runId === input.runId).sort((a,b) => b.version-a.version)[0];
   const binding = { id: randomUUID(), runId: input.runId, version: (previous?.version ?? 0) + 1, issueIds: [...new Set(input.issueIds)].sort(), unitIds: [...new Set(input.unitIds)].sort(), createdAt: new Date().toISOString() };
   this.persist("binding", binding); return binding;
  });
 }
 private append<T extends DevelopmentRecord | DevelopmentTest>(kind: "record" | "test", input: CaptureDevelopmentRecordInput | RecordDevelopmentTestInput): T {
  nonempty(input.runId, "Run ID"); nonempty(input.sourceEventId, "Source event ID");
  if (input.id) assertUuid(input.id);
  return this.transaction(sources => {
   const old = this.entities<T>(sources, kind).find(x => x.runId === input.runId && x.sourceEventId === input.sourceEventId);
   if (old) {
    for (const [key, value] of Object.entries(input)) if (key !== "id" && JSON.stringify((old as unknown as Record<string,unknown>)[key]) !== JSON.stringify(value)) throw new Error(`Source event conflict: ${input.sourceEventId}`);
    if (input.id && old.id !== input.id) throw new Error("Source event identity conflict");
    return old;
   }
   const binding = this.entities<DevelopmentBinding>(sources, "binding").filter(x => x.runId === input.runId && (!input.bindingId || x.id === input.bindingId)).sort((a,b) => b.version-a.version)[0];
   if (!binding) throw new Error("Run must be explicitly bound before capture");
   const value = { ...input, id: input.id ?? randomUUID(), bindingId: binding.id, issueIds: binding.issueIds, unitIds: binding.unitIds, createdAt: new Date().toISOString() } as T;
   this.persist(kind, value); return value;
  });
 }
 captureRecord(input: CaptureDevelopmentRecordInput): DevelopmentRecord { nonempty(input.kind, "Record kind"); return this.append("record", { ...input, metadata: input.metadata ?? {} }); }
 recordTest(input: RecordDevelopmentTestInput): DevelopmentTest {
  nonempty(input.command, "Test command"); nonempty(input.cwd, "Test cwd");
  if (!["passed", "failed", "cancelled", "not-run"].includes(input.status) || (input.status === "passed" && input.exitCode !== 0) || (input.status === "failed" && (input.exitCode === null || input.exitCode === 0))) throw new Error("Test status and exit code disagree");
  return this.append("test", input);
 }
 rebuildIndex() { return this.transaction(sources => ({ projectId: this.projectId, schemaVersion: 1, sources: sources.length, logicalDigest: hash(JSON.stringify(sources.map(s => [s.envelope.kind, s.envelope.payload.id, s.envelope.digest]).sort())) })); }
 private legacy(): WorkTraceabilityManifest {
  const path = join(this.projectRoot, ".www/control-ledger/traceability.json");
  return existsSync(path) ? parseWorkTraceabilityManifest(JSON.parse(readFileSync(path, "utf8"))) : { schemaVersion: 1, references: [], links: [] };
 }
 private context(select?: { kind: "issue" | "unit" | "run"; id: string }): DevelopmentContext {
  const state = this.scan();
  const rows = this.db.query("SELECT path,digest,kind,id,payload FROM development_sources WHERE project = ?").all(this.projectId) as { path: string; digest: string; kind: Kind; id: string; payload: string }[];
  const integrity = this.db.query("PRAGMA integrity_check").all() as Record<string, string>[];
  if (integrity.some(row => Object.values(row).some(value => value !== "ok"))) state.errors.push("SQLite integrity check failed");
  for (const row of rows) { const source = state.sources.find(s => s.path === row.path); if (source && row.digest === source.rawDigest && (row.payload !== JSON.stringify(source.envelope.payload) || row.kind !== source.envelope.kind || row.id !== source.envelope.payload.id)) state.errors.push(`SQLite projection differs from source: ${row.path}`); }
  const stale = rows.length !== state.sources.length || state.sources.some(source => !rows.some(row => row.path === source.path && row.digest === source.rawDigest));
  const values = <T>(kind: Kind): T[] => state.errors.length || stale ? [] : state.sources.filter(source => source.envelope.kind === kind).map(source => source.envelope.payload as T);
  const links = values<{ unitId: string; issue: DevelopmentIssue }>("link");
  const matches = (value: { runId: string; unitIds: string[]; issueIds: string[] }) => !select || (select.kind === "run" ? value.runId === select.id : select.kind === "unit" ? value.unitIds.includes(select.id) : value.issueIds.includes(select.id));
  const bindings = values<DevelopmentBinding>("binding").filter(matches).sort((a,b) => a.runId.localeCompare(b.runId) || a.version - b.version), records = values<DevelopmentRecord>("record").filter(matches).sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)), tests = values<DevelopmentTest>("test").filter(matches).sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const relatedUnits = new Set([...bindings.flatMap(x => x.unitIds), ...links.filter(x => select?.kind === "issue" && x.issue.id === select.id).map(x => x.unitId), ...(select?.kind === "unit" ? [select.id] : [])]);
  const relatedIssues = new Set([...bindings.flatMap(x => x.issueIds), ...links.filter(x => relatedUnits.has(x.unitId)).map(x => x.issue.id), ...(select?.kind === "issue" ? [select.id] : [])]);
  let legacy: WorkTraceabilityManifest = { schemaVersion: 1, references: [], links: [] };
  try { legacy = this.legacy(); } catch (error) { state.errors.push(String(error)); }
  const issues = new Map<string, DevelopmentIssue>();
  for (const issue of [...links.map(x => x.issue), ...legacy.references.filter(x => x.kind === "linear-issue")]) if (!select || relatedIssues.has(issue.id)) issues.set(issue.id, { id: issue.id, uuid: issue.uuid, url: issue.url });
  const legacyLinks = select ? legacy.links.filter(x => relatedIssues.has(x.from.id) || relatedIssues.has(x.to.id)) : legacy.links;
  const referenceKeys = new Set(legacyLinks.flatMap(x => [`${x.from.kind}:${x.from.id}`, `${x.to.kind}:${x.to.id}`]));
  return { projectId: this.projectId, units: values<DevelopmentUnit>("unit").filter(x => !select || relatedUnits.has(x.id)), issues: [...issues.values()], bindings, records, tests, legacyReferences: select ? legacy.references.filter(x => referenceKeys.has(`${x.kind}:${x.id}`) || relatedIssues.has(x.id)) : legacy.references, legacyLinks, integrity: { status: state.errors.length ? "corrupt" : stale ? "stale" : "current", errors: state.errors }, sourceRoot: this.sourceRoot, indexPath: this.indexPath };
 }
 getIssueContext(id: string) { return this.context({ kind: "issue", id }); }
 getUnitContext(id: string) { return this.context({ kind: "unit", id }); }
 getRunContext(id: string) { return this.context({ kind: "run", id }); }
 getContext() { return this.context(); }
 getWorkReferenceContext(kind: WorkReferenceKind, id: string): { references: WorkReference[]; links: WorkTraceabilityLink[] } {
  const manifest = this.legacy();
  const start = manifest.references.find(reference => reference.kind === kind && reference.id === id);
  if (!start) throw new Error(`Unknown work reference: ${kind}:${id}`);
  const visited = new Set<string>([referenceKey(start)]);
  for (let changed = true; changed;) {
   changed = false;
   for (const link of manifest.links) {
    const from = referenceKey(link.from), to = referenceKey(link.to);
    if (visited.has(from) && !visited.has(to)) { visited.add(to); changed = true; }
    if (visited.has(to) && !visited.has(from)) { visited.add(from); changed = true; }
   }
  }
  return {
   references: manifest.references.filter(reference => visited.has(referenceKey(reference))),
   links: manifest.links.filter(link => visited.has(referenceKey(link.from)) && visited.has(referenceKey(link.to))),
  };
 }
}
