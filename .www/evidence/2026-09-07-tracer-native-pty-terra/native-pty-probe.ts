import { appendFileSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexAppServer } from "../../../src/infrastructure/executors/codex-app-server";
import { ProjectWorkbench, type WorkbenchActivityJournal } from "../../../src/application/project-workbench";
import type { ExecutorPort } from "../../../src/application/ports/executor-port";
import type { ProjectActivity, ProjectActivityAppendResult, ProjectActivityInput } from "../../../src/domain/project-activity";

const artifactDirectory = import.meta.dir;

class Journal implements WorkbenchActivityJournal {
	public records: ProjectActivity[] = [];
	public async readAll(): Promise<ProjectActivity[]> { return this.records; }
	public async append(input: ProjectActivityInput): Promise<ProjectActivityAppendResult> {
		const activity: ProjectActivity = {
			...input,
			schemaVersion: 1,
			id: `terra-${this.records.length + 1}`,
			sequence: this.records.length + 1,
			recordedAt: new Date().toISOString(),
		};
		this.records.push(activity);
		return { activity, appended: true };
	}
}

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function writeState(snapshot: ReturnType<ProjectWorkbench["snapshot"]>): void {
	writeFileSync(join(artifactDirectory, "state.json"), JSON.stringify({
		phase: snapshot.phase,
		threadId: snapshot.threadId,
		activeTurnId: snapshot.activeTurnId,
		selectedActivityId: snapshot.selectedActivityId,
		activities: snapshot.activities.map((activity) => ({
			id: activity.id,
			sequence: activity.sequence,
			kind: activity.kind,
			phase: activity.phase,
			title: activity.title,
			nativeRefs: activity.nativeRefs,
			method: activity.payload.method,
		})),
		workFlow: {
			source: snapshot.workFlow.source,
			steps: snapshot.workFlow.steps.map((step) => ({
				id: step.id,
				number: step.number,
				status: step.status,
				association: step.association,
			})),
		},
	}, null, 2));
}

const cwd = await mkdtemp(join(tmpdir(), "www-tracer-native-"));
const server = await CodexAppServer.connect();
server.subscribe((event) => {
	if (event.type !== "notification") return;
	if (!event.method.startsWith("turn/") && event.method !== "item/completed") return;
	const params = record(event.params);
	const turn = record(params.turn);
	const item = record(params.item);
	appendFileSync(join(artifactDirectory, "events.jsonl"), `${JSON.stringify({
		method: event.method,
		refs: event.refs,
		turnStatus: turn.status ?? null,
		itemType: item.type ?? null,
		itemStatus: item.status ?? null,
		textType: typeof item.text,
		contentTypes: Array.isArray(item.content) ? item.content.map((content) => record(content).type ?? null) : [],
	})}\n`);
});

const port: ExecutorPort = {
	startThread: (input) => server.startThread({ ...input, ephemeral: true }),
	startTurn: (input) => server.startTurn(input),
	resumeThread: (input) => server.resumeThread(input),
	readThread: (input) => server.readThread(input),
	listThreads: (input) => server.listThreads(input),
	interruptTurn: (input) => server.interruptTurn(input),
	respondToApproval: (input) => server.respondToApproval(input),
	subscribe: (listener) => server.subscribe(listener),
	close: () => server.close(),
};
const workbench = new ProjectWorkbench(port, new Journal(), {
	projectId: "tracer-native-terra",
	cwd,
	model: "gpt-5.6-sol",
	effort: "low",
	approvalPolicy: "never",
	sandbox: "read-only",
});
workbench.subscribe(writeState);
const { runProjectWorkbenchShell } = await import("../../../src/presentation/tui/workbench-shell");
runProjectWorkbenchShell({ workbench, cwd, usage: { refresh: async () => [], startPolling: () => () => {} } });
