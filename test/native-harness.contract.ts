import { expect } from "bun:test";
import type { ExecutorPort } from "../src/application/ports/executor-port.js";
import type { NativeHarnessEvent } from "../src/domain/native-session.js";

export interface NativeHarnessContractFixture {
	readonly harness: ExecutorPort;
	settleSuccess(text?: string): void;
	settleFailure(error?: Error): void;
	settleInterrupted(): void;
	emitReasoning(text: string): void;
}

export async function assertPhaseANativeHarnessContract(create: () => Promise<NativeHarnessContractFixture>): Promise<void> {
	const fixture = await create();
	const events: NativeHarnessEvent[] = [];
	fixture.harness.subscribe(event => events.push(event));
	const thread = await fixture.harness.startThread({ cwd: "/workspace" });

	const receipt = await fixture.harness.startTurn({ threadId: thread.id, text: "answer this" });
	expect(receipt.threadId).toBe(thread.id);
	expect(events).toEqual([]);
	await Bun.sleep(5);
	expect(events.map(event => event.type === "notification" ? event.method : event.type)).toEqual(["turn/started"]);

	fixture.emitReasoning("hidden reasoning");
	fixture.settleSuccess("visible answer");
	await Bun.sleep(5);
	expect(events.map(event => event.type === "notification" ? event.method : event.type)).toEqual([
		"turn/started",
		"item/agentMessage/delta",
		"item/completed",
		"turn/completed",
	]);
	expect(events[1]).toEqual({
		type: "notification",
		method: "item/agentMessage/delta",
		refs: { threadId: thread.id, turnId: receipt.id, itemId: `pi-message-${receipt.id}` },
		params: { delta: "visible answer" },
	});
	expect(events[2]).toMatchObject({
		type: "notification",
		method: "item/completed",
		params: { item: { type: "agentMessage", text: "visible answer" } },
	});
	expect(events.some(event => JSON.stringify(event).includes("hidden reasoning"))).toBe(false);

	await fixture.harness.close();
	fixture.settleSuccess("late answer");
	await Promise.resolve();
	expect(events).toHaveLength(4);
}

export async function assertPhaseATerminalContract(
	create: () => Promise<NativeHarnessContractFixture>,
	settle: (fixture: NativeHarnessContractFixture) => void,
	expectedTerminal: "turn/completed" | "turn/failed" | "turn/interrupted",
): Promise<void> {
	const fixture = await create();
	const events: NativeHarnessEvent[] = [];
	fixture.harness.subscribe(event => events.push(event));
	const thread = await fixture.harness.startThread({ cwd: "/workspace" });
	const receipt = await fixture.harness.startTurn({ threadId: thread.id, text: "answer this" });
	await Bun.sleep(5);
	settle(fixture);
	settle(fixture);
	await Bun.sleep(5);
	expect(events.filter(event => event.type === "notification" && event.refs.turnId === receipt.id)
		.filter(event => event.type === "notification" && (event.method === "turn/started" || event.method.startsWith("turn/")))
		.map(event => event.type === "notification" ? event.method : event.type)).toEqual(["turn/started", expectedTerminal]);
}
