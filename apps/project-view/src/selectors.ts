import      { mockDb        } from "./mock-db" ;
import      { TABLE_NAMES   } from "./model"   ;
import type {
              DbRecord    ,
              Decision    ,
              ModuleSlug  ,
              Principle   ,
              ProjectNode ,
              RecordRef   ,
              TableName   ,
                            } from "./model"   ;

export const moduleBySlug = (slug: ModuleSlug) => mockDb.project_nodes.find((node) => node.slug === slug)!;
export const moduleComponents = (slug: ModuleSlug) => {
  const module = moduleBySlug(slug);
  return mockDb.project_nodes.filter((node) => node.parentId === module.id);
};
export const viewForModule = (slug: ModuleSlug) => {
  const module = moduleBySlug(slug);
  return mockDb.views.find((view) => view.nodeId === module.id)!;
};
export const recordByRef = (recordRef: RecordRef): DbRecord | undefined =>
  (mockDb[recordRef.table] as readonly DbRecord[]).find((record) => record.id === recordRef.id);
export const findRecord = (id: string): { table: TableName; record: DbRecord } | undefined => {
  for (const table of TABLE_NAMES) {
    const record = (mockDb[table] as readonly DbRecord[]).find((item) => item.id === id);
    if (record) return { table, record };
  }
  return undefined;
};
export const checkForTarget = (targetId: string) => mockDb.verification_runs.find((check) => check.targetId === targetId);
export const checksForModule = (slug: ModuleSlug) => {
  const module = moduleBySlug(slug)                                                     ;
  const ids    = new Set([module.id, ...moduleComponents(slug).map((item) => item.id)]) ;
  return mockDb.verification_runs.filter((check) => ids.has(check.targetId));
};
export const principlesForModule = (slug: ModuleSlug) => {
  const ids = new Set(moduleComponents(slug).map((item) => item.id));
  return mockDb.principles.filter((principle) => principle.targetIds.some((id) => ids.has(id)));
};
export const decisionsForModule = (slug: ModuleSlug) => {
  const module = moduleBySlug(slug)                                                     ;
  const ids    = new Set([module.id, ...moduleComponents(slug).map((item) => item.id)]) ;
  return mockDb.decisions.filter((decision) => ids.has(decision.targetId));
};
export const relationsFor = (recordRef: RecordRef) => mockDb.relations.filter((relation) =>
  (relation.from.table === recordRef.table && relation.from.id === recordRef.id)
  || (relation.to.table === recordRef.table && relation.to.id === recordRef.id));
export const adjacentModules = (slug: ModuleSlug) => {
  const module = moduleBySlug(slug);
  const relatedIds = relationsFor({ table: "project_nodes", id: module.id })
    .flatMap((relation) => [relation.from, relation.to])
    .filter((item) => item.table === "project_nodes" && item.id !== module.id)
    .map((item) => item.id);
  return mockDb.project_nodes.filter((node) => node.kind === "module" && relatedIds.includes(node.id));
};
export const documentsForModule = (slug: ModuleSlug) => {
  const documentIds = new Set(principlesForModule(slug).map((principle) => principle.documentId));
  return mockDb.documents.filter((document) => documentIds.has(document.id));
};
export const relationPathForPrinciple = (principle: Principle) => {
  const definition = mockDb.relations.find((relation) =>
    relation.kind === "defines"
    && relation.to.table === "principles"
    && relation.to.id === principle.id);
  const documentRef = definition?.from.table === "documents" ? definition.from : { table: "documents" as const, id: principle.documentId };
  const documentReferences = mockDb.relations.filter((relation) =>
    relation.kind === "references"
    && relation.to.table === documentRef.table
    && relation.to.id === documentRef.id);
  const applicationTargets = mockDb.relations.filter((relation) =>
    relation.kind === "applies-to"
    && relation.from.table === "principles"
    && relation.from.id === principle.id);
  const runtimeInputs = mockDb.relations.filter((relation) =>
    relation.kind === "included-in-execution-input"
    && relation.to.table === documentRef.table
    && relation.to.id === documentRef.id);
  const verifications = mockDb.relations.filter((relation) =>
    relation.kind === "verifies"
    && relation.to.table === "principles"
    && relation.to.id === principle.id);
  return { definition, documentRef, documentReferences, applicationTargets, runtimeInputs, verifications };
};
export const implementationForDecision = (id: string) => mockDb.implementation_links.find((link) => link.decisionId === id);
export const verificationForDecision = (decision: Decision) =>
  mockDb.verification_runs.find((check) => check.refs.some((item) => item.table === "decisions" && item.id === decision.id));
export const targetNode = (targetId: string): ProjectNode | undefined => mockDb.project_nodes.find((node) => node.id === targetId);

const uniqueReferences = (references: readonly RecordRef[]): RecordRef[] => {
  const referencesByIdentity = new Map(references.map((item) => [`${item.table}/${item.id}`, item]));
  return [...referencesByIdentity.values()];
};

export const outgoingReferences = (table: TableName, record: DbRecord): RecordRef[] => {
  const references = [...record.refs];
  if (table === "project_nodes" && "parentId" in record && record.parentId) references.push({ table: "project_nodes", id: record.parentId });
  if (table === "relations" && "from" in record) references.push(record.from, record.to, ...(record.source ? [record.source] : []));
  if (table === "views" && "nodeId" in record) {
    references.push({ table: "project_nodes", id: record.nodeId });
    references.push(...record.annotations.map((annotation) => ({ table: "project_nodes" as const, id: annotation.componentId })));
  }
  if (table === "principles" && "documentId" in record) {
    references.push({ table: "documents", id: record.documentId });
    references.push(...record.targetIds.map((id) => ({ table: "project_nodes" as const, id })));
  }
  if (table === "decisions" && "sourceRawIds" in record) {
    references.push({ table: "project_nodes", id: record.targetId });
    references.push(...record.sourceRawIds.map((id) => ({ table: "raw_events" as const, id })));
    if (record.supersededBy) references.push({ table: "decisions", id: record.supersededBy });
  }
  if (table === "implementation_links" && "decisionId" in record) {
    references.push({ table: "decisions", id: record.decisionId });
    references.push({ table: "commits", id: record.commitId });
    references.push({ table: "project_nodes", id: record.targetId });
  }
  if (table === "verification_runs" && "criterion" in record) references.push({ table: "project_nodes", id: record.targetId });
  if (table === "raw_sessions" && "projectId" in record) references.push({ table: "project_nodes", id: record.projectId });
  if (table === "raw_events" && "sessionId" in record) references.push({ table: "raw_sessions", id: record.sessionId });
  return uniqueReferences(references);
};

export const componentEvidenceRefs = (componentId: string): RecordRef[] => {
  const target = { table: "project_nodes" as const, id: componentId };
  const principles = mockDb.principles
    .filter((principle) => outgoingReferences("principles", principle).some((item) => item.table === target.table && item.id === target.id))
    .map((principle) => ({ table: "principles" as const, id: principle.id }));
  const checks = mockDb.verification_runs
    .filter((check) => outgoingReferences("verification_runs", check).some((item) => item.table === target.table && item.id === target.id))
    .map((check) => ({ table: "verification_runs" as const, id: check.id }));
  return uniqueReferences([...principles, ...checks]);
};

export interface IntegrityIssue {
  type: "duplicate" | "missing-ref" | "cycle";
  message: string;
}
export function verifyMockDb(db = mockDb): IntegrityIssue[] {
  const issues: IntegrityIssue[] = []                                                                                                   ;
  const ids                      = new Map<string, TableName>()                                                                         ;
  const resolve                  = (item: RecordRef) => (db[item.table] as readonly DbRecord[]).find((record) => record.id === item.id) ;
  for (const table of TABLE_NAMES) {
    for (const record of db[table]) {
      if (ids.has(record.id)) issues.push({ type: "duplicate", message: `${record.id} is duplicated in ${table} and ${ids.get(record.id)}` });
      ids.set(record.id, table);
    }
  }
  const requireRef = (source: string, item: RecordRef | null | undefined) => { if (item && !resolve(item)) issues.push({ type: "missing-ref", message: `${source} -> ${item.table}/${item.id}` }); };
  for (const table of TABLE_NAMES) {
    for (const record of db[table]) {
      for (const item of record.refs) {
        if (!resolve(item)) issues.push({ type: "missing-ref", message: `${table}/${record.id} -> ${item.table}/${item.id}` });
      }
    }
  }
  for (const node of db.project_nodes) if (node.parentId) requireRef(`project_nodes/${node.id}.parentId`, { table: "project_nodes", id: node.parentId });
  for (const relation of db.relations) { requireRef(`relations/${relation.id}.from`, relation.from); requireRef(`relations/${relation.id}.to`, relation.to); requireRef(`relations/${relation.id}.source`, relation.source); }
  for (const view of db.views) {
    requireRef(`views/${view.id}.nodeId`, { table: "project_nodes", id: view.nodeId });
    view.annotations.forEach((annotation) => requireRef(`views/${view.id}.annotations`, { table: "project_nodes", id: annotation.componentId }));
  }
  for (const principle of db.principles) { requireRef(`principles/${principle.id}.documentId`, { table: "documents", id: principle.documentId }); principle.targetIds.forEach((id) => requireRef(`principles/${principle.id}.targetIds`, { table: "project_nodes", id })); }
  for (const decision of db.decisions) { requireRef(`decisions/${decision.id}.targetId`, { table: "project_nodes", id: decision.targetId }); decision.sourceRawIds.forEach((id) => requireRef(`decisions/${decision.id}.sourceRawIds`, { table: "raw_events", id })); }
  for (const link of db.implementation_links) { requireRef(`implementation_links/${link.id}.decisionId`, { table: "decisions", id: link.decisionId }); requireRef(`implementation_links/${link.id}.commitId`, { table: "commits", id: link.commitId }); requireRef(`implementation_links/${link.id}.targetId`, { table: "project_nodes", id: link.targetId }); }
  for (const check of db.verification_runs) requireRef(`verification_runs/${check.id}.targetId`, { table: "project_nodes", id: check.targetId });
  for (const session of db.raw_sessions) requireRef(`raw_sessions/${session.id}.projectId`, { table: "project_nodes", id: session.projectId });
  for (const event of db.raw_events) requireRef(`raw_events/${event.id}.sessionId`, { table: "raw_sessions", id: event.sessionId });
  const visiting = new Set<string>() ;
  const visited  = new Set<string>() ;
  const visit = (decision: Decision) => {
    if (visiting.has(decision.id)) { issues.push({ type: "cycle", message: `decision replacement cycle at ${decision.id}` }); return; }
    if (visited.has(decision.id) || !decision.supersededBy) return;
    visiting.add(decision.id);
    const next = db.decisions.find((item) => item.id === decision.supersededBy);
    if (!next) issues.push({ type: "missing-ref", message: `decisions/${decision.id} supersededBy ${decision.supersededBy}` });
    else visit(next);
    visiting.delete(decision.id); visited.add(decision.id);
  };
  db.decisions.forEach(visit);
  return issues;
}

export const formatValue = (value: unknown): string => {
  if (value === null) return "null";
  if (value === "") return '"" (empty string)';
  if (value === false) return "false";
  if (value === true) return "true";
  if (Array.isArray(value)) return value.length ? `[${value.length} items]` : "[]";
  if (typeof value === "object") return `{${Object.keys(value as object).length} fields}`;
  return String(value);
};

export const allReferencedBy = (table: TableName, id: string) => {
  const found: { table: TableName; record: DbRecord }[] = [];
  for (const sourceTable of TABLE_NAMES) {
    for (const record of mockDb[sourceTable]) {
      if (outgoingReferences(sourceTable, record).some((item) => item.table === table && item.id === id)) found.push({ table: sourceTable, record });
    }
  }
  return found;
};
