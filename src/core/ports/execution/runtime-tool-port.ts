/** Host-owned tools. Registration does not attest that native built-ins are isolated. */
export interface RuntimeToolDefinition {
	readonly name        : string                            ;
	readonly description : string                            ;
	readonly inputSchema : Readonly<Record<string, unknown>> ;
}
export interface RuntimeToolCall {
	readonly threadId  : string  ;
	readonly turnId    : string  ;
	readonly callId    : string  ;
	readonly tool      : string  ;
	readonly arguments : unknown ;
}
export interface RuntimeToolResult {
	readonly success: boolean;
	readonly text: string
}
export type RuntimeToolHandler = (call: RuntimeToolCall) => Promise<RuntimeToolResult>;
