import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProjectWorkbenchSession } from "../../../src/infrastructure/project-workbench-session.js";
import { CodexAppServer } from "../../../src/infrastructure/executors/codex-app-server.js";
import type { ExecutorPort } from "../../../src/application/ports/executor-port.js";
import { WorkbenchChatView } from "../../../src/presentation/tui/workbench-views.js";
import { stripTerminalSequences } from "@earendil-works/pi-tui";

const evidenceDirectory = import.meta.dir;
const outputPath = join(evidenceDirectory, `replay-${Date.now()}-result.json`);
const model = "gpt-5.6-sol";
const effort = "low";
const normalPrompt = "도구를 사용하거나 파일을 만들지 마세요. 정확히 다음 한 줄만 답하세요: 재개 정상 확인";
const normalAnswer = "재개 정상 확인";
const interruptPrompt = "도구를 사용하거나 파일을 만들지 마세요. 숫자와 짧은 한글 문장을 400줄 이상 작성하세요. 1번부터 즉시 시작하세요.";
const sourceFiles = [
  "src/infrastructure/project-workbench-session.ts",
  "src/infrastructure/executors/codex-app-server.ts",
  "src/infrastructure/activity-journal-store.ts",
  "src/application/project-workbench.ts",
  "src/presentation/tui/workbench-views.ts",
];

const digest = (value: string | Uint8Array) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const fingerprints = Object.fromEntries(await Promise.all(sourceFiles.map(async path => [path, digest(await readFile(join(evidenceDirectory, "../../..", path)))])));
const workspace = await mkdtemp(join(tmpdir(), "www-native-chat-resume-"));
const serverEvents: Array<Record<string, unknown>> = [];
const phases: Array<Record<string, unknown>> = [];
let rawServer: CodexAppServer | undefined;

function publicRefs(value: { threadId?: string; turnId?: string; itemId?: string }): Record<string, string> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => typeof entry === "string" && entry.length > 0)) as Record<string, string>;
}

async function connectReadOnlyNative(): Promise<ExecutorPort> {
  const server = await CodexAppServer.connect({ requestTimeoutMs: 45_000 });
  rawServer = server;
  server.subscribe(event => {
    if (event.type !== "notification") return;
    if (event.method !== "turn/completed" && event.method !== "item/completed") return;
    const params = event.params as Record<string, unknown>;
    const item = params.item as Record<string, unknown> | undefined;
    serverEvents.push({
      method: event.method,
      refs: publicRefs(event.refs),
      turnStatus: (params.turn as Record<string, unknown> | undefined)?.status,
      itemType: item?.type,
      itemStatus: item?.status,
    });
  });
  return {
    startThread: input => server.startThread({ ...input, model, effort, approvalPolicy: "never", sandbox: "read-only", ephemeral: false }),
    resumeThread: input => server.resumeThread({ ...input, model, effort, approvalPolicy: "never", sandbox: "read-only" }),
    readThread: input => server.readThread(input),
    listThreads: input => server.listThreads(input),
    startTurn: input => server.startTurn({ ...input, model, effort, approvalPolicy: "never" }),
    interruptTurn: input => server.interruptTurn(input),
    respondToApproval: input => server.respondToApproval(input),
    subscribe: listener => server.subscribe(listener),
    close: () => server.close(),
  };
}

async function open(resumeThreadId?: string) {
  return createProjectWorkbenchSession(workspace, { resumeThreadId, model, effort }, { connectNative: connectReadOnlyNative });
}

async function waitFor(predicate: () => boolean, label: string, timeoutMs = 70_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await Bun.sleep(100);
  }
  throw new Error(`${label} timeout`);
}

function snapshot(session: Awaited<ReturnType<typeof open>>) {
  const state = session.workbench.snapshot;
  return {
    phase: state.phase,
    threadId: state.threadId,
    activeTurnId: state.activeTurnId,
    chat: state.chat.map(message => ({ id: message.id, role: message.role, status: message.status, partial: message.partial === true, content: message.content, activityId: message.activityId })),
    activities: state.activities.map(activity => ({ sequence: activity.sequence, kind: activity.kind, phase: activity.phase, method: activity.payload.method, refs: publicRefs(activity.nativeRefs) })),
    journalSequence: state.journalSequence,
    activityCount: state.activityCount,
    error: state.error,
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function localJournalNotice(state: ReturnType<typeof snapshot>) {
  const reconciliation = state.activities.find(activity => activity.method === "thread/resume-local-reconciled");
  return {
    text: "재개 화면의 이전 대화는 local activity journal에서 복원되며 Native history는 hydrate하지 않는다.",
    observed: Boolean(reconciliation),
    reconciliationRefs: reconciliation?.refs ?? {},
  };
}

let result: Record<string, unknown>;
try {
  const first = await open();
  await first.workbench.dispatch({ type: "chat.send", text: normalPrompt });
  await waitFor(() => first.workbench.snapshot.activeTurnId === null && first.workbench.snapshot.chat.some(message => message.role === "assistant" && message.status === "completed"));
  const firstState = snapshot(first);
  const threadId = firstState.threadId;
  assert(typeof threadId === "string" && threadId.length > 0, "normal request did not create a native thread");
  const normalUsers = firstState.chat.filter(message => message.role === "user");
  const normalAssistants = firstState.chat.filter(message => message.role === "assistant");
  assert(normalUsers.length === 1 && normalAssistants.length === 1, "normal request chat count was not 1 user + 1 assistant");
  assert(normalAssistants[0]?.content.trim() === normalAnswer, "normal assistant content mismatch");
  assert(normalAssistants[0]?.status === "completed", "normal assistant was not completed");
  phases.push({ name: "normal-completed", state: firstState });
  await first.close();

  const reopened = await open(threadId);
  const reopenedState = snapshot(reopened);
  phases.push({ name: "normal-reopen-before-assertions", state: reopenedState });
  const normalRestored = reopenedState.chat.filter(message => message.role === "assistant" && message.content.trim() === normalAnswer);
  assert(reopenedState.threadId === threadId, "reopen returned a different native thread");
  assert(reopenedState.chat.length === 2 && normalRestored.length === 1, "normal chat was not restored exactly once after reopen");
  assert(reopenedState.chat[0]?.role === "user" && reopenedState.chat[1]?.role === "assistant", "reopened chat order changed");
  const firstResumeNotice = localJournalNotice(reopenedState);
  assert(firstResumeNotice.observed, "local journal reconciliation activity was missing after reopen");
  const view = new WorkbenchChatView(reopened.workbench.snapshot);
  const resumedFrame = view.render(80).map(stripTerminalSequences);
  view.dispose();
  assert(resumedFrame.join("\n").includes(normalAnswer), "resumed Native Chat frame omitted normal answer");
  phases.push({ name: "normal-reopened", state: reopenedState, frame80: resumedFrame, localJournalNotice: firstResumeNotice });
  await reopened.close();

  const interrupting = await open(threadId);
  await interrupting.workbench.dispatch({ type: "chat.send", text: interruptPrompt });
  await waitFor(() => Boolean(interrupting.workbench.snapshot.draft), "interrupted request draft", 70_000);
  await interrupting.workbench.dispatch({ type: "chat.cancel" });
  await waitFor(() => interrupting.workbench.snapshot.activeTurnId === null, "interrupted request termination", 30_000);
  const interruptedState = snapshot(interrupting);
  const cancelled = interruptedState.chat.filter(message => message.role === "assistant" && message.status === "cancelled");
  assert(cancelled.length === 1, "interrupted request did not produce exactly one cancelled assistant message");
  assert(cancelled[0]?.partial === true, "interrupted assistant was not marked partial");
  assert(cancelled[0]?.content.trim().length > 0, "interrupted assistant omitted public partial content");
  phases.push({ name: "interrupted", state: interruptedState });
  await interrupting.close();

  const resumedInterrupted = await open(threadId);
  const resumedInterruptedState = snapshot(resumedInterrupted);
  const restoredCancelled = resumedInterruptedState.chat.filter(message => message.role === "assistant" && message.status === "cancelled" && message.partial === true);
  assert(resumedInterruptedState.threadId === threadId, "interrupted resume returned a different native thread");
  assert(resumedInterruptedState.chat.length === 4, "interrupted resume did not restore all four chat messages");
  assert(restoredCancelled.length === 1 && restoredCancelled[0]?.content.trim().length > 0, "interrupted partial message did not persist after resume");
  const secondResumeNotice = localJournalNotice(resumedInterruptedState);
  assert(secondResumeNotice.observed, "local journal reconciliation activity was missing after interrupted resume");
  const finalView = new WorkbenchChatView(resumedInterrupted.workbench.snapshot);
  const finalFrame = finalView.render(80).map(stripTerminalSequences);
  finalView.dispose();
  assert(finalFrame.join("\n").includes("중단됨"), "resumed frame omitted cancelled label");
  phases.push({ name: "interrupted-reopened", state: resumedInterruptedState, frame80: finalFrame, localJournalNotice: secondResumeNotice });
  await resumedInterrupted.close();

  result = { recordedAt: new Date().toISOString(), outcome: "passed", model, effort, nativePolicy: { approvalPolicy: "never", sandbox: "read-only", ephemeral: false }, workspaceKind: "temporary and removed after capture", sourceFingerprints: fingerprints, phases, nativeTerminalEvents: serverEvents, scope: "Actual createProjectWorkbenchSession → CodexAppServer → file ActivityJournalStore persistence. Only public chat/activity content and Native refs are retained; reasoning text is excluded." };
} catch (error) {
  result = { recordedAt: new Date().toISOString(), outcome: "failed", model, effort, nativePolicy: { approvalPolicy: "never", sandbox: "read-only", ephemeral: false }, workspaceKind: "temporary and removed after capture", sourceFingerprints: fingerprints, phases, nativeTerminalEvents: serverEvents, failure: error instanceof Error ? { name: error.name, message: error.message } : String(error) };
} finally {
  await rawServer?.close().catch(() => undefined);
  await rm(workspace, { recursive: true, force: true });
}
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ outcome: result.outcome, outputPath }));
if (result.outcome !== "passed") process.exitCode = 1;
