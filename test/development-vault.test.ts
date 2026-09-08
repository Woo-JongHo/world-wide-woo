import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync, renameSync, copyFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportDevelopmentVault, replayDevelopmentVault, resolveDevelopmentDocument, type DevelopmentVaultRequest } from '../src/adapters/outbound/development/development-vault.js';
/** @linear WOO-698 */
const request: DevelopmentVaultRequest = { requestId: 'checkpoint-1', projectId: 'p', runId: 'r', title: 'Message 개발', unitIds: ['u'], issues: [{ id: 'WOO-683', uuid: 'uuid' }], records: [{ id: 'record-1', body: '공개 대화', metadata: { source: 'test' } }] };
describe('development Vault', () => {
  test('durable readback, retry and rename preserve document identity; edits and copies conflict', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'www-vault-')));
    try {
      const first = exportDevelopmentVault(request, { vaultRoot: root });
      expect(exportDevelopmentVault(request, { vaultRoot: root })).toEqual(first);
      expect(readFileSync(first.path, 'utf8')).toContain('WOO-683');
      const renamed = join(root, 'Development', 'renamed.md'); renameSync(first.path, renamed);
      expect(exportDevelopmentVault(request, { vaultRoot: root }).path).toBe(renamed);
      expect(resolveDevelopmentDocument(first.documentId, root)).toBe(renamed);
      copyFileSync(renamed, join(root, 'copy.md'));
      expect(() => resolveDevelopmentDocument(first.documentId, root)).toThrow('Duplicate');
      rmSync(join(root, 'copy.md'));
      writeFileSync(renamed, readFileSync(renamed, 'utf8') + '\nHuman edit');
      expect(() => exportDevelopmentVault(request, { vaultRoot: root })).toThrow('human-edited');
      const next = exportDevelopmentVault({ ...request, requestId: 'checkpoint-2' }, { vaultRoot: root });
      expect(next.documentId).not.toBe(first.documentId);
      expect(readFileSync(renamed, 'utf8')).toContain('Human edit');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  test('same request ID cannot silently export different source records', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'www-vault-')));
    try {
      exportDevelopmentVault(request, { vaultRoot: root });
      expect(() => exportDevelopmentVault({ ...request, summary: 'different' }, { vaultRoot: root })).toThrow('reused');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

test('replay validates forged done receipts and the existing exported document', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'www-vault-replay-')));
  const vaultRoot = join(root, 'vault'); const outboxRoot = join(root, 'outbox');
  try {
    const receipt = exportDevelopmentVault(request, { vaultRoot, outboxRoot });
    const donePath = join(outboxRoot, `${receipt.documentId}.done.json`);
    const done = JSON.parse(readFileSync(donePath, 'utf8'));
    expect(replayDevelopmentVault(outboxRoot, { vaultRoot }).receipts).toHaveLength(1);
    for (const forgedIdentity of [
      { documentId: '00000000-0000-0000-0000-000000000000' },
      { requestId: 'forged' },
      { inputDigest: 'forged' },
    ]) {
      writeFileSync(donePath, JSON.stringify({ ...done, ...forgedIdentity }) + '\n');
      const forged = replayDevelopmentVault(outboxRoot, { vaultRoot });
      expect(forged.receipts).toHaveLength(0);
      expect(forged.failures[0]?.error).toContain('captured request');
    }
    writeFileSync(donePath, JSON.stringify({ ...done, digest: 'forged' }) + '\n');
    const forgedDigest = replayDevelopmentVault(outboxRoot, { vaultRoot });
    expect(forgedDigest.receipts).toHaveLength(0);
    expect(forgedDigest.failures[0]?.error).toContain('current vault document');
    writeFileSync(donePath, JSON.stringify(done) + '\n');
    writeFileSync(receipt.path, readFileSync(receipt.path, 'utf8') + '\nstale');
    const stale = replayDevelopmentVault(outboxRoot, { vaultRoot });
    expect(stale.receipts).toHaveLength(0);
    expect(stale.failures[0]?.error).toContain('current vault document');
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test('blocked export can retry after the filesystem obstruction is removed', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'www-vault-failure-')));
  try {
    writeFileSync(join(root, 'Development'), 'obstruction');
    expect(() => exportDevelopmentVault(request, { vaultRoot: root })).toThrow();
    rmSync(join(root, 'Development'));
    const receipt = exportDevelopmentVault(request, { vaultRoot: root });
    expect(readFileSync(receipt.path, 'utf8')).toContain('공개 대화');
    expect(exportDevelopmentVault(request, { vaultRoot: root })).toEqual(receipt);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
