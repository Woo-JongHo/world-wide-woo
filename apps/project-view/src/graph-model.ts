import      { mockDb           } from "./mock-db" ;
import type {
              CheckStatus    ,
              DecisionStatus ,
              ModuleSlug     ,
              RecordRef      ,
                               } from "./model"   ;

export type GraphMode = "structure" | "evidence";

type GraphNodeKind = "project" | "module" | "component" | "document" | "principle"
                     | "decision" | "commit" | "check" | "raw";

export interface GraphNode {
  id       : string                              ;
  ref      : RecordRef                           ;
  title    : string                              ;
  subtitle : string                              ;
  kind     : GraphNodeKind                       ;
  x        : number                              ;
  y        : number                              ;
  status   : CheckStatus | DecisionStatus | null ;
}

export interface GraphEdge {
  id         : string                                 ;
  source     : string                                 ;
  target     : string                                 ;
  label      : string                                 ;
  provenance : string                                 ;
  kind       : "structure" | "relation" | "reference" ;
}

export interface GraphData {
  nodes : GraphNode[] ;
  edges : GraphEdge[] ;
}

export const NODE_WIDTH  = 224 ;
export const NODE_HEIGHT = 88  ;

const projectNodeRef = (id: string): RecordRef => ({ table: "project_nodes", id });

const makeGraphNode = (
  ref: RecordRef,
  title: string,
  subtitle: string,
  kind: GraphNode["kind"],
  status: GraphNode["status"],
): GraphNode => ({ id: ref.id, ref, title, subtitle, kind, x: 0, y: 0, status });

const graphNodeAt = (ref: RecordRef, x: number, y: number): GraphNode => {
  const node = graphNodeForRef(ref);
  if (!node) throw new Error(`Graph record does not exist: ${ref.table}/${ref.id}`);
  return { ...node, x, y };
};

const structureEdge = (source: string, target: string): GraphEdge => ({
  id         : `structure:${source}:${target}`       ,
  source                                            ,
  target                                            ,
  label      : "포함"                              ,
  provenance : `project_nodes.${target}.parentId`   ,
  kind       : "structure"                         ,
});

const relationEdge = (id: string): GraphEdge => {
  const relation = mockDb.relations.find((item) => item.id === id);
  if (!relation) throw new Error(`Graph relation does not exist: ${id}`);
  return {
    id         : relation.id                ,
    source     : relation.from.id           ,
    target     : relation.to.id             ,
    label      : relation.kind              ,
    provenance : `relations.${relation.id}` ,
    kind       : "relation"                 ,
  };
};

const referenceEdge = (
  id: string,
  source: string,
  target: string,
  label: string,
  provenance: string,
): GraphEdge => ({ id, source, target, label, provenance, kind: "reference" });

const structureGraph = (module: ModuleSlug | null): GraphData => {
  const root = mockDb.project_nodes.find((node) => node.kind === "project");
  if (!root) throw new Error("Project graph root does not exist");
  const modules = mockDb.project_nodes.filter((node) =>
    node.kind === "module" && node.parentId === root.id);

  const moduleY = [40, 260, 480];
  const nodes = [
    graphNodeAt(projectNodeRef(root.id), 0, 260),
    ...modules.map((node, index) => graphNodeAt(projectNodeRef(node.id), 300, moduleY[index] ?? 260)),
  ];
  const edges = modules.map((node) => structureEdge(root.id, node.id));
  if (module === null) return { nodes, edges };

  const focusedModule = modules.find((node) => node.slug === module);
  if (!focusedModule) throw new Error(`Project module does not exist: ${module}`);
  const components    = mockDb.project_nodes.filter((node) => node.parentId === focusedModule.id) ;
  const componentStep = components.length > 1 ? 520 / (components.length - 1) : 0                 ;
  const componentNodes = components.map((node, index) =>
    graphNodeAt(projectNodeRef(node.id), 650, components.length === 1 ? 260 : componentStep * index));
  const componentEdges = components.map((node) => structureEdge(focusedModule.id, node.id));
  return { nodes: [...nodes, ...componentNodes], edges: [...edges, ...componentEdges] };
};

const evidenceGraph = (): GraphData => ({
  nodes: [
    graphNodeAt({ table: "decisions", id: "DEC-014" }, 300, 190),
    graphNodeAt({ table: "raw_events", id: "RAW-013" }, 0, 80),
    graphNodeAt({ table: "raw_events", id: "RAW-014" }, 0, 280),
    graphNodeAt({ table: "commits", id: "COM-014" }, 650, 20),
    graphNodeAt({ table: "verification_runs", id: "CHK-014" }, 650, 210),
    graphNodeAt({ table: "documents", id: "DOC-002" }, 0, 500),
    graphNodeAt({ table: "principles", id: "PRN-003" }, 300, 450),
    graphNodeAt({ table: "project_nodes", id: "CMP-CHAT-STREAM" }, 650, 450),
  ],
  edges: [
    referenceEdge("reference:RAW-013:DEC-014", "RAW-013", "DEC-014", "제안 근거", "decisions.DEC-014.sourceRawIds"),
    referenceEdge("reference:RAW-014:DEC-014", "RAW-014", "DEC-014", "채택 근거", "decisions.DEC-014.sourceRawIds"),
    referenceEdge("reference:DEC-014:CHK-014", "DEC-014", "CHK-014", "검사 참조", "decisions.DEC-014.refs"),
    relationEdge("REL-004"),
    relationEdge("REL-008"),
    relationEdge("REL-009"),
    relationEdge("REL-006"),
    relationEdge("REL-012"),
  ],
});

export const graphNodeForRef = (ref: RecordRef): GraphNode | null => {
  switch (ref.table) {
    case "project_nodes": {
      const record = mockDb.project_nodes.find((item) => item.id === ref.id);
      return record
        ? makeGraphNode(ref, record.displayLabel ?? record.name, record.responsibility, record.kind, null)
        : null;
    }
    case "relations": {
      const record = mockDb.relations.find((item) => item.id === ref.id);
      return record
        ? makeGraphNode(ref, record.kind, `${record.from.id} → ${record.to.id}`, "raw", null)
        : null;
    }
    case "views": {
      const record = mockDb.views.find((item) => item.id === ref.id);
      return record ? makeGraphNode(ref, record.previewKind, record.revision, "raw", null) : null;
    }
    case "documents": {
      const record = mockDb.documents.find((item) => item.id === ref.id);
      return record ? makeGraphNode(ref, record.title, record.path, "document", null) : null;
    }
    case "principles": {
      const record = mockDb.principles.find((item) => item.id === ref.id);
      return record ? makeGraphNode(ref, record.statement, record.detail, "principle", null) : null;
    }
    case "decisions": {
      const record = mockDb.decisions.find((item) => item.id === ref.id);
      return record ? makeGraphNode(ref, record.title, record.content, "decision", record.status) : null;
    }
    case "commits": {
      const record = mockDb.commits.find((item) => item.id === ref.id);
      return record
        ? makeGraphNode(ref, record.summary, `${record.sha} · ${record.branch}`, "commit", null)
        : null;
    }
    case "implementation_links": {
      const record = mockDb.implementation_links.find((item) => item.id === ref.id);
      return record ? makeGraphNode(ref, record.file, record.basis, "raw", null) : null;
    }
    case "verification_runs": {
      const record = mockDb.verification_runs.find((item) => item.id === ref.id);
      return record
        ? makeGraphNode(ref, record.criterion, `${record.method} · ${record.actor}`, "check", record.status)
        : null;
    }
    case "raw_sessions": {
      const record = mockDb.raw_sessions.find((item) => item.id === ref.id);
      return record
        ? makeGraphNode(ref, record.sourceKind, record.sourceDescription, "raw", null)
        : null;
    }
    case "raw_events": {
      const record = mockDb.raw_events.find((item) => item.id === ref.id);
      return record
        ? makeGraphNode(ref, record.eventKind, record.transcript ?? "원문 없음", "raw", null)
        : null;
    }
  }
};

export const buildProjectGraph = (mode: GraphMode, module: ModuleSlug | null): GraphData =>
  mode === "structure" ? structureGraph(module) : evidenceGraph();
