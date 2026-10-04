import      { useEffect, useRef, useState                 } from "react"        ;
import type { ReactNode                                   } from "react"        ;
import      { mockDb                                      } from "./mock-db"    ;
import type { CheckStatus, DbRecord, RecordRef, TableName } from "./model"      ;
import      {
              findRecord                                ,
              formatValue                               ,
              outgoingReferences                        ,
              recordByRef                               ,
              targetNode                                ,
                                                          } from "./selectors"  ;
import      { AppLink, pathForRef                         } from "./navigation" ;

export const statusLabels: Record<CheckStatus, string> = {
  passed: "Passed", failed: "Failed", "needs-review": "Needs review", "not-checked": "Not checked", stale: "Stale · 재확인 필요",
};

const currentPageProps: { ariaCurrent: "page" } = { ariaCurrent: "page" };

export function StatusLabel({ status }: { status: CheckStatus }) {
  return <span className="status-label" data-status={status}><span aria-hidden="true" className="status-mark" />{statusLabels[status]}</span>;
}

export function EvidenceAnchor({ recordRef, onInspect, suffix, expanded = false }: { recordRef: RecordRef; onInspect?: (ref: RecordRef, trigger: HTMLElement) => void; suffix?: string; expanded?: boolean }) {
  const record = recordByRef(recordRef);
  if (!record) return <span className="broken-ref mono">{recordRef.id} · 확인 불가</span>;
  if (onInspect) return <button type="button" className="evidence-anchor" aria-label={`${recordRef.id} 근거 열기`} aria-controls="evidence-inspector" aria-expanded={expanded} onClick={(event) => onInspect(recordRef, event.currentTarget)}>{recordRef.id}{suffix ? ` · ${suffix}` : ""}</button>;
  return <AppLink className="evidence-anchor" href={pathForRef(recordRef.table, recordRef.id)} ariaLabel={`${recordRef.id} Database 레코드로 이동`}>{recordRef.id}{suffix ? ` · ${suffix}` : ""}</AppLink>;
}

export function CopyButton({ text, label = "복사" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "success" | "error">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("success");
    } catch { setState("error"); }
    window.setTimeout(() => setState("idle"), 1800);
  };
  const copyLabel = state === "success" ? "복사됨" : state === "error" ? "복사 실패" : label;
  return <button type="button" className="quiet-button" onClick={copy} aria-live="polite">{copyLabel}</button>;
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return <nav className="breadcrumbs" aria-label="Breadcrumb">{items.map((item, index) => <span key={`${item.label}-${index}`}>{item.href ? <AppLink href={item.href}>{item.label}</AppLink> : item.label}{index < items.length - 1 && <span aria-hidden="true"> / </span>}</span>)}</nav>;
}

const detailTitle = (record: DbRecord) => {
  if ("title" in record && typeof record.title === "string") return record.title;
  if ("name" in record && typeof record.name === "string") return record.name;
  if ("statement" in record && typeof record.statement === "string") return record.statement;
  if ("summary" in record && typeof record.summary === "string") return record.summary;
  if ("criterion" in record && typeof record.criterion === "string") return record.criterion;
  return record.id;
};

export function EvidenceInspector({ recordRef, onClose, returnFocus }: { recordRef: RecordRef | null; onClose: () => void; returnFocus: HTMLElement | null }) {
  const panelRef = useRef<HTMLElement>(null)                                              ;
  const record   = recordRef ? recordByRef(recordRef) : undefined                         ;
  const related  = recordRef && record ? outgoingReferences(recordRef.table, record) : [] ;
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 1280px)").matches);
  useEffect(() => {
    const media    = window.matchMedia("(max-width: 1280px)") ;
    const onChange = () => setNarrow(media.matches)           ;
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  useEffect(() => {
    if (!recordRef) return;
    if (narrow) requestAnimationFrame(() => panelRef.current?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onClose(); requestAnimationFrame(() => returnFocus?.isConnected ? returnFocus.focus() : document.querySelector<HTMLElement>("#main-content a, #main-content button")?.focus()); return; }
      if (event.key !== "Tab" || !narrow || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex="0"]')];
      if (!focusable.length) { event.preventDefault(); panelRef.current.focus(); return; }
      const first = focusable[0]; const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [narrow, recordRef, onClose, returnFocus]);
  if (!recordRef) return null;
  const closeAndRestore = () => { onClose(); requestAnimationFrame(() => returnFocus?.isConnected ? returnFocus.focus() : document.querySelector<HTMLElement>("#main-content a, #main-content button")?.focus()); };
  return <div className="inspector-layer" role="presentation" onMouseDown={(event) => { if (narrow && event.target === event.currentTarget) closeAndRestore(); }}>
    <aside ref={panelRef} className="evidence-inspector" id="evidence-inspector" aria-label={`${recordRef.id} 근거 인스펙터`} role={narrow ? "dialog" : "complementary"} aria-modal={narrow ? true : undefined} tabIndex={-1}>
      <header className="inspector-header"><div><span className="eyebrow">{recordRef.table.replaceAll("_", " ")}</span><h2>{record ? detailTitle(record) : "확인할 수 없는 참조"}</h2><code>{recordRef.id}</code></div><button className="close-button" type="button" onClick={closeAndRestore} aria-label="인스펙터 닫기">×</button></header>
      {record ? <>
        <dl className="field-list compact">{Object.entries(record).filter(([key]) => !["refs", "body", "transcript", "raw", "diff"].includes(key)).slice(0, 8).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{formatValue(value)}</dd></div>)}</dl>
        {"rationale" in record && <section className="inspector-section"><h3>판정 이유</h3><p>{String(record.rationale)}</p></section>}
        {"statement" in record && <section className="inspector-section"><h3>원칙</h3><p>{String(record.detail)}</p></section>}
        {related.length > 0 && <section className="inspector-section"><h3>Related evidence</h3><div className="anchor-list">{related.map((item) => <EvidenceAnchor key={`${item.table}-${item.id}`} recordRef={item} />)}</div></section>}
        <div className="inspector-actions"><AppLink className="text-button" href={pathForRef(recordRef.table, recordRef.id)}>Database에서 {recordRef.id} 열기</AppLink><CopyButton text={recordRef.id} label="ID 복사" /></div>
      </> : <p className="empty-state">{recordRef.id} 참조가 목업 스냅샷에 없습니다.</p>}
    </aside>
  </div>;
}

export function useInspector() {
  const [recordRef, setRecordRef] = useState<RecordRef | null>(null);
  const [returnFocus, setReturnFocus] = useState<HTMLElement | null>(null);
  return {
    recordRef, returnFocus,
    inspect: (next: RecordRef, trigger: HTMLElement) => { setRecordRef(next); setReturnFocus(trigger); },
    close: () => setRecordRef(null),
  };
}

export function AppShell({ area, children }: { area: "service" | "assurance" | "database"; children: ReactNode }) {
  return <div className="app-shell">
    <header className="context-bar"><div className="brand"><span className="brand-mark">W</span><span><strong>WWW</strong><small>Project View</small></span></div><div className="snapshot-meta"><span>MOCK</span><span>READ ONLY</span><code>main / 4f2c9a1</code></div></header>
    <nav className="primary-nav" aria-label="Primary navigation">
      <AppLink href="/projects/www/service" className="primary-link" {...(area === "service" ? currentPageProps : {})}><span>01</span><strong>Service</strong></AppLink>
      <AppLink href="/projects/www/assurance" className="primary-link" {...(area === "assurance" ? currentPageProps : {})}><span>02</span><strong>Assurance</strong></AppLink>
      <AppLink href="/projects/www/database" className="primary-link" {...(area === "database" ? currentPageProps : {})}><span>03</span><strong>Database</strong></AppLink>
    </nav>
    <main className="workspace" id="main-content">{children}</main>
    <footer className="status-footer"><span>Mock snapshot · 2026-09-28</span><span>Revision 4f2c9a1</span><span>Times shown in Asia/Seoul</span><span>{Object.values(mockDb).reduce((sum, records) => sum + records.length, 0)} records</span></footer>
  </div>;
}

export function ServiceTargetLink({ targetId }: { targetId: string }) {
  const node = targetNode(targetId);
  if (!node) return <span className="broken-ref mono">{targetId} · 대상 없음</span>;
  let module = node;
  if (node.kind === "component") module = mockDb.project_nodes.find((item) => item.id === node.parentId) ?? node;
  const component = node.kind === "component" ? `&component=${encodeURIComponent(node.id)}` : "";
  return <AppLink className="evidence-anchor" href={`/projects/www/service/${module.slug}?tab=${node.kind === "component" ? "composition" : "overview"}${component}`}>{node.id} · {node.name}</AppLink>;
}

export function RecordLink({ id }: { id: string }) {
  const found = findRecord(id);
  return found ? <EvidenceAnchor recordRef={{ table: found.table, id }} /> : <span className="broken-ref">{id} · 확인 불가</span>;
}
