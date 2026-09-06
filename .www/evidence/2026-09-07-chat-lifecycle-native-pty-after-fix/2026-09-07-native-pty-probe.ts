import { appendFileSync, writeFileSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexAppServer } from "../../src/infrastructure/executors/codex-app-server";
import { ProjectWorkbench, type WorkbenchActivityJournal } from "../../src/application/project-workbench";
import type { ExecutorPort } from "../../src/application/ports/executor-port";
import type { ProjectActivity, ProjectActivityInput, ProjectActivityAppendResult } from "../../src/domain/project-activity";
import { WorkbenchChatView } from "../../src/presentation/tui/workbench-views";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
class Journal implements WorkbenchActivityJournal {
 records: ProjectActivity[] = [];
 async readAll() { return this.records; }
 async append(input: ProjectActivityInput): Promise<ProjectActivityAppendResult> {
   const activity: ProjectActivity = { ...input, schemaVersion: 1, id: `probe-${this.records.length+1}`, sequence: this.records.length+1, recordedAt: new Date().toISOString() };
   this.records.push(activity); return { activity, appended: true };
 }
}
const cwd = await mkdtemp(join(tmpdir(), "www-native-chat-"));
const server = await CodexAppServer.connect();
server.subscribe(event => {
 if (event.type !== "notification") return;
 if (!event.method.startsWith("turn/") && event.method !== "item/completed") return;
 const params = event.params as any;
 appendFileSync(join(import.meta.dir,"2026-09-07-native-pty-events.jsonl"),JSON.stringify({method:event.method,refs:event.refs,turnStatus:params.turn?.status,turnError:params.turn?.error,itemType:params.item?.type,itemStatus:params.item?.status,textType:typeof params.item?.text,contentTypes:Array.isArray(params.item?.content)?params.item.content.map((c:any)=>c.type):undefined})+"\n");
});
const port: ExecutorPort = {
 startThread: input => server.startThread({ ...input, ephemeral: true }),
 startTurn: input => server.startTurn(input), resumeThread: input => server.resumeThread(input),
 readThread: input => server.readThread(input), listThreads: input => server.listThreads(input),
 interruptTurn: input => server.interruptTurn(input), respondToApproval: input => server.respondToApproval(input),
 subscribe: listener => server.subscribe(listener), close: () => server.close(),
};
const wb = new ProjectWorkbench(port, new Journal(), { projectId:"native-chat-probe", cwd, model:"gpt-5.6-sol", effort:"low", approvalPolicy:"never", sandbox:"read-only" });
const { runProjectWorkbenchShell } = await import("../../src/presentation/tui/workbench-shell");
wb.subscribe(snapshot => {
 writeFileSync(join(import.meta.dir,"2026-09-07-native-pty-state.json"), JSON.stringify({phase:snapshot.phase,threadId:snapshot.threadId,activeTurnId:snapshot.activeTurnId,draft:!!snapshot.draft,chat:snapshot.chat,error:snapshot.error}));
});
runProjectWorkbenchShell({workbench:wb,cwd,usage:{refresh:async()=>[],startPolling:()=>()=>{}}});
