import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import type { RuntimeMonitorProjection, RuntimeMonitorState } from "../../domain/runtime-monitor.js";
import { colors } from "./theme.js";

export class RuntimeMonitorView implements Component {
	public constructor(
		private readonly getMonitor: () => RuntimeMonitorProjection,
		private readonly now: () => number = Date.now,
	) {}
	public invalidate(): void {}
	public render(width: number): string[] {
		const size=Math.max(1,Math.min(156,width)); const data=this.getMonitor();
		const rows:string[]=[colors.accent("WORLD WIDE WOO · LIVE MONITOR"),stateLine(data.state),rule(size)];
		if(data.state==="idle") rows.push("No active execution.");
		else {
			section(rows,"CURRENT EXECUTION",size);
			rows.push(`Request  ${data.activeRequest?.label ?? "—"}${data.activeRequest ? ` · ${elapsedAt(data.activeRequest.elapsed, this.now())}` : ""}`);
			rows.push(`Model    ${data.model ?? "—"}    Agent  ${data.agent ?? "—"}`);
			if(data.currentTool){section(rows,"CURRENT TOOL",size);rows.push(`${data.currentTool.label}  ············  ${elapsedAt(data.currentTool.elapsed, this.now())}`);}
			if(data.approval?.pending) rows.push(colors.warning(`◐ WAITING FOR APPROVAL · ${data.approval.elapsed ? elapsedAt(data.approval.elapsed, this.now()) : "—"}`));
		}
		section(rows,"ACTIVITY",size);
		for(const event of data.recentEvents) rows.push(`${event.recordedAt.slice(11,19)}  ${pad(event.kind,10)}  ${truncateToWidth(event.label,size-22)}`);
		if(!data.recentEvents.length) rows.push(colors.muted("No recent activity."));
		section(rows,"STATUS",size);rows.push(`Retry ${data.retryCount} · Failure ${data.failureCount} · Approval ${data.approval?.pending?"waiting":"—"}`);
		rows.push(rule(size),colors.muted("r next · R prev · 1 Stats · 2 Dashboard · [3 Monitor] · Esc back"));
		const offset=Math.max(0,Math.floor((width-size)/2));return rows.map(row=>`${" ".repeat(offset)}${truncateToWidth(row,size)}`);
	}
}
function stateLine(state:RuntimeMonitorState):string{if(state==="running")return colors.accent("● RUNNING");if(state==="waiting")return colors.warning("◐ WAITING");if(state==="blocked")return colors.warning("! BLOCKED");if(state==="failed")return colors.error("✕ FAILED");if(state==="completed")return colors.success("✓ COMPLETED");return colors.muted("○ IDLE");}
function section(rows:string[],title:string,width:number):void{const label=` ${title} `;rows.push(colors.border(`${label}${"─".repeat(Math.max(0,width-visibleWidth(label)))}`));}
function rule(width:number):string{return colors.border("─".repeat(width));}
function pad(value:string,width:number):string{const text=truncateToWidth(value,width);return text+" ".repeat(Math.max(0,width-visibleWidth(text)));}
function elapsed(value:number|null):string{return value===null?"observed":""+(value<60_000?`${Math.round(value/100)/10}s`:`${Math.floor(value/60_000)}m${String(Math.round(value%60_000/1000)).padStart(2,"0")}s`);}
function elapsedAt(value:{readonly startedAt:string;readonly elapsedMs:number|null},now:number):string{return elapsed(value.elapsedMs ?? Math.max(0,now-Date.parse(value.startedAt))); }
