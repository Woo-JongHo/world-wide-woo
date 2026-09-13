import { describe, expect, test } from "bun:test";
import { RequestRuntimePolicy, type RequestRuntimeMode } from "../src/core/application/orchestration/request-runtime-mode.js";

describe("RequestRuntimePolicy", () => {
	const cases: readonly {
		mode: RequestRuntimeMode;
		goal: boolean;
		expected: RequestRuntimeMode;
	}[] = [
		{ mode: "off", goal: false, expected: "off" },
		{ mode: "off", goal: true, expected: "observe" },
		{ mode: "observe", goal: false, expected: "observe" },
		{ mode: "observe", goal: true, expected: "observe" },
		{ mode: "broker", goal: false, expected: "broker" },
		{ mode: "broker", goal: true, expected: "broker" },
	];

	for (const item of cases) {
		test(`${item.mode} + goal=${item.goal} -> ${item.expected}`, () => {
			const policy = new RequestRuntimePolicy({
				mode: item.mode,
				capabilitiesConfigured: item.mode === "broker",
				resuming: false,
			});
			expect(policy.modeForRequest(item.goal)).toBe(item.expected);
			expect(policy.manages(item.goal)).toBe(item.expected !== "off");
		});
	}

	test("resumed v1 sessions are not silently upgraded to protocol v2", () => {
		const policy = new RequestRuntimePolicy({ mode: "broker", capabilitiesConfigured: true, resuming: true });
		expect(policy.protocolVersion(false)).toBe(1);
		expect(policy.protocolVersion(true)).toBe(2);
	});

	test("capability authority and broker mode must be configured together", () => {
		expect(() => new RequestRuntimePolicy({ mode: "broker", capabilitiesConfigured: false, resuming: false })).toThrow();
		expect(() => new RequestRuntimePolicy({ mode: "observe", capabilitiesConfigured: true, resuming: false })).toThrow();
	});
});
