import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { developmentDigest, writeDevelopmentArtifact } from './development-snapshot.js';

/** @linear WOO-698 */
export interface DevelopmentVaultRequest {
  requestId: string; priorDocumentId?: string; codeLinks?: { label: string; url: string }[]; projectId: string; runId: string; title: string; summary?: string; unitIds: string[];
  issues: { id: string; uuid: string; url?: string }[];
  records: { id: string; body: string; kind?: string; metadata?: Record<string, unknown> }[];
  tests?: { id: string; status: string; command: string; output: string; snapshot?: unknown }[];
}
export interface DevelopmentVaultReceipt { documentId: string; path: string; digest: string; requestId: string; uri: string }
interface DevelopmentVaultDoneReceipt { documentId: string; requestId: string; inputDigest: string; digest: string }
export function developmentVaultRoot(): string { return resolve(process.env.WWW_DEVELOPMENT_VAULT || join(homedir(), 'woo', '03_WWW_Development')); }
function uuidFor(value: string): string {
  const h = developmentDigest(value);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
function safeDirectory(root: string, name: string): string {
  const path = join(root, name);
  mkdirSync(path, { recursive: true });
  if (lstatSync(path).isSymbolicLink() || realpathSync(path) !== path) throw new Error(`Vault directory must not be a symlink: ${path}`);
  return path;
}
export function resolveDevelopmentDocument(documentId: string, vaultRoot = developmentVaultRoot()): string {
  if (!/^[0-9a-f-]{36}$/.test(documentId)) throw new Error('Invalid document UUID');
  const found: string[] = [];
  const visit = (folder: string) => {
    for (const item of readdirSync(folder, { withFileTypes: true })) {
      if (item.isSymbolicLink()) continue;
      const path = join(folder, item.name);
      if (item.isDirectory()) { if (item.name !== '.www') visit(path); }
      else if (item.isFile() && item.name.endsWith('.md') && readFileSync(path, 'utf8').startsWith(`---\nwww_document_id: "${documentId}"\n`)) found.push(path);
    }
  };
  visit(resolve(vaultRoot));
  if (found.length !== 1) throw new Error(found.length ? `Duplicate document ID: ${documentId}` : `Document missing: ${documentId}`);
  return found[0]!;
}
export function exportDevelopmentVault(request: DevelopmentVaultRequest, options: { vaultRoot?: string; outboxRoot?: string } = {}): DevelopmentVaultReceipt {
  if (!request.requestId || !request.projectId || !request.runId) throw new Error('Request, project and run IDs are required');
  const identity = `${request.projectId}\0${request.runId}\0${request.requestId}`;
  const documentId = uuidFor(identity); const inputDigest = developmentDigest(JSON.stringify(request));
  if (options.outboxRoot) persistDevelopmentVaultRequest(request, options.outboxRoot);
  const root = resolve(options.vaultRoot || developmentVaultRoot()); mkdirSync(root, { recursive: true });
  if (realpathSync(root) !== root) throw new Error('Vault root must not be a symlink');
  const rawDir = safeDirectory(root, 'Raw'); const notes = safeDirectory(root, 'Development');
  const state = safeDirectory(root, '.www'); const receipts = safeDirectory(state, 'receipts');
  const receiptPath = join(receipts, `${documentId}.json`);
  const donePath = options.outboxRoot ? join(options.outboxRoot, `${documentId}.done.json`) : undefined;
  const uri = (path: string) => `obsidian://open?path=${encodeURIComponent(path)}`;
  if (donePath && existsSync(donePath)) validateDoneReceipt(donePath, { documentId, requestId: request.requestId, inputDigest }, root);
  if (existsSync(receiptPath)) {
    if (!lstatSync(receiptPath).isFile() || lstatSync(receiptPath).isSymbolicLink()) throw new Error('Unsafe export receipt');
    const prior = JSON.parse(readFileSync(receiptPath, 'utf8')) as DevelopmentVaultReceipt & { inputDigest: string };
    if (prior.inputDigest !== inputDigest) throw new Error('Export request ID reused with different contents');
    const path = resolveDevelopmentDocument(documentId, root);
    if (developmentDigest(readFileSync(path)) !== prior.digest) throw new Error(`Export conflict: human-edited document ${documentId}`);
    const result = { documentId, requestId: request.requestId, path, digest: prior.digest, uri: uri(path) };
    if (donePath) writeDevelopmentArtifact(donePath, JSON.stringify({ documentId, requestId: request.requestId, inputDigest, digest: result.digest }) + '\n');
    return result;
  }
  const raw = JSON.stringify(request, null, 2) + '\n'; const rawDigest = developmentDigest(raw);
  const rawPath = join(rawDir, `${rawDigest}.json`); writeDevelopmentArtifact(rawPath, raw);
  const q = JSON.stringify;
  const note = [
    '---', `www_document_id: ${q(documentId)}`, `www_project_id: ${q(request.projectId)}`, `www_run_id: ${q(request.runId)}`,
    `www_unit_ids: ${q(request.unitIds)}`, `www_linear_ids: ${q(request.issues.map((issue) => issue.id))}`,
    `www_linear_uuids: ${q(request.issues.map((issue) => issue.uuid))}`, `www_record_ids: ${q(request.records.map((record) => record.id))}`,
    `www_test_ids: ${q((request.tests ?? []).map((test) => test.id))}`, `www_source_digest: ${q(rawDigest)}`, `www_request_id: ${q(request.requestId)}`,
    `www_supersedes: ${q(request.priorDocumentId ?? null)}`, 'www_renderer_version: 2', '---', '', `# ${request.title.replace(/[\r\n]/g, ' ')}`, '',
    request.summary || '개발 세션의 공개 기록과 실행 근거입니다.', '',
    '## 연결', '', ...request.issues.map((issue) => `- ${issue.url ? `[${issue.id}](${issue.url})` : issue.id}`),
    ...(request.codeLinks ?? []).map((link) => `- [${link.label.replace(/[\[\]\r\n]/g, ' ')}](<${link.url.replace(/[<>\r\n]/g, '')}>)`),
    ...(request.priorDocumentId ? [`- 이전 문서: ${request.priorDocumentId}`] : []), `- [보존 원문 및 provenance](../Raw/${rawDigest}.json)`, '',
    '## 대화·개발 기록', '', ...request.records.flatMap((record, index) => [`### ${index + 1}. ${record.kind || '개발 기록'}`, '', readableRecord(record.body), '', `원문 ID: ${record.id}`, '']),
    '## 테스트 실행', '', ...(request.tests ?? []).flatMap((test, index) => [`### 실행 ${index + 1} · ${test.status}`, '', fenced(test.command), '', '실행 결과는 Review·Acceptance 판정과 별개입니다.', '', fenced(excerpt(test.output)), '', snapshotSummary(test.snapshot), '', `원문 ID: ${test.id} · [전체 출력·snapshot](../Raw/${rawDigest}.json)`, '']),
    '## 미검증·다음 행동', '', '수집된 공개 기록만 포함합니다. 수락 여부와 후속 작업은 연결된 Linear Issue에서 확인합니다.', '',
  ].join('\n');
  const path = join(notes, `${documentId}.md`); writeDevelopmentArtifact(path, note);
  const resolved = resolveDevelopmentDocument(documentId, root);
  const digest = developmentDigest(readFileSync(resolved));
  if (digest !== developmentDigest(note)) throw new Error('Vault note readback mismatch');
  const receipt = { documentId, requestId: request.requestId, path: resolved, digest, uri: uri(resolved) };
  writeDevelopmentArtifact(receiptPath, JSON.stringify({ ...receipt, inputDigest }, null, 2) + '\n');
  if (donePath) writeDevelopmentArtifact(donePath, JSON.stringify({ documentId, requestId: request.requestId, inputDigest, digest: receipt.digest }) + '\n');
  return receipt;
}

function validateDoneReceipt(donePath: string, expected: Omit<DevelopmentVaultDoneReceipt, 'digest'>, vaultRoot: string): void {
  if (!lstatSync(donePath).isFile() || lstatSync(donePath).isSymbolicLink()) throw new Error('Unsafe done receipt');
  const done = JSON.parse(readFileSync(donePath, 'utf8')) as Partial<DevelopmentVaultDoneReceipt>;
  if (done.documentId !== expected.documentId || done.requestId !== expected.requestId || done.inputDigest !== expected.inputDigest) {
    throw new Error('Done receipt does not match the captured request');
  }
  if (typeof done.digest !== 'string') throw new Error('Done receipt digest is missing');
  const documentPath = resolveDevelopmentDocument(expected.documentId, vaultRoot);
  if (developmentDigest(readFileSync(documentPath)) !== done.digest) throw new Error('Done receipt does not match the current vault document');
}

function excerpt(text: string): string {
  return text.length > 6000 ? text.slice(0, 6000) + '\n… 표시를 줄였습니다. 전체 내용은 보존 원문 링크에서 확인합니다.' : text;
}
function fenced(text: string): string {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = '`'.repeat(longest + 1);
  return `${fence}text\n${text}\n${fence}`;
}
function readableRecord(body: string): string {
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return excerpt(body); }
  const texts: string[] = [];
  const visit = (value: unknown, depth: number) => {
    if (depth > 8 || value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach((item) => visit(item, depth + 1)); return; }
    const obj = value as Record<string, unknown>;
    for (const [key, child] of Object.entries(obj)) {
      if (['text', 'message', 'delta', 'output', 'command'].includes(key) && typeof child === 'string') texts.push(child);
      else if (typeof child === 'object') visit(child, depth + 1);
    }
  };
  visit(parsed, 0);
  if (texts.length) return excerpt(texts.join('\n\n'));
  const method = parsed && typeof parsed === 'object' && 'method' in parsed ? String(parsed.method) : '개발 이벤트';
  return `${method} 기록. 상세 구조는 보존 원문 링크에서 확인합니다.`;
}
function snapshotSummary(value: unknown): string {
  if (!value || typeof value !== 'object') return '코드 snapshot: 확인되지 않음';
  const snapshots = value as { before?: { id?: string }; after?: { id?: string } };
  if (!snapshots.before?.id || !snapshots.after?.id) return '코드 snapshot: 원문 참조';
  return `코드 snapshot: ${snapshots.before.id.slice(0, 12)} → ${snapshots.after.id.slice(0, 12)} · ${snapshots.before.id === snapshots.after.id ? '관측 입력 동일' : '관측 입력 변경'} · 재현 가능성은 원문의 제한 사항 참조`;
}
/** Replay persisted requests, preserving their captured content rather than reading a newer run context. */
export function replayDevelopmentVault(outboxRoot: string, options: { vaultRoot?: string } = {}): { receipts: DevelopmentVaultReceipt[]; failures: { requestPath: string; error: string }[] } {
  const receipts: DevelopmentVaultReceipt[] = []; const failures: { requestPath: string; error: string }[] = [];
  if (!existsSync(outboxRoot)) return { receipts, failures };
  for (const entry of readdirSync(outboxRoot).filter((name) => name.endsWith('.request.json')).sort()) {
    const requestPath = join(outboxRoot, entry);
    try {
      if (!lstatSync(requestPath).isFile() || lstatSync(requestPath).isSymbolicLink()) throw new Error('Unsafe outbox request');
      const request = JSON.parse(readFileSync(requestPath, 'utf8')) as DevelopmentVaultRequest;
      receipts.push(exportDevelopmentVault(request, { ...options, outboxRoot }));
    } catch (error) { failures.push({ requestPath, error: String(error) }); }
  }
  return { receipts, failures };
}

export function persistDevelopmentVaultRequest(request: DevelopmentVaultRequest, outboxRoot: string): void {
  if (!request.requestId || !request.projectId || !request.runId) throw new Error('Request, project and run IDs are required');
  mkdirSync(outboxRoot, { recursive: true });
  const documentId = uuidFor(`${request.projectId}\0${request.runId}\0${request.requestId}`);
  writeDevelopmentArtifact(join(outboxRoot, `${documentId}.request.json`), JSON.stringify(request, null, 2) + '\n');
}
