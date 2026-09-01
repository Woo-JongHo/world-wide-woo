import { appendFile, chmod, lstat, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ReviewProvenanceStore } from "../application/review-service";
import type { ReviewProvenance, ReviewProvider } from "../domain/review";

/** Append-only, local provenance journal. Its path is deliberately supplied by composition. */
export class FileReviewProvenanceStore implements ReviewProvenanceStore {
	constructor(private readonly filePath: string) {}

	async append(record: ReviewProvenance): Promise<void> {
		validateRecord(record);
		await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
		await assertRegularOrMissing(this.filePath);
		await appendFile(this.filePath, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
		await chmod(this.filePath, 0o600);
	}

	async readAll(): Promise<readonly ReviewProvenance[]> {
		try {
			await assertRegularOrMissing(this.filePath);
			const lines = (await readFile(this.filePath, "utf8")).split("\n").filter(Boolean);
			return Object.freeze(lines.map((line, index) => parseRecord(line, index + 1)));
		} catch (error) {
			if (isMissing(error)) return Object.freeze([]);
			throw error;
		}
	}
}

async function assertRegularOrMissing(path: string): Promise<void> {
	try {
		const info = await lstat(path);
		if (!info.isFile() || info.isSymbolicLink()) throw new Error("Unsafe review provenance path");
	} catch (error) {
		if (!isMissing(error)) throw error;
	}
}

function parseRecord(line: string, lineNumber: number): ReviewProvenance {
	try {
		const value = JSON.parse(line) as ReviewProvenance;
		validateRecord(value);
		return Object.freeze({ ...value });
	} catch (error) {
		throw new Error(`Invalid review provenance record at line ${lineNumber}`, { cause: error });
	}
}

function validateRecord(value: ReviewProvenance): void {
	if (!value || (value.provider !== "anthropic" && value.provider !== "google")) throw new Error("Invalid review provenance provider");
	for (const key of ["model", "version", "packetDigest", "resultDigest", "sentAt", "receivedAt"] as const) {
		if (typeof value[key] !== "string" || value[key].length === 0) throw new Error(`Invalid review provenance ${key}`);
	}
	if (!isDigest(value.packetDigest) || !isDigest(value.resultDigest)) throw new Error("Invalid review provenance digest");
	if (Number.isNaN(Date.parse(value.sentAt)) || Number.isNaN(Date.parse(value.receivedAt))) throw new Error("Invalid review provenance timestamp");
}

function isDigest(value: string): boolean { return /^[a-f0-9]{64}$/u.test(value); }
function isMissing(error: unknown): boolean { return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"; }
