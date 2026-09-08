import { cpus, platform, release } from "node:os";
import { projectWorkFlow } from "../src/core/domain/work-steps";
import { WorkbenchChatView } from "../src/adapters/inbound/tui/chat/workbench-views";

const count = 5_000;
const activities = Array.from({ length: count }, (_, index) => ({
	schemaVersion: 1 as const,
	id: `activity-${index}`,
	projectId: "chat-render-benchmark",
	sequence: index + 1,
	recordedAt: "2026-09-07T00:00:00.000Z",
	kind: "message" as const,
	phase: "completed" as const,
	provider: "openai-codex",
	nativeRefs: { threadId: "thread", turnId: `turn-${index}`, itemId: `message-${index}` },
	sourceDigest: `sha256:${"a".repeat(64)}`,
	payload: { role: "assistant", text: `message ${index}` },
}));
const snapshot = {
	projectId: "chat-render-benchmark", revision: 1, journalSequence: count, phase: "ready" as const,
	mcpServers: [], threadId: "thread", activeTurnId: null, activities, selectedActivityId: null,
	pendingApproval: null,
	chat: activities.map((activity, index) => ({
		id: `message-${index}`, role: "assistant" as const, content: index === count - 1 ? "```ts\n" + "const value = 42;\n".repeat(2_000) + "```" : `message ${index}`,
		activityId: activity.id, status: "completed" as const,
	})),
	chatQueue: [], draft: "", reasoningDraft: "", liveActivity: null, workFlow: projectWorkFlow([]),
	tnotes: [], todo: null, actionResult: null, error: null,
};
const samples = [];
for (let sample = 0; sample < 5; sample += 1) {
  const start = performance.now();
  const view = new WorkbenchChatView(snapshot);
  const constructed = performance.now();
  const rows = view.render(80);
  const rendered = performance.now();
  for (let frame = 0; frame < 50; frame += 1) view.render(80);
  const scrolled = performance.now();
  view.render(40);
  view.render(120);
  const resized = performance.now();
  view.dispose();
  samples.push({ rows: rows.length, constructMs: constructed - start, renderMs: rendered - constructed,
    scrollFrameMs: (scrolled - rendered) / 50, resizePairMs: resized - scrolled });
}
console.log(JSON.stringify({ count, contentUtf8Bytes: snapshot.chat.reduce((n, message) => n + Buffer.byteLength(message.content), 0),
  columns: [80, 40, 120], cpu: cpus()[0]?.model, os: `${platform()} ${release()}`, bun: Bun.version, samples }));
