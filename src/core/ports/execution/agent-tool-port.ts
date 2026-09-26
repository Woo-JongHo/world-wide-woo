import type { Tool }               from "@earendil-works/pi-ai";
import type { ToolResultSnapshot } from "@/core/domain/execution/output";

export interface AgentToolExecution {
	modelContent : string             ;
	isError      : boolean            ;
	snapshot     : ToolResultSnapshot ;
}

export interface AgentTool {
	readonly definition: Tool;
	execute(arguments_: Record<string, unknown>, signal: AbortSignal): Promise<AgentToolExecution>;
}
