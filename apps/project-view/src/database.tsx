import      { useCallback, useEffect, useMemo, useRef, useState } from "react"        ;
import      { mockDb                                            } from "./mock-db"    ;
import      { TABLE_NAMES                                       } from "./model"      ;
import type { DbRecord, RecordRef, TableName                    } from "./model"      ;
import      { allReferencedBy, formatValue, outgoingReferences  } from "./selectors"  ;
import      { AppLink, navigateTo, navigationTrigger            } from "./navigation" ;
import      { AppShell, Breadcrumbs, CopyButton, EvidenceAnchor } from "./common"     ;

const tableGroups: { label: string; tables: TableName[] }[] = [
  { label : "Structure"         , tables : ["project_nodes", "relations", "views"]                  },
  { label : "Rules & Decisions" , tables : ["documents", "principles", "decisions"]                 },
  { label : "Evidence"          , tables : ["commits", "implementation_links", "verification_runs"] },
  { label : "RAW"               , tables : ["raw_sessions", "raw_events"]                           },
];
const tableDescriptions: Record<TableName, string> = {
  project_nodes: "서비스와 구성요소의 논리 구조", relations: "레코드 사이에 저장된 관계", views: "미리보기와 구성요소 매핑",
  documents: "원칙을 정의하는 문서 원문", principles: "적용 대상이 지정된 원칙", decisions: "제안·채택·대체 결정",
  commits: "변경 근거가 되는 목업 Commit", implementation_links: "결정과 변경의 연결 기록", verification_runs: "검사 기준과 결과",
  raw_sessions: "원본 이벤트의 세션 경계", raw_events: "순서와 전문을 보존한 원본 이벤트",
};
const preferredColumns: Record<TableName, string[]> = {
  project_nodes: ["id", "kind", "name", "parentId", "axis"], relations: ["id", "kind", "from", "to"], views: ["id", "nodeId", "previewKind", "revision"],
  documents: ["id", "path", "title", "revision", "includedInRuntime"], principles: ["id", "statement", "documentId", "active"], decisions: ["id", "title", "status", "targetId", "adoptedAt"],
  commits: ["id", "sha", "branch", "summary"], implementation_links: ["id", "decisionId", "commitId", "targetId", "file"], verification_runs: ["id", "status", "category", "targetId", "checkedRevision"],
  raw_sessions: ["id", "sourceKind", "projectId", "startedAt"], raw_events: ["id", "eventKind", "sessionId", "order", "occurredAt"],
};

type DetailTab          = "fields" | "json" | "relations" | "transcript"                                                ;
type SchemaColumn       = { name: string; type: string; nullable: "no" | "yes" | "optional"; reference: string | null } ;
type DatabaseQueryState = { q: string; sort: string; dir: string; status: string }                                      ;

const currentPageProps: { ariaCurrent: "page" } = { ariaCurrent: "page" };

const baseSchema: SchemaColumn[] = [
  { name: "id", type: "string", nullable: "no", reference: null },
  { name: "refs", type: "RecordRef[]", nullable: "no", reference: "polymorphic record IDs" },
];

const schemaByTable: Record<TableName, SchemaColumn[]> = {
  project_nodes: [...baseSchema,
    { name: "project", type: '"WWW"', nullable: "no", reference: null }, { name: "kind", type: '"project" | "module" | "component"', nullable: "no", reference: null },
    { name: "axis", type: '"service" | "assurance"', nullable: "no", reference: null }, { name: "parentId", type: "string | null", nullable: "yes", reference: "project_nodes.id" },
    { name: "name", type: "string", nullable: "no", reference: null }, { name: "responsibility", type: "string", nullable: "no", reference: null },
    { name: "input", type: "string", nullable: "no", reference: null }, { name: "output", type: "string", nullable: "no", reference: null },
    { name: "slug", type: "ModuleSlug", nullable: "optional", reference: null }, { name: "implementation", type: "string", nullable: "optional", reference: null },
    { name: "displayLabel", type: "string", nullable: "optional", reference: null }],
  relations: [...baseSchema,
    { name: "from", type: "RecordRef", nullable: "no", reference: "polymorphic record ID" }, { name: "to", type: "RecordRef", nullable: "no", reference: "polymorphic record ID" },
    { name: "kind", type: "string", nullable: "no", reference: null }, { name: "source", type: "RecordRef | null", nullable: "yes", reference: "polymorphic record ID" }],
  views: [...baseSchema,
    { name: "nodeId", type: "string", nullable: "no", reference: "project_nodes.id" }, { name: "revision", type: "string", nullable: "no", reference: null },
    { name: "annotations", type: "ViewAnnotation[]", nullable: "no", reference: "project_nodes.id via componentId" }, { name: "previewKind", type: "PreviewKind", nullable: "no", reference: null },
    { name: "preview", type: "PreviewContent", nullable: "no", reference: null }],
  documents: [...baseSchema,
    { name: "path", type: "string", nullable: "no", reference: null }, { name: "title", type: "string", nullable: "no", reference: null },
    { name: "body", type: "string", nullable: "no", reference: null }, { name: "revision", type: "string", nullable: "no", reference: null },
    { name: "anchor", type: "string", nullable: "no", reference: null }, { name: "includedInRuntime", type: "boolean | null", nullable: "yes", reference: null }],
  principles: [...baseSchema,
    { name: "statement", type: "string", nullable: "no", reference: null }, { name: "detail", type: "string", nullable: "no", reference: null },
    { name: "targetIds", type: "string[]", nullable: "no", reference: "project_nodes.id" }, { name: "documentId", type: "string", nullable: "no", reference: "documents.id" },
    { name: "documentParagraph", type: "number", nullable: "no", reference: null }, { name: "active", type: "boolean", nullable: "no", reference: null }],
  decisions: [...baseSchema,
    { name: "title", type: "string", nullable: "no", reference: null }, { name: "content", type: "string", nullable: "no", reference: null },
    { name: "reason", type: "string", nullable: "no", reference: null }, { name: "targetId", type: "string", nullable: "no", reference: "project_nodes.id" },
    { name: "status", type: "DecisionStatus", nullable: "no", reference: null }, { name: "adoptedBy", type: "string | null", nullable: "yes", reference: null },
    { name: "adoptedAt", type: "string | null", nullable: "yes", reference: null }, { name: "sourceRawIds", type: "string[]", nullable: "no", reference: "raw_events.id" },
    { name: "supersededBy", type: "string | null", nullable: "yes", reference: "decisions.id" }],
  commits: [...baseSchema,
    { name: "sha", type: "string", nullable: "no", reference: null }, { name: "branch", type: "string", nullable: "no", reference: null },
    { name: "summary", type: "string", nullable: "no", reference: null }, { name: "paths", type: "string[]", nullable: "no", reference: null },
    { name: "diff", type: "string", nullable: "no", reference: null }],
  implementation_links: [...baseSchema,
    { name: "decisionId", type: "string", nullable: "no", reference: "decisions.id" }, { name: "commitId", type: "string", nullable: "no", reference: "commits.id" },
    { name: "targetId", type: "string", nullable: "no", reference: "project_nodes.id" }, { name: "file", type: "string", nullable: "no", reference: null },
    { name: "basis", type: "string", nullable: "no", reference: null }],
  verification_runs: [...baseSchema,
    { name: "targetId", type: "string", nullable: "no", reference: "project_nodes.id" }, { name: "criterion", type: "string", nullable: "no", reference: null },
    { name: "category", type: '"rule" | "implementation" | "view"', nullable: "no", reference: null }, { name: "status", type: "CheckStatus", nullable: "no", reference: null },
    { name: "method", type: "string", nullable: "no", reference: null }, { name: "actor", type: "string", nullable: "no", reference: null },
    { name: "checkedAt", type: "string | null", nullable: "yes", reference: null }, { name: "checkedRevision", type: "string | null", nullable: "yes", reference: null },
    { name: "currentRevision", type: "string", nullable: "no", reference: null }, { name: "evidence", type: "string", nullable: "no", reference: null },
    { name: "rationale", type: "string", nullable: "no", reference: null }, { name: "diff", type: "string | null", nullable: "yes", reference: null }],
  raw_sessions: [...baseSchema,
    { name: "sourceKind", type: "string", nullable: "no", reference: null }, { name: "projectId", type: "string", nullable: "no", reference: "project_nodes.id" },
    { name: "startedAt", type: "string | null", nullable: "yes", reference: null }, { name: "sourceDescription", type: "string", nullable: "no", reference: null }],
  raw_events: [...baseSchema,
    { name: "sessionId", type: "string", nullable: "no", reference: "raw_sessions.id" }, { name: "turnId", type: "string | null", nullable: "yes", reference: null },
    { name: "order", type: "number", nullable: "no", reference: null }, { name: "occurredAt", type: "string | null", nullable: "yes", reference: null },
    { name: "eventKind", type: "string", nullable: "no", reference: null }, { name: "raw", type: "Record<string, unknown>", nullable: "no", reference: null },
    { name: "transcript", type: "string | null", nullable: "yes", reference: null }],
};

const referenceColumns: Partial<Record<TableName, Record<string, TableName>>> = {
  project_nodes        : { parentId: "project_nodes" },
  views                : { nodeId: "project_nodes" },
  principles           : { targetIds: "project_nodes", documentId: "documents" },
  decisions            : { targetId: "project_nodes", sourceRawIds: "raw_events", supersededBy: "decisions" },
  implementation_links : { decisionId: "decisions", commitId: "commits", targetId: "project_nodes" },
  verification_runs    : { targetId: "project_nodes" },
  raw_sessions         : { projectId: "project_nodes" },
  raw_events           : { sessionId: "raw_sessions" },
};

function isRecordRef(value: unknown): value is RecordRef {
  if (!value || typeof value !== "object" || !("table" in value) || !("id" in value)) return false;
  return typeof value.id === "string" && typeof value.table === "string" && TABLE_NAMES.some((table) => table === value.table);
}

function referencesForValue(table: TableName, column: string, value: unknown): RecordRef[] {
  if (isRecordRef(value)) return [value];
  if (Array.isArray(value)) {
    const explicit = value.filter(isRecordRef);
    if (explicit.length > 0) return explicit;
    const targetTable = referenceColumns[table]?.[column];
    if (targetTable) return value.filter((item): item is string => typeof item === "string").map((id) => ({ table: targetTable, id }));
    if (table === "views" && column === "annotations") return value.flatMap((item): RecordRef[] => item && typeof item === "object" && "componentId" in item && typeof item.componentId === "string" ? [{ table: "project_nodes", id: item.componentId }] : []);
    return [];
  }
  const targetTable = referenceColumns[table]?.[column];
  return targetTable && typeof value === "string" ? [{ table: targetTable, id: value }] : [];
}

function sortableValue(value: unknown): string {
  if (isRecordRef(value)) return `${value.table}/${value.id}`;
  if (Array.isArray(value)) return value.map(sortableValue).join("\u0000");
  if (value && typeof value === "object") return JSON.stringify(value);
  return value === null ? "" : String(value);
}

function buildHref(table: TableName, options: { row?: string | null; q?: string; sort?: string; dir?: string; status?: string; detail?: DetailTab } = {}) {
  const params = new URLSearchParams(); params.set("table", table);
  if (options.row) params.set("row", options.row); if (options.q) params.set("q", options.q); if (options.sort) params.set("sort", options.sort);
  if (options.dir) params.set("dir", options.dir); if (options.status) params.set("status", options.status); if (options.detail) params.set("detail", options.detail);
  return `/projects/www/database?${params.toString()}`;
}

export function DatabasePage({ table, rowId, query, sort, direction, status, detailTab }: { table: TableName; rowId: string | null; query: string; sort: string; direction: "asc" | "desc"; status: string; detailTab: DetailTab }) {
  const [schemaOpen, setSchemaOpen] = useState(false);
  const searchTransaction = useRef(false)                        ;
  const records           = mockDb[table] as readonly DbRecord[] ;
  const columns           = preferredColumns[table]              ;
  const sortKey           = columns.includes(sort) ? sort : "id" ;
  const visible = useMemo(() => records.filter((record) => {
    const searchable   = JSON.stringify(record).toLocaleLowerCase()               ;
    const matchesQuery = !query || searchable.includes(query.toLocaleLowerCase()) ;
    const recordStatus = "status" in record ? String(record.status) : ""          ;
    return matchesQuery && (!status || recordStatus === status);
  }).toSorted((a, b) => {
    const left = sortableValue(Reflect.get(a, sortKey)); const right = sortableValue(Reflect.get(b, sortKey));
    return left.localeCompare(right, "ko", { numeric: true }) * (direction === "asc" ? 1 : -1);
  }), [records, query, status, sortKey, direction]);
  const selected     = records.find((record) => record.id === rowId) ?? null                                        ;
  const missingRowId = rowId && !selected ? rowId : null                                                            ;
  const statuses     = [...new Set(records.flatMap((record) => "status" in record ? [String(record.status)] : []))] ;
  useEffect(() => {
    searchTransaction.current = false;
    const restart = () => { searchTransaction.current = false; };
    window.addEventListener("popstate", restart);
    return () => window.removeEventListener("popstate", restart);
  }, [table]);
  const updateControls = (updates: Record<string, string>, replace = false) => {
    const params = new URLSearchParams(window.location.search); Object.entries(updates).forEach(([key, value]) => value ? params.set(key, value) : params.delete(key)); params.delete("row");
    navigateTo(`/projects/www/database?${params.toString()}`, { preserveScroll: true, replace });
  };
  const updateSearch = (value: string) => {
    updateControls({ q: value }, searchTransaction.current);
    searchTransaction.current = true;
  };
  return <AppShell area="database"><div className="database-page">
    <Breadcrumbs items={[{ label: "WWW" }, { label: "Database" }]} />
    <header className="database-heading"><div><p className="eyebrow">Common data entry · {TABLE_NAMES.length} mock tables</p><h1>Database</h1><p>Service와 Assurance가 함께 사용하는 구조화 데이터와 보존된 RAW를 읽습니다.</p></div><div className="read-only-note"><span>READ ONLY</span><small>Mock metadata · no SQL</small></div></header>
    <div className={`database-workspace ${selected || missingRowId ? "has-detail" : ""}`}>
      <aside className="table-browser"><h2>Tables</h2>{tableGroups.map((group) => <section key={group.label}><h3>{group.label}</h3>{group.tables.map((name) => <AppLink key={name} className={name === table ? "selected" : ""} href={buildHref(name)}><span>{name}</span><b>{mockDb[name].length}</b></AppLink>)}</section>)}</aside>
      <section className="records-pane"><header><div><p className="eyebrow">Records / {table}</p><h2>{table}</h2><p>{tableDescriptions[table]}</p></div><button type="button" className={`quiet-button ${schemaOpen ? "active" : ""}`} onClick={() => setSchemaOpen((value) => !value)} aria-expanded={schemaOpen}>Schema</button></header>
        {schemaOpen ? <SchemaView table={table} /> : <><div className="record-controls"><label>Search<input type="search" value={query} placeholder={`Search ${table}`} onChange={(event) => updateSearch(event.currentTarget.value)} onBlur={() => { searchTransaction.current = false; }} /></label>{statuses.length > 0 && <label>Status<select value={status} onChange={(event) => { searchTransaction.current = false; updateControls({ status: event.currentTarget.value }); }}><option value="">All statuses</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label>}<label>Sort<select value={sortKey} onChange={(event) => { searchTransaction.current = false; updateControls({ sort: event.currentTarget.value }); }}>{columns.map((column) => <option key={column}>{column}</option>)}</select></label><button type="button" className="sort-direction" onClick={() => { searchTransaction.current = false; updateControls({ dir: direction === "asc" ? "desc" : "asc" }); }} aria-label={`정렬 방향 ${direction === "asc" ? "오름차순" : "내림차순"}`}>{direction === "asc" ? "↑" : "↓"}</button><span className="result-count">{visible.length} / {records.length} records</span></div><RecordGrid table={table} records={visible} columns={columns} selectedId={selected?.id ?? null} state={{ q: query, sort: sortKey, dir: direction, status }} />{!visible.length && <div className="empty-state"><p>“{query || status}” 조건에 맞는 레코드가 없습니다.</p><AppLink className="text-button" href={buildHref(table, { sort: "id", dir: "asc" })}>검색과 필터 초기화</AppLink></div>}</>}
      </section>
      {selected && <RecordDetail table={table} record={selected} tab={detailTab} state={{ q: query, sort: sortKey, dir: direction, status }} />}
      {missingRowId && <MissingRecordDetail table={table} rowId={missingRowId} state={{ q: query, sort: sortKey, dir: direction, status }} />}
    </div>
  </div></AppShell>;
}

function RecordGrid({ table, records, columns, selectedId, state }: { table: TableName; records: readonly DbRecord[]; columns: string[]; selectedId: string | null; state: DatabaseQueryState }) {
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selectedId || history.state?.scrollPositions?.[`database:${table}`] !== undefined) return;
    gridRef.current?.querySelector<HTMLElement>(`tr[data-record-id="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selectedId, table]);
  return <div ref={gridRef} className="record-grid-scroll" data-history-scroll={`database:${table}`}><table className="record-table"><thead><tr>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody>{records.map((record) => <tr key={record.id} data-record-id={record.id} data-selected={record.id === selectedId}>{columns.map((column, index) => { const value = Reflect.get(record, column); return <td key={column} title={typeof value === "string" ? value : undefined}>{index === 0 ? <AppLink className="row-select" ariaLabel={`${record.id} 행 선택`} href={buildHref(table, { row: record.id, ...state })} preserveScroll>{record.id}</AppLink> : formatGridValue(table, column, value)}</td>; })}</tr>)}</tbody></table></div>;
}

function formatGridValue(table: TableName, column: string, value: unknown) {
  const reference     = referencesForValue(table, column, value) ;
  const onlyReference = reference[0]                             ;
  if (reference.length === 1 && onlyReference) return <EvidenceAnchor recordRef={onlyReference} />;
  if (reference.length > 1) return <span>{reference.map((item, index) => <span key={`${item.table}-${item.id}`}>{index > 0 && ", "}<EvidenceAnchor recordRef={item} /></span>)}</span>;
  return <span className={value === null || value === "" || typeof value === "boolean" || typeof value === "number" ? "literal-value" : ""}>{formatValue(value)}</span>;
}

function SchemaView({ table }: { table: TableName }) {
  return <section className="schema-view"><div className="schema-note"><strong>MOCK SCHEMA</strong><span>TypeScript 목업 계약입니다. 운영 DB introspection 결과가 아닙니다.</span></div><table className="record-table"><thead><tr><th scope="col">column</th><th scope="col">mock type</th><th scope="col">nullable</th><th scope="col">reference</th></tr></thead><tbody>{schemaByTable[table].map((column) => <tr key={column.name}><td><code>{column.name}</code></td><td><code>{column.type}</code></td><td>{column.nullable}</td><td>{column.reference ? <code>{column.reference}</code> : "—"}</td></tr>)}</tbody></table></section>;
}

function useRecordDetailPanel(closeHref: string, focusId: string) {
  const panelRef    = useRef<HTMLElement>(null)        ;
  const returnFocus = useRef<HTMLElement | null>(null) ;
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 1280px)").matches);
  useEffect(() => {
    returnFocus.current = navigationTrigger();
  }, [focusId]);
  const close = useCallback(() => {
    const trigger = returnFocus.current;
    navigateTo(closeHref, { preserveScroll: true });
    requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus();
      else {
        const fallback = document.querySelector<HTMLElement>(`tr[data-record-id="${CSS.escape(focusId)}"] .row-select`);
        if (fallback) fallback.focus();
        else document.querySelector<HTMLElement>(".record-controls input, .records-pane button, .table-browser a")?.focus();
      }
    });
  }, [closeHref, focusId]);
  useEffect(() => {
    const media    = window.matchMedia("(max-width: 1280px)") ;
    const onChange = () => setNarrow(media.matches)           ;
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  useEffect(() => {
    if (narrow) requestAnimationFrame(() => panelRef.current?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key !== "Tab" || !narrow || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex="0"]')];
      if (focusable.length === 0) { event.preventDefault(); panelRef.current.focus(); return; }
      const first = focusable[0]     ;
      const last  = focusable.at(-1) ;
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close, narrow]);
  return { panelRef, narrow, close };
}

function RecordDetail({ table, record, tab, state }: { table: TableName; record: DbRecord; tab: DetailTab; state: DatabaseQueryState }) {
  const [wrap, setWrap] = useState(true); const raw = table === "raw_events" ? mockDb.raw_events.find((item) => item.id === record.id) : null;
  const availableTabs: DetailTab[] = raw ? ["fields", "json", "relations", "transcript"] : ["fields", "json", "relations"] ;
  const selectedTab                = availableTabs.includes(tab) ? tab : "fields"                                          ;
  const detailPanel                = useRecordDetailPanel(buildHref(table, state), record.id)                              ;
  return <div className="record-detail-layer" role="presentation" onMouseDown={(event) => { if (detailPanel.narrow && event.target === event.currentTarget) detailPanel.close(); }}><aside ref={detailPanel.panelRef} className="record-detail" aria-label={`${record.id} record detail`} role={detailPanel.narrow ? "dialog" : "complementary"} aria-modal={detailPanel.narrow ? true : undefined} tabIndex={-1}><header><div><p className="eyebrow">{table}</p><h2>{record.id}</h2></div><button className="close-button" type="button" aria-label="레코드 상세 닫기" onClick={detailPanel.close}>×</button></header><nav className="record-detail-tabs" aria-label="Record detail views">{availableTabs.map((item) => <AppLink key={item} className={item === selectedTab ? "active" : ""} {...(item === selectedTab ? currentPageProps : {})} href={buildHref(table, { row: record.id, ...state, detail: item })} preserveScroll>{item.charAt(0).toUpperCase() + item.slice(1)}</AppLink>)}</nav>
    {selectedTab === "fields" && <Fields table={table} record={record} />}{selectedTab === "json" && <JsonView record={record} />}{selectedTab === "relations" && <Relations table={table} record={record} />}{selectedTab === "transcript" && raw && <Transcript text={raw.transcript} rawId={raw.id} wrap={wrap} setWrap={setWrap} order={raw.order} timestamp={raw.occurredAt} />}
  </aside></div>;
}

function Fields({ table, record }: { table: TableName; record: DbRecord }) { return <div className="detail-scroll"><dl className="field-list">{Object.entries(record).filter(([key]) => key !== "refs").map(([key, value]) => <div key={key}><dt>{key}</dt><dd><FieldValue table={table} field={key} value={value} /></dd></div>)}</dl></div>; }
function FieldValue({ table, field, value }: { table: TableName; field: string; value: unknown }) {
  const references = referencesForValue(table, field, value);
  if (references.length > 0) return <span className="anchor-list">{references.map((item) => <span key={`${item.table}-${item.id}`} className="relation-reference"><EvidenceAnchor recordRef={item} /><CopyButton text={item.id} label={`${item.id} ID 복사`} /></span>)}</span>;
  if (typeof value === "object" && value !== null) return <pre>{JSON.stringify(value, null, 2)}</pre>;
  return <span className="literal-value">{formatValue(value)}</span>;
}
function JsonView({ record }: { record: DbRecord }) { const json = JSON.stringify(record, null, 2); return <div className="detail-scroll json-view"><div className="technical-toolbar"><span>Preserved mock object</span><CopyButton text={json} label="JSON 복사" /></div><pre>{json}</pre></div>; }
function Relations({ table, record }: { table: TableName; record: DbRecord }) {
  const outgoing = outgoingReferences(table, record) ;
  const inbound  = allReferencedBy(table, record.id) ;
  return <div className="detail-scroll relations-view"><section><h3>Outgoing references</h3>{outgoing.length ? outgoing.map((item) => <div className="relation-row" key={`${item.table}-${item.id}`}><span>{item.table}</span><span className="relation-reference"><EvidenceAnchor recordRef={item} /><CopyButton text={item.id} label={`${item.id} ID 복사`} /></span></div>) : <p>이 레코드의 외부 참조가 없습니다.</p>}</section><section><h3>Referenced by</h3>{inbound.length ? inbound.map((item) => <div className="relation-row" key={`${item.table}-${item.record.id}`}><span>{item.table}</span><span className="relation-reference"><EvidenceAnchor recordRef={{ table: item.table, id: item.record.id }} /><CopyButton text={item.record.id} label={`${item.record.id} ID 복사`} /></span></div>) : <p>이 레코드를 참조하는 레코드가 없습니다.</p>}</section></div>;
}
function MissingRecordDetail({ table, rowId, state }: { table: TableName; rowId: string; state: DatabaseQueryState }) {
  const detailPanel = useRecordDetailPanel(buildHref(table, state), rowId);
  return <div className="record-detail-layer" role="presentation" onMouseDown={(event) => { if (detailPanel.narrow && event.target === event.currentTarget) detailPanel.close(); }}><aside ref={detailPanel.panelRef} className="record-detail" aria-label={`${rowId} missing record detail`} role={detailPanel.narrow ? "dialog" : "complementary"} aria-modal={detailPanel.narrow ? true : undefined} tabIndex={-1}><header><div><p className="eyebrow">{table}</p><h2>{rowId}</h2></div><button className="close-button" type="button" aria-label="레코드 상세 닫기" onClick={detailPanel.close}>×</button></header><div className="empty-state"><p><code>{rowId}</code> 레코드를 현재 목업 스냅샷에서 확인할 수 없습니다.</p><p>요청한 ID를 유지했습니다. 테이블을 확인하거나 상세를 닫아 목록으로 돌아가세요.</p></div></aside></div>;
}
function Transcript({ text, rawId, wrap, setWrap, order, timestamp }: { text: string | null; rawId: string; wrap: boolean; setWrap: (value: boolean) => void; order: number; timestamp: string | null }) {
  return <div className="detail-scroll transcript-view"><div className="transcript-meta"><span>Source order {order}</span><span>{timestamp ? new Date(timestamp).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "원본 시각 없음"}</span></div><div className="technical-toolbar"><button type="button" className="quiet-button" aria-pressed={wrap} onClick={() => setWrap(!wrap)}>줄바꿈 {wrap ? "켜짐" : "꺼짐"}</button>{text && <CopyButton text={text} label={`${rawId} 전문 복사`} />}</div>{text ? <pre className={`raw-transcript ${wrap ? "wrap" : "nowrap"}`}>{text}</pre> : <p className="empty-state">이 레코드에는 전문이 없습니다.</p>}</div>;
}

export const isTableName = (value: string | null): value is TableName => TABLE_NAMES.some((table) => table === value)                               ;
export const isDetailTab = (value: string | null): value is DetailTab => ["fields", "json", "relations", "transcript"].some((tab) => tab === value) ;
