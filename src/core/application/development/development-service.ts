import type { ProjectActivity } from "../../domain/execution/project-activity";

/** UI and capture boundary; adapters own storage, execution and URI opening. */
export interface DevelopmentServicePorts {
	execute(args: readonly string[]): Promise<string>;
	capture(activity: ProjectActivity): void;
	checkpoint(requestId: string): Promise<string>;
	prepareCheckpoint?(requestId: string): () => Promise<string>;
	close?(): void;
}

/** @linear WOO-697 */
/** @Unit Code-012 */
export class DevelopmentService {
	private error: string | null = null;
	private exports: Promise<void> = Promise.resolve();
	constructor(readonly runId: string, private readonly ports: DevelopmentServicePorts) {}

	/** Capture is synchronous: the binding cannot change while an event is queued. */
	observe(activity: ProjectActivity): void {
		try { this.ports.capture(activity); }
		catch (error) { this.error = String(error); throw error; }
		if (activity.kind === "progress" && activity.payload.method === "turn/completed") {
			const requestId = `turn:${activity.nativeRefs.turnId ?? activity.id}`;
			let exportFrozen: () => Promise<string>;
			try { exportFrozen = this.ports.prepareCheckpoint?.(requestId) ?? (() => this.ports.checkpoint(requestId)); }
			catch (error) { this.error = String(error); throw error; }
			this.exports = this.exports.then(async () => {
				try { await exportFrozen(); }
				catch (error) { this.error = String(error); }
			});
		}
	}

	async execute(args: readonly string[]): Promise<string> {
		const result = await this.ports.execute(args);
		return args[0] === "status" && this.error ? `${result}\n기록 오류: ${this.error}` : result;
	}

	async close(): Promise<void> { await this.exports; this.ports.close?.(); }
}

/** Returns null for unrelated commands, preserving the existing /map view. */
export async function executeDevelopmentShellCommand(text: string, service?: Pick<DevelopmentService, "execute">): Promise<string | null> {
	const args = text.trim().split(/\s+/u);
	if (args[0] === "/work") args.shift();
	else if (args[0] === "/map" && (args[1] === "issue" || args[1] === "unit")) {
		args.shift(); args.unshift("map");
	} else return null;
	if (!service) return "개발 기록 서비스를 사용할 수 없습니다.";
	try { return await service.execute(args.length ? args : ["status"]); }
	catch (error) { return `개발 기록 오류: ${error instanceof Error ? error.message : String(error)}`; }
}
