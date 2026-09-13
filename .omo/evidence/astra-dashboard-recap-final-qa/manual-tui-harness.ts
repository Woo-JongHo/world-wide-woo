import { ProcessTerminal } from "@earendil-works/pi-tui";
import { astraFixture } from "../../../test/fixtures/astra-snapshot";
import { projectConversationRecap } from "../../../src/core/domain/work/conversation-recap";
import { runProjectWorkbenchShell } from "../../../src/adapters/inbound/tui/shell/workbench-shell";

const scenario = process.env.QA_CASE ?? "recap";
const observationPath = process.env.QA_OBSERVATION_LOG;
if (!observationPath) throw new Error("QA_OBSERVATION_LOG is required");

let snapshot = astraFixture(scenario === "working" ? "working" : "ready");
const dispatches: unknown[] = [];
let listener: (next: typeof snapshot) => void = () => {};
if (scenario === "recap") {
  snapshot.chat = [
    { id: "qa-user", activityId: "qa-user", role: "user", content: "Check token sk-manual-recap-secret and confirm this public request.", status: "completed" },
    { id: "qa-assistant", activityId: "qa-assistant", role: "assistant", content: "<analysis>PRIVATE_ANALYSIS_SENTINEL</analysis>\n<answer>PUBLIC_ANSWER_SENTINEL</answer>", status: "completed", toolPayload: "PRIVATE_TOOL_SENTINEL" },
    { id: "qa-system", activityId: "qa-system", role: "system", content: "PRIVATE_SYSTEM_SENTINEL", status: "completed" },
  ] as typeof snapshot.chat;
}
if (scenario === "bounds") {
  snapshot.chat = Array.from({ length: 12 }, (_, index) => ({
    id: `qa-${index}`,
    activityId: `qa-${index}`,
    role: index % 2 === 0 ? "user" : "assistant",
    content: `${index}:${"가".repeat(500)}`,
    status: "completed",
  })) as typeof snapshot.chat;
}
if (scenario === "approval") {
  snapshot.pendingApproval = {
    requestId: 99,
    callbackId: null,
    kind: "command",
    refs: {},
    availableDecisions: ["accept", "decline"],
    params: { command: "git status", reason: "manual Escape QA" },
  };
}
const saveObservation = async (): Promise<void> => {
  const recap = projectConversationRecap(snapshot.chat);
  await Bun.write(observationPath, JSON.stringify({
    scenario,
    phase: snapshot.phase,
    pendingApprovalRequestId: snapshot.pendingApproval?.requestId ?? null,
    dispatches,
    recap: {
      sourceMessageCount: recap.sourceMessageCount,
      entryCount: recap.entries.length,
      omittedMessageCount: recap.omittedMessageCount,
      truncated: recap.truncated,
      entryCodePointLengths: recap.entries.map(entry => Array.from(entry.text).length),
      entryPrefixes: recap.entries.map(entry => entry.text.slice(0, 2)),
      totalCodePoints: recap.entries.reduce((total, entry) => total + Array.from(entry.text).length, 0),
    },
  }, null, 2) + "\n");
};
await saveObservation();
const workbench = {
  get snapshot() { return snapshot; },
  subscribe(nextListener: typeof listener) { listener = nextListener; listener(snapshot); return () => { listener = () => {}; }; },
  async dispatch(command: unknown) {
    dispatches.push(command);
    if (typeof command === "object" && command !== null && "type" in command && command.type === "chat.cancel") {
      snapshot = { ...snapshot, phase: "ready", activeTurnId: null, liveActivity: null };
      listener(snapshot);
    }
    await saveObservation();
    return { state: "accepted", commandId: `qa-${dispatches.length}` };
  },
  async close() {},
};
runProjectWorkbenchShell({
  design: "astra",
  terminal: new ProcessTerminal(),
  cwd: `/tmp/astra-manual-${scenario}`,
  workbench: workbench as never,
  usage: { async refresh() { return []; }, startPolling(onUpdate: (value: never[]) => void) { onUpdate([]); return () => {}; } } as never,
  auth: { methods: () => [], async status(provider: string) { return { state: "configured", provider, type: "oauth", source: "fixture" }; }, async login() { throw new Error("unexpected login"); }, async logout() {} } as never,
  composerDraft: { initialText: "", async save() {}, async clear() {} },
  releaseSessionLease: async () => {},
});
