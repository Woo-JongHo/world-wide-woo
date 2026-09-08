import { describe, expect, test } from "bun:test";
import { assessRuntimeProvenance, type RuntimeIdentity } from "../src/core/domain/execution/runtime-provenance";
import { inspectRuntimeProvenance, type RuntimeProvenanceEnvironment } from "../src/adapters/outbound/workspace/runtime-provenance-source";

const identity = (overrides: Partial<RuntimeIdentity> = {}): RuntimeIdentity => ({
	sourceRoot: "/workspace/99_www",
	entrypoint: "/workspace/99_www/src/cli.ts",
	revision: "a".repeat(40),
	dirty: false,
	packageName: "world-wide-woo",
	packageVersion: "0.0.16",
	...overrides,
});

describe("runtime provenance", () => {
	test("accepts a resolved global command when it loads the same workspace revision", () => {
		const result = assessRuntimeProvenance(
			identity({ entrypoint: "/Users/woo/.bun/bin/www" }),
			identity(),
		);

		expect(result.state).toBe("matched");
		expect(result.reasons).toEqual([]);
	});

	test("rejects the same package version when a physical global copy loads another revision", () => {
		const result = assessRuntimeProvenance(
			identity({ sourceRoot: "/Users/woo/.bun/install/global/node_modules/world-wide-woo", revision: "b".repeat(40) }),
			identity({ packageVersion: "0.0.16" }),
		);

		expect(result.state).toBe("mismatched");
		expect(result.reasons).toEqual(["source-root", "revision"]);
	});

	test("fails closed when the runtime revision cannot be observed", () => {
		const result = assessRuntimeProvenance(identity({ revision: null, dirty: null }), identity());

		expect(result.state).toBe("unverifiable");
		expect(result.reasons).toEqual(["runtime-revision-unavailable", "runtime-dirty-unavailable"]);
	});

	test("collects the resolved global entrypoint instead of trusting its shared package version", () => {
		const workspace = "/workspace/99_www";
		const global = "/global/node_modules/world-wide-woo";
		const packages = new Map([
			[`${workspace}/package.json`, JSON.stringify({ name: "world-wide-woo", version: "0.0.16" })],
			[`${global}/package.json`, JSON.stringify({ name: "world-wide-woo", version: "0.0.16" })],
		]);
		const environment: RuntimeProvenanceEnvironment = {
			cwd: () => workspace,
			entrypoint: () => "/Users/woo/.bun/bin/www",
			realpath: path => path === "/Users/woo/.bun/bin/www" ? `${global}/src/cli.ts` : path,
			exists: path => packages.has(path),
			readText: path => packages.get(path) ?? null,
			git: (cwd, args) => args[0] === "rev-parse" ? cwd === workspace ? "a".repeat(40) : "b".repeat(40) : "",
		};

		const result = inspectRuntimeProvenance(environment);
		expect(result).toMatchObject({
			state: "mismatched",
			reasons: ["source-root", "revision"],
			runtime: { sourceRoot: global, entrypoint: `${global}/src/cli.ts`, packageVersion: "0.0.16" },
			workspace: { sourceRoot: workspace, packageVersion: "0.0.16" },
		});
	});
});
