import { Database } from "bun:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, linkSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, unlinkSync, writeFileSync, chmodSync } from "node:fs";
import { homedir, platform } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { CaptureDevelopmentRecordInput, DevelopmentBinding, DevelopmentContext, DevelopmentIssue, DevelopmentRecord, DevelopmentTest, DevelopmentUnit, RecordDevelopmentTestInput } from "../../../core/domain/development/development-records.js";
import type { TraceabilityEdge, TraceabilityLedger, TraceRef, VerificationReceipt } from "../../../core/domain/development/development-traceability.js";
import { entityRefs } from "../../../core/domain/development/development-traceability.js";
import { parseWorkTraceabilityManifest, referenceKey, type WorkReference, type WorkReferenceKind, type WorkTraceabilityLink, type WorkTraceabilityManifest } from "../../../core/domain/work/traceability.js";
import { digestLedger, stableJson } from "./development-traceability-digest.js";
import { canonicalDigest, requiredCoverageFromRegistries, sha256, validateLedger, validateVerificationReceipt } from "./development-traceability-contract.js";
import { inspectObsidianTraceability, validateReceiptEvidenceAlignment, type ObsidianNoteProjection } from "./traceability-validator.js";

type Entity = DevelopmentUnit | DevelopmentBinding | DevelopmentRecord | DevelopmentTest | { id: string; unitId: string; issue: DevelopmentIssue };
type Kind = "unit" | "link" | "binding" | "record" | "test";
interface Envelope { schemaVersion: 1; projectId: string; kind: Kind; payload: Entity; digest: string }
interface Source { path: string; envelope: Envelope; rawDigest: string }
export interface TraceabilityGraph {
 logicalDigest: string; entities: Array<{ ref: string; kind: string; id: string }>; edges: TraceabilityEdge[];
}
type TraceabilityQueryKind = "spec" | "acceptance" | "test" | "exception" | "issue" | "unit" | "code" | "pr" | "pull-request" | "note" | "receipt";
interface TraceabilityEntityRow { ref: string; kind: string; externalId: string; payload: string; payloadDigest: string }
interface TraceabilityEdgeRow { source: TraceRef; relation: TraceabilityEdge["relation"]; target: TraceRef }
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
// SQLite's default ORDER BY uses binary code-point order. Projection arrays
// must use the same order or a rebuild can write valid rows and then reject
// its own read-back when IDs contain punctuation or mixed case.
const sqliteOrder = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
function containedSource(root: string, path: string): string {
 if (isAbsolute(path) || path.split(/[\\/]/u).some(part => part === "..")) throw new Error("SOURCE_PATH_MUST_BE_RELATIVE");
 const canonicalRoot = realpathSync(root), canonicalPath = realpathSync(resolve(canonicalRoot, path));
 const offset = relative(canonicalRoot, canonicalPath);
 if (offset === ".." || offset.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(offset)) throw new Error("SOURCE_PATH_ESCAPES_PROJECT");
 return canonicalPath;
}
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
 private readonly vaultRoot?: string;
 private readonly vaultSpecRoot?: string;
 private readonly requiredVaultLinearIds?: readonly string[];
 private readonly db: Database;
 constructor(options: { projectRoot: string; dataRoot?: string; vaultRoot?: string; vaultSpecRoot?: string; requiredVaultLinearIds?: readonly string[] }) {
  this.projectRoot = resolve(options.projectRoot);
  this.vaultRoot = options.vaultRoot ? resolve(options.vaultRoot) : undefined;
  this.vaultSpecRoot = options.vaultSpecRoot;
  this.requiredVaultLinearIds = options.requiredVaultLinearIds;
  this.metadataRoot = join(this.projectRoot, ".www/control-ledger/development");
  mkdirSync(this.metadataRoot, { recursive: true });
  const identityPath = join(this.metadataRoot, "project.json");
  const relationLedgerPath = join(this.projectRoot, ".www/control-ledger/traceability-v3.json");
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
  this.db.run("CREATE TABLE IF NOT EXISTS acceptance_coverage (project TEXT NOT NULL, acceptance_ref TEXT NOT NULL, test_ref TEXT, receipt_ref TEXT, status TEXT NOT NULL, PRIMARY KEY(project,acceptance_ref))");
  this.db.run("CREATE TABLE IF NOT EXISTS exception_coverage (project TEXT NOT NULL, exception_ref TEXT NOT NULL, stage TEXT NOT NULL, test_ref TEXT, receipt_ref TEXT, status TEXT NOT NULL, PRIMARY KEY(project,exception_ref,stage))");
  this.db.run("CREATE TABLE IF NOT EXISTS projection_freshness (project TEXT NOT NULL, ref TEXT NOT NULL, source_digest TEXT NOT NULL, status TEXT NOT NULL, PRIMARY KEY(project,ref))");
  this.db.run("CREATE TABLE IF NOT EXISTS obsidian_notes (project TEXT NOT NULL, document_id TEXT NOT NULL, path TEXT NOT NULL, digest TEXT NOT NULL, linear_id TEXT NOT NULL, schema_version INTEGER NOT NULL, status TEXT NOT NULL, PRIMARY KEY(project,document_id), UNIQUE(project,path), UNIQUE(project,linear_id))");
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
 private hasTraceabilityV2(): boolean { return existsSync(join(this.projectRoot, ".www/control-ledger/traceability-v3.json")); }

 private loadTraceabilityLedger(): TraceabilityLedger {
  const path = join(this.projectRoot, ".www/control-ledger/traceability-v3.json");
  if (!existsSync(path)) throw new Error(`Traceability relation ledger is missing: ${path}`);
  const ledger = JSON.parse(readFileSync(path, "utf8")) as TraceabilityLedger;
  const errors = validateLedger(ledger, digestLedger(ledger));
  if (errors.length) throw new Error(errors.join("\n"));
  if (ledger.projectId !== this.projectId) throw new Error("Traceability project identity differs from DevelopmentStore");
  return ledger;
 }

 private expectedTraceability(ledger: TraceabilityLedger) {
  const receipts = new Map<string, VerificationReceipt>();
  for (const entity of ledger.entities.filter(entity => entity.kind === "receipt")) {
   if (!entity.source) throw new Error(`RECEIPT_SOURCE_MISSING:${entity.ref}`);
   const path = containedSource(this.projectRoot, entity.source.path);
   if (!existsSync(path)) throw new Error(`RECEIPT_SOURCE_MISSING:${entity.ref}`);
   const receiptBytes = readFileSync(path);
   if (sha256(receiptBytes) !== entity.source.digest) throw new Error(`RECEIPT_SOURCE_DIGEST_MISMATCH:${entity.ref}`);
   const receipt = JSON.parse(receiptBytes.toString("utf8")) as VerificationReceipt;
   const errors = validateVerificationReceipt(receipt);
   if (errors.length) throw new Error(errors.join("\n"));
   if (receipt.id !== entity.id) throw new Error(`RECEIPT_ENTITY_MISMATCH:${entity.ref}`);
   for (const evidence of receipt.evidence) {
    const evidencePath = containedSource(this.projectRoot, evidence.path);
    if (sha256(readFileSync(evidencePath)) !== evidence.sha256) throw new Error(`EVIDENCE_DIGEST_MISMATCH:${evidence.id}`);
   }
   receipts.set(entity.ref, receipt);
  }
  const receiptErrors = validateReceiptEvidenceAlignment(ledger, receipts);
  for (const [receiptRef, receipt] of receipts) {
   const required = requiredCoverageFromRegistries(this.projectRoot, ledger, receipt);
   if (canonicalDigest([...(receipt.requiredAcceptanceRefs ?? [])].sort()) !== canonicalDigest(required.requiredAcceptances)
    || canonicalDigest([...(receipt.applicableExceptionStages ?? [])].sort((left, right) => left.exceptionRef.localeCompare(right.exceptionRef)))
     !== canonicalDigest(required.importantStages)) {
    receiptErrors.push(`RECEIPT_REQUIRED_COVERAGE_MISMATCH:${receiptRef}`);
   }
  }
  if (receiptErrors.length) throw new Error(receiptErrors.join("\n"));
  let notes: ObsidianNoteProjection[] = [];
  if (this.vaultRoot) {
   const inspected = inspectObsidianTraceability({ vaultRoot: this.vaultRoot, ledger, specRoot: this.vaultSpecRoot, requiredLinearIds: this.requiredVaultLinearIds });
   if (inspected.errors.length) throw new Error(inspected.errors.join("\n"));
   notes = inspected.notes;
  }
  const entities: TraceabilityEntityRow[] = ledger.entities.map(value => {
   const payload = stableJson(value);
   return { ref: value.ref, kind: value.kind, externalId: value.id, payload, payloadDigest: hash(payload) };
  }).sort((left, right) => sqliteOrder(left.ref, right.ref));
  const edges: TraceabilityEdgeRow[] = ledger.edges.map(edge => ({ source: edge.from, relation: edge.relation, target: edge.to }))
   .sort((left, right) => sqliteOrder(left.source, right.source) || sqliteOrder(left.relation, right.relation) || sqliteOrder(left.target, right.target));
  const logicalDigest = digestLedger(ledger);
  const currentReceipts = (target: TraceRef, test: TraceRef) => ledger.edges
   .filter(edge => edge.relation === "executes" && edge.to === test)
   .map(edge => edge.from)
   .filter((receiptRef, index, values) => values.indexOf(receiptRef) === index)
   .filter(receiptRef => ledger.edges.some(edge => edge.from === receiptRef && edge.relation === "covers" && edge.to === target))
   .filter(receiptRef => {
    const receipt = receipts.get(receiptRef);
    return Boolean(receipt && ledger.edges.some(edge => edge.from === receiptRef && edge.relation === "at-revision" && ledger.entities.some(entity => entity.ref === edge.to && entity.kind === "git-revision" && entity.id === receipt.sourceRevision)));
   });
  const acceptanceCoverage = ledger.entities.filter(entity => entity.kind === "acceptance").map(entity => {
   const tests = ledger.edges.filter(edge => edge.from === entity.ref && edge.relation === "verified-by").map(edge => edge.to);
   const candidates = tests.flatMap(test => currentReceipts(entity.ref, test).map(receiptRef => ({ test, receiptRef, coverage: receipts.get(receiptRef)!.acceptanceCoverage.find(item => item.acceptanceRef === entity.ref && item.testRef === test) })));
   const candidate = candidates.length === 1 ? candidates[0] : undefined;
   return { acceptanceRef: entity.ref, testRef: candidate?.test ?? (tests.length === 1 ? tests[0]! : null), receiptRef: candidate?.receiptRef ?? null, status: candidate?.coverage?.status ?? "blocked" };
  }).sort((a, b) => sqliteOrder(a.acceptanceRef, b.acceptanceRef));
  const exceptionCoverage = ledger.entities.filter(entity => entity.kind === "exception").flatMap(entity => ["detect", "control", "recovery"].map(stage => {
   const tests = ledger.edges.filter(edge => edge.from === entity.ref && edge.relation === "verified-by").map(edge => edge.to);
   const candidates = tests.flatMap(test => currentReceipts(entity.ref, test).map(receiptRef => ({ test, receiptRef, coverage: receipts.get(receiptRef)!.exceptionCoverage.find(item => item.exceptionRef === entity.ref && item.stage === stage && item.testRef === test) })).filter(candidate => candidate.coverage));
   const candidate = candidates.length === 1 ? candidates[0] : undefined;
   return { exceptionRef: entity.ref, stage, testRef: candidate?.test ?? (tests.length === 1 ? tests[0]! : null), receiptRef: candidate?.receiptRef ?? null, status: candidate?.coverage?.status ?? "blocked" };
  })).sort((a, b) => sqliteOrder(a.exceptionRef, b.exceptionRef) || sqliteOrder(a.stage, b.stage));
  const freshness = entities.map(entity => {
   const source = ledger.entities.find(value => value.ref === entity.ref)?.source;
   if (!source) return { ref: entity.ref, sourceDigest: entity.payloadDigest, status: "unknown" };
   if (entity.kind === "note" && this.vaultRoot) {
    const note = notes.find(value => value.documentId === entity.externalId);
    return { ref: entity.ref, sourceDigest: source.digest, status: note?.status ?? "unknown" };
   }
   const path = resolve(this.projectRoot, source.path);
   if (!existsSync(path)) return { ref: entity.ref, sourceDigest: source.digest, status: "unknown" };
   return { ref: entity.ref, sourceDigest: source.digest, status: hash(readFileSync(path, "utf8")) === source.digest ? "current" : "stale" };
  });
  const rowDigest = hash(stableJson({ projectId: this.projectId, entities, edges, acceptanceCoverage, exceptionCoverage, freshness, notes }));
  const meta = [
   { key: "logical_digest", value: logicalDigest },
   { key: "project_id", value: this.projectId },
   { key: "row_digest", value: rowDigest },
   { key: "schema_version", value: "3" },
  ];
  return { entities, edges, acceptanceCoverage, exceptionCoverage, freshness, notes, meta, logicalDigest, rowDigest };
 }

 rebuildTraceability(): { logicalDigest: string; rowDigest: string; entities: number; edges: number } {
  const ledger = this.loadTraceabilityLedger();
  const expected = this.expectedTraceability(ledger);
  this.db.run("BEGIN IMMEDIATE");
  try {
   this.db.query("DELETE FROM traceability_edges WHERE project = ?").run(this.projectId);
   this.db.query("DELETE FROM traceability_entities WHERE project = ?").run(this.projectId);
   this.db.query("DELETE FROM traceability_meta WHERE project = ?").run(this.projectId);
   this.db.query("DELETE FROM acceptance_coverage WHERE project = ?").run(this.projectId);
   this.db.query("DELETE FROM exception_coverage WHERE project = ?").run(this.projectId);
   this.db.query("DELETE FROM projection_freshness WHERE project = ?").run(this.projectId);
   this.db.query("DELETE FROM obsidian_notes WHERE project = ?").run(this.projectId);
   const insertEntity = this.db.query("INSERT INTO traceability_entities(project,ref,kind,external_id,payload,payload_digest) VALUES (?,?,?,?,?,?)");
   for (const row of expected.entities) insertEntity.run(this.projectId, row.ref, row.kind, row.externalId, row.payload, row.payloadDigest);
   const insertEdge = this.db.query("INSERT INTO traceability_edges(project,source,relation,target) VALUES (?,?,?,?)");
   for (const row of expected.edges) insertEdge.run(this.projectId, row.source, row.relation, row.target);
   const insertAcceptance = this.db.query("INSERT INTO acceptance_coverage(project,acceptance_ref,test_ref,receipt_ref,status) VALUES (?,?,?,?,?)");
   for (const row of expected.acceptanceCoverage) insertAcceptance.run(this.projectId, row.acceptanceRef, row.testRef, row.receiptRef, row.status);
   const insertException = this.db.query("INSERT INTO exception_coverage(project,exception_ref,stage,test_ref,receipt_ref,status) VALUES (?,?,?,?,?,?)");
   for (const row of expected.exceptionCoverage) insertException.run(this.projectId, row.exceptionRef, row.stage, row.testRef, row.receiptRef, row.status);
   const insertFreshness = this.db.query("INSERT INTO projection_freshness(project,ref,source_digest,status) VALUES (?,?,?,?)");
   for (const row of expected.freshness) insertFreshness.run(this.projectId, row.ref, row.sourceDigest, row.status);
   const insertNote = this.db.query("INSERT INTO obsidian_notes(project,document_id,path,digest,linear_id,schema_version,status) VALUES (?,?,?,?,?,?,?)");
   for (const row of expected.notes) insertNote.run(this.projectId, row.documentId, row.path, row.digest, row.linearId, row.schemaVersion, row.status);
   const insertMeta = this.db.query("INSERT INTO traceability_meta(project,key,value) VALUES (?,?,?)");
   for (const row of expected.meta) insertMeta.run(this.projectId, row.key, row.value);
   this.db.run("COMMIT");
  } catch (error) { this.db.run("ROLLBACK"); throw error; }
  this.assertTraceabilityCurrent();
  return { logicalDigest: expected.logicalDigest, rowDigest: expected.rowDigest, entities: entityRefs(ledger).size, edges: ledger.edges.length };
 }

 assertTraceabilityCurrent(): { logicalDigest: string; rowDigest: string } {
  const ledger = this.loadTraceabilityLedger();
  const expected = this.expectedTraceability(ledger);
  const integrity = this.db.query("PRAGMA integrity_check").all() as Array<Record<string, string>>;
  const foreignKeys = this.db.query("PRAGMA foreign_key_check").all();
  const entities = (this.db.query("SELECT ref,kind,external_id,payload,payload_digest FROM traceability_entities WHERE project = ? ORDER BY ref").all(this.projectId) as Array<{ ref: string; kind: string; external_id: string; payload: string; payload_digest: string }>).map(row => ({ ref: row.ref, kind: row.kind, externalId: row.external_id, payload: row.payload, payloadDigest: row.payload_digest }));
  const edges = this.db.query("SELECT source,relation,target FROM traceability_edges WHERE project = ? ORDER BY source,relation,target").all(this.projectId) as TraceabilityEdgeRow[];
  const meta = this.db.query("SELECT key,value FROM traceability_meta WHERE project = ? ORDER BY key").all(this.projectId) as Array<{ key: string; value: string }>;
  const acceptanceCoverage = this.db.query("SELECT acceptance_ref,test_ref,receipt_ref,status FROM acceptance_coverage WHERE project = ? ORDER BY acceptance_ref").all(this.projectId).map((row: any) => ({ acceptanceRef: row.acceptance_ref, testRef: row.test_ref, receiptRef: row.receipt_ref, status: row.status }));
  const exceptionCoverage = this.db.query("SELECT exception_ref,stage,test_ref,receipt_ref,status FROM exception_coverage WHERE project = ? ORDER BY exception_ref,stage").all(this.projectId).map((row: any) => ({ exceptionRef: row.exception_ref, stage: row.stage, testRef: row.test_ref, receiptRef: row.receipt_ref, status: row.status }));
  const freshness = this.db.query("SELECT ref,source_digest,status FROM projection_freshness WHERE project = ? ORDER BY ref").all(this.projectId).map((row: any) => ({ ref: row.ref, sourceDigest: row.source_digest, status: row.status }));
  const notes = this.db.query("SELECT document_id,path,digest,linear_id,schema_version,status FROM obsidian_notes WHERE project = ? ORDER BY document_id").all(this.projectId).map((row: any) => ({ documentId: row.document_id, path: row.path, digest: row.digest, linearId: row.linear_id, schemaVersion: row.schema_version, status: row.status }));
  const actualRowDigest = hash(stableJson({ projectId: this.projectId, entities, edges, acceptanceCoverage, exceptionCoverage, freshness, notes }));
  const errors: string[] = [];
  if (integrity.some(row => Object.values(row).some(value => value !== "ok"))) errors.push("SQLite integrity check failed");
  if (foreignKeys.length) errors.push("SQLite foreign-key check failed");
  if (stableJson(entities) !== stableJson(expected.entities)) errors.push("traceability entity projection differs from relation ledger");
  if (stableJson(edges) !== stableJson(expected.edges)) errors.push("traceability edge projection differs from relation ledger");
  if (stableJson(meta) !== stableJson(expected.meta)) errors.push("traceability metadata projection differs from relation ledger");
  if (stableJson(acceptanceCoverage) !== stableJson(expected.acceptanceCoverage) || stableJson(exceptionCoverage) !== stableJson(expected.exceptionCoverage) || stableJson(freshness) !== stableJson(expected.freshness) || stableJson(notes) !== stableJson(expected.notes)) errors.push("traceability materialized projection differs from relation ledger");
  if (actualRowDigest !== expected.rowDigest) errors.push("traceability canonical row digest differs from relation ledger");
  if (errors.length) throw new Error(`${errors.join("\n")}\nrun \`bun run traceability:rebuild\``);
  return { logicalDigest: expected.logicalDigest, rowDigest: expected.rowDigest };
 }

 queryTraceability(kind: TraceabilityQueryKind, id: string): TraceabilityGraph {
  const { logicalDigest } = this.assertTraceabilityCurrent();
  const normalizedKind = kind === "test" ? "test-contract" : kind;
  const entities = this.db.query("SELECT ref,kind,external_id FROM traceability_entities WHERE project = ?").all(this.projectId) as Array<{ ref: string; kind: string; external_id: string }>;
  const match = entities
   .filter(entity => entity.kind === normalizedKind && entity.external_id === id)
   .sort((left, right) => right.ref.localeCompare(left.ref, undefined, { numeric: true }))[0];
  if (!match) throw new Error(`Unknown traceability id: ${normalizedKind}:${id}`);
  const start = match.ref as TraceRef;
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
  return { logicalDigest, entities: entities.filter(entity => visited.has(entity.ref)).map(entity => ({ ref: entity.ref, kind: entity.kind, id: entity.external_id })).sort((a, b) => a.ref.localeCompare(b.ref)), edges: edges.filter(edge => visited.has(edge.source) && visited.has(edge.target)).map(edge => ({ from: edge.source, relation: edge.relation as TraceabilityEdge["relation"], to: edge.target })) };
 }
 coverageForSpec(id: string) {
  const { logicalDigest } = this.assertTraceabilityCurrent();
  const specRow = this.db.query("SELECT ref FROM traceability_entities WHERE project = ? AND kind = 'spec' AND external_id = ? ORDER BY ref DESC LIMIT 1").get(this.projectId, id) as { ref: string } | null;
  if (!specRow) throw new Error(`Unknown traceability spec: spec:${id}`);
  const spec = specRow.ref as TraceRef;
  const acceptances = this.db.query("SELECT target FROM traceability_edges WHERE project = ? AND source = ? AND relation = 'has-acceptance' ORDER BY target").all(this.projectId, spec) as Array<{ target: string }>;
  if (!acceptances.length) throw new Error(`Traceability spec has no acceptance: ${spec}`);
  const coverage = this.db.query("SELECT acceptance_ref,test_ref,receipt_ref,status FROM acceptance_coverage WHERE project = ? ORDER BY acceptance_ref").all(this.projectId) as Array<{ acceptance_ref: string; test_ref: string | null; receipt_ref: string | null; status: string }>;
  return { logicalDigest, acceptances: coverage.filter(row => acceptances.some(item => item.target === row.acceptance_ref)).map(row => ({ acceptanceRef: row.acceptance_ref, testRef: row.test_ref, receiptRef: row.receipt_ref, status: row.status })) };
 }
 traceabilityDrift() {
  const { logicalDigest } = this.assertTraceabilityCurrent();
  return {
   logicalDigest,
   stale: this.db.query("SELECT ref,status FROM projection_freshness WHERE project = ? AND status != 'current' ORDER BY ref").all(this.projectId),
   notes: this.db.query("SELECT document_id AS documentId,path,digest,linear_id AS linearId,status FROM obsidian_notes WHERE project = ? AND status != 'current' ORDER BY document_id").all(this.projectId),
  };
 }
 traceabilityOrphans() {
  const { logicalDigest } = this.assertTraceabilityCurrent();
  const entities = this.db.query("SELECT ref FROM traceability_entities WHERE project = ? ORDER BY ref").all(this.projectId) as Array<{ ref: string }>;
  const edges = this.db.query("SELECT source,target FROM traceability_edges WHERE project = ?").all(this.projectId) as Array<{ source: string; target: string }>;
  return { logicalDigest, entities: entities.filter(entity => !edges.some(edge => edge.source === entity.ref || edge.target === entity.ref)).map(entity => entity.ref) };
 }
 registerUnit(input: { id?: string; name: string }): DevelopmentUnit {
  if (this.hasTraceabilityV2()) throw new Error("Unit creation is owned by the traceability-v3 graph ledger; refusing a competing source envelope");
  nonempty(input.name, "Unit name"); const id = input.id ?? randomUUID(); assertUuid(id);
  return this.transaction(sources => {
   const old = this.entities<DevelopmentUnit>(sources, "unit").find(x => x.id === id);
   if (old) { if (old.name !== input.name) throw new Error("Unit identity already has another name"); return old; }
   const unit = { id, name: input.name, createdAt: new Date().toISOString() }; this.persist("unit", unit); return unit;
  });
 }
 linkIssue(input: { unitId: string; issue: DevelopmentIssue }) {
  if (this.hasTraceabilityV2()) throw new Error("Unit–Issue links are owned by the traceability-v3 graph ledger; refusing a competing source envelope");
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
