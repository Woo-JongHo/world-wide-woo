import { CodexAppServer } from "../../../src/adapters/outbound/execution/codex-app-server.ts";
import { ProjectWorkbench, type WorkbenchActivityJournal } from "../../../src/core/application/orchestration/project-workbench.ts";
import type { ProjectActivity, ProjectActivityAppendResult, ProjectActivityInput } from "../../../src/core/domain/execution/project-activity.ts";

class MemoryJournal implements WorkbenchActivityJournal {
	private readonly rows: ProjectActivity[] = [];
	async append(input: ProjectActivityInput): Promise<ProjectActivityAppendResult> {
		const activity = { ...input, schemaVersion: 1 as const, id: `smoke-${this.rows.length + 1}`, sequence: this.rows.length + 1, recordedAt: new Date().toISOString() } as ProjectActivity;
		this.rows.push(activity); return { activity, appended: true };
	}
	async readAll(): Promise<ProjectActivity[]> { return [...this.rows]; }
	hasBoundThread(): boolean { return true; }
}

const server = await CodexAppServer.connect();
const journal = new MemoryJournal();
const workbench = new ProjectWorkbench(server, journal, { projectId: "current-native-smoke", cwd: process.cwd(), model: "gpt-5.6-sol", effort: "low", approvalPolicy: "never", sandbox: "read-only" });
try {
	await workbench.waitUntilReady();
	await workbench.dispatch({ type: "chat.send", text: "도구 없이 한 줄로 연결 상태만 답하세요: 연결 확인" });
	const deadline = Date.now() + 45_000;
	while (Date.now() < deadline && (workbench.snapshot.activeTurnId !== null || !workbench.snapshot.chat.some(message => message.role === "assistant" && message.status === "completed"))) await Bun.sleep(100);
	console.log(JSON.stringify({ threadId: workbench.snapshot.threadId, activeTurnId: workbench.snapshot.activeTurnId, model: workbench.snapshot.activeModel, phase: workbench.snapshot.phase, assistant: workbench.snapshot.chat.filter(message => message.role === "assistant"), activityCount: workbench.snapshot.activities.length, timeout: workbench.snapshot.activeTurnId !== null }, null, 2));
} finally { await workbench.close(); }
