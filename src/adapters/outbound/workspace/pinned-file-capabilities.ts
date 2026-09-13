import { constants } from "node:fs";
import { open, realpath, lstat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import type { RequestActionCapability, RequestActionIntent } from "../../../core/ports/execution/request-action-port";

const digest = (text: string) => `sha256:${createHash("sha256").update(text).digest("hex")}`;
const MAX_BYTES = 64 * 1024;
/** A host-approved single operation. Native cannot mint, edit or widen this permit. */
export interface PinnedFileWritePermit {
	readonly requestId: string;
	readonly operationId: string;
	readonly expectedRevision: number;
	readonly path: string;
	readonly beforeDigest: string;
	readonly afterDigest: string;
}

/** Explicit files only; no directory grants, creates, shell, network or remote credentials. */
export function pinnedFileCapabilities(paths: readonly string[], permits: readonly PinnedFileWritePermit[] = []): readonly RequestActionCapability[] {
	if (paths.some(path => !isAbsolute(path) || resolve(path) !== path)) throw new Error("Pinned file paths must be canonical absolute paths");
	const allowed = new Set(paths), approvals = structuredClone(permits);
	const scoped = (intent: RequestActionIntent, write: boolean) => {
		const args = intent.arguments;
		if (typeof args.path !== "string" || !allowed.has(args.path)) return false;
		if (Object.keys(args).some(k => !(write ? ["path", "content", "beforeDigest"] : ["path"]).includes(k))) return false;
		return !write || typeof args.content === "string" && Buffer.byteLength(args.content) <= MAX_BYTES && typeof args.beforeDigest === "string" && /^sha256:[a-f0-9]{64}$/u.test(args.beforeDigest);
	};
	const valid = (intent: RequestActionIntent, write: boolean) => scoped(intent, write) && (!write || approvals.some(p => p.requestId === intent.requestId && p.operationId === intent.operationId && p.expectedRevision === intent.expectedRevision && p.path === intent.arguments.path && p.beforeDigest === intent.arguments.beforeDigest && p.afterDigest === digest(intent.arguments.content as string)));
	const capability = (write: boolean): RequestActionCapability => ({
		id: write ? "files.replace-approved" : "files.read-pinned",
		effect: write ? "workspace-change" : "read",
		description: write ? "Replace one pinned UTF-8 file after exact before-digest check and single-action host approval. No creation." : "Read one pinned UTF-8 file with its SHA-256. May be used for fresh verification read-back.",
		inputSchema: { type: "object", properties: { path: { type: "string", enum: [...allowed] }, ...(write ? { beforeDigest: { type: "string" }, content: { type: "string" } } : {}) }, required: write ? ["path", "beforeDigest", "content"] : ["path"], additionalProperties: false },
		authorize: async intent => valid(intent, write),
		...(write ? { approvalPreview: async (intent: RequestActionIntent) => scoped(intent, true) ? { summary: `파일 교체 · ${intent.arguments.path}`, detail: `이 작업 한 번만 승인합니다.\n기존 SHA: ${intent.arguments.beforeDigest}\n변경 SHA: ${digest(intent.arguments.content as string)}\n교체할 전체 내용:\n${intent.arguments.content}` } : null } : {}),
		...(write ? { reconciliation: {
			prepare: (intent: RequestActionIntent) => ({ path: intent.arguments.path, beforeDigest: intent.arguments.beforeDigest, afterDigest: digest(intent.arguments.content as string) }),
			readBack: async (descriptor: Readonly<Record<string, unknown>>, signal: AbortSignal) => {
				const { path, beforeDigest, afterDigest } = descriptor;
				if (typeof path !== "string" || !allowed.has(path) || typeof afterDigest !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(afterDigest) || signal.aborted) throw new Error("RECONCILIATION_SCOPE_DENIED");
				if (await realpath(path) !== path) throw new Error("FILE_SYMLINK_DENIED");
				const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
				try {
					const stat = await file.stat();
					if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_BYTES) throw new Error("FILE_SCOPE_DENIED");
					const bytes = await file.readFile();
					if (bytes.length > MAX_BYTES) throw new Error("FILE_TOO_LARGE");
					const observedDigest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
					const current = await lstat(path);
					if (signal.aborted || current.isSymbolicLink() || current.dev !== stat.dev || current.ino !== stat.ino || await realpath(path) !== path) throw new Error("FILE_TARGET_CHANGED");
					const confirmed = observedDigest === afterDigest;
					return { confirmed, summary: confirmed ? `Desired file state confirmed: ${path}` : `File state unresolved: ${path}`, source: { path, beforeDigest, expectedDigest: afterDigest, observedDigest, readBack: confirmed } };
				} finally { await file.close(); }
			},
		} } : {}),
		execute: async (intent, signal, grant) => {
			const granted = write && scoped(intent, true) && grant && JSON.stringify(grant.intent) === JSON.stringify(intent);
			if (!(valid(intent, write) || granted) || signal.aborted) throw new Error("FILE_ACTION_DENIED");
			const path = intent.arguments.path as string;
			if (await realpath(path) !== path) throw new Error("FILE_SYMLINK_DENIED");
			const file = await open(path, (write ? constants.O_RDWR : constants.O_RDONLY) | constants.O_NOFOLLOW);
			try {
				const stat = await file.stat();
				if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_BYTES) throw new Error("FILE_SCOPE_DENIED");
				const beforeBytes = await file.readFile();
				const before = beforeBytes.toString("utf8");
				if (beforeBytes.length > MAX_BYTES) throw new Error("FILE_TOO_LARGE");
				if (!Buffer.from(before).equals(beforeBytes)) throw new Error("FILE_NOT_UTF8");
				const beforeDigest = digest(before);
				if (!write) return { outcome: "passed", summary: `Read ${path}`, source: { path, digest: beforeDigest, text: before } };
				if (intent.arguments.beforeDigest !== beforeDigest || signal.aborted) throw new Error("FILE_CONTENT_STALE");
				const current = await lstat(path);
				if (current.dev !== stat.dev || current.ino !== stat.ino || current.isSymbolicLink() || await realpath(path) !== path) throw new Error("FILE_TARGET_CHANGED");
				const content = Buffer.from(intent.arguments.content as string);
				// The already-open inode is the write target. Partial I/O is uncertain, never retried here.
				let offset = 0;
				while (offset < content.length) {
					if (signal.aborted) throw new Error("FILE_ACTION_INTERRUPTED");
					const { bytesWritten } = await file.write(content, offset, content.length - offset, offset);
					if (!bytesWritten) throw new Error("FILE_WRITE_INCOMPLETE");
					offset += bytesWritten;
				}
				await file.truncate(content.length);
				await file.sync();
				const buffer = Buffer.alloc(content.length);
				let read = 0;
				while (read < buffer.length) { const result = await file.read(buffer, read, buffer.length - read, read); if (!result.bytesRead) break; read += result.bytesRead; }
				const after = await lstat(path);
				const passed = read === buffer.length && buffer.equals(content) && after.dev === stat.dev && after.ino === stat.ino;
				return { outcome: passed ? "passed" : "failed", summary: `Replace ${path}`, source: { path, beforeDigest, afterDigest: digest(buffer.toString("utf8")), readBack: passed } };
			} finally { await file.close(); }
		},
	});
	return [capability(false), capability(true)];
}
