import { Database } from "bun:sqlite";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { canonicalJson, sha256 } from "../../core/commit/commit-governance.js";

type Receipt = Record<string, unknown> & { schemaVersion: string; receiptId: string; runId: string; capability: string; status: string; stage: string; receiptDigest: string; result?: { commitSha?: string } | null };

function receiptFiles(root: string): string[] {
	if (!existsSync(root)) return [];
	const files: string[] = [];
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		const path = join(root, entry.name);
		if (entry.isDirectory()) files.push(...receiptFiles(path)); else if (entry.name.endsWith(".json")) files.push(path);
	}
	return files.sort();
}
function validateReceipt(receipt: Receipt): void {
	if (receipt.schemaVersion !== "1.0" || !receipt.receiptId || !receipt.runId || receipt.capability !== "commit" || !receipt.status || !receipt.stage) throw new Error("Invalid commit Receipt envelope");
	const { receiptDigest, ...payload } = receipt;
	if (!/^[0-9a-f]{64}$/u.test(receiptDigest) || receiptDigest !== sha256(canonicalJson(payload))) throw new Error(`Receipt digest mismatch: ${receipt.receiptId}`);
}

/** SQLite is a disposable search projection of append-only commit Receipt JSON. */
export class CommitReceiptStore {
	private readonly db: Database;
	constructor(readonly projectRoot: string, indexPath: string) {
		this.projectRoot = resolve(projectRoot); this.db = new Database(resolve(indexPath), { create: true, strict: true });
		this.db.run("PRAGMA journal_mode = WAL"); this.db.run("CREATE TABLE IF NOT EXISTS commit_receipts (receipt_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, commit_sha TEXT, status TEXT NOT NULL, stage TEXT NOT NULL, digest TEXT NOT NULL, payload TEXT NOT NULL)");
	}
	close(): void { this.db.close(); }
	rebuild(): { receipts: number; digest: string } {
		const receipts = receiptFiles(join(this.projectRoot, ".www/receipts/commit")).map(path => JSON.parse(readFileSync(path, "utf8")) as Receipt);
		for (const receipt of receipts) validateReceipt(receipt);
		this.db.run("BEGIN IMMEDIATE");
		try {
			this.db.run("DELETE FROM commit_receipts"); const insert = this.db.query("INSERT INTO commit_receipts(receipt_id,run_id,commit_sha,status,stage,digest,payload) VALUES (?,?,?,?,?,?,?)");
			for (const receipt of receipts) insert.run(receipt.receiptId, receipt.runId, receipt.result?.commitSha ?? null, receipt.status, receipt.stage, receipt.receiptDigest, canonicalJson(receipt));
			this.db.run("COMMIT");
		} catch (error) { this.db.run("ROLLBACK"); throw error; }
		return { receipts: receipts.length, digest: sha256(canonicalJson(receipts.map(value => value.receiptDigest).sort())) };
	}
	query(commitSha: string): unknown { return this.db.query("SELECT payload FROM commit_receipts WHERE commit_sha = ?").get(commitSha) ?? null; }
}

