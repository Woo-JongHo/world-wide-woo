import { describe, expect, test } from "bun:test";
import { access, readFile, readdir } from "node:fs/promises";
import manifestJson from "../.www/control-ledger/traceability.json";
import {
	parseWorkTraceabilityManifest,
	referenceKey,
	relatedWorkReferences,
	validateWorkTraceabilityManifest,
	type LinearIssueReference,
} from "../src/domain/work/index.js";

const linear: LinearIssueReference = {
	kind: "linear-issue",
	id: "WOO-123",
	uuid: "123e4567-e89b-12d3-a456-426614174000",
	url: "https://linear.app/example/issue/WOO-123/example",
};
const completeMapping = {
	schemaVersion: 1,
	references: [
		{ kind: "story", id: "ST-999-01" },
		linear,
		{ kind: "code", id: "src/domain/work/index.ts" },
		{ kind: "test", id: "test/work-traceability.test.ts" },
		{ kind: "evidence", id: ".www/evidence/work-traceability.json" },
	],
	links: [
		{ from: { kind: "story", id: "ST-999-01" }, relation: "tracks", to: linear },
		{ from: { kind: "story", id: "ST-999-01" }, relation: "implements", to: { kind: "code", id: "src/domain/work/index.ts" } },
		{ from: { kind: "test", id: "test/work-traceability.test.ts" }, relation: "verifies", to: { kind: "story", id: "ST-999-01" } },
		{ from: { kind: "evidence", id: ".www/evidence/work-traceability.json" }, relation: "evidences", to: { kind: "story", id: "ST-999-01" } },
	],
};

describe("work traceability", () => {
	test("queries Linear, code, test, and evidence in both directions without merging identifiers", () => {
		const manifest = parseWorkTraceabilityManifest(completeMapping);
		const story = { kind: "story", id: "ST-999-01" } as const;
		expect(relatedWorkReferences(manifest, story).map(referenceKey)).toEqual([
			"linear-issue:WOO-123",
			"code:src/domain/work/index.ts",
			"test:test/work-traceability.test.ts",
			"evidence:.www/evidence/work-traceability.json",
		]);
		expect(relatedWorkReferences(manifest, linear).map(referenceKey)).toEqual(["story:ST-999-01"]);
		expect(referenceKey({ kind: "project-activity", id: "activity-123" })).toBe("project-activity:activity-123");
		expect(referenceKey({ kind: "native", id: "codex:item-456" })).toBe("native:codex:item-456");
	});

	test("rejects duplicate, dangling, conflated, and malformed references", () => {
		expect(() => referenceKey({ kind: "story", id: "WOO-123" })).toThrow("Invalid story reference");
		expect(() => referenceKey({ ...linear, id: "ST-011-07" })).toThrow("Invalid linear-issue reference");
		expect(() => parseWorkTraceabilityManifest({ schemaVersion: 1, references: [linear, linear], links: [] })).toThrow("Duplicate work reference");
		expect(() => parseWorkTraceabilityManifest({
			schemaVersion: 1,
			references: [{ kind: "story", id: "ST-999-01" }],
			links: [{ from: { kind: "story", id: "ST-999-01" }, relation: "tracks", to: linear }],
		})).toThrow("Dangling work reference: linear-issue:WOO-123");
		expect(() => parseWorkTraceabilityManifest({
			schemaVersion: 1,
			references: [{ ...linear, uuid: "not-a-uuid" }],
			links: [],
		})).toThrow("Invalid Linear UUID");
	});

	test("rejects links whose endpoints violate the relation contract", () => {
		const references = [
			{ kind: "epic", id: "EP-999" },
			{ kind: "story", id: "ST-999-01" },
			linear,
			{ kind: "project-activity", id: "activity-123" },
			{ kind: "native", id: "codex:item-456" },
			{ kind: "code", id: "src/domain/work/index.ts" },
			{ kind: "test", id: "test/work-traceability.test.ts" },
			{ kind: "evidence", id: ".www/evidence/work-traceability.json" },
		];
		const invalidLinks = [
			{ from: { kind: "code", id: "src/domain/work/index.ts" }, relation: "implements", to: { kind: "story", id: "ST-999-01" } },
			{ from: linear, relation: "tracks", to: { kind: "story", id: "ST-999-01" } },
			{ from: { kind: "code", id: "src/domain/work/index.ts" }, relation: "verifies", to: { kind: "test", id: "test/work-traceability.test.ts" } },
			{ from: { kind: "story", id: "ST-999-01" }, relation: "evidences", to: { kind: "evidence", id: ".www/evidence/work-traceability.json" } },
			{ from: { kind: "native", id: "codex:item-456" }, relation: "originated-from", to: { kind: "project-activity", id: "activity-123" } },
		];

		for (const link of invalidLinks) {
			expect(() => parseWorkTraceabilityManifest({ schemaVersion: 1, references, links: [link] }))
				.toThrow(`Invalid ${link.relation} direction`);
		}
	});

	test("keeps source and test issue annotations connected to registered Linear identities", async () => {
		const manifest = parseWorkTraceabilityManifest(manifestJson);
		const taggedIssues = new Set<string>();
		for (const directory of ["src", "test"] as const) {
			for (const file of await readdir(directory, { recursive: true })) {
				if (!file.endsWith(".ts")) continue;
				const path = `${directory}/${file.replaceAll("\\", "/")}`;
				const source = await readFile(path, "utf8");
				for (const annotation of source.matchAll(/@linear\s+([^\r\n]+)/gu)) {
					for (const id of new Set(annotation[1]!.match(/WOO-\d+/gu) ?? [])) {
						const issue = manifest.references.find(reference => reference.kind === "linear-issue" && reference.id === id);
						expect(issue, `Unregistered ${id} in ${path}`).toBeDefined();
						if (!issue) throw new Error(`Unregistered ${id} in ${path}`);
						const reference = { kind: directory === "src" ? "code" as const : "test" as const, id: path };
						expect(relatedWorkReferences(manifest, issue).map(referenceKey), `Unlinked ${id} in ${path}`)
							.toContain(referenceKey(reference));
						taggedIssues.add(id);
					}
				}
			}
		}
		for (const id of ["WOO-679", "WOO-683", "WOO-684", "WOO-686", "WOO-687", "WOO-688", "WOO-689", "WOO-690", "WOO-691", "WOO-692", "WOO-696", "WOO-697", "WOO-698"]) {
			expect(taggedIssues.has(id), `Missing code/test annotation for ${id}`).toBe(true);
		}
	});

	test("requires knowledge bridge issues to annotate linked production code and regression tests", async () => {
		const manifest = parseWorkTraceabilityManifest(manifestJson);
		const expected = {
			"WOO-696": { code: "src/infrastructure/development-store.ts", test: "test/development-store.test.ts" },
			"WOO-697": { code: "src/infrastructure/development-snapshot.ts", test: "test/development-test-runner.test.ts" },
			"WOO-698": { code: "src/infrastructure/development-vault.ts", test: "test/development-vault.test.ts" },
		};
		for (const [id, paths] of Object.entries(expected)) {
			const issue = manifest.references.find(reference => reference.kind === "linear-issue" && reference.id === id);
			expect(issue, `Missing knowledge bridge issue: ${id}`).toBeDefined();
			if (!issue) continue;
			for (const [kind, path] of Object.entries(paths) as Array<["code" | "test", string]>) {
				const source = await readFile(path, "utf8");
				expect(source, `Missing ${id} annotation in ${path}`).toMatch(new RegExp(`@linear\\s+[^\\r\\n]*\\b${id}\\b`, "u"));
				const reference = { kind, id: path } as const;
				expect(relatedWorkReferences(manifest, issue).map(referenceKey), `Unlinked ${id} annotation in ${path}`)
					.toContain(referenceKey(reference));
			}
		}
	});

	test("validates the real Chat issue mappings offline without inventing legacy planning ownership", async () => {
		const manifest = await validateWorkTraceabilityManifest(manifestJson, {
			exists: async path => access(path).then(() => true, () => false),
		});
		expect(manifest.references.some(reference => reference.kind === "epic" || reference.kind === "story")).toBe(false);
		const chatIssueIds = ["WOO-679", "WOO-683", "WOO-684", "WOO-686", "WOO-687", "WOO-688", "WOO-689", "WOO-690", "WOO-691", "WOO-692"];
		const issues = manifest.references.filter((reference): reference is LinearIssueReference => reference.kind === "linear-issue");
		for (const id of chatIssueIds) {
			const issue = issues.find(reference => reference.id === id);
			expect(issue, `Missing Chat issue: ${id}`).toBeDefined();
			if (!issue) throw new Error(`Missing Chat issue: ${id}`);
			const related = relatedWorkReferences(manifest, issue);
			expect(related.some(reference => reference.kind === "test")).toBe(true);
			expect(related.some(reference => reference.kind === "evidence")).toBe(true);
			// WOO-692 owns integration acceptance, not a new production-code module.
			if (id !== "WOO-692") expect(related.some(reference => reference.kind === "code")).toBe(true);
			for (const reference of related) {
				expect(relatedWorkReferences(manifest, reference).map(referenceKey)).toContain(referenceKey(issue));
			}
		}
		expect(relatedWorkReferences(manifest, { kind: "code", id: "src/presentation/tui/syntax-highlighter.ts" })
			.filter(reference => reference.kind === "linear-issue").map(reference => reference.id).sort())
			.toEqual(expect.arrayContaining(["WOO-686", "WOO-691"]));
		expect(manifest.links).toContainEqual({
			from: { kind: "test", id: "test/work-flow.test.ts" },
			relation: "verifies",
			to: { kind: "code", id: "src/domain/work/activity-classification.ts" },
		});

		const missing = structuredClone(manifestJson) as { schemaVersion: 1; references: Array<{ kind: string; id: string }>; links: unknown[] };
		missing.references.push({ kind: "code", id: "src/domain/work/missing.ts" });
		await expect(validateWorkTraceabilityManifest(missing, { exists: async path => path !== "src/domain/work/missing.ts" }))
			.rejects.toThrow("Missing repository traceability target: src/domain/work/missing.ts");
	});
});
