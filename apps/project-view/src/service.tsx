import      {
              Fragment                  ,
              useMemo                   ,
              useState                  ,
                                          } from "react"        ;
import      { mockDb                      } from "./mock-db"    ;
import type {
              ChatPreviewContent        ,
              DashboardPreviewContent   ,
              Decision                  ,
              DecisionStatus            ,
              ModuleSlug                ,
              ModuleTab                 ,
              MonitorPreviewContent     ,
              ProjectNode               ,
              ViewAnnotation            ,
                                          } from "./model"      ;
import      {
              adjacentModules           ,
              checksForModule           ,
              componentEvidenceRefs     ,
              decisionsForModule        ,
              documentsForModule        ,
              implementationForDecision ,
              moduleBySlug              ,
              moduleComponents          ,
              principlesForModule       ,
              relationPathForPrinciple  ,
              verificationForDecision   ,
              viewForModule             ,
                                          } from "./selectors"  ;
import      { AppLink                     } from "./navigation" ;
import      {
              AppShell                  ,
              Breadcrumbs               ,
              EvidenceAnchor            ,
              EvidenceInspector         ,
              RecordLink                ,
              ServiceTargetLink         ,
              StatusLabel               ,
              useInspector              ,
                                          } from "./common"     ;

const modules: ModuleSlug[] = ["monitor", "chat", "dashboard"];
const decisionStatusLabels: Record<DecisionStatus, string> = {
  proposed   : "제안"   ,
  adopted    : "채택됨" ,
  rejected   : "기각"   ,
  superseded : "대체됨" ,
};

export function ServiceOverview() {
  const inspector = useInspector();
  return <AppShell area="service"><div className={`page-with-inspector ${inspector.recordRef ? "has-inspector" : ""}`}><div className="page-main">
    <header className="page-heading service-heading"><div><p className="eyebrow">Business logic · {modules.length} modules</p><h1>Service</h1><p className="lede">실제 서비스의 기능과 구성, 화면, 구현 근거를 구조에서 시작해 탐색합니다.</p></div><div className="revision-note"><span>Current basis</span><code>{viewForModule("chat").revision}</code></div></header>
    <div className="structure-labels" aria-hidden="true"><span>Index</span><span>Module</span><span>Responsibility / composition</span><span>Evidence</span></div>
    <section className="structure-map" aria-label="Service module structure"><div className="scope-bracket" aria-hidden="true" />
      {modules.map((slug, index) => {
        const module = moduleBySlug(slug); const components = moduleComponents(slug); const checks = checksForModule(slug);
        return <article className="structure-band" key={slug}>
          <span className="structure-index">{String(index + 1).padStart(2, "0")}</span>
          <h2><AppLink href={`/projects/www/service/${slug}?tab=overview`}>{module.name}</AppLink></h2>
          <div className="band-composition"><p>{module.responsibility}</p><p className="component-line">{components.map((item) => item.displayLabel ?? item.name).join(" · ")}</p><span className="count-note">{components.length} components · {checks.length} checks</span></div>
          <div className="band-evidence">{checks.length ? checks.map((check) => <div key={check.id}><EvidenceAnchor recordRef={{ table: "verification_runs", id: check.id }} onInspect={inspector.inspect} expanded={inspector.recordRef?.table === "verification_runs" && inspector.recordRef.id === check.id} /><StatusLabel status={check.status} /></div>) : <span className="unknown-copy">확인 기록 없음</span>}</div>
        </article>;
      })}
    </section>
    <section className="recent-changes"><div><p className="eyebrow">Recent structural change</p><h2>결정에서 검사까지 이어지는 현재 근거</h2></div><div className="evidence-chain"><RecordLink id="DEC-014" /><span aria-hidden="true">→</span><RecordLink id="COM-014" /><span aria-hidden="true">→</span><RecordLink id="CHK-014" /></div><p>채택된 결정과 연결된 변경이 있지만, 같은 리비전의 구현 검사는 실패했습니다.</p></section>
  </div><EvidenceInspector recordRef={inspector.recordRef} onClose={inspector.close} returnFocus={inspector.returnFocus} /></div></AppShell>;
}

const tabLabels: Record<ModuleTab, string> = { overview: "Overview", composition: "Composition", view: "View", principles: "Principles", decisions: "Decisions" };

export function ModuleDetail({ slug, tab, selectedComponent, selectedPrinciple, selectedDecision }: { slug: ModuleSlug; tab: ModuleTab; selectedComponent: string | null; selectedPrinciple: string | null; selectedDecision: string | null }) {
  const module = moduleBySlug(slug);
  return <AppShell area="service"><div className="module-page">
    <Breadcrumbs items={[{ label: "WWW" }, { label: "Service", href: "/projects/www/service" }, { label: module.name }]} />
    <header className="page-heading module-heading"><div><p className="eyebrow">Service module · {module.id}</p><h1>{module.name}</h1><p className="lede">{module.responsibility}</p></div><div className="module-path"><span>Implementation</span><code>{module.implementation}</code></div></header>
    <nav className="context-nav" aria-label="Service modules">{modules.map((item) => <AppLink key={item} href={`/projects/www/service/${item}?tab=overview`} className={item === slug ? "active" : ""}>{moduleBySlug(item).name}</AppLink>)}</nav>
    <nav className="detail-tabs" aria-label={`${module.name} detail views`}>{(Object.keys(tabLabels) as ModuleTab[]).map((item) => <AppLink key={item} href={`/projects/www/service/${slug}?tab=${item}`} className={item === tab ? "active" : ""} {...(item === tab ? { ariaCurrent: "page" as const } : {})} ariaLabel={`${tabLabels[item]} 화면`}>{tabLabels[item]}</AppLink>)}</nav>
    {tab === "overview" && <Overview slug={slug} />}
    {tab === "composition" && <Composition slug={slug} selectedId={selectedComponent} />}
    {tab === "view" && <ModuleView slug={slug} selectedId={selectedComponent} />}
    {tab === "principles" && <Principles slug={slug} selectedId={selectedPrinciple} />}
    {tab === "decisions" && <Decisions slug={slug} selectedId={selectedDecision} />}
  </div></AppShell>;
}

function Overview({ slug }: { slug: ModuleSlug }) {
  const module = moduleBySlug(slug); const components = moduleComponents(slug); const checks = checksForModule(slug); const principles = principlesForModule(slug);
  const documents = documentsForModule(slug); const adjacent = adjacentModules(slug);
  return <section className="detail-content overview-layout"><div className="reading-column"><p className="eyebrow">Responsibility</p><h2>{module.name}가 맡는 범위</h2><p className="reading-copy">{module.responsibility} 화면은 목업 스냅샷의 구조와 근거를 읽기 위한 것이며 Native 실행을 조작하지 않습니다.</p><dl className="boundary-list"><div><dt>Input</dt><dd>{module.input}</dd></div><div><dt>Output</dt><dd>{module.output}</dd></div><div><dt>Boundary</dt><dd>실행과 저장은 Native core가 소유하고, 이 View는 읽기 모델만 표현합니다.</dd></div><div><dt>Adjacent areas</dt><dd>{adjacent.length ? adjacent.map((item) => <AppLink key={item.id} className="evidence-anchor" href={`/projects/www/service/${item.slug}?tab=overview`}>{item.name}</AppLink>) : "저장된 인접 관계 없음"}</dd></div><div><dt>Connected documents</dt><dd>{documents.length ? documents.map((document) => <EvidenceAnchor key={document.id} recordRef={{ table: "documents", id: document.id }} suffix={document.path} />) : "연결 문서 없음"}</dd></div></dl></div><aside className="overview-index"><h2>Connected structure</h2><dl><div><dt>Components</dt><dd>{components.length}</dd></div><div><dt>Principles</dt><dd>{principles.length}</dd></div><div><dt>Checks</dt><dd>{checks.length}</dd></div></dl><div className="anchor-list">{checks.map((check) => <AppLink key={check.id} className="evidence-anchor" href={`/projects/www/assurance?check=${check.id}`}>{check.id} · {check.criterion} · {check.status}</AppLink>)}</div></aside></section>;
}

function Composition({ slug, selectedId }: { slug: ModuleSlug; selectedId: string | null }) {
  const components = moduleComponents(slug);
  const selected = components.find((item) => item.id === selectedId) ?? components[0]!;
  return <section className="detail-content composition-layout"><nav className="component-index" aria-label="Components"><p className="eyebrow">Component index</p>{components.map((component, index) => <AppLink key={component.id} className={component.id === selected.id ? "selected" : ""} href={`/projects/www/service/${slug}?tab=composition&component=${component.id}`}><span>{String(index + 1).padStart(2, "0")}</span><strong>{component.name}</strong><small>{component.id}</small></AppLink>)}</nav><ComponentReading component={selected} slug={slug} /></section>;
}

function ComponentReading({ component, slug }: { component: ProjectNode; slug: ModuleSlug }) {
  const evidenceRefs = componentEvidenceRefs(component.id);
  return <article className="component-reading"><p className="eyebrow">Selected component · {component.id}</p><h2>{component.name}</h2><p className="reading-copy">{component.responsibility}</p><div className="scope-flow"><div><span>Receives</span><strong>{component.input}</strong></div><i aria-hidden="true">→</i><div><span>Produces</span><strong>{component.output}</strong></div></div><section><h3>Implementation reference</h3><code className="path-block">{component.implementation}</code></section><section><h3>Principles and checks</h3>{evidenceRefs.length ? <div className="anchor-list">{evidenceRefs.map((item) => <EvidenceAnchor key={`${item.table}-${item.id}`} recordRef={item} />)}</div> : <p className="empty-inline">연결된 원칙 또는 검사 기록이 없습니다.</p>}</section><AppLink className="text-button" href={`/projects/www/service/${slug}?tab=view&component=${component.id}`}>View에서 같은 구성요소 보기</AppLink></article>;
}

function ModuleView({ slug, selectedId }: { slug: ModuleSlug; selectedId: string | null }) {
  const view = viewForModule(slug);
  const annotatedComponents = view.annotations.map((annotation) => ({ annotation, component: mockDb.project_nodes.find((item) => item.id === annotation.componentId)! }));
  const selectedEntry = annotatedComponents.find(({ component }) => component.id === selectedId) ?? annotatedComponents[0]!;
  const selectedArea = selectedEntry.annotation.area;
  const evidenceRefs = componentEvidenceRefs(selectedEntry.component.id);
  return <section className="detail-content view-layout"><div className="preview-column"><div className="preview-header"><span>{moduleBySlug(slug).name} / Mock preview</span><code>revision {view.revision}</code></div>{view.previewKind === "native-chat" ? <ChatPreview selected={selectedArea} annotations={view.annotations} content={view.preview} /> : view.previewKind === "runtime-monitor" ? <MonitorPreview selected={selectedArea} content={view.preview} /> : <DashboardPreview selected={selectedArea} content={view.preview} />}</div><aside className="annotation-rail"><p className="eyebrow">View annotations</p><h2>구성요소</h2>{annotatedComponents.map(({ component }, index) => <AppLink key={component.id} className={`annotation ${component.id === selectedEntry.component.id ? "selected" : ""}`} href={`/projects/www/service/${slug}?tab=view&component=${component.id}`}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{component.name}</strong><small>{component.responsibility}</small></div></AppLink>)}<section className="annotation-evidence"><h3>Selected evidence</h3><code>{selectedEntry.component.implementation}</code>{evidenceRefs.map((item) => <EvidenceAnchor key={`${item.table}-${item.id}`} recordRef={item} />)}</section></aside></section>;
}

function Hotspot({ active, number, className }: { active: boolean; number: string; className: string }) { return <span className={`hotspot ${className} ${active ? "active" : ""}`} aria-hidden="true">{number}</span>; }

function ChatPreview({ selected, annotations, content }: { selected: string; annotations: ViewAnnotation[]; content: ChatPreviewContent }) {
  return <div className="tui-preview chat-preview" aria-label="Chat mock preview">{annotations.map((annotation, index) => <Hotspot key={annotation.componentId} active={selected === annotation.area} number={String(index + 1).padStart(2, "0")} className={annotation.hotspotClass} />)}
    <div className={`tui-main ${selected === "stream" ? "selected-area" : ""}`}><div className="tui-welcome"><span className="tui-logo">{content.welcome.title}</span><p>{content.welcome.detail}</p></div><div className="tui-message"><b>{content.messages[0]?.actor}</b><p>{content.messages[0]?.body}</p></div><div className="tui-message assistant"><b>{content.messages[1]?.actor}</b><p>{content.messages[1]?.body}</p><div className={`tool-block ${selected === "tools" ? "selected-area" : ""}`}><span>{content.tool.label}</span><code>{content.tool.result}</code></div><p>{content.result}</p></div></div>
    <aside className={`tui-rail ${selected === "rail" ? "selected-area" : ""}`}><section><b>{content.rail.plan.label}</b><p>{content.rail.plan.title}</p><ul>{content.rail.plan.items.map((item) => <li key={item}>{item}</li>)}</ul></section><section className="progress-nested"><b>{content.rail.progress.label}</b>{content.rail.progress.items.map((item) => <div key={item}><span />{item}</div>)}</section><section><b>{content.rail.test.label}</b><dl>{content.rail.test.rows.map((row) => <div key={row.label} className={row.label === "Failed" ? "fail-line" : ""}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl></section></aside>
    <footer className={`tui-composer ${selected === "composer" ? "selected-area" : ""}`}><div className="stage-line">{content.stages.map((stage) => <span key={stage.label} className={stage.state === "pending" ? "" : stage.state}><i />{stage.label}</span>)}</div><div className="composer-shape"><span>{content.composerPlaceholder}</span><kbd>↵</kbd></div></footer><div className={`adapter-edge ${selected === "adapter" ? "selected-area" : ""}`}><span>{content.adapter.label}</span><code>{content.adapter.mapping}</code></div></div>;
}

function MonitorPreview({ selected, content }: { selected: string; content: MonitorPreviewContent }) { return <div className="tui-preview monitor-preview"><header><strong>{content.title}</strong><span>{content.snapshot}</span></header><div className={`monitor-runs ${selected === "runs" ? "selected-area" : ""}`}>{content.runs.map((run) => <Fragment key={run.name}><span>{run.label}</span><b>{run.name}</b><em>{run.status}</em></Fragment>)}</div><div className={`monitor-status ${selected === "status" ? "selected-area" : ""}`}><small>{content.stageLabel}</small><strong>{content.currentStage}</strong><div className="stage-bar">{content.stages.map((stage, index) => <i key={index} className={stage.state === "pending" ? "" : stage.state} />)}</div></div><aside className={`monitor-usage ${selected === "usage" ? "selected-area" : ""}`}><small>{content.usageLabel}</small>{content.usage.map((item, index) => <Fragment key={item.label}>{index > 0 && <hr/>}<b>{item.value}</b><span>{item.label}</span></Fragment>)}</aside></div>; }

function DashboardPreview({ selected, content }: { selected: string; content: DashboardPreviewContent }) { return <div className="tui-preview dashboard-preview"><header><strong>{content.title}</strong><span>{content.summary}</span></header><div className={`dash-projects ${selected === "projects" ? "selected-area" : ""}`}>{content.projects.map((project) => <Fragment key={project.name}><span>{project.index}</span><b>{project.name}</b><em>{project.status}</em></Fragment>)}</div><section className={`dash-today ${selected === "today" ? "selected-area" : ""}`}><small>{content.todayLabel}</small>{content.today.map((item) => <p key={item}>{item}</p>)}</section><section className={`dash-summary ${selected === "summary" ? "selected-area" : ""}`}><small>{content.evidenceLabel}</small><dl>{content.evidence.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl><p>{content.evidenceNote}</p></section></div>; }

function Principles({ slug, selectedId }: { slug: ModuleSlug; selectedId: string | null }) {
  const principles = principlesForModule(slug); const selected = principles.find((item) => item.id === selectedId) ?? principles.find((item) => item.id === "PRN-003") ?? principles[0];
  if (!selected) return <div className="empty-state">이 모듈에는 지정된 원칙이 없습니다.</div>;
  const path = relationPathForPrinciple(selected);
  const document = mockDb.documents.find((item) => item.id === path.documentRef.id);
  if (!document) return <div className="empty-state">{path.documentRef.id} 문서 참조를 확인할 수 없습니다.</div>;
  const targets = path.applicationTargets.flatMap((relation) => relation.to.table === "project_nodes" ? [relation.to.id] : []);
  const checks = path.verifications.flatMap((relation) => relation.from.table === "verification_runs" ? mockDb.verification_runs.filter((check) => check.id === relation.from.id) : []);
  const storedRelations = [...path.documentReferences, ...(path.definition ? [path.definition] : []), ...path.applicationTargets, ...path.runtimeInputs, ...path.verifications];
  return <section className="detail-content principle-layout"><header className="principle-title"><div><p className="eyebrow">Selected principle · {selected.id}</p><h2>{selected.statement}</h2><p>{selected.detail}</p></div><nav aria-label="Principles">{principles.map((item) => <AppLink key={item.id} className={item.id === selected.id ? "active" : ""} href={`/projects/www/service/${slug}?tab=principles&principle=${item.id}`}>{item.id}</AppLink>)}</nav></header><article className="document-reading"><div className="document-meta"><span>{document.path}</span><span>{document.anchor}</span><code>{document.revision}</code></div>{document.body.split("\n\n").map((paragraph, index) => <p key={paragraph} className={index === selected.documentParagraph ? "highlighted-paragraph" : ""}>{paragraph}</p>)}<EvidenceAnchor recordRef={{ table: "documents", id: document.id }} /></article><aside className="principle-evidence"><section><h3>Document reference</h3>{path.documentReferences.length ? path.documentReferences.map((relation) => <div key={relation.id}><RecordLink id={relation.id} /><EvidenceAnchor recordRef={relation.from} /></div>) : <p>저장된 문서 참조 관계 없음</p>}{path.definition && <div><RecordLink id={path.definition.id} /><span>{path.definition.kind}</span></div>}</section><section><h3>Application targets</h3>{targets.length ? targets.map((id) => <ServiceTargetLink key={id} targetId={id} />) : <p>저장된 적용 대상 관계 없음</p>}</section><section><h3>Implementation references</h3>{targets.length ? targets.map((id) => { const node = mockDb.project_nodes.find((item) => item.id === id); return <code key={id}>{node?.implementation ?? "구현 참조 없음"}</code>; }) : <p>적용 대상 관계가 없어 구현 참조를 파생하지 않았습니다.</p>}</section><section><h3>Runtime input evidence</h3>{path.runtimeInputs.length ? path.runtimeInputs.map((relation) => <div key={relation.id}><RecordLink id={relation.id} /><EvidenceAnchor recordRef={relation.from} suffix="실행 입력 포함 근거" /></div>) : <p>실행 입력 포함 여부 확인 안 됨</p>}</section><section><h3>Verification</h3>{checks.length ? checks.map((check) => <AppLink key={check.id} className="evidence-anchor" href={`/projects/www/assurance?check=${check.id}`}>{check.id} · {check.status}</AppLink>) : <p>확인 기록 없음</p>}</section></aside><footer className="principle-flow">{storedRelations.length ? storedRelations.map((relation) => <span key={relation.id}><i className="solid" /><RecordLink id={relation.id} /> · {relation.kind}</span>) : <small>표시할 저장 관계가 없습니다.</small>}</footer></section>;
}

function Decisions({ slug, selectedId }: { slug: ModuleSlug; selectedId: string | null }) {
  const decisions = decisionsForModule(slug); const selected = decisions.find((item) => item.id === selectedId) ?? decisions.find((item) => item.id === "DEC-014") ?? decisions[0];
  return <section className="detail-content decisions-layout"><nav className="decision-index" aria-label="Decisions">{decisions.map((decision) => <AppLink key={decision.id} className={decision.id === selected?.id ? "selected" : ""} href={`/projects/www/service/${slug}?tab=decisions&decision=${decision.id}`}><span>{decision.id}</span><strong>{decision.title}</strong><small>{decisionStatusLabels[decision.status]}</small></AppLink>)}</nav>{selected ? <DecisionReading decision={selected} /> : <div className="empty-state">연결된 결정이 없습니다.</div>}</section>;
}

function DecisionReading({ decision }: { decision: Decision }) {
  const implementation = implementationForDecision(decision.id); const verification = verificationForDecision(decision);
  const adoption = decisionStatusLabels[decision.status];
  return <article className="decision-reading"><p className="eyebrow">Decision · {decision.id}</p><h2>{decision.title}</h2><p className="reading-copy">{decision.content}</p><section><h3>Reason</h3><p>{decision.reason}</p></section><dl className="decision-triad"><dt>채택</dt><dd data-tone={decision.status}>{adoption}{decision.adoptedAt ? ` · ${new Date(decision.adoptedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}` : ""}</dd><dt>코드 연결</dt><dd>{implementation ? <><RecordLink id={implementation.commitId} /><span> · </span><RecordLink id={implementation.id} /></> : "연결된 변경 없음"}</dd><dt>확인</dt><dd data-tone={verification?.status ?? "not-checked"}>{verification ? <AppLink className="evidence-anchor" href={`/projects/www/assurance?check=${verification.id}`}>{verification.id} · {verification.status}</AppLink> : "미확인"}</dd></dl><section><h3>Source RAW</h3><div className="anchor-list">{decision.sourceRawIds.length ? decision.sourceRawIds.map((id) => <RecordLink id={id} key={id} />) : <span>출처 RAW 없음</span>}</div></section>{decision.supersededBy && <p className="superseded-note">이 결정은 <RecordLink id={decision.supersededBy} />에 의해 대체되었습니다.</p>}</article>;
}
