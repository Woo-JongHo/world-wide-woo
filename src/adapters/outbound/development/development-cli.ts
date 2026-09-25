import { randomUUID }                 from "node:crypto";
import { join }                       from "node:path";
import { DevelopmentService }         from "@/core/application/development/development-service";
import type { DevelopmentContext }    from "@/core/domain/development/development-records";
import { isReasoningActivityPayload } from "@/core/domain/execution/project-activity";
import { scanDevelopmentCode }        from "@/adapters/outbound/development/development-code-scanner";
import { DevelopmentStore }           from "@/adapters/outbound/development/development-store";
import { runDevelopmentTest }         from "@/adapters/outbound/development/development-test-runner";
import {
	developmentVaultRoot,
	exportDevelopmentVault,
	persistDevelopmentVaultRequest,
	replayDevelopmentVault,
	resolveDevelopmentDocument,
} from "@/adapters/outbound/development/development-vault";

export const DEVELOPMENT_HELP = [
	"www development unit <name> [uuid]",
	"www development link <unit-uuid> <WOO-id> [issue-uuid issue-url]",
	"www development bind <run-id> <WOO-id> [unit-uuid ...]",
	"www development status [run-id] | map <issue|unit> <id> | scan | rebuild | retry",
	"www development test <run-id> -- <executable> [arguments ...]",
	"www development checkpoint <run-id> | open <document-uuid>",
	"TUI: /work issue <WOO-id> [unit-uuid ...] · /work status · /work checkpoint · /work open [document-uuid]",
	"TUI: /map issue <WOO-id> · /map unit <uuid>",
	"WWW_DATA_DIR: 공유 SQLite 데이터 루트 · WWW_DEVELOPMENT_VAULT: 전용 Vault 경로",
].join("\n");

const latestByVersion = <T extends { version: number }>(values: readonly T[]): T | undefined =>
	[...values].sort((left, right) => right.version - left.version)[0];

const latestDocumentRecord = (context: DevelopmentContext) =>
	context.records
		.filter(record => record.kind === "document")
		.sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

export function formatDevelopmentContext(context: DevelopmentContext, runId?: string): string {
	const binding   = latestByVersion(context.bindings)                            ;
	const records   = context.records.filter(record => record.kind !== "document") ;
	const documents = context.records.filter(record => record.kind === "document") ;

	return [
		`개발 연결${runId ? ` · Run ${runId}` : ""} · ${context.integrity.status}`,
		`Issue: ${context.issues.map(issue => issue.id).join(", ") || "없음"}`,
		`Unit: ${context.units.map(unit => `${unit.name} (${unit.id})`).join(", ") || "없음"}`,
		...(runId ? [`현재 결속 v${binding?.version ?? 0}: ${binding?.issueIds.join(", ") || "미연결"}`] : []),
		`공개 기록 ${records.length} · 테스트 ${context.tests.length}`,
		...documents.map(record => `Obsidian: ${String(record.metadata.documentId)} · ${String(record.metadata.path)}`),
		...context.tests.map(test => `${test.status} · ${test.command} · ${test.id}`),
		...context.legacyReferences
			.filter(reference => ["code", "test", "evidence"].includes(reference.kind))
			.map(reference => `${reference.kind}: ${reference.id}`),
		`원본: ${context.sourceRoot}`,
		`SQLite: ${context.indexPath}`,
		...context.integrity.errors,
	].join("\n");
}

export interface DevelopmentRuntimeOptions {
	projectRoot: string;
	runId: string;
	/** Optional persistent data directory; omit to use the standard WWW data root. */
	dataRoot?: string;
	/** Optional Obsidian vault; omit to use the configured development vault. */
	vaultRoot?: string;
	openUri?: (uri: string) => Promise<void>;
}

/** @linear WOO-699 */
/** Lazy storage keeps an ordinary unbound Chat session free from recording writes. */
export function createDevelopmentService(options: DevelopmentRuntimeOptions): DevelopmentService {
	let store: DevelopmentStore | undefined;
	let latestDocument: string | undefined;
	const db = () => store ??= new DevelopmentStore({
		projectRoot: options.projectRoot,
		...(options.dataRoot ? { dataRoot: options.dataRoot } : {}),
	});
	const latestBinding = () => latestByVersion(db().getRunContext(options.runId).bindings);

	const prepareCheckpoint = (requestId: string): (() => Promise<string>) => {
		if (!store) return async () => "Issue가 연결되지 않아 기록할 개발 Run이 없습니다.";
		const context = store.getRunContext(options.runId);
		if (!context.bindings.length) return async () => "Issue가 연결되지 않아 기록할 개발 Run이 없습니다.";
		if (context.integrity.status !== "current") throw new Error(`원본 인덱스를 확인하세요: ${context.integrity.status}`);

		const binding = latestByVersion(context.bindings);
		if (!binding) return async () => "Issue가 연결되지 않아 기록할 개발 Run이 없습니다.";
		const previous = latestDocumentRecord(context);
		const priorDocumentId = previous?.metadata.documentId;
		const request = {
			requestId,
			projectId : context.projectId,
			runId     : options.runId,
			title     : `개발 기록 · ${context.issues.map(issue => issue.id).join(", ")}`,
			unitIds   : context.units.map(unit => unit.id),
			issues    : context.issues,
			records   : context.records.filter(record => record.kind !== "document"),
			tests     : context.tests,
			...(typeof priorDocumentId === "string" ? { priorDocumentId } : {}),
			codeLinks: context.legacyReferences
				.filter(reference => ["code", "test", "evidence"].includes(reference.kind))
				.map(reference => ({ label: reference.id, url: `file://${join(options.projectRoot, reference.id)}` })),
		};
		const outboxRoot = join(store.sourceRoot, "vault-outbox");
		persistDevelopmentVaultRequest(request, outboxRoot);

		return async () => {
			const receipt = exportDevelopmentVault(request, {
				outboxRoot,
				...(options.vaultRoot ? { vaultRoot: options.vaultRoot } : {}),
			});
			latestDocument = receipt.documentId;
			db().captureRecord({
				runId         : options.runId,
				bindingId     : binding.id,
				sourceEventId : `document:${receipt.documentId}`,
				kind          : "document",
				body          : `Obsidian: ${receipt.documentId}`,
				metadata: {
					documentId : receipt.documentId,
					path       : receipt.path,
					digest     : receipt.digest,
					requestId  : receipt.requestId,
				},
			});
			return `Obsidian 기록: ${receipt.documentId}\n${receipt.path}`;
		};
	};

	const checkpoint = async (requestId: string) => prepareCheckpoint(requestId)();
	const execute = async (args: readonly string[]): Promise<string> => {
		const [command, ...rest] = args;
		if (!command
			|| command === "help"
			|| command === "--help"
			|| command === "-h") return DEVELOPMENT_HELP;

		if (command === "unit" && rest.length >= 1 && rest.length <= 2) {
			const name = rest[0];
			if (!name) return DEVELOPMENT_HELP;
			return JSON.stringify(db().registerUnit({ name, ...(rest[1] ? { id: rest[1] } : {}) }));
		}
		if (command === "link" && (rest.length === 2 || rest.length === 4)) {
			const [unitId, issueId, issueUuid, issueUrl] = rest;
			if (!unitId || !issueId) return DEVELOPMENT_HELP;
			const issue = issueUuid && issueUrl
				? { id: issueId, uuid: issueUuid, url: issueUrl }
				: db().getIssueContext(issueId).issues.find(candidate => candidate.id === issueId);
			if (!issue) throw new Error("등록된 Linear UUID를 찾지 못했습니다. issue UUID와 URL을 명시하세요.");
			return JSON.stringify(db().linkIssue({ unitId, issue }));
		}
		if (command === "issue" && rest.length >= 1) {
			const issueId = rest[0];
			if (!issueId) return DEVELOPMENT_HELP;
			const issue = db().getIssueContext(issueId);
			const binding = db().bindRun({
				runId    : options.runId,
				issueIds : [issueId],
				unitIds  : rest.length > 1 ? rest.slice(1) : issue.units.map(unit => unit.id),
			});
			return `Run ${options.runId} · ${binding.issueIds.join(", ")} · 결속 v${binding.version}`;
		}
		if (command === "status" && rest.length === 0) return formatDevelopmentContext(db().getRunContext(options.runId), options.runId);
		if ((command === "map" && rest.length === 2 && (rest[0] === "issue" || rest[0] === "unit")) || (command === "scan" && rest.length === 0)) {
			const all = db().getContext();
			if (all.integrity.status !== "current") throw new Error(`인덱스 확인 필요: ${all.integrity.status}`);
			const scan = scanDevelopmentCode(options.projectRoot, all.units, all.issues);
			if (command === "scan") {
				if (scan.errors.length) throw new Error(scan.errors.join("\n"));
				return JSON.stringify(scan, null, 2);
			}
			const [target, id] = rest;
			if (!target || !id) return DEVELOPMENT_HELP;
			const context = target === "issue" ? db().getIssueContext(id) : db().getUnitContext(id);
			const locations = scan.locations.filter(location => target === "issue" ? location.issueIds.includes(id) : location.unitIds.includes(id));
			return [
				formatDevelopmentContext(context),
				...locations.map(location => `코드 선언: ${location.path}:${location.line}`),
				...scan.errors.map(error => `선언 오류: ${error}`),
			].join("\n");
		}
		if (command === "retry" && rest.length === 0) {
			const result = replayDevelopmentVault(join(db().sourceRoot, "vault-outbox"), options.vaultRoot ? { vaultRoot: options.vaultRoot } : {});
			if (result.failures.length) throw new Error(JSON.stringify(result, null, 2));
			return JSON.stringify(result, null, 2);
		}
		if (command === "rebuild" && rest.length === 0) return JSON.stringify(db().rebuildIndex());
		if (command === "checkpoint" && rest.length === 0) {
			db();
			return checkpoint(`manual:${randomUUID()}`);
		}
		if (command === "open" && rest.length <= 1) {
			const priorDocument   = latestDocumentRecord(db().getRunContext(options.runId))                                          ;
			const priorDocumentId = priorDocument?.metadata.documentId                                                               ;
			const id              = rest[0] ?? latestDocument ?? (typeof priorDocumentId === "string" ? priorDocumentId : undefined) ;
			if (!id) throw new Error("열 문서 ID를 지정하거나 먼저 /work checkpoint를 실행하세요.");
			const path = resolveDevelopmentDocument(id, options.vaultRoot ?? developmentVaultRoot());
			const uri = `obsidian://open?path=${encodeURIComponent(path)}`;
			if (options.openUri) await options.openUri(uri);
			else {
				const { default: open } = await import("open");
				await open(uri);
			}
			return `Obsidian 열기 요청: ${id}\n${path}`;
		}
		if (command === "test" && rest[0] === "--" && rest.length > 1) {
			const binding = latestBinding();
			if (!binding) throw new Error("테스트 전에 Run과 Issue를 연결하세요.");
			const result = await runDevelopmentTest({
				argv         : rest.slice(1),
				projectRoot  : options.projectRoot,
				artifactRoot : join(db().sourceRoot, "artifacts"),
			});
			const test = db().recordTest({
				runId         : options.runId,
				bindingId     : binding.id,
				sourceEventId : `test:${randomUUID()}`,
				command       : result.command,
				cwd           : result.cwd,
				status        : result.status,
				exitCode      : result.exitCode,
				output        : result.output,
				snapshot: {
					...result.snapshot,
					execution: {
						argv       : result.argv,
						startedAt  : result.startedAt,
						finishedAt : result.finishedAt,
						signal     : result.signal,
					},
				},
			});
			await checkpoint(`test:${test.id}`);
			const message = `테스트 ${test.status} · ${test.id}\n${test.output}`;
			if (test.status !== "passed") throw new Error(message);
			return message;
		}
		throw new Error(DEVELOPMENT_HELP);
	};

	return new DevelopmentService(options.runId, {
		execute,
		checkpoint,
		prepareCheckpoint,
		close: () => store?.close(),
		capture: activity => {
			if (!store || !latestBinding() || isReasoningActivityPayload(activity.payload)) return;
			if (activity.kind !== "message" && activity.kind !== "tool" && activity.kind !== "progress") return;
			store.captureRecord({
				runId         : options.runId,
				sourceEventId : activity.id,
				kind          : activity.kind,
				body          : JSON.stringify(activity.payload, null, 2),
				metadata: {
					nativeRefs   : activity.nativeRefs,
					phase        : activity.phase,
					sourceDigest : activity.sourceDigest,
					recordedAt   : activity.recordedAt,
					coverage     : "partial-public-observation",
				},
			});
		},
	});
}

export async function runDevelopmentCli(args: string[], options: Omit<DevelopmentRuntimeOptions, "runId"> = { projectRoot: process.cwd() }): Promise<string> {
	const command = args[0] ;
	let runId     = ""      ;
	let forwarded = args    ;
	if (["bind", "test", "checkpoint"].includes(command ?? "")) {
		const requestedRunId = args[1];
		if (!requestedRunId) throw new Error(DEVELOPMENT_HELP);
		runId = requestedRunId;
		const forwardedCommand = command === "bind" ? "issue" : command === "test" || command === "checkpoint" ? command : "";
		forwarded = [forwardedCommand, ...args.slice(2)];
	} else if (command === "status") {
		runId = args[1] ?? "";
		forwarded = ["status"];
		if (args.length > 2) throw new Error(DEVELOPMENT_HELP);
	}
	const service = createDevelopmentService({ ...options, runId });
	try {
		return await service.execute(forwarded);
	} finally {
		await service.close();
	}
}
