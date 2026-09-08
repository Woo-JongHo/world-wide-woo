import { expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDevelopmentTest } from '../src/adapters/outbound/development-test-runner.js';
import { captureDevelopmentSnapshot } from '../src/adapters/outbound/development-snapshot.js';
/** @linear WOO-697 */
test('explicit argv captures failure and both streams, with actual input blobs', async () => {
  const root = mkdtempSync(join(tmpdir(), 'www-test-run-')); const repo = join(root, 'repo'); mkdirSync(repo);
  try {
    Bun.spawnSync(['git', 'init', repo]); writeFileSync(join(repo, 'input.txt'), 'before');
    const snapshot = captureDevelopmentSnapshot(repo, join(root, 'artifacts'));
    expect(snapshot.files.find((file) => file.path === 'input.txt')).toBeDefined();
    expect(readFileSync(snapshot.files[0]!.blobPath!, 'utf8')).toBe('before');
    expect(snapshot.reconstructable).toBe(false);
    const result = await runDevelopmentTest({ argv: [process.execPath, '-e', 'console.log(process.argv[1]); console.error("failure"); process.exit(7)', '$(touch nope)'], projectRoot: repo, artifactRoot: join(root, 'artifacts') });
    expect(result.status).toBe('failed'); expect(result.exitCode).toBe(7); expect(result.stdout).toContain('$(touch nope)'); expect(result.stderr).toContain('failure');
    const abort = new AbortController(); abort.abort();
    const cancelled = await runDevelopmentTest({ argv: [process.execPath, '-e', 'process.exit(0)'], projectRoot: repo, artifactRoot: join(root, 'artifacts'), signal: abort.signal });
    expect(cancelled.status).toBe('cancelled'); expect(cancelled.exitCode).toBeNull();
    const passed = await runDevelopmentTest({ argv: [process.execPath, '-e', 'console.log("ok")'], projectRoot: repo, artifactRoot: join(root, 'artifacts') });
    expect(passed.status).toBe('passed'); expect(passed.exitCode).toBe(0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('snapshot excludes generated artifacts when artifactRoot is inside the repository', () => {
  const root = mkdtempSync(join(tmpdir(), 'www-snapshot-artifacts-')); const repo = join(root, 'repo'); mkdirSync(repo);
  try {
    Bun.spawnSync(['git', 'init', repo]); writeFileSync(join(repo, 'input.txt'), 'stable');
    const artifactRoot = join(repo, '.artifacts');
    const first = captureDevelopmentSnapshot(repo, artifactRoot);
    writeFileSync(join(artifactRoot, 'metadata.json'), 'generated');
    const second = captureDevelopmentSnapshot(repo, artifactRoot);
    expect(second.id).toBe(first.id);
    expect(second.files.map((file) => file.path)).toEqual(['input.txt']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('running cancellation, unavailable executable, changed inputs and start binding remain explicit', async () => {
  const root = mkdtempSync(join(tmpdir(), 'www-test-edge-')); const repo = join(root, 'repo'); mkdirSync(repo);
  try {
    Bun.spawnSync(['git', 'init', repo]); writeFileSync(join(repo, 'input.txt'), 'before');
    const abort = new AbortController();
    const executing = runDevelopmentTest({ argv: [process.execPath, '-e', 'setTimeout(()=>{},30000)'], projectRoot: repo, artifactRoot: join(root, 'artifacts'), signal: abort.signal, bindingId: 'binding-start' });
    setTimeout(() => abort.abort(), 30);
    const cancelled = await executing;
    expect(cancelled.status).toBe('cancelled'); expect(cancelled.bindingId).toBe('binding-start');
    const missing = await runDevelopmentTest({ argv: ['/this/executable/does/not/exist'], projectRoot: repo, artifactRoot: join(root, 'artifacts') });
    expect(missing.status).toBe('not-run'); expect(missing.exitCode).toBeNull(); expect(missing.stderr.length).toBeGreaterThan(0);
    const changed = await runDevelopmentTest({ argv: [process.execPath, '-e', 'require("node:fs").writeFileSync("input.txt","after")'], projectRoot: repo, artifactRoot: join(root, 'artifacts') });
    expect(changed.snapshot.before.id).not.toBe(changed.snapshot.after.id);
    expect(readFileSync(changed.snapshot.before.files[0]!.blobPath!, 'utf8')).toBe('before');
    expect(readFileSync(changed.snapshot.after.files[0]!.blobPath!, 'utf8')).toBe('after');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
