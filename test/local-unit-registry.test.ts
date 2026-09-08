import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncLocalUnitRegistry } from "../src/infrastructure/local-unit-registry.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture(): { root: string; data: string } {
	const root = mkdtempSync(join(tmpdir(), "www-local-units-")); roots.push(root);
	const data = join(root, "data");
	mkdirSync(join(root, ".woo"), { recursive: true });
	mkdirSync(join(root, ".www/control-ledger"), { recursive: true });
	mkdirSync(join(root, "src"), { recursive: true });
	writeFileSync(join(root, "src/chat.ts"), "const route = /^\\/stats\\s+#(\\d+)$/u;\nconst title = `# 질문 ${route.source}`;\nexport class ChatView { render() {} }\n");
	writeFileSync(join(root, ".www/control-ledger/traceability-v3.json"), JSON.stringify({
		schemaVersion: 3,
		projectId: "11111111-1111-4111-8111-111111111111",
		entities: [{ ref: "issue:WOO-1", kind: "issue", id: "WOO-1" }, { ref: "note:WOO-1", kind: "note", id: "WOO-1" }],
	}));
	writeFileSync(join(root, ".woo/units.yaml"), `schemaVersion: 1\nunits:\n  - id: Code-001\n    name: Chat\n    code:\n      path: src/chat.ts\n      symbol: ChatView\n      members: [render]\n    linear: [WOO-1]\n    obsidian: Chat.md\n`);
	return { root, data };
}

describe("local Code-ID registry", () => {
	test("validates code owners and projects Linear links into SQLite", () => {
		const { root, data } = fixture();
		const result = syncLocalUnitRegistry({ projectRoot: root, dataRoot: data });
		expect(result).toMatchObject({ units: 1, links: 1 });
		const db = new Database(result.indexPath, { readonly: true });
		try {
			expect(db.query("SELECT code_id,path,symbol,members,obsidian FROM local_code_units").get()).toEqual({ code_id: "Code-001", path: "src/chat.ts", symbol: "ChatView", members: '["render"]', obsidian: "Chat.md" });
			expect(db.query("SELECT code_id,issue_id FROM local_code_linear").get()).toEqual({ code_id: "Code-001", issue_id: "WOO-1" });
			expect(db.query("SELECT manifest_digest FROM local_code_meta").get()).toEqual({ manifest_digest: result.digest });
		} finally { db.close(); }
	});

	test("rejects missing symbols and unknown Linear issues before writing", () => {
		const { root, data } = fixture();
		writeFileSync(join(root, ".woo/units.yaml"), `schemaVersion: 1\nunits:\n  - id: Code-001\n    name: Chat\n    code: { path: src/chat.ts, symbol: Missing }\n    linear: [WOO-404]\n`);
		expect(() => syncLocalUnitRegistry({ projectRoot: root, dataRoot: data })).toThrow(/WOO-404[\s\S]*Missing/u);
	});

	test("normalizes unordered links and members into a stable projection", () => {
		const { root, data } = fixture();
		const ledgerPath = join(root, ".www/control-ledger/traceability-v3.json");
		writeFileSync(ledgerPath, JSON.stringify({ schemaVersion: 3, projectId: "11111111-1111-4111-8111-111111111111", entities: [
			{ ref: "issue:WOO-1", kind: "issue", id: "WOO-1" }, { ref: "issue:WOO-2", kind: "issue", id: "WOO-2" },
		] }));
		writeFileSync(join(root, "src/chat.ts"), "export class ChatView { render() {} update() {} }\n");
		const manifestPath = join(root, ".woo/units.yaml");
		writeFileSync(manifestPath, `schemaVersion: 1\nunits:\n  - id: Code-001\n    name: Chat\n    code: { path: src/chat.ts, symbol: ChatView, members: [update, render] }\n    linear: [WOO-2, WOO-1]\n`);
		const first = syncLocalUnitRegistry({ projectRoot: root, dataRoot: data });
		writeFileSync(manifestPath, `schemaVersion: 1\nunits:\n  - id: Code-001\n    name: Chat\n    code: { path: src/chat.ts, symbol: ChatView, members: [render, update] }\n    linear: [WOO-1, WOO-2]\n`);
		const second = syncLocalUnitRegistry({ projectRoot: root, dataRoot: data });
		expect(second.digest).toBe(first.digest);
		const db = new Database(second.indexPath, { readonly: true });
		try {
			expect(db.query("SELECT members FROM local_code_units").get()).toEqual({ members: '["render","update"]' });
			expect(db.query("SELECT issue_id FROM local_code_linear ORDER BY issue_id").all()).toEqual([{ issue_id: "WOO-1" }, { issue_id: "WOO-2" }]);
		} finally { db.close(); }
	});
});
