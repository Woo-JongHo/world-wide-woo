import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, lstatSync, realpathSync, openSync, writeFileSync, fsyncSync, closeSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { platform } from 'node:os';

/** @linear WOO-697 */
export interface DevelopmentSnapshot {
  id: string; revision: string | null; capturedAt: string; repository: string;
  files: { path: string; digest: string; blobPath?: string }[];
  reconstructable: boolean; limitations: string[];
}
export function developmentDigest(value: string | Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }
/** Exclusive, flushed immutable artifacts. Existing bytes must agree. */
export function writeDevelopmentArtifact(path: string, contents: string | Uint8Array): void {
  let fd: number;
  try { fd = openSync(path, 'wx', 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error(`Unsafe artifact: ${path}`);
    if (developmentDigest(readFileSync(path)) !== developmentDigest(contents)) throw new Error(`Artifact conflict: ${path}`);
    return;
  }
  try { writeFileSync(fd, contents); fsyncSync(fd); } finally { closeSync(fd); }
  if (platform() !== 'win32') {
    const parent = openSync(dirname(path), 'r');
    try { fsyncSync(parent); } finally { closeSync(parent); }
  }
}
export function captureDevelopmentSnapshot(repository: string, artifactRoot: string): DevelopmentSnapshot {
  repository = realpathSync(resolve(repository));
  artifactRoot = resolve(artifactRoot);
  const blobs = join(artifactRoot, 'blobs'); mkdirSync(blobs, { recursive: true });
  artifactRoot = realpathSync(artifactRoot);
  const git = (args: string[]) => Bun.spawnSync(['git', '-C', repository, ...args]);
  const revision = git(['rev-parse', 'HEAD']);
  const listing = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
  const limitations = ['Ignored files, environment, dependencies and external services are not captured.', 'Capture is observational; concurrent edits cannot be excluded.'];
  if (listing.exitCode !== 0) throw new Error(`Cannot enumerate Git inputs: ${listing.stderr.toString()}`);
  const files: DevelopmentSnapshot['files'] = [];
  const listedPaths = listing.stdout.toString().split('\0').filter(Boolean).map((path) => path.replace(/\\/gu, '/'));
  for (const path of [...new Set(listedPaths)].sort()) {
    try {
      const absolute = join(repository, path);
      if (absolute === artifactRoot || absolute.startsWith(artifactRoot + sep)) continue;
      const stat = lstatSync(absolute);
      if (!realpathSync(absolute).startsWith(repository + sep)) { limitations.push(`Input escapes repository: ${path}`); continue; }
      if (!stat.isFile()) { limitations.push(`Unsupported input: ${path}`); continue; }
      if (stat.size > 16 * 1024 * 1024) { limitations.push(`Input exceeds 16 MiB capture limit: ${path}`); continue; }
      const bytes = readFileSync(absolute); const digest = developmentDigest(bytes); const blobPath = join(blobs, digest);
      writeDevelopmentArtifact(blobPath, bytes); files.push({ path, digest, blobPath });
    } catch (error) { limitations.push(`Unreadable or deleted input: ${path} (${String(error)})`); }
  }
  const id = developmentDigest(JSON.stringify({ revision: revision.exitCode === 0 ? revision.stdout.toString().trim() : null, files: files.map(({ path, digest }) => ({ path, digest })) }));
  // Byte blobs support inspection, but an observational capture is not a reproducible environment claim.
  return { id, revision: revision.exitCode === 0 ? revision.stdout.toString().trim() : null, capturedAt: new Date().toISOString(), repository, files, reconstructable: false, limitations };
}
