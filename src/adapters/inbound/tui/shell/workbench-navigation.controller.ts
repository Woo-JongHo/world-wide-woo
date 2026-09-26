import { ScrollView, VStack }          from "@earendil-works/pi-tui";
import type { Component }              from "@earendil-works/pi-tui";
import type { DevelopmentMapSnapshot } from "@/core/domain/development/development-map";
import type { WwwPage }                from "@/adapters/inbound/tui/shell/www-surface";

export type WorkbenchBaseViewMode = "workbench"                                                               ;
export type ObservabilityViewMode = "stats" | "dashboard" | "monitor"                                         ;
export type WorkbenchViewMode     = WorkbenchBaseViewMode | ObservabilityViewMode | "map" | "source" | "test" ;

export function workbenchViewModeCommand(text: string): WorkbenchViewMode | null {
	const command = text.trim().toLowerCase();
	return command === "/dashboard" ? "dashboard"
		: command === "/monitor" ? "monitor"
			: command === "/map" ? "map"
				: command === "/stats" ? "stats"
					: command === "/test" ? "test"
						: null;
}

export function workbenchStatsTargetCommand(text: string): "session" | "diagnostics" | "latest" | number | "invalid" | null {
	const command = text.trim();
	if (command === "/stats") return "session";
	if (command === "/stats diagnostics") return "diagnostics";
	if (command === "/stats latest") return "latest";
	const numbered = command.match(/^\/stats\s+#(\d+)$/u);
	if (numbered) return Number(numbered[1]);
	return command.startsWith("/stats") ? "invalid" : null;
}

export function workbenchEscapeView(
	mode: WorkbenchViewMode,
	previous: WorkbenchBaseViewMode,
): WorkbenchBaseViewMode | null {
	return mode !== "workbench" ? previous : null;
}

const OBSERVABILITY_ROTATION: readonly ObservabilityViewMode[] = ["stats", "dashboard", "monitor"];

export function rotateObservabilityView(mode: ObservabilityViewMode, direction: 1 | -1): ObservabilityViewMode {
	const index = OBSERVABILITY_ROTATION.indexOf(mode);
	return OBSERVABILITY_ROTATION[(index + direction + OBSERVABILITY_ROTATION.length) % OBSERVABILITY_ROTATION.length]!;
}

export function directObservabilityView(key: string): ObservabilityViewMode | null {
	return key === "1" ? "stats" : key === "2" ? "dashboard" : key === "3" ? "monitor" : null;
}

export function shouldHandleObservabilityShortcut(navigationActive: boolean, editableFocused: boolean, key: string): boolean {
	return navigationActive && !editableFocused && (key === "r" || key === "R" || directObservabilityView(key) !== null);
}

export function workbenchDashboardSessionIndex(
	previous: readonly { readonly sessionId: string }[],
	selectedIndex: number,
	next: readonly { readonly sessionId: string }[],
): number {
	const selectedSessionId = previous[selectedIndex]?.sessionId;
	const preserved = selectedSessionId ? next.findIndex(session => session.sessionId === selectedSessionId) : -1;
	return preserved >= 0 ? preserved : Math.min(Math.max(0, selectedIndex), Math.max(0, next.length - 1));
}

export interface DevelopmentMapPollingSource {
	startPolling(listener: (snapshot: DevelopmentMapSnapshot) => void, intervalMs?: number): () => void;
}

export class DevelopmentMapPollingLifecycle {
	private stopPolling: (() => void) | null = null;

	public constructor(
		private readonly source: DevelopmentMapPollingSource | undefined,
		private readonly listener: (snapshot: DevelopmentMapSnapshot) => void,
	) {}

	public enter(): void {
		if (!this.stopPolling && this.source) this.stopPolling = this.source.startPolling(this.listener);
	}

	public leave(): void {
		this.stopPolling?.();
		this.stopPolling = null;
	}
}

/** A stable layout slot whose active component and keyboard owner can change without rebuilding the root. */
export class ComponentSlot implements Component {
	public constructor(private current: Component) {}
	public set        (component: Component): void { this.current = component; }
	public invalidate ()                    : void { this.current.invalidate(); }
	public render     (width: number       ): string[] { return this.current.render(width); }
	public handleInput(data: string        ): void { this.current.handleInput?.(data); }
}

export function createWorkbenchViewHost(
	getMode: () => WorkbenchViewMode,
	workbench: Component,
	dashboard: Component,
	monitor: Component,
	source: Component,
	map: Component,
	stats: Component,
	test?: Component,
): Component {
	return new VStack([
		{ component : workbench         , basis : 0 , grow : 1 , shrink : 1 , minSize : 1 , visible : () => getMode() === "workbench" },
		{ component : dashboard         , basis : 0 , grow : 1 , shrink : 1 , minSize : 1 , visible : () => getMode() === "dashboard" },
		{ component : monitor           , basis : 0 , grow : 1 , shrink : 1 , minSize : 1 , visible : () => getMode() === "monitor"   },
		{ component : source            , basis : 0 , grow : 1 , shrink : 1 , minSize : 1 , visible : () => getMode() === "source"    },
		{ component : map               , basis : 0 , grow : 1 , shrink : 1 , minSize : 1 , visible : () => getMode() === "map"       },
		{ component : stats             , basis : 0 , grow : 1 , shrink : 1 , minSize : 1 , visible : () => getMode() === "stats"     },
		{ component : test ?? workbench , basis : 0 , grow : 1 , shrink : 1 , minSize : 1 , visible : () => getMode() === "test"      },
	]);
}

interface NavigationTargets {
	readonly editor    : Component  ;
	readonly dashboard : ScrollView ;
	readonly monitor   : ScrollView ;
	readonly source    : ScrollView ;
	readonly map       : ScrollView ;
	readonly stats     : ScrollView ;
	readonly test      : ScrollView ;
}

interface WwwNavigationSurface {
	readonly page: WwwPage;
	readonly currentScroll: ScrollView;
	show(page: WwwPage): void;
}

/** Owns view-mode transitions, map polling, browse state, and the focus target chosen by each transition. */
export class WorkbenchNavigationController {
	private currentMode: WorkbenchViewMode ;
	private wwwBrowse           = false    ;
	private observabilityBrowse = false    ;

	public constructor(
		initialMode: WorkbenchViewMode,
		private readonly setFocus: (component: Component) => void,
		private readonly targets: NavigationTargets,
		private readonly mapPolling: DevelopmentMapPollingLifecycle,
		private readonly www: WwwNavigationSurface | null,
	) {
		this.currentMode = initialMode;
	}

	public get mode(): WorkbenchViewMode { return this.currentMode; }
	public get wwwBrowsing(): boolean { return this.wwwBrowse; }
	public get observabilityBrowsing(): boolean { return this.observabilityBrowse; }

	public showWwwPage(page: WwwPage, browse = page !== "execution"): boolean {
		if (!this.www) return false;
		this.changeMode("workbench");
		this.www.show(page);
		this.wwwBrowse = browse;
		this.observabilityBrowse = false;
		this.setFocus(browse ? this.www.currentScroll : this.targets.editor);
		return true;
	}

	public openCommandView(next: WorkbenchViewMode): void {
		if (next === "map") {
			this.observabilityBrowse = false;
			this.wwwBrowse = Boolean(this.www);
			this.changeMode(next);
			this.setFocus(this.targets.map);
			return;
		}
		if (next === "test") {
			this.observabilityBrowse = false;
			this.wwwBrowse = Boolean(this.www);
			this.changeMode(next);
			this.targets.test.scrollToStart();
			this.setFocus(this.targets.test);
			return;
		}
		if (next === "workbench" || next === "source") {
			this.openWorkbench();
			return;
		}
		this.enterObservability(next);
	}

	public enterObservability(next: ObservabilityViewMode): void {
		this.changeMode(next);
		this.observabilityBrowse = true;
		this.wwwBrowse = false;
		this.setFocus(next === "stats" ? this.targets.stats : next === "dashboard" ? this.targets.dashboard : this.targets.monitor);
	}

	public openSource(): void {
		this.changeMode("source");
		this.observabilityBrowse = false;
		this.setFocus(this.targets.source);
	}

	public openWorkbench(): void {
		this.changeMode("workbench");
		this.wwwBrowse = false;
		this.observabilityBrowse = false;
		this.setFocus(this.targets.editor);
	}

	public closeTransientSurface(): void {
		this.wwwBrowse = false;
		this.observabilityBrowse = false;
		this.setFocus(this.targets.editor);
	}

	public toggleWwwBrowse(editorFocused: boolean): void {
		this.wwwBrowse = editorFocused;
		this.observabilityBrowse = this.wwwBrowse && isObservabilityMode(this.currentMode);
		this.setFocus(this.wwwBrowse ? this.currentScroll() : this.targets.editor);
	}

	public leaveWwwBrowse(): void {
		this.wwwBrowse = false;
		this.setFocus(this.targets.editor);
	}

	public returnToWorkbench(): boolean {
		if (!workbenchEscapeView(this.currentMode, "workbench")) return false;
		this.openWorkbench();
		return true;
	}

	public currentScroll(): ScrollView {
		return this.currentMode === "map" ? this.targets.map
			: this.currentMode === "source" ? this.targets.source
				: this.currentMode === "test" ? this.targets.test
					: this.currentMode === "stats" ? this.targets.stats
						: this.currentMode === "dashboard" ? this.targets.dashboard
							: this.currentMode === "monitor" ? this.targets.monitor
								: this.www?.currentScroll ?? this.targets.source;
	}

	public dispose(): void {
		this.mapPolling.leave();
	}

	private changeMode(next: WorkbenchViewMode): void {
		if (this.currentMode === next) return;
		const wasMap = this.currentMode === "map";
		this.currentMode = next;
		if (!wasMap && next === "map") this.mapPolling.enter();
		if (wasMap && next !== "map") this.mapPolling.leave();
	}
}

function isObservabilityMode(mode: WorkbenchViewMode): mode is ObservabilityViewMode {
	return mode === "stats" || mode === "dashboard" || mode === "monitor";
}
