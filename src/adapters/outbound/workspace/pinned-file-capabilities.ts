import { constants }                                         from "node:fs";
import { open, lstat, realpath }                             from "node:fs/promises";
import { createHash }                                        from "node:crypto";
import { isAbsolute, resolve }                               from "node:path";
import type { RequestActionCapability, RequestActionIntent } from "@/core/ports/execution/request-action-port";

const MAX_BYTES      = 64 * 1024;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;

const digest = (text: string): string => `sha256:${createHash("sha256").update(text).digest("hex")}`;

type ApprovalPreview = NonNullable<RequestActionCapability["approvalPreview"]> ;
type Reconciliation  = NonNullable<RequestActionCapability["reconciliation"]>  ;
type ExecuteAction   = RequestActionCapability["execute"]                      ;
type InputSchema     = NonNullable<RequestActionCapability["inputSchema"]>     ;

/** A host-approved single operation. Native cannot mint, edit or widen this permit. */
export interface PinnedFileWritePermit {
	readonly requestId        : string ;
	readonly operationId      : string ;
	readonly expectedRevision : number ;
	readonly path             : string ;
	readonly beforeDigest     : string ;
	readonly afterDigest      : string ;
}

/** Explicit files only; no directory grants, creates, shell, network or remote credentials. */
export function pinnedFileCapabilities(
	paths   : readonly string[],
	permits : readonly PinnedFileWritePermit[] = [],
): readonly RequestActionCapability[] {
	if (paths.some(path => !isAbsolute(path) || resolve(path) !== path)) {
		throw new Error("Pinned file paths must be canonical absolute paths");
	}

	const allowed   = new Set(paths);
	const approvals = structuredClone(permits);

	// 01. 요청 범위와 실행 승인

	const isInScope = (intent: RequestActionIntent, write: boolean): boolean => {
		const args = intent.arguments;

		if (typeof args.path !== "string" || !allowed.has(args.path)) return false;

		const allowedFields = write ? ["path", "content", "beforeDigest"] : ["path"];
		if (Object.keys(args).some(key => !allowedFields.includes(key))) return false;

		if (!write) return true;

		return (
			(typeof args.content      === "string" && Buffer.byteLength(args.content) <= MAX_BYTES) &&
			(typeof args.beforeDigest === "string" && DIGEST_PATTERN.test(args.beforeDigest))
		);
	};

	const isAuthorized = (intent: RequestActionIntent, write: boolean): boolean => {
		if (!isInScope(intent, write)) return false;
		if (!write) return true;

		const args = intent.arguments;

		return approvals.some(permit => (
			permit.requestId        === intent.requestId &&
			permit.operationId      === intent.operationId &&
			permit.expectedRevision === intent.expectedRevision &&
			permit.path             === args.path &&
			permit.beforeDigest     === args.beforeDigest &&
			permit.afterDigest      === digest(args.content as string)
		));
	};

	// 02. 승인 미리보기

	const approvalPreview: ApprovalPreview = async intent => {
		if (!isInScope(intent, true)) return null;

		const args = intent.arguments;

		return {
			summary: `파일 교체 · ${args.path}`,
			detail : [
				"이 작업 한 번만 승인합니다.",
				`기존 SHA: ${args.beforeDigest}`,
				`변경 SHA: ${digest(args.content as string)}`,
				"교체할 전체 내용:",
				`${args.content}`,
			].join("\n"),
		};
	};

	// 03. 교체 결과 재확인

	const prepareReconciliation: Reconciliation["prepare"] = intent => ({
		path         : intent.arguments.path,
		beforeDigest : intent.arguments.beforeDigest,
		afterDigest  : digest(intent.arguments.content as string),
	});

	const readBack: Reconciliation["readBack"] = async (descriptor, signal) => {
		const { path, beforeDigest, afterDigest } = descriptor;

		if (
			typeof path !== "string" ||
			!allowed.has(path) ||
			typeof afterDigest !== "string" ||
			!DIGEST_PATTERN.test(afterDigest) ||
			signal.aborted
		) {
			throw new Error("RECONCILIATION_SCOPE_DENIED");
		}

		if (await realpath(path) !== path) throw new Error("FILE_SYMLINK_DENIED");

		const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);

		try {
			const stat = await file.stat();
			if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_BYTES) {
				throw new Error("FILE_SCOPE_DENIED");
			}

			const bytes = await file.readFile();
			if (bytes.length > MAX_BYTES) throw new Error("FILE_TOO_LARGE");

			const observedDigest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
			const current        = await lstat(path);

			if (
				signal.aborted ||
				current.isSymbolicLink() ||
				current.dev !== stat.dev ||
				current.ino !== stat.ino ||
				await realpath(path) !== path
			) {
				throw new Error("FILE_TARGET_CHANGED");
			}

			const confirmed = observedDigest === afterDigest;

			return {
				confirmed,
				summary: confirmed
					? `Desired file state confirmed: ${path}`
					: `File state unresolved: ${path}`,
				source: { path, beforeDigest, expectedDigest: afterDigest, observedDigest, readBack: confirmed },
			};
		} finally {
			await file.close();
		}
	};

	const reconciliation: Reconciliation = {
		prepare : prepareReconciliation,
		readBack,
	};

	// 04. 파일 읽기와 교체 실행

	const createExecutor = (write: boolean): ExecuteAction => async (intent, signal, grant) => {
		const granted = (
			write &&
			isInScope(intent, true) &&
			grant &&
			JSON.stringify(grant.intent) === JSON.stringify(intent)
		);

		if (!(isAuthorized(intent, write) || granted) || signal.aborted) {
			throw new Error("FILE_ACTION_DENIED");
		}

		const path = intent.arguments.path as string;
		if (await realpath(path) !== path) throw new Error("FILE_SYMLINK_DENIED");

		const mode = (write ? constants.O_RDWR : constants.O_RDONLY) | constants.O_NOFOLLOW;
		const file = await open(path, mode);

		try {
			const stat = await file.stat();
			if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_BYTES) {
				throw new Error("FILE_SCOPE_DENIED");
			}

			const beforeBytes = await file.readFile();
			const before      = beforeBytes.toString("utf8");

			if (beforeBytes.length > MAX_BYTES) throw new Error("FILE_TOO_LARGE");
			if (!Buffer.from(before).equals(beforeBytes)) throw new Error("FILE_NOT_UTF8");

			const beforeDigest = digest(before);

			if (!write) {
				return {
					outcome : "passed",
					summary : `Read ${path}`,
					source  : { path, digest: beforeDigest, text: before },
				};
			}

			if (intent.arguments.beforeDigest !== beforeDigest || signal.aborted) {
				throw new Error("FILE_CONTENT_STALE");
			}

			const current = await lstat(path);

			if (
				current.dev !== stat.dev ||
				current.ino !== stat.ino ||
				current.isSymbolicLink() ||
				await realpath(path) !== path
			) {
				throw new Error("FILE_TARGET_CHANGED");
			}

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
			let read     = 0;

			while (read < buffer.length) {
				const result = await file.read(buffer, read, buffer.length - read, read);
				if (!result.bytesRead) break;

				read += result.bytesRead;
			}

			const after  = await lstat(path);
			const passed = (
				read === buffer.length &&
				buffer.equals(content) &&
				after.dev === stat.dev &&
				after.ino === stat.ino
			);

			return {
				outcome : passed ? "passed" : "failed",
				summary : `Replace ${path}`,
				source  : { path, beforeDigest, afterDigest: digest(buffer.toString("utf8")), readBack: passed },
			};
		} finally {
			await file.close();
		}
	};

	// 05. 스키마와 capability 구성

	const createInputSchema = (write: boolean): InputSchema => ({
		type: "object",
		properties: {
			path: { type: "string", enum: [...allowed] },
			...(write ? {
				beforeDigest : { type: "string" },
				content      : { type: "string" },
			} : {}),
		},
		required             : write ? ["path", "beforeDigest", "content"] : ["path"],
		additionalProperties : false,
	});

	const createCapability = (write: boolean): RequestActionCapability => ({
		id          : write ? "files.replace-approved" : "files.read-pinned",
		effect      : write ? "workspace-change" : "read",
		description : write
			? "Replace one pinned UTF-8 file after exact before-digest check and single-action host approval. No creation."
			: "Read one pinned UTF-8 file with its SHA-256. May be used for fresh verification read-back.",
		inputSchema : createInputSchema(write),
		authorize   : async intent => isAuthorized(intent, write),
		...(write ? { approvalPreview, reconciliation } : {}),
		execute     : createExecutor(write),
	});

	return [createCapability(false), createCapability(true)];
}
