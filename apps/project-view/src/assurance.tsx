import      { useEffect                    } from "react"        ;
import      { mockDb                       } from "./mock-db"    ;
import type { CheckStatus, VerificationRun } from "./model"      ;
import      { targetNode                   } from "./selectors"  ;
import      { AppLink, navigateTo          } from "./navigation" ;
import      {
              AppShell                   ,
              Breadcrumbs                ,
              EvidenceAnchor             ,
              RecordLink                 ,
              ServiceTargetLink          ,
              StatusLabel                ,
                                           } from "./common"     ;

export type AssuranceCategory = "all" | "rule" | "implementation" | "view";
export type AssuranceStatus = CheckStatus | "all";

const categories     : readonly AssuranceCategory[]      = ["all", "rule", "implementation", "view"]                                                                ;
const statusFilters  : readonly AssuranceStatus[]        = ["all", "failed", "passed", "stale", "needs-review", "not-checked"]                                      ;
const categoryLabels : Record<AssuranceCategory, string> = { all: "All checks", rule: "Rule checks", implementation: "Implementation checks", view: "View checks" } ;

export const isAssuranceCategory = (value: string | null): value is AssuranceCategory => categories.some((category) => category === value) ;
export const isAssuranceStatus   = (value: string | null): value is AssuranceStatus => statusFilters.some((status) => status === value)    ;

function assuranceHref(category: AssuranceCategory, status: AssuranceStatus, check: string | null) {
  const params = new URLSearchParams();
  if (category !== "all") params.set("category", category);
  if (status !== "all") params.set("status", status);
  if (check) params.set("check", check);
  const query = params.toString();
  return `/projects/www/assurance${query ? `?${query}` : ""}`;
}

export function AssurancePage({ selectedId, category, status }: { selectedId: string | null; category: AssuranceCategory; status: AssuranceStatus }) {
  const visible      = mockDb.verification_runs.filter((item) => (category === "all" || item.category === category) && (status === "all" || item.status === status))                               ;
  const selected     = visible.find((item) => item.id === selectedId) ?? visible[0] ?? null                                                                                                        ;
  const statusCounts = Object.fromEntries(["passed", "failed", "needs-review", "not-checked", "stale"].map((key) => [key, mockDb.verification_runs.filter((item) => item.status === key).length])) ;
  useEffect(() => {
    if ((selected?.id ?? null) !== selectedId) navigateTo(assuranceHref(category, status, selected?.id ?? null), { replace: true, preserveScroll: true });
  }, [category, selected?.id, selectedId, status]);
  const changeFilter = (nextCategory: AssuranceCategory, nextStatus: AssuranceStatus) => {
    const nextVisible  = mockDb.verification_runs.filter((item) => (nextCategory === "all" || item.category === nextCategory) && (nextStatus === "all" || item.status === nextStatus)) ;
    const nextSelected = nextVisible.find((item) => item.id === selectedId) ?? nextVisible[0] ?? null                                                                                  ;
    navigateTo(assuranceHref(nextCategory, nextStatus, nextSelected?.id ?? null), { preserveScroll: true });
  };
  return <AppShell area="assurance"><div className="assurance-page">
    <Breadcrumbs items={[{ label: "WWW" }, { label: "Assurance" }]} />
    <header className="page-heading"><div><p className="eyebrow">Detection & review · Mock findings</p><h1>Assurance</h1><p className="lede">검사 기준, 실제 근거, 판정 이유를 서비스 구현과 분리해 읽습니다.</p></div><div className="revision-note"><span>Current basis</span><code>4f2c9a1</code></div></header>
    <div className="assurance-summary" aria-label="Check counts"><span>{mockDb.verification_runs.length} checks</span><span>{statusCounts.passed} passed</span><span>{statusCounts.failed} failed</span><span>{statusCounts["needs-review"]} needs review</span><span>{statusCounts.stale} stale</span><span>{statusCounts["not-checked"]} not checked</span></div>
    <div className="assurance-workspace"><aside className="check-browser"><fieldset><legend>Check category</legend>{categories.map((item) => <button type="button" key={item} className={category === item ? "active" : ""} aria-pressed={category === item} onClick={() => changeFilter(item, status)}>{categoryLabels[item]}<span>{item === "all" ? mockDb.verification_runs.length : mockDb.verification_runs.filter((check) => check.category === item).length}</span></button>)}</fieldset><label>Status filter<select value={status} onChange={(event) => { const next = event.currentTarget.value; if (isAssuranceStatus(next)) changeFilter(category, next); }}><option value="all">All statuses</option><option value="failed">Failed</option><option value="passed">Passed</option><option value="stale">Stale</option><option value="needs-review">Needs review</option><option value="not-checked">Not checked</option></select></label><nav aria-label="Verification runs">{visible.map((check) => <AppLink href={assuranceHref(category, status, check.id)} key={check.id} className={`check-row ${check.id === selected?.id ? "selected" : ""}`} preserveScroll><StatusLabel status={check.status} /><strong>{check.criterion}</strong><small>{targetNode(check.targetId)?.name ?? check.targetId}</small><code>{check.checkedRevision ?? "no revision"}</code></AppLink>)}{!visible.length && <div className="empty-state"><p>이 필터에 해당하는 검사가 없습니다.</p><button type="button" className="text-button" onClick={() => changeFilter("all", "all")}>필터 초기화</button></div>}</nav></aside>{selected ? <CheckDetail check={selected} /> : <div className="empty-state">검사를 선택하면 실제 근거와 판정 이유를 볼 수 있습니다.</div>}</div>
  </div></AppShell>;
}

function CheckDetail({ check }: { check: VerificationRun }) {
  const target       = targetNode(check.targetId)                                                        ;
  const revisionDiff = check.checkedRevision !== null && check.checkedRevision !== check.currentRevision ;
  return <article className="check-detail"><header><div><p className="eyebrow">{check.category} check · {check.id}</p><StatusLabel status={check.status} /><h2>{check.criterion}</h2></div><div className="revision-pair"><div><span>검사한 리비전</span><code>{check.checkedRevision ?? "검사 기록 없음"}</code></div><div><span>현재 리비전</span><code>{check.currentRevision}</code></div>{revisionDiff && <strong>재확인 필요 · 리비전 차이는 실패 판정이 아닙니다.</strong>}</div></header><section className="check-target"><h3>Target</h3><p>{target?.name ?? check.targetId} · {target?.responsibility ?? "대상 레코드를 찾을 수 없습니다."}</p><ServiceTargetLink targetId={check.targetId} /></section><section className="evidence-reading"><h3>Evidence</h3><p>{check.evidence}</p>{check.diff && <DiffBlock diff={check.diff} evidence={check.evidence} />}</section><section className="rationale-reading"><h3>판정 이유</h3><p>{check.rationale}</p><dl><div><dt>Method</dt><dd>{check.method}</dd></div><div><dt>Actor</dt><dd>{check.actor}</dd></div><div><dt>Checked at</dt><dd>{check.checkedAt ? new Date(check.checkedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "확인 기록 없음"}</dd></div></dl></section><section className="check-relations"><h3>Applied criteria & records</h3><div className="relation-lines">{check.refs.map((item) => <div key={`${item.table}-${item.id}`}><span>{item.table.replaceAll("_", " ")}</span><EvidenceAnchor recordRef={item} /></div>)}<div><span>verification record</span><RecordLink id={check.id} /></div></div></section></article>;
}

function DiffBlock({ diff, evidence }: { diff: string; evidence: string }) {
  const lines        = diff.split("\n")                                                        ;
  const evidenceLine = evidence.match(/:(\d+)/)?.[1]                                           ;
  const changedIndex = lines.findIndex((line) => line.startsWith("-") || line.startsWith("+")) ;
  return <div className="diff-block" aria-label="Mock code diff">{lines.map((line, index) => <code key={`${line}-${index}`} className={line.startsWith("+") ? "added" : line.startsWith("-") ? "removed" : "context"}><span>{evidenceLine && index === changedIndex ? evidenceLine : "—"}</span>{line}</code>)}</div>;
}
