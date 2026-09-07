import { resolve } from 'node:path';
import { captureDevelopmentSnapshot, type DevelopmentSnapshot } from './development-snapshot.js';

/** @linear WOO-697 */
export interface DevelopmentTestExecution {
  bindingId?: string;
  command: string; argv: string[]; cwd: string; status: 'passed' | 'failed' | 'cancelled' | 'not-run';
  exitCode: number | null; signal: string | null; stdout: string; stderr: string; output: string;
  startedAt: string; finishedAt: string; snapshot: { before: DevelopmentSnapshot; after: DevelopmentSnapshot };
}
/** Only an explicit argument vector is executed; a successful process is not an acceptance verdict. */
export async function runDevelopmentTest(input: { argv: string[]; projectRoot: string; artifactRoot: string; signal?: AbortSignal; bindingId?: string }): Promise<DevelopmentTestExecution> {
  if (!input.argv.length || input.argv.some((arg) => typeof arg !== 'string' || arg.includes('\0'))) throw new Error('A nonempty test argument vector is required');
  const cwd = resolve(input.projectRoot); const before = captureDevelopmentSnapshot(cwd, input.artifactRoot);
  const startedAt = new Date().toISOString();
  let stdout = ''; let stderr = ''; let exitCode: number | null = null; let signal: string | null = null;
  let status: DevelopmentTestExecution['status'] = 'not-run';
  if (!input.signal?.aborted) {
    try {
      const child = Bun.spawn(input.argv, { cwd, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
      let cancelled = false;
      const abort = () => { cancelled = true; child.kill('SIGKILL'); };
      input.signal?.addEventListener('abort', abort, { once: true });
      if (input.signal?.aborted) abort();
      try {
        [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
        signal = child.signalCode ?? null;
        status = cancelled ? 'cancelled' : exitCode === 0 ? 'passed' : 'failed';
      } finally { input.signal?.removeEventListener('abort', abort); }
    } catch (error) { stderr = String(error); }
  } else status = 'cancelled';
  const after = captureDevelopmentSnapshot(cwd, input.artifactRoot);
  return { bindingId: input.bindingId, argv: [...input.argv], command: JSON.stringify(input.argv), cwd, status, exitCode, signal, stdout, stderr, output: `stdout:\n${stdout}\nstderr:\n${stderr}`, startedAt, finishedAt: new Date().toISOString(), snapshot: { before, after } };
}
