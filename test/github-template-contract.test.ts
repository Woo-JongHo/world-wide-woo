import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";

const root = join(import.meta.dir, "..");
const form = (name: string) => YAML.parse(readFileSync(join(root, ".github/ISSUE_TEMPLATE", name), "utf8")) as { title: string; labels: string[]; body: Array<{ type: string; id?: string; validations?: { required?: boolean } }> };

describe("GitHub templates mirror agent contracts", () => {
	test("Bug form은 무접두어 제목과 문제·재현 최소 계약만 요구한다", () => {
		const value = form("bug-report.yml");
		expect(value.title).toBe("");
		expect(value.labels).toEqual(["bug"]);
		expect(value.body.filter(item => item.type !== "markdown").map(item => item.id)).toEqual(["observed", "reproduction"]);
		expect(value.body.filter(item => item.type !== "markdown").every(item => item.validations?.required)).toBeTrue();
	});

	test("Enhancement form은 무접두어 제목과 요청·현재 불편만 요구한다", () => {
		const value = form("feature-request.yml");
		expect(value.title).toBe("");
		expect(value.labels).toEqual(["enhancement"]);
		expect(value.body.map(item => item.id)).toEqual(["problem", "inconvenience"]);
		expect(value.body.every(item => item.validations?.required)).toBeTrue();
	});

	test("PR template은 연결과 복구 계약을 노출한다", () => {
		const value = readFileSync(join(root, ".github/PULL_REQUEST_TEMPLATE.md"), "utf8");
		for (const marker of ["Linear:", "Code-ID:", "Obsidian:", "Receipt:", "## 위험과 복구", "- 복구:"]) expect(value).toContain(marker);
	});
});
