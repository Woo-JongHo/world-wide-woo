import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { SkillRunReceipt, SkillRunState } from "../../../core/workflows/skill-run.js";
import { verifySkillRunReceipt } from "../../../core/workflows/skill-run.js";

export class FileSkillRunStore {
	constructor(private readonly root: string) {}
	statePath(runId: string): string { return resolve(this.root, "runtime/skills", `${safeId(runId)}.json`); }
	receiptPath(receipt: SkillRunReceipt): string { return resolve(this.root, "receipts/skills", safeId(receipt.runId), `${safeId(receipt.receiptId)}.json`); }
	async read(runId: string): Promise<SkillRunState> { return JSON.parse(await readFile(this.statePath(runId), "utf8")) as SkillRunState; }
	async write(state: SkillRunState, expectedRevision?: number): Promise<void> {
		const target = this.statePath(state.runId); await mkdir(dirname(target), { recursive: true, mode: 0o700 });
		if (expectedRevision !== undefined) { const current = await this.read(state.runId); if (current.revision !== expectedRevision) throw new Error("SKILL_RUN_CONFLICT"); }
		const temporary = `${target}.${process.pid}.tmp`; await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { flag: "wx", mode: 0o600 }); await rename(temporary, target);
	}
	async writeReceipt(receipt: SkillRunReceipt): Promise<string> {
		verifySkillRunReceipt(receipt);
		const target = this.receiptPath(receipt); await mkdir(dirname(target), { recursive: true, mode: 0o700 }); await writeFile(target, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx", mode: 0o600 }); return target;
	}
	async readReceipt(runId: string, receiptId: string): Promise<SkillRunReceipt> {
		const receipt = JSON.parse(await readFile(resolve(this.root, "receipts/skills", safeId(runId), `${safeId(receiptId)}.json`), "utf8")) as SkillRunReceipt;
		verifySkillRunReceipt(receipt);
		return receipt;
	}
	async listReceipts(runId: string): Promise<readonly SkillRunReceipt[]> {
		const directory = resolve(this.root, "receipts/skills", safeId(runId));
		const names = await readdir(directory).catch(error => (error as NodeJS.ErrnoException).code === "ENOENT" ? [] : Promise.reject(error));
		const receipts = await Promise.all(names.filter(name => name.endsWith(".json")).sort().map(name => readFile(resolve(directory, name), "utf8").then(text => JSON.parse(text) as SkillRunReceipt)));
		for (const receipt of receipts) verifySkillRunReceipt(receipt);
		return Object.freeze(receipts);
	}
}

function safeId(value: string): string { if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value)) throw new Error("SKILL_RUN_ID_INVALID"); return value; }
