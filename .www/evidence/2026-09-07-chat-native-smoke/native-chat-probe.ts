import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexAppServer } from "../../../src/infrastructure/executors/codex-app-server";
import { ProjectWorkbench, type WorkbenchActivityJournal } from "../../../src/application/project-workbench";
import type { ExecutorPort } from "../../../src/application/ports/executor-port";
import type { ProjectActivity, ProjectActivityInput, ProjectActivityAppendResult } from "../../../src/domain/project-activity";
import { WorkbenchChatView } from "../../../src/presentation/tui/workbench-views";
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
const port: ExecutorPort = {
 startThread: input => server.startThread({ ...input, ephemeral: true }),
 startTurn: input => server.startTurn(input), resumeThread: input => server.resumeThread(input),
 readThread: input => server.readThread(input), listThreads: input => server.listThreads(input),
 interruptTurn: input => server.interruptTurn(input), respondToApproval: input => server.respondToApproval(input),
 subscribe: listener => server.subscribe(listener), close: () => server.close(),
};
const wb = new ProjectWorkbench(port, new Journal(), { projectId:"native-chat-probe", cwd, model:"gpt-5.6-sol", effort:"low", approvalPolicy:"never", sandbox:"read-only" });
const views: unknown[] = [];
let maxUsers = 0, sawDraft = false;
const unsubscribe = wb.subscribe(snapshot => {
 maxUsers = Math.max(maxUsers, snapshot.chat.filter(message => message.role === "user").length);
 if (snapshot.draft) sawDraft = true;
});
let outcome = "pending";
try {
 await wb.dispatch({ type:"chat.send", text:"연결 확인용입니다. 도구 없이 다음 한 줄만 출력하세요: 안녕하세요 👋 연결 확인" });
 const deadline = Date.now()+45000;
 while(Date.now()<deadline) {
   const snapshot = wb.snapshot;
   if(snapshot.error) { outcome="error: "+snapshot.error; break; }
   if(snapshot.activeTurnId===null && snapshot.chat.some(m=>m.role==="assistant" && m.status==="completed")) { outcome="completed"; break; }
   await Bun.sleep(100);
 }
 if(outcome==="pending") outcome="timeout";
 const view = new WorkbenchChatView(wb.snapshot);
 for(const width of [40,80,120]) {
   const rows=view.render(width).map(stripTerminalSequences);
   views.push({width, rows, overflow:rows.filter(row=>visibleWidth(row)>width).length});
 }
 const report={recordedAt:new Date().toISOString(),outcome,model:"gpt-5.6-sol",maxUsers,sawDraft,chat:wb.snapshot.chat,views,scope:"real Native -> ProjectWorkbench -> real component rendering; ephemeral thread + in-memory journal; not PTY/keyboard/resume acceptance"};
 await writeFile(join(import.meta.dir,"2026-09-07-native-chat-probe.json"),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
} finally {unsubscribe(); await wb.close();}
