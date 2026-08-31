import { describe, expect, test } from "bun:test";
import { ExitKeyPolicy } from "../src/presentation/tui/exit-key-policy";

describe("ExitKeyPolicy", () => {
	test("clears first and exits only on a second Ctrl+C inside 500ms", () => {
		let now = 1_000;
		const policy = new ExitKeyPolicy(() => now);
		expect(policy.ctrlC(false)).toBe("clear");
		now += 499;
		expect(policy.ctrlC(false)).toBe("exit");
	});

	test("resets the exit gesture after its safety window", () => {
		let now = 1_000;
		const policy = new ExitKeyPolicy(() => now);
		expect(policy.ctrlC(false)).toBe("clear");
		now += 500;
		expect(policy.ctrlC(false)).toBe("clear");
	});

	test("does not treat a backwards clock jump as a second press", () => {
		let now = 1_000;
		const policy = new ExitKeyPolicy(() => now);
		expect(policy.ctrlC(false)).toBe("clear");
		now = 900;
		expect(policy.ctrlC(false)).toBe("clear");
	});

	test("aborts streaming first and exits on the second Ctrl+C", () => {
		let now = 1_000;
		const policy = new ExitKeyPolicy(() => now);
		expect(policy.ctrlC(true)).toBe("abort");
		now += 100;
		expect(policy.ctrlC(false)).toBe("exit");
	});

	test("Ctrl+D exits only with an empty composer", () => {
		const policy = new ExitKeyPolicy();
		expect(policy.ctrlD(true)).toBe("ignore");
		expect(policy.ctrlD(false)).toBe("exit");
	});

	test("resets a pending destructive gesture after a non-destructive overlay close", () => {
		let now = 1_000;
		const policy = new ExitKeyPolicy(() => now);
		expect(policy.ctrlC(false)).toBe("clear");
		policy.reset();
		now += 100;
		expect(policy.ctrlC(false)).toBe("clear");
	});
});
