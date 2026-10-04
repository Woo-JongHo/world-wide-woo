import      { useLocationState                                      } from "./navigation" ;
import      { moduleTabs                                            } from "./model"      ;
import type { ModuleSlug, ModuleTab, TableName                      } from "./model"      ;
import      { ModuleDetail                                          } from "./service"    ;
import      { ProjectGraphPage                                      } from "./graph-page" ;
import      { AssurancePage, isAssuranceCategory, isAssuranceStatus } from "./assurance"  ;
import      { DatabasePage, isDetailTab, isTableName                } from "./database"   ;

const moduleSlugs: readonly ModuleSlug[] = ["monitor", "chat", "dashboard"]                                                      ;
const isModuleSlug                       = (value: string): value is ModuleSlug => moduleSlugs.some((slug) => slug === value)    ;
const isModuleTab                        = (value: string | null): value is ModuleTab => moduleTabs.some((tab) => tab === value) ;

export default function App() {
  useLocationState();
  const path   = window.location.pathname.replace(/\/+$/, "") || "/" ;
  const params = new URLSearchParams(window.location.search)         ;
  if (path === "/" || path === "/projects" || path === "/projects/www") {
    history.replaceState(history.state, "", "/projects/www/service");
    return <ProjectGraphPage mode="structure" />;
  }
  if (path === "/projects/www/service") return <ProjectGraphPage mode="structure" />;
  const moduleMatch = path.match(/^\/projects\/www\/service\/([^/]+)$/) ;
  const moduleSlug  = moduleMatch?.[1]                                  ;
  if (moduleSlug && isModuleSlug(moduleSlug)) {
    const tabParam = params.get("tab"); const tab = isModuleTab(tabParam) ? tabParam : "overview";
    return <ModuleDetail slug={moduleSlug} tab={tab} selectedComponent={params.get("component")} selectedPrinciple={params.get("principle")} selectedDecision={params.get("decision")} />;
  }
  if (path === "/projects/www/assurance") {
    if (!params.has("check") && !params.has("category") && !params.has("status")) return <ProjectGraphPage mode="evidence" />;
    const categoryParam = params.get("category"); const category = isAssuranceCategory(categoryParam) ? categoryParam : "all";
    const statusParam = params.get("status"); const status = isAssuranceStatus(statusParam) ? statusParam : "all";
    return <AssurancePage selectedId={params.get("check")} category={category} status={status} />;
  }
  if (path === "/projects/www/database") {
    const tableParam = params.get("table"); const table: TableName = isTableName(tableParam) ? tableParam : "project_nodes";
    const sort = params.get("sort") ?? "id"; const direction = params.get("dir") === "desc" ? "desc" : "asc";
    const detailParam = params.get("detail"); const detailTab = isDetailTab(detailParam) ? detailParam : "fields";
    return <DatabasePage table={table} rowId={params.get("row")} query={params.get("q") ?? ""} sort={sort} direction={direction} status={params.get("status") ?? ""} detailTab={detailTab} />;
  }
  return <div className="route-error"><p className="eyebrow">404 · Project View</p><h1>경로를 찾을 수 없습니다.</h1><a href="/projects/www/service">Service 구조로 돌아가기</a></div>;
}
