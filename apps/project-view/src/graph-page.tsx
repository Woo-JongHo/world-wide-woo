import      { useMemo, useState               } from "react"         ;
import type { ModuleSlug, RecordRef           } from "./model"       ;
import type { GraphData, GraphMode, GraphNode } from "./graph-model" ;
import      { buildProjectGraph               } from "./graph-model" ;
import      { NodeCanvas                      } from "./node-canvas" ;
import      { mockDb                          } from "./mock-db"     ;
import      { outgoingReferences, recordByRef } from "./selectors"   ;
import      { AppLink, navigateTo, pathForRef } from "./navigation"  ;
import      { CopyButton, StatusLabel         } from "./common"      ;
import "./graph.css";

const moduleSlugs: readonly ModuleSlug[] = ["monitor", "chat", "dashboard"];

const kindLabels: Record<GraphNode["kind"], string> = {
  project: "Project", module: "Module", component: "Component", document: "Document",
  principle: "Principle", decision: "Decision", commit: "Commit", check: "Check", raw: "RAW",
};

function graphHref(mode: GraphMode, scope: ModuleSlug | null, nodeId: string | null) {
  const params = new URLSearchParams();
  params.set("scope", scope ?? "all");
  if (nodeId) params.set("node", nodeId);
  const query = params.toString();
  return `/projects/www/${mode === "structure" ? "service" : "assurance"}${query ? `?${query}` : ""}`;
}

function readScope(params: URLSearchParams): ModuleSlug | null {
  if (!params.has("scope")) return "chat";
  const value = params.get("scope");
  return moduleSlugs.find((slug) => slug === value) ?? null;
}

function moduleForRef(ref: RecordRef): ModuleSlug | null {
  if (ref.table !== "project_nodes") return null;
  const node   = mockDb.project_nodes.find((item) => item.id === ref.id)                                            ;
  const module = node?.kind === "component" ? mockDb.project_nodes.find((item) => item.id === node.parentId) : node ;
  return module?.slug ?? null;
}

export function ProjectGraphPage({ mode }: { mode: GraphMode }) {
  const params     = new URLSearchParams(window.location.search)                  ;
  const scope      = readScope(params)                                            ;
  const selectedId = params.get("node")                                           ;
  const graph      = useMemo(() => buildProjectGraph(mode, scope), [mode, scope]) ;
  const selected   = graph.nodes.find((node) => node.id === selectedId) ?? null   ;
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase()                                                                                                               ;
  const matches         = normalizedQuery ? graph.nodes.filter((node) => `${node.id} ${node.title} ${node.subtitle}`.toLocaleLowerCase().includes(normalizedQuery)) : [] ;

  const select = (id: string) => {
    if (id === selectedId) return;
    navigateTo(graphHref(mode, scope, id), { preserveScroll: true });
  };
  const closeInspector = () => {
    navigateTo(graphHref(mode, scope, null), { preserveScroll: true });
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(selectedId ?? "")}"]`)?.focus({ preventScroll: true }));
  };
  const changeScope = (next: ModuleSlug | null) => {
    const href = next ? graphHref("structure", next, null) : "/projects/www/service?scope=all";
    navigateTo(href, { preserveScroll: true });
    setQuery("");
  };
  const expand = (id: string) => {
    const node = mockDb.project_nodes.find((item) => item.id === id);
    if (node?.kind === "module" && node.slug) changeScope(node.slug);
    else if (node?.kind === "project") changeScope(null);
    else select(id);
  };

  return <div className="graph-app" onKeyDown={(event) => {
    if (event.key === "Escape" && selected) {
      event.preventDefault();
      event.stopPropagation();
      closeInspector();
    }
  }}>
    <a className="graph-skip" href="#project-canvas">캔버스로 이동</a>
    <header className="graph-header">
      <AppLink href="/projects/www/service" className="graph-brand" ariaLabel="WWW 프로젝트 맵"><span className="graph-brand-symbol" aria-hidden="true">W</span><strong>WWW</strong><span>Project map</span></AppLink>
      <nav className="graph-primary-nav" aria-label="프로젝트 화면">
        <AppLink href={graphHref("structure", scope, null)} {...(mode === "structure" ? { ariaCurrent: "page" as const } : {})}><MapIcon />구조 맵</AppLink>
        <AppLink href={graphHref("evidence", scope, null)} {...(mode === "evidence" ? { ariaCurrent: "page" as const } : {})}><ConnectionsIcon />근거 맵</AppLink>
        <AppLink href="/projects/www/database"><DatabaseIcon />Database</AppLink>
      </nav>
      <div className="graph-snapshot"><span>Mock</span><code>4f2c9a1</code></div>
    </header>

    <div className="graph-layout">
      <aside className="graph-explorer" aria-label="프로젝트 탐색">
        <div className="graph-project-label"><span className="graph-project-avatar">W</span><div><strong>World Wide Woo</strong><small>프로젝트 구조와 근거</small></div></div>
        <section className="graph-explorer-section">
          <h2>Service</h2>
          <button type="button" className={`graph-tree-item ${scope === null && mode === "structure" ? "active" : ""}`} onClick={() => changeScope(null)}><MapIcon /><span>전체 모듈</span><small>3</small></button>
          {moduleSlugs.map((slug) => {
            const module = mockDb.project_nodes.find((node) => node.slug === slug);
            if (!module) return null;
            const children = mockDb.project_nodes.filter((node) => node.parentId === module.id);
            return <div className="graph-tree-branch" key={slug}>
              <button type="button" className={`graph-tree-item ${scope === slug && mode === "structure" ? "active" : ""}`} aria-expanded={scope === slug && mode === "structure"} onClick={() => changeScope(slug)}><span className="graph-tree-chevron" aria-hidden="true">{scope === slug && mode === "structure" ? "⌄" : "›"}</span><span>{module.name}</span><small>{children.length}</small></button>
              {scope === slug && mode === "structure" && <div className="graph-tree-children">{children.map((child) => <button type="button" key={child.id} className={selectedId === child.id ? "selected" : ""} onClick={() => select(child.id)}><span aria-hidden="true" />{child.displayLabel ?? child.name}</button>)}</div>}
            </div>;
          })}
        </section>
        <section className="graph-explorer-section">
          <h2>Assurance</h2>
          <AppLink className={`graph-tree-item ${mode === "evidence" ? "active" : ""}`} href={graphHref("evidence", scope, null)}><ConnectionsIcon /><span>결정과 연결된 근거</span></AppLink>
          <p className="graph-explorer-note">채택, 코드 연결, 검사 결과를 각각의 노드로 읽습니다.</p>
        </section>
        <div className="graph-explorer-bottom"><span className="graph-readonly-dot" />읽기 전용 목업<small>노드 위치는 화면에서만 바뀝니다.</small></div>
      </aside>

      <main className="graph-main" id="project-canvas">
        <div className="graph-page-toolbar">
          <div><div className="graph-breadcrumb">WWW <span>/</span> {mode === "structure" ? "Service" : "Assurance"}</div><h1>{mode === "structure" ? "프로젝트 구조" : "결정과 근거"}</h1></div>
          <div className="graph-search-wrap">
            <label className="graph-search"><SearchIcon /><input type="search" aria-label="현재 맵의 노드 검색" placeholder="노드 이름 또는 ID 검색" value={query} onChange={(event) => setQuery(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter" && matches[0]) select(matches[0].id); }} /><kbd>↵</kbd></label>
            {normalizedQuery && <div className="graph-search-results" aria-label="노드 검색 결과"><span role="status">{matches.length}개 노드</span>{matches.slice(0, 8).map((node) => <button type="button" key={node.id} onClick={() => { select(node.id); setQuery(""); }}><strong>{node.title}</strong><code>{node.id}</code></button>)}{!matches.length && <p>현재 맵에서 일치하는 노드가 없습니다.</p>}</div>}
          </div>
        </div>
        <div className="graph-map-meta"><p>{mode === "structure" ? "모듈을 더블클릭하면 구성요소가 펼쳐집니다." : "DEC-014의 채택부터 구현·검사·출처까지 연결된 기록입니다."}</p><span>{graph.nodes.length} nodes <i /> {graph.edges.length} connections</span></div>
        <div className={`graph-stage ${selected ? "has-selection" : ""}`}>
          <NodeCanvas graph={graph} graphKey={`${mode}:${scope ?? "all"}`} selectedId={selected?.id ?? null} onSelect={select} onExpand={expand} query={query} />
          {selected && <GraphInspector node={selected} graph={graph} onSelect={select} onExpand={expand} onClose={closeInspector} />}
          {selectedId && !selected && <div className="graph-missing-note" role="status">현재 맵에 {selectedId} 노드가 없습니다.<button type="button" onClick={() => navigateTo(graphHref(mode, scope, null), { replace: true })}>선택 지우기</button></div>}
        </div>
        <footer className="graph-footer"><div><span className="graph-legend-dot structure" />구성 관계<span className="graph-legend-dot evidence" />저장된 근거 관계</div><span>Mock snapshot · 2026-09-28</span></footer>
      </main>
    </div>
  </div>;
}

function GraphInspector({ node, graph, onSelect, onExpand, onClose }: { node: GraphNode; graph: GraphData; onSelect: (id: string) => void; onExpand: (id: string) => void; onClose: () => void }) {
  const record = recordByRef(node.ref);
  if (!record) return null;
  const edges       = graph.edges.filter((edge) => edge.source === node.id || edge.target === node.id)                                                                                                                                        ;
  const references  = outgoingReferences(node.ref.table, record)                                                                                                                                                                              ;
  const module      = moduleForRef(node.ref)                                                                                                                                                                                                  ;
  const explanation = "responsibility" in record ? record.responsibility : "rationale" in record ? record.rationale : "content" in record ? record.content : "detail" in record ? record.detail : "summary" in record ? record.summary : null ;

  return <aside className="graph-inspector" aria-label={`${node.title} 노드 상세`}>
    <header><span className="graph-type-tag" data-kind={node.kind}>{kindLabels[node.kind]}</span><button type="button" className="graph-inspector-close" onClick={onClose} aria-label="노드 상세 닫기">×</button></header>
    <div className="graph-inspector-heading"><h2>{node.title}</h2><code>{node.id}</code>{node.ref.table === "verification_runs" && "status" in record && "criterion" in record && <StatusLabel status={record.status} />}{node.ref.table === "decisions" && "adoptedBy" in record && <span className="graph-decision-state">{record.status === "adopted" ? "채택됨" : record.status === "superseded" ? "대체됨" : record.status === "rejected" ? "기각" : "제안"}</span>}</div>
    <div className="graph-inspector-scroll">
      {explanation && <section><h3>설명</h3><p>{explanation}</p></section>}
      {"input" in record && <section><h3>입력과 출력</h3><dl><dt>입력</dt><dd>{record.input}</dd><dt>출력</dt><dd>{record.output}</dd></dl></section>}
      {"implementation" in record && record.implementation && <section><h3>구현 위치</h3><code className="graph-path">{record.implementation}</code></section>}
      {"evidence" in record && <section><h3>검사 근거</h3><p>{record.evidence}</p></section>}
      {"transcript" in record && record.transcript !== null && <section><h3>RAW 전문</h3><pre className="graph-raw-text">{record.transcript}</pre><CopyButton text={record.transcript} label="전문 복사" /></section>}
      {"body" in record && <section><h3>문서 원문</h3><pre className="graph-document-text">{record.body}</pre></section>}
      <section><h3>연결 <span>{edges.length}</span></h3><div className="graph-inspector-connections">{edges.map((edge) => {
        const neighbor = graph.nodes.find((item) => item.id === (edge.source === node.id ? edge.target : edge.source));
        if (!neighbor) return null;
        return <button type="button" key={edge.id} onClick={() => onSelect(neighbor.id)}><span className="graph-connection-direction" aria-hidden="true">{edge.source === node.id ? "↗" : "↙"}</span><span><strong>{neighbor.title}</strong><small>{edge.label}</small><code>{edge.provenance}</code></span></button>;
      })}{!edges.length && <p>현재 맵에 표시된 연결이 없습니다.</p>}</div></section>
      {references.length > 0 && <section><h3>레코드 참조</h3><div className="graph-record-refs">{references.map((ref) => <AppLink href={pathForRef(ref.table, ref.id)} key={`${ref.table}/${ref.id}`}>{ref.id}</AppLink>)}</div></section>}
    </div>
    <footer>{node.kind === "module" && <button type="button" className="graph-primary-button" onClick={() => onExpand(node.id)}>구성요소 펼치기</button>}{module && <AppLink className="graph-secondary-button" href={`/projects/www/service/${module}?tab=view${node.kind === "component" ? `&component=${node.id}` : ""}`}>View 열기</AppLink>}{node.kind === "check" && <AppLink className="graph-secondary-button" href={`/projects/www/assurance?check=${node.id}`}>검사 상세 열기</AppLink>}<AppLink className="graph-text-link" href={pathForRef(node.ref.table, node.id)}>Database에서 원본 보기 <span aria-hidden="true">↗</span></AppLink></footer>
  </aside>;
}

function MapIcon() { return <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="2" y="7" width="5" height="6" rx="1.5" /><rect x="13" y="2" width="5" height="6" rx="1.5" /><rect x="13" y="12" width="5" height="6" rx="1.5" /><path d="M7 10h3V5h3M10 10v5h3" /></svg>; }
function ConnectionsIcon() { return <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="4" cy="10" r="2.5" /><circle cx="15" cy="4" r="2.5" /><circle cx="15" cy="16" r="2.5" /><path d="m6.2 8.8 6.5-3.5m-6.5 6 6.5 3.5" /></svg>; }
function DatabaseIcon() { return <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><ellipse cx="10" cy="4.5" rx="6.5" ry="2.5" /><path d="M3.5 4.5v10c0 3.3 13 3.3 13 0v-10M3.5 9.5c0 3.3 13 3.3 13 0" /></svg>; }
function SearchIcon() { return <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg>; }
