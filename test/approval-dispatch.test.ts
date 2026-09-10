import { describe, expect, test } from "bun:test";
import {
	ApprovalDeliveryUncertainError,
	ApprovalResponseDispatcher,
	dispatchApprovalResponse,
	type ApprovalResponseObservation,
} from "../src/core/application/orchestration/approval-dispatch.js";
import type { NativeApprovalRequest, NativeApprovalResolution } from "../src/core/domain/execution/native-session.js";
import { ActivityJournalStore, digestActivitySource } from "../src/adapters/outbound/persistence/activity-journal-store.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const request: NativeApprovalRequest = {
	requestId: 17,
	callbackId: "callback-17",
	kind: "permissions",
	refs: { threadId: "thread-1", turnId: "turn-1" },
	availableDecisions: [],
	params: { command: "dangerous" },
};

const digestSource = (source: string): string => `digest:${source}`;
const serializeEvidence = (value: unknown) => ({ value: { bounded: JSON.stringify(value).slice(0, 24) }, omitted: true });

describe("dispatchApprovalResponse", () => {
	test("awaits immutable preparation evidence before sending the exact signed response", async () => {
		const observations: ApprovalResponseObservation[] = [];
		const order: string[] = [];
		let releasePreparation!: () => void;
		const preparation = new Promise<void>((resolve) => { releasePreparation = resolve; });
		const response = { permissions: { filesystem: { write: true } }, scope: "turn" as const, strictAutoReview: false };
		const transmissions: NativeApprovalResolution[] = [];
		const dispatch = dispatchApprovalResponse({ commandId: "command-1", request, response }, {
			digestSource,
			serializeEvidence,
			record: async (entry) => {
				observations.push(entry);
				order.push(entry.payload.method as string);
				if (entry.payload.operation === "approval/response-prepared") await preparation;
			},
			respondToApproval: async (resolution) => { transmissions.push(resolution); order.push("send"); },
		});
		await Promise.resolve();
		expect(transmissions).toHaveLength(0);
		(response.permissions.filesystem as { write: boolean }).write = false;
		releasePreparation();
		const result = await dispatch;

		expect(transmissions).toEqual([{ requestId: 17, response: { permissions: { filesystem: { write: true } }, scope: "turn", strictAutoReview: false } }]);
		expect(order).toEqual(["governance/decision-prepared", "send", "governance/decision-dispatched"]);
		expect(result.state).toBe("delivered");
		expect(observations[0]?.nativeRefs).toEqual({ threadId: "thread-1", turnId: "turn-1", approvalRequestId: 17, approvalCallbackId: "callback-17" });
		expect(observations[0]?.payload).toMatchObject({ commandId: "command-1", responseEvidenceOmitted: true });
		expect(observations[0]?.sourceDigest).not.toBe(result.responseDigest);
		expect(observations[0]?.sourceDigest).toContain('"commandId":"command-1"');
		expect(Object.isFrozen(observations[0])).toBe(true);
	});

	test("does not send when preparation persistence fails", async () => {
		let sends = 0;
		await expect(dispatchApprovalResponse({ commandId: "command-2", request, response: { decision: "decline" } }, {
			digestSource,
			serializeEvidence,
			record: async () => { throw new Error("disk full"); },
			respondToApproval: async () => { sends += 1; },
		})).rejects.toThrow("disk full");
		expect(sends).toBe(0);
	});

	test("records a truthful uncertain delivery after a send rejection without spoofing authority", async () => {
		const observations: ApprovalResponseObservation[] = [];
		const result = await dispatchApprovalResponse({ commandId: "command-3", request, response: { decision: "acceptForSession" } }, {
			digestSource,
			serializeEvidence,
			record: async (entry) => { observations.push(entry); },
			respondToApproval: async () => { throw new Error("socket closed after write"); },
		});

		expect(result).toMatchObject({ state: "uncertain" });
		if (result.state !== "uncertain") throw new Error("expected uncertain approval delivery");
		expect(result.reason).not.toContain("socket closed after write");
		expect(observations.map((entry) => entry.payload.method)).toEqual([
			"governance/decision-prepared",
			"governance/decision-uncertain",
		]);
		expect(observations[1]?.payload).not.toHaveProperty("approved");
		expect(observations[1]?.payload).not.toHaveProperty("accepted");
	});

	test("treats delivery-audit failure as uncertain even after Native resolves before send returns", async () => {
		const order: string[] = [];
		await expect(dispatchApprovalResponse({ commandId: "command-4", request, response: { decision: "cancel" } }, {
			digestSource,
			serializeEvidence,
			record: async (entry) => {
				order.push(entry.payload.method as string);
				if (entry.payload.operation === "approval/response-delivered") throw new Error("audit unavailable");
			},
			respondToApproval: async () => { order.push("native-resolved"); },
		})).rejects.toBeInstanceOf(ApprovalDeliveryUncertainError);
		expect(order).toEqual(["governance/decision-prepared", "native-resolved", "governance/decision-dispatched"]);
	});

	test("blocks a resend after a send failure leaves delivery uncertain", async () => {
		let sends = 0;
		const dispatcher = new ApprovalResponseDispatcher({
			digestSource,
			serializeEvidence,
			record: async () => undefined,
			respondToApproval: async () => { sends += 1; throw new Error("connection lost"); },
		});
		const input = { commandId: "command-5", request, response: { decision: "decline" } as const };
		expect((await dispatcher.dispatch(input)).state).toBe("uncertain");
		await expect(dispatcher.dispatch({ ...input, response: { decision: "accept" } })).rejects.toBeInstanceOf(ApprovalDeliveryUncertainError);
		expect(sends).toBe(1);
		dispatcher.confirmNativeResolved(request);
		expect((await dispatcher.dispatch(input)).state).toBe("uncertain");
		expect(sends).toBe(2);
	});

	test("blocks every decision after a delivered response until Native resolution", async () => {
		let sends = 0;
		const dispatcher = new ApprovalResponseDispatcher({ digestSource, serializeEvidence, record: async () => undefined, respondToApproval: async () => { sends += 1; } });
		expect((await dispatcher.dispatch({ commandId: "sent-1", request, response: { decision: "accept" } })).state).toBe("delivered");
		await expect(dispatcher.dispatch({ commandId: "sent-2", request, response: { decision: "decline" } })).rejects.toBeInstanceOf(ApprovalDeliveryUncertainError);
		expect(sends).toBe(1);
		dispatcher.confirmNativeResolved(request);
		expect((await dispatcher.dispatch({ commandId: "sent-3", request, response: { decision: "decline" } })).state).toBe("delivered");
		expect(sends).toBe(2);
	});

	test("restores prepared and dispatched interlocks after restart until a resolved observation", async () => {
		let sends = 0;
		const observations: ApprovalResponseObservation[] = [];
		const dependencies = { digestSource, serializeEvidence, record: async (entry: ApprovalResponseObservation) => { observations.push(entry); }, respondToApproval: async () => { sends += 1; } };
		await new ApprovalResponseDispatcher(dependencies).dispatch({ commandId: "before-restart", request, response: { decision: "accept" } });
		const resumed = new ApprovalResponseDispatcher(dependencies);
		resumed.restoreInterlocks(observations);
		await expect(resumed.dispatch({ commandId: "after-restart", request, response: { decision: "decline" } })).rejects.toBeInstanceOf(ApprovalDeliveryUncertainError);
		expect(sends).toBe(1);
		resumed.restoreInterlocks([{
			nativeRefs: { threadId: "thread-1", turnId: "turn-1", approvalRequestId: 17 },
			payload: { eventType: "approval-resolved", requestId: 17 },
		}]);
		expect((await resumed.dispatch({ commandId: "after-resolved", request, response: { decision: "decline" } })).state).toBe("delivered");
		expect(sends).toBe(2);
	});

	test("restores a prepared-only crash interlock but ignores request-less observations", async () => {
		let sends = 0;
		const dispatcher = new ApprovalResponseDispatcher({ digestSource, serializeEvidence, record: async () => undefined, respondToApproval: async () => { sends += 1; } });
		dispatcher.restoreInterlocks([
			{ nativeRefs: {}, payload: { operation: "approval/response-prepared" } },
			{ nativeRefs: { threadId: "thread-1", turnId: "turn-1", approvalRequestId: 17, approvalCallbackId: "callback-17" }, payload: { operation: "approval/response-prepared" } },
		]);
		await expect(dispatcher.dispatch({ commandId: "crash-retry", request, response: { decision: "accept" } })).rejects.toBeInstanceOf(ApprovalDeliveryUncertainError);
		expect(sends).toBe(0);
	});

	test("does not relock when dispatched audit follows an early Native resolution", async () => {
		let sends = 0;
		const dispatcher = new ApprovalResponseDispatcher({ digestSource, serializeEvidence, record: async () => undefined, respondToApproval: async () => { sends += 1; } });
		const refs = { threadId: "thread-1", turnId: "turn-1", approvalRequestId: 17, approvalCallbackId: "callback-17" };
		dispatcher.restoreInterlocks([
			{ nativeRefs: refs, payload: { operation: "approval/response-prepared" } },
			{ nativeRefs: refs, payload: { eventType: "approval-resolved" } },
			{ nativeRefs: refs, payload: { operation: "approval/response-delivered" } },
		]);
		expect((await dispatcher.dispatch({ commandId: "after-early-resolved", request, response: { decision: "decline" } })).state).toBe("delivered");
		expect(sends).toBe(1);
	});

	test("keeps terminal delivery observations distinct in the real journal deduplicator", async () => {
		const directory = await mkdtemp(join(tmpdir(), "www-approval-audit-"));
		try {
			const store = new ActivityJournalStore(directory);
			const record = async (entry: ApprovalResponseObservation) => { await store.append({ ...entry, projectId: "approval-audit", provider: "openai-codex" }); };
			const dependencies = { digestSource: digestActivitySource, serializeEvidence, record, respondToApproval: async () => undefined };
			await dispatchApprovalResponse({ commandId: "command-a", request, response: { decision: "decline" } }, dependencies);
			await dispatchApprovalResponse({ commandId: "command-b", request, response: { decision: "decline" } }, dependencies);
			const delivered = (await store.readAll("approval-audit")).filter(entry => entry.payload.operation === "approval/response-delivered");
			expect(delivered).toHaveLength(2);
			expect(delivered[0]?.sourceDigest).not.toBe(delivered[1]?.sourceDigest);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("bounds raw transport errors through the evidence serializer", async () => {
		const observations: ApprovalResponseObservation[] = [];
		const result = await dispatchApprovalResponse({ commandId: "command-6", request, response: { decision: "decline" } }, {
			digestSource,
			serializeEvidence: (value) => ({ value: String(value).slice(0, 8), omitted: String(value).length > 8 }),
			record: async (entry) => { observations.push(entry); },
			respondToApproval: async () => { throw new Error("secret-token-and-a-very-long-transport-message"); },
		});
		expect(result).toMatchObject({ state: "uncertain", reason: "secret-t" });
		expect(observations[1]?.payload.reason).toBe("secret-t");
		expect(JSON.stringify(observations)).not.toContain("secret-token");
	});
});
