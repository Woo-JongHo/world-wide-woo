import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { DevelopmentService } from "../application/development-service";
import type { DevelopmentContext } from "../domain/development-records";
import { isReasoningActivityPayload } from "../domain/project-activity";
import { scanDevelopmentCode } from "./development-code-scanner";
import { DevelopmentStore } from "./development-store";
import { runDevelopmentTest } from "./development-test-runner";
import { developmentVaultRoot, exportDevelopmentVault, persistDevelopmentVaultRequest, resolveDevelopmentDocument, replayDevelopmentVault } from "./development-vault";

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

export function formatDevelopmentContext(context: DevelopmentContext, runId?: string): string {
 const current = [...context.bindings].sort((a, b) => b.version - a.version)[0];
 return [
  `개발 연결${runId ? ` · Run ${runId}` : ""} · ${context.integrity.status}`,
  `Issue: ${context.issues.map(x => x.id).join(", ") || "없음"}`,
  `Unit: ${context.units.map(x => `${x.name} (${x.id})`).join(", ") || "없음"}`,
  ...(runId ? [`현재 결속 v${current?.version ?? 0}: ${current?.issueIds.join(", ") || "미연결"}`] : []),
  `공개 기록 ${context.records.filter(x=>x.kind !== "document").length} · 테스트 ${context.tests.length}`,
  ...context.records.filter(x=>x.kind === "document").map(x=>`Obsidian: ${String(x.metadata.documentId)} · ${String(x.metadata.path)}`),
  ...context.tests.map(test => `${test.status} · ${test.command} · ${test.id}`),
  ...context.legacyReferences.filter(x => ["code", "test", "evidence"].includes(x.kind)).map(x => `${x.kind}: ${x.id}`),
  `원본: ${context.sourceRoot}`, `SQLite: ${context.indexPath}`,
  ...context.integrity.errors,
 ].join("\n");
}

export interface DevelopmentRuntimeOptions {
 projectRoot: string; runId: string; dataRoot?: string; vaultRoot?: string;
 openUri?: (uri: string) => Promise<void>;
}

/** @linear WOO-699 */
/** Lazy storage keeps an ordinary unbound Chat session free from recording writes. */
export function createDevelopmentService(options: DevelopmentRuntimeOptions): DevelopmentService {
 let store: DevelopmentStore | undefined;
 let latestDocument: string | undefined;
 const db = () => store ??= new DevelopmentStore({ projectRoot: options.projectRoot, dataRoot: options.dataRoot });
 const latestBinding = () => [...db().getRunContext(options.runId).bindings].sort((a,b) => b.version-a.version)[0];
 const prepareCheckpoint = (requestId: string): (() => Promise<string>) => {
  if (!store) return async () => "Issue가 연결되지 않아 기록할 개발 Run이 없습니다.";
  const context = store.getRunContext(options.runId);
  if (!context.bindings.length) return async () => "Issue가 연결되지 않아 기록할 개발 Run이 없습니다.";
  if (context.integrity.status !== "current") throw new Error(`원본 인덱스를 확인하세요: ${context.integrity.status}`);
  const binding = [...context.bindings].sort((a,b)=>b.version-a.version)[0]!;
  const previous = context.records.filter(x=>x.kind === "document").sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
  const request = { requestId, projectId: context.projectId, runId: options.runId,
   title: `개발 기록 · ${context.issues.map(x => x.id).join(", ")}`, unitIds: context.units.map(x => x.id),
   issues: context.issues, records: context.records.filter(x=>x.kind !== "document"), tests: context.tests,
   priorDocumentId: previous?.metadata.documentId as string | undefined,
   codeLinks: context.legacyReferences.filter(x=>["code","test","evidence"].includes(x.kind)).map(x=>({label:x.id,url:`file://${join(options.projectRoot,x.id)}`})),
  };
  const outboxRoot = join(store.sourceRoot, "vault-outbox");
  persistDevelopmentVaultRequest(request,outboxRoot);
  return async () => {
   const receipt = exportDevelopmentVault(request, { vaultRoot: options.vaultRoot, outboxRoot });
   latestDocument = receipt.documentId;
   db().captureRecord({runId:options.runId,bindingId:binding.id,sourceEventId:`document:${receipt.documentId}`,kind:"document",body:`Obsidian: ${receipt.documentId}`,
    metadata:{documentId:receipt.documentId,path:receipt.path,digest:receipt.digest,requestId:receipt.requestId}});
   return `Obsidian 기록: ${receipt.documentId}\n${receipt.path}`;
  };
 };
 const checkpoint = async (requestId: string) => prepareCheckpoint(requestId)();
 const execute = async (args: readonly string[]): Promise<string> => {
  const [command, ...rest] = args;
  if (!command || command === "help" || command === "--help" || command === "-h") return DEVELOPMENT_HELP;
  if (command === "unit" && rest.length >= 1 && rest.length <= 2) return JSON.stringify(db().registerUnit({ name: rest[0]!, id: rest[1] }));
  if (command === "link" && (rest.length === 2 || rest.length === 4)) {
   const issue = rest.length === 4 ? { id: rest[1]!, uuid: rest[2]!, url: rest[3]! } : db().getIssueContext(rest[1]!).issues.find(x => x.id === rest[1]);
   if (!issue) throw new Error("등록된 Linear UUID를 찾지 못했습니다. issue UUID와 URL을 명시하세요.");
   return JSON.stringify(db().linkIssue({ unitId: rest[0]!, issue }));
  }
  if (command === "issue" && rest.length >= 1) {
   const issue = db().getIssueContext(rest[0]!);
   const binding = db().bindRun({ runId: options.runId, issueIds: [rest[0]!], unitIds: rest.length > 1 ? rest.slice(1) : issue.units.map(x => x.id) });
   return `Run ${options.runId} · ${binding.issueIds.join(", ")} · 결속 v${binding.version}`;
  }
  if (command === "status" && rest.length === 0) return formatDevelopmentContext(db().getRunContext(options.runId), options.runId);
  if ((command === "map" && rest.length === 2 && (rest[0] === "issue" || rest[0] === "unit")) || (command === "scan" && rest.length === 0)) {
   const all = db().getContext();
   if (all.integrity.status !== "current") throw new Error(`인덱스 확인 필요: ${all.integrity.status}`);
   const scan = scanDevelopmentCode(options.projectRoot, all.units, all.issues);
   if (command === "scan") { if (scan.errors.length) throw new Error(scan.errors.join("\n")); return JSON.stringify(scan,null,2); }
   const context = rest[0] === "issue" ? db().getIssueContext(rest[1]!) : db().getUnitContext(rest[1]!);
   const locations = scan.locations.filter(x => rest[0] === "issue" ? x.issueIds.includes(rest[1]!) : x.unitIds.includes(rest[1]!));
   return [formatDevelopmentContext(context), ...locations.map(x => `코드 선언: ${x.path}:${x.line}`), ...scan.errors.map(x=>`선언 오류: ${x}`)].join("\n");
  }
  if (command === "retry" && rest.length === 0) {
   const result = replayDevelopmentVault(join(db().sourceRoot,"vault-outbox"), {vaultRoot:options.vaultRoot});
   if (result.failures.length) throw new Error(JSON.stringify(result,null,2));
   return JSON.stringify(result,null,2);
  }
  if (command === "rebuild" && rest.length === 0) return JSON.stringify(db().rebuildIndex());
  if (command === "checkpoint" && rest.length === 0) { db(); return checkpoint(`manual:${randomUUID()}`); }
  if (command === "open" && rest.length <= 1) {
   const prior = options.runId ? db().getRunContext(options.runId).records.filter(x=>x.kind === "document").sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0] : undefined;
   const id = rest[0] ?? latestDocument ?? prior?.metadata.documentId as string | undefined;
   if (!id) throw new Error("열 문서 ID를 지정하거나 먼저 /work checkpoint를 실행하세요.");
   const path = resolveDevelopmentDocument(id, options.vaultRoot ?? developmentVaultRoot());
   const uri = `obsidian://open?path=${encodeURIComponent(path)}`;
   if (options.openUri) await options.openUri(uri);
   else { const { default: open } = await import("open"); await open(uri); }
   return `Obsidian 열기 요청: ${id}\n${path}`;
  }
  if (command === "test" && rest[0] === "--" && rest.length > 1) {
   const binding = latestBinding(); if (!binding) throw new Error("테스트 전에 Run과 Issue를 연결하세요.");
   const result = await runDevelopmentTest({ argv: rest.slice(1), projectRoot: options.projectRoot, artifactRoot: join(db().sourceRoot, "artifacts") });
   const test = db().recordTest({ runId: options.runId, bindingId: binding.id, sourceEventId: `test:${randomUUID()}`, command: result.command, cwd: result.cwd,
    status: result.status, exitCode: result.exitCode, output: result.output, snapshot: {...result.snapshot, execution: {argv:result.argv,startedAt:result.startedAt,finishedAt:result.finishedAt,signal:result.signal}} });
   await checkpoint(`test:${test.id}`);
   const message = `테스트 ${test.status} · ${test.id}\n${test.output}`;
   if (test.status !== "passed") throw new Error(message);
   return message;
  }
  throw new Error(DEVELOPMENT_HELP);
 };
 return new DevelopmentService(options.runId, { execute, checkpoint, prepareCheckpoint, close: () => store?.close(), capture: activity => {
  if (!store || !latestBinding() || isReasoningActivityPayload(activity.payload)) return;
  if (activity.kind !== "message" && activity.kind !== "tool" && activity.kind !== "progress") return;
  store.captureRecord({ runId: options.runId, sourceEventId: activity.id, kind: activity.kind,
   body: JSON.stringify(activity.payload, null, 2), metadata: { nativeRefs: activity.nativeRefs, phase: activity.phase,
    sourceDigest: activity.sourceDigest, recordedAt: activity.recordedAt, coverage: "partial-public-observation" } });
 } });
}

export async function runDevelopmentCli(args: string[], options: Omit<DevelopmentRuntimeOptions, "runId"> = { projectRoot: process.cwd() }): Promise<string> {
 const command = args[0];
 let runId = ""; let forwarded = args;
 if (["bind", "test", "checkpoint"].includes(command ?? "")) {
  if (!args[1]) throw new Error(DEVELOPMENT_HELP);
  runId = args[1]; forwarded = [command === "bind" ? "issue" : command!, ...args.slice(2)];
 } else if (command === "status") { runId = args[1] ?? ""; forwarded = ["status"]; if (args.length > 2) throw new Error(DEVELOPMENT_HELP); }
 const service = createDevelopmentService({ ...options, runId });
 try { return await service.execute(forwarded); } finally { await service.close(); }
}
