import type { Component                    } from "@earendil-works/pi-tui"                                         ;
import type { WorkbenchSnapshot            } from "@/core/domain/work/workbench"                                   ;
import type {
              UsageLimitSnapshot         ,
              UsageSnapshot              ,
                                           } from "@/core/ports/observability/usage-monitor-port"                  ;
import      {
              monitoringCard             ,
              monitoringColumns          ,
              monitoringPanel            ,
              monitoringTable            ,
              monitoringUnavailablePanel ,
              monitoringWidths           ,
                                           } from "@/adapters/inbound/tui/foundation/layout/www-monitoring-layout" ;
import type { MonitoringCard               } from "@/adapters/inbound/tui/foundation/layout/www-monitoring-layout" ;
import      {
              a                          ,
              fit                        ,
              number                     ,
              pair                       ,
              prose                      ,
              railSection                ,
              safe                       ,
              section                    ,
                                           } from "@/adapters/inbound/tui/foundation/theme/www-theme"              ;

const PROVIDERS = ["openai-codex", "anthropic", "google", "zai"] as const;
const PROVIDER_LABELS: Readonly<Record<UsageSnapshot["provider"], string>> = {
	"openai-codex" : "Codex",
	anthropic      : "Claude",
	google         : "Antigravity",
	zai            : "Z.AI",
};

export class WwwUsageView implements Component {
	constructor(
		private readonly get       : () => WorkbenchSnapshot,
		private readonly usage     : () => readonly UsageSnapshot[],
		private readonly synthetic : () => boolean = () => false,
	) {}
	invalidate(): void {}
	render(width: number): string[] {
		const snapshot   = this.get()             ;
		const providers  = this.usage()           ;
		const innerWidth = Math.max(1, width - 2) ;
		const rows = [
			...(this.synthetic() ? [a.attention("DEMO DATA · 합성 예시 · 실제 사용 기록 아님")] : []),
			...section("구독 잔여 한도", width, "토큰 사용량과 별도 지표", a.active),
			...providerCards(providers, width),
			...PROVIDERS.flatMap(provider => {
				const current = providers.find(candidate => candidate.provider === provider);
				return (current?.limits ?? []).map(limit => {
					const remaining = observedPercent(limit);
					return pair(
						`${PROVIDER_LABELS[provider]} · ${safe(limit.label, 24)}`,
						`${remaining === null ? "잔여량 미관측" : `${Math.round(remaining)}% 남음`} · ${resetIn(limit.resetsAt)}`,
						width,
					);
				});
			}),
			...usageDashboard(snapshot, width),
			...section("모델별 사용 내역", width, width >= 66 ? "현재 프로세스 관측 범위" : "", a.active),
			a.muted("단위: tokens · 직접 대화와 분리 실행은 실행 경로이며 업무 분류가 아닙니다."),
			a.muted("OBSERVED = 관측 합계 · 미관측 경로의 사용량은 포함하지 않습니다."),
			...modelRows(snapshot, width),
			...monitoringPanel({ title: "어디에 사용했나", ink: a.info }, attributionRows(snapshot, innerWidth), width),
		];
		return rows.flatMap(row => prose(fit(row, width), width));
	}
}

export class WwwUsageRail implements Component {
	constructor(
		private readonly get       : () => WorkbenchSnapshot,
		private readonly usage     : () => readonly UsageSnapshot[],
		private readonly synthetic : () => boolean = () => false,
	) {}
	invalidate(): void {}
	render(width: number): string[] {
		const session = this.get().sessionUsage                         ;
		const stale   = this.usage().filter(provider => provider.stale) ;
		const rows = [
			...railSection("관측 범위", width),
			...(this.synthetic() ? [a.attention("DEMO DATA · 합성 예시")] : []),
			pair("직접 대화", session?.observationCoverage.interactive ? "관측됨" : "미관측", width),
			pair("분리 실행", session?.observationCoverage.detached ? "관측됨" : "미관측", width),
			a.muted("프로세스 연결 이후의 사용량입니다."),
			a.muted("과거 전체 대화·하루 합계가 아닙니다."),
			...railSection("아직 알 수 없는 것", width),
			a.muted("작업별 귀속 · 조사/구현/검증 목적"),
			...railSection("확인이 필요한 상태", width),
			...stale.map(provider => a.attention(`${PROVIDER_LABELS[provider.provider]} · 오래된 한도 정보`)),
			a.muted("/usage · 구독 한도 조회"),
		];
		return rows.flatMap(row => prose(fit(row, width), width));
	}
}

function observedPercent(limit: UsageLimitSnapshot): number | null {
	if (typeof limit.remainingPercent === "number" && Number.isFinite(limit.remainingPercent)) return Math.max(0, Math.min(100, limit.remainingPercent));
	if (typeof limit.usedPercent === "number" && Number.isFinite(limit.usedPercent)) return 100 - Math.max(0, Math.min(100, limit.usedPercent));
	return null;
}

function resetIn(timestamp: number | undefined, now = Date.now()): string {
	if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return "리셋 시각 미관측";
	const minutes = Math.max(0, Math.ceil((timestamp - now) / 60_000)) ;
	const days    = Math.floor(minutes / 1_440)                        ;
	const hours   = Math.floor((minutes % 1_440) / 60)                 ;
	if (days > 0) return `${days}일 ${hours}시간 후 리셋`;
	if (hours > 0) return `${hours}시간 ${minutes % 60}분 후 리셋`;
	return `${minutes}분 후 리셋`;
}

function providerCard(provider: UsageSnapshot["provider"], snapshot: UsageSnapshot | undefined): MonitoringCard {
	if (!snapshot) return { title: PROVIDER_LABELS[provider], value: "미관측", detail: "provider snapshot 없음" };
	const limit     = snapshot.limits[0]                                     ;
	const remaining = limit ? observedPercent(limit) : null                  ;
	const state     = `${snapshot.state}${snapshot.stale ? " · stale" : ""}` ;
	if (!limit) return { title: PROVIDER_LABELS[provider], value: state, detail: "quota 미관측" };
	return {
		title  : PROVIDER_LABELS[provider],
		value  : remaining === null ? state : `${Math.round(remaining)}% 남음`,
		detail : `${safe(limit.label, 42)} · ${state}`,
	};
}

function providerCards(providers: readonly UsageSnapshot[], width: number): string[] {
	if (width < 96) return PROVIDERS.flatMap(provider => [
		...monitoringCard(providerCard(provider, providers.find(candidate => candidate.provider === provider)), width),
		"",
	]);
	const widths = monitoringWidths(width, PROVIDERS.length);
	const cards = PROVIDERS.map((provider, index) => monitoringCard(
		providerCard(provider, providers.find(candidate => candidate.provider === provider)),
		widths[index] ?? 1,
	));
	return monitoringColumns(cards, widths);
}

function modelRows(snapshot: WorkbenchSnapshot, width: number): string[] {
	const session = snapshot.sessionUsage;
	if (!session?.models.length) return [a.muted("모델 사용 내역 미관측 · 관측 기준선이 필요합니다.")];

	const columns = [
		{ heading : "MODEL"    , minWidth : 18 , weight : 1 , align : "left"  },
		{ heading : "EFFORT"   , minWidth : 6  , weight : 0 , align : "left"  },
		{ heading : "DIRECT"   , minWidth : 8  , weight : 0 , align : "right" },
		{ heading : "DETACHED" , minWidth : 8  , weight : 0 , align : "right" },
		{ heading : "OBSERVED" , minWidth : 8  , weight : 0 , align : "right" },
	] as const;
	const rows = session.models.map(model => [
		safe(model.model, 48),
		safe(model.effort ?? "미관측", 16),
		session.observationCoverage.interactive ? number(model.interactiveTokens) : "미관측",
		session.observationCoverage.detached ? number(model.detachedTokens) : "미관측",
		number(model.totalTokens),
	]);
	if (width < 66) return rows.flatMap(row => [
		fit(`${row[0]} · ${row[1]}`, width),
		fit(`직접 ${row[2]} · 분리 ${row[3]} · 관측 ${row[4]}`, width),
	]);
	return monitoringTable({ columns, rows }, width);
}

function attributionRows(snapshot: WorkbenchSnapshot, width: number): string[] {
	const session = snapshot.sessionUsage;
	if (!session) return [a.muted("세션 사용량 미관측")];
	const interactive = session.models.reduce((sum, model) => sum + model.interactiveTokens, 0) ;
	const detached    = session.models.reduce((sum, model) => sum + model.detachedTokens, 0)    ;
	const unassigned  = session.unattributedTokens                                              ;
	return [
		pair("직접 대화", session.observationCoverage.interactive ? `${number(interactive)} tokens` : "미관측", width),
		pair("분리 실행", session.observationCoverage.detached ? `${number(detached)} tokens` : "미관측", width),
		pair("모델 귀속 미확인", session.observedTotalTokens === null ? "미관측" : `${number(unassigned)} tokens`, width),
		a.muted("작업별 귀속 미확인 · 업무·사용 목적 연결이 아직 없습니다."),
	];
}

function compactNumber(value: number | null): string {
	if (value === null) return "—";
	if (value >= 1_000_000) return `${Math.round(value / 10_000) / 100}M`;
	if (value >= 1_000) return `${Math.round(value / 100) / 10}K`;
	return String(value);
}

function modelLabel(model: string): string {
	if (/sonnet/iu.test(model)) return "Sonnet";
	if (/opus/iu.test(model)) return "Opus";
	if (/haiku/iu.test(model)) return "Haiku";
	if (/gemini/iu.test(model)) return "Gemini";
	const normalized = model.replace(/^gpt-[\d.]+-/u, "").replace(/^claude-/u, "").split(/[-_/]/u).filter(Boolean).at(-1) ?? model;
	return normalized.charAt(0).toLocaleUpperCase("en-US") + normalized.slice(1);
}

function percentage(value: number, total: number): number { return total > 0 ? Math.round(value / total * 100) : 0; }

function usageBar(percent: number, width = 20): string {
	const filled = Math.round(Math.max(0, Math.min(100, percent)) * width / 100);
	return `${a.active("█".repeat(filled))}${a.rule("░".repeat(width - filled))}`;
}

function summaryCards(snapshot: WorkbenchSnapshot, width: number): string[] {
	const session  = snapshot.sessionUsage                                                                                                   ;
	const requests = snapshot.requestRuntime ?? []                                                                                           ;
	const terminal = requests.filter(request => ["completed", "failed", "blocked", "skipped"].includes(request.status))                      ;
	const success  = terminal.length ? percentage(terminal.filter(request => request.status === "completed").length, terminal.length) : null ;
	const cards = [
		{ title : "OBSERVED TOKENS" , value : compactNumber(session?.observedTotalTokens ?? null)          , detail : "현재 프로세스 기준"                                                         },
		{ title : "REQUESTS"        , value : requests.length ? number(requests.length) : "—"              , detail : "request runtime"                                                            },
		{ title : "MODELS"          , value : session?.models.length ? number(session.models.length) : "—" , detail : "token 귀속 모델"                                                            },
		{ title : "SUCCESS"         , value : success === null ? "—" : `${success}%`                       , detail : terminal.length ? `${terminal.length} terminal requests` : "terminal 미관측" },
	];
	if (width < 88) return cards.flatMap(card => [...monitoringCard(card, width), ""]);
	const widths = monitoringWidths(width, cards.length);
	return monitoringColumns(cards.map((card, index) => monitoringCard(card, widths[index] ?? 1)), widths);
}

function modelShareRows(snapshot: WorkbenchSnapshot, width: number): string[] {
	const models = snapshot.sessionUsage?.models ?? []                       ;
	const total  = models.reduce((sum, model) => sum + model.totalTokens, 0) ;
	if (!models.length || total <= 0) return [a.muted("모델별 token 귀속 미관측")];
	const labelWidth = Math.max(8, Math.min(16, Math.floor(width * 0.22))) ;
	const barWidth   = Math.max(5, Math.min(22, width - labelWidth - 8)  ) ;
	return [...models].sort((left, right) => right.totalTokens - left.totalTokens).slice(0, 7).map(model => {
		const share = percentage(model.totalTokens, total);
		return fit(`${modelLabel(model.model).padEnd(labelWidth)} ${usageBar(share, barWidth)}  ${String(share).padStart(3)}%`, width);
	});
}

function selectedModelRows(snapshot: WorkbenchSnapshot, model: string | undefined, width: number): string[] {
	if (!model) return [a.muted("선택할 model 관측 없음")];
	const modelRows = (snapshot.sessionUsage?.models ?? []).filter(row => row.model === model)               ;
	const tokens    = modelRows.length ? modelRows.reduce((total, row) => total + row.totalTokens, 0) : null ;
	const efforts   = modelRows.reduce<Record<string, number>>((counts, row) => {
		const effort = row.effort ?? "unknown";
		counts[effort] = (counts[effort] ?? 0) + row.totalTokens;
		return counts;
	}, {});
	return [
		pair(modelLabel(model), safe(model, 44), width),
		pair("tokens", compactNumber(tokens), width),
		...Object.entries(efforts).map(([effort, effortTokens]) => pair(effort, `${percentage(effortTokens, tokens ?? 0)}%`, width)),
	];
}

function selectedModelName(snapshot: WorkbenchSnapshot): string | undefined {
	const totals = new Map<string, number>();
	for (const row of snapshot.sessionUsage?.models ?? []) totals.set(row.model, (totals.get(row.model) ?? 0) + row.totalTokens);
	return [...totals].sort(([leftModel, leftTokens], [rightModel, rightTokens]) => rightTokens - leftTokens || leftModel.localeCompare(rightModel))[0]?.[0]
}

function usageDashboard(snapshot: WorkbenchSnapshot, width: number): string[] {
	const split        = width >= 100                                                                                                                                                                            ;
	const widths       = monitoringWidths(width, 2)                                                                                                                                                              ;
	const leftWidth    = split ? widths[0] ?? width : width                                                                                                                                                      ;
	const rightWidth   = split ? widths[1] ?? width : width                                                                                                                                                      ;
	const share        = monitoringPanel({ title: "MODEL SHARE", ink: a.active }, modelShareRows(snapshot, Math.max(1, leftWidth - 2)), leftWidth)                                                               ;
	const trend        = monitoringUnavailablePanel("USAGE TREND", "일별 token history 저장 계약이 아직 없습니다.", leftWidth)                                                                                   ;
	const selectedName = selectedModelName(snapshot)                                                                                                                                                             ;
	const selected     = monitoringPanel({ title: `OBSERVED MODEL · ${modelLabel(selectedName ?? "미관측")}`, ink: a.info }, selectedModelRows(snapshot, selectedName, Math.max(1, rightWidth - 2)), rightWidth) ;
	return [
		...summaryCards(snapshot, width),
		...share,
		...(split ? monitoringColumns([trend, selected], widths) : [...trend, ...selected]),
	];
}
