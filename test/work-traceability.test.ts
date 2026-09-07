import { describe, expect, test } from "bun:test";
import { access, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import manifestJson from "../.www/control-ledger/traceability.json";
import { runCodeMap } from "../scripts/code-map.js";
import {
	findWorkReference,
	parseWorkTraceabilityManifest,
	referenceKey,
	relatedWorkReferences,
	type LinearIssueReference,
} from "../src/domain/work/traceability.js";
import {
	extractLinearIssueIds,
	extractLinearIssueIdsByPath,
	validateLinearAnnotations,
	validateWorkTraceabilityManifest,
	type LinearAnnotation,
} from "../src/domain/work/traceability-validator.js";

const linear: LinearIssueReference = {
	kind: "linear-issue",
	id: "WOO-123",
	uuid: "123e4567-e89b-12d3-a456-426614174000",
	url: "https://linear.app/example/issue/WOO-123/example",
};
const code = { kind: "code", id: "src/domain/work/traceability.ts" } as const;
const verification = { kind: "test", id: "test/work-traceability.test.ts" } as const;
const completeMapping = {
	schemaVersion: 1,
	references: [linear, code, verification],
	links: [
		{ from: linear, relation: "implements", to: code },
		{ from: verification, relation: "verifies", to: linear },
	],
};

async function annotationsIn(directory: "src" | "scripts" | "test"): Promise<LinearAnnotation[]> {
	const annotations: LinearAnnotation[] = [];
	const sources: { path: string; source: string }[] = [];
	for (const file of await readdir(directory, { recursive: true })) {
		if (!file.endsWith(".ts")) continue;
		const path = `${directory}/${file.replaceAll("\\", "/")}`;
		sources.push({ path, source: await readFile(path, "utf8") });
	}
	const issueIdsByPath = await extractLinearIssueIdsByPath(sources);
	for (const { path } of sources) {
		const issueIds = issueIdsByPath.get(path) ?? [];
		if (issueIds.length > 0) annotations.push({ path, kind: directory === "test" ? "test" : "code", issueIds });
	}
	return annotations;
}

async function invoke(args: readonly string[]): Promise<{ exitCode: number; output: string }> {
	const chunks: string[] = [];
	const original = console.log;
	console.log = (...values: unknown[]) => { chunks.push(values.map(String).join(" ")); };
	try {
		const exitCode = await runCodeMap(args, resolve(import.meta.dir, ".."));
		return { exitCode, output: chunks.join("\n") };
	} finally {
		console.log = original;
	}
}

describe("work traceability", () => {
	test("keeps Linear display ID, UUID, URL, and repository identity distinct while querying both directions", () => {
		const manifest = parseWorkTraceabilityManifest(completeMapping);
		expect(findWorkReference(manifest, "WOO-123")).toEqual(linear);
		expect(findWorkReference(manifest, linear.uuid)).toEqual(linear);
		expect(findWorkReference(manifest, linear.url)).toEqual(linear);
		expect(findWorkReference(manifest, code.id)).toEqual(code);
		expect(relatedWorkReferences(manifest, linear).map(referenceKey)).toEqual([
			"code:src/domain/work/traceability.ts",
			"test:test/work-traceability.test.ts",
		]);
		expect(relatedWorkReferences(manifest, code).map(referenceKey)).toEqual(["linear-issue:WOO-123"]);
	});

	test("rejects duplicate, dangling, conflated, malformed, and escaping references", () => {
		expect(() => referenceKey({ kind: "story", id: "WOO-123" })).toThrow("story 참조가 올바르지 않습니다");
		expect(() => referenceKey({ ...linear, id: "ST-011-07" })).toThrow("linear-issue 참조가 올바르지 않습니다");
		expect(() => parseWorkTraceabilityManifest({ schemaVersion: 1, references: [linear, linear], links: [] })).toThrow("작업 참조가 중복되었습니다");
		expect(() => parseWorkTraceabilityManifest({
			schemaVersion: 1,
			references: [linear, { ...linear, id: "WOO-124", url: "https://linear.app/example/issue/WOO-124/example" }],
			links: [],
		})).toThrow("Linear UUID가 중복되었습니다");
		expect(() => parseWorkTraceabilityManifest({
			schemaVersion: 1,
			references: [linear],
			links: [{ from: linear, relation: "implements", to: code }],
		})).toThrow("선언되지 않은 작업 참조입니다: code:src/domain/work/traceability.ts");
		expect(() => referenceKey({ kind: "code", id: "src/../outside.ts" })).toThrow("code 참조가 올바르지 않습니다");
	});

	test("rejects links whose endpoints violate the relation contract", () => {
		const invalid = {
			schemaVersion: 1,
			references: [linear, code],
			links: [{ from: code, relation: "implements", to: linear }],
		};
		expect(() => parseWorkTraceabilityManifest(invalid)).toThrow("implements 관계 방향이 올바르지 않습니다: code -> linear-issue");
	});

	test("rejects missing repository targets and unregistered or unlinked annotations", async () => {
		await expect(validateWorkTraceabilityManifest(completeMapping, { exists: async path => path !== verification.id }))
			.rejects.toThrow(`저장소 추적 대상이 없습니다: ${verification.id}`);
		const manifest = parseWorkTraceabilityManifest(completeMapping);
		expect(() => validateLinearAnnotations(manifest, [{ path: code.id, kind: "code", issueIds: ["WOO-999"] }]))
			.toThrow(`등록되지 않은 WOO-999입니다: ${code.id}`);
		expect(() => validateLinearAnnotations(manifest, [{ path: "scripts/code-map.ts", kind: "code", issueIds: [linear.id] }]))
			.toThrow(`연결되지 않은 WOO-123입니다: scripts/code-map.ts`);
		expect(() => validateLinearAnnotations(manifest, [], { requireCodeDeclaration: true }))
			.toThrow("제품 코드에 @linear 선언이 없습니다");
	});

	test("extracts only leading TypeScript comments and ignores string, template, regexp, trailing, and orphan markers", async () => {
		const source = `
const stringMarker = "@linear WOO-991";
const templateMarker = \`@linear WOO-992\`;
const interpolatedTemplateMarker = \`value \${stringMarker} @linear WOO-993\`;
const regexpMarker = /@linear WOO-994/u;
const copiedFixture = "/** @linear WOO-998 */ export function fake() {}";
const trailingMarker = true; // @linear WOO-995
const inlineMarker = /* @linear WOO-996 */ true;

/** @linear WOO-123 */
export function declaredMapping(): boolean { return true; }

// @linear WOO-124
test("declared test", () => {});

// @linear WOO-997
`;
		expect(await extractLinearIssueIds(source)).toEqual(["WOO-123", "WOO-124"]);
	});

	// @linear WOO-695
	test("validates the current PR snapshot and requires actual production declarations", async () => {
		const manifest = await validateWorkTraceabilityManifest(manifestJson, {
			exists: async path => access(path).then(() => true, () => false),
		});
		const annotations = (await Promise.all([
			annotationsIn("src"),
			annotationsIn("scripts"),
			annotationsIn("test"),
		])).flat();
		const summary = validateLinearAnnotations(manifest, annotations, { requireCodeDeclaration: true });
		expect(summary.codeDeclarations).toBeGreaterThan(0);
		expect(summary.issueIds).toEqual(expect.arrayContaining(["WOO-690", "WOO-695"]));
		expect(manifest.references.some(reference => reference.kind === "epic" || reference.kind === "story")).toBe(false);
		for (const id of ["WOO-679", "WOO-681", "WOO-682", "WOO-677"]) {
			const issue = findWorkReference(manifest, id);
			expect(issue).toBeDefined();
			expect(relatedWorkReferences(manifest, issue!).length).toBeGreaterThan(0);
		}
		for (const id of ["WOO-696", "WOO-697", "WOO-698"]) {
			const issue = findWorkReference(manifest, id);
			expect(issue).toBeDefined();
			expect(relatedWorkReferences(manifest, issue!)).toEqual([]);
		}
	});

	test("executes issue, code, JSON, unlinked, and offline check CLI queries", async () => {
		const issue = await invoke(["WOO-690"]);
		expect(issue.exitCode).toBe(0);
		expect(issue.output).toContain("linear-issue:WOO-690");
		expect(issue.output).toContain("a417df98-8479-4222-b7e8-170ea4230f97");
		expect(issue.output).toContain("https://linear.app/woo-world/issue/WOO-690/");
		expect(issue.output).toContain("code:src/application/project-workbench.ts");
		expect(issue.output).toContain("test:test/project-workbench.test.ts");

		const reverse = await invoke(["src/application/project-workbench.ts"]);
		expect(reverse.output).toContain("linear-issue:WOO-690");

		const json = await invoke(["a417df98-8479-4222-b7e8-170ea4230f97", "--json"]);
		expect(JSON.parse(json.output).reference.id).toBe("WOO-690");
		const url = await invoke([JSON.parse(json.output).reference.url]);
		expect(url.exitCode).toBe(0);
		expect(url.output).toContain("linear-issue:WOO-690");

		const planned = await invoke(["WOO-696"]);
		expect(planned.output).toContain("현재 스냅샷 연결 없음");

		const check = await invoke(["--check", "--json"]);
		const result = JSON.parse(check.output);
		expect(result.ok).toBe(true);
		expect(result.validation).toBe("offline");
		expect(result.annotations.codeDeclarations).toBeGreaterThan(0);
	});
});
