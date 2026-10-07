import      { createHash                         } from "node:crypto"                                         ;
import      {
              closeSync                        ,
              constants                        ,
              fstatSync                        ,
              lstatSync                        ,
              mkdirSync                        ,
              mkdtempSync                      ,
              openSync                         ,
              readFileSync                     ,
              realpathSync                     ,
              rmSync                           ,
              writeFileSync                    ,
                                                 } from "node:fs"                                             ;
import      { tmpdir                             } from "node:os"                                             ;
import      { dirname, isAbsolute, join, resolve } from "node:path"                                           ;
import      {
              loadLocalUnitManifest            ,
              validateLocalUnitManifest        ,
                                                 } from "@/adapters/outbound/development/local-unit-registry" ;
import type { LocalUnitManifest                  } from "@/adapters/outbound/development/local-unit-registry" ;

export interface LocalWorkflowVerification {
 status        : "passed" | "failed" | "uncertain" ;
 subjectDigest : string                            ;
 evidence      : readonly string[]                 ;
 issues        : readonly string[]                 ;
 checkedAt     : string                            ;
}
interface Snapshot {
 root     : string              ;
 files    : Map<string, Buffer> ;
 manifest : LocalUnitManifest   ;
 digest   : string              ;
}
const hash         = (value: string | Buffer) => createHash("sha256").update(value).digest("hex") ;
const manifestPath = ".woo/units.yaml"                                                            ;

function partsOf(path: string): string[] {
 if (
  !path ||
  isAbsolute(path) ||
  path.includes("\\") ||
  path.includes("\0") ||
  path.split("/").some(part => !part || part === "." || part === "..")
 ) {
  throw new Error(`LOCAL_WORKFLOW_PATH_INVALID: ${path}`);
 }
 return path.split("/");
}

// Refuse all symlink components, including manifest ancestors. A private
// snapshot keeps the legacy validator from following mutable project paths.
function readContained(root: string, path: string, optional = false): Buffer | undefined {
 const parts = partsOf(path) ;
 let current = root          ;
 for (const part of parts) {
  current = join(current, part);
  let stat;
  try { stat = lstatSync(current); } catch (error) {
   if (optional && (error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
   throw new Error(`LOCAL_WORKFLOW_INPUT_MISSING: ${path}: ${String(error)}`);
  }
  if (stat.isSymbolicLink()) throw new Error(`LOCAL_WORKFLOW_PATH_SYMLINK: ${path}`);
 }
 const canonicalPath = realpathSync(current);
 if (canonicalPath !== current) throw new Error(`LOCAL_WORKFLOW_PATH_SYMLINK: ${path}`);
 const descriptor = openSync(canonicalPath, constants.O_RDONLY | constants.O_NOFOLLOW);
 try {
  const stat = fstatSync(descriptor);
  if (!stat.isFile()) throw new Error(`LOCAL_WORKFLOW_INPUT_NOT_FILE: ${path}`);
  const data        = readFileSync(descriptor) ;
  const after       = lstatSync(current)       ;
  const handleAfter = fstatSync(descriptor)    ;
  if (after.isSymbolicLink()
	|| after.ino !== stat.ino
	|| after.dev !== stat.dev
	|| after.size !== stat.size
	|| after.mtimeMs !== stat.mtimeMs
	|| handleAfter.size !== stat.size
	|| handleAfter.mtimeMs !== stat.mtimeMs) {
   throw new Error(`LOCAL_WORKFLOW_SOURCE_CHANGED: ${path}`);
  }
  return data;
 } finally { closeSync(descriptor); }
}
function stage(directory: string, path: string, bytes: Buffer): void {
 const target = join(directory, path);
 mkdirSync(dirname(target), { recursive: true });
 writeFileSync(target, bytes);
}
function snapshot(root: string, stagingRoot: string): Snapshot {
 const files         = new Map<string, Buffer>()          ;
 const manifestBytes = readContained(root, manifestPath)! ;
 files.set(manifestPath, manifestBytes); stage(stagingRoot, manifestPath, manifestBytes);
 const manifest = loadLocalUnitManifest(stagingRoot);
 if (!manifest.units.length) throw new Error("LOCAL_WORKFLOW_UNITS_EMPTY: .woo/units.yaml에 검증할 unit이 필요합니다.");
 for (const unit of manifest.units) {
  if (!unit || typeof unit.code?.path !== "string") throw new Error("LOCAL_WORKFLOW_CODE_PATH_MISSING: unit.code.path가 필요합니다.");
  const code = readContained(root, unit.code.path)!;
  files.set(unit.code.path, code); stage(stagingRoot, unit.code.path, code);

 }
 const digest = hash(JSON.stringify({ scope: "local-workflow-v1", root, files: [...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, bytes]) => [path, hash(bytes)]) }));
 return { root, files, manifest, digest };
}

/** Local preflight checks only code declarations and manifest bytes.
 * Root and byte digests detect stale subjects and changes during verification.
 */
export async function verifyLocalWorkflow(projectRoot: string, expected?: { subjectDigest: string }): Promise<LocalWorkflowVerification> {
 let subjectDigest = hash(JSON.stringify({ root: resolve(projectRoot), unavailable: true })) ;
 let before: Snapshot | undefined                                                            ;
 const stagingRoot = mkdtempSync(join(tmpdir(), "www-local-preflight-"))                     ;
 const result = (status: LocalWorkflowVerification["status"], issues: string[]): LocalWorkflowVerification => ({
  status, subjectDigest, issues, checkedAt: new Date().toISOString(),
  evidence: before ? [...before.files].sort(([a], [b]) => a.localeCompare(b)).map(([path, bytes]) => `local-readback:${path}:sha256:${hash(bytes)}`) : [],
 });
 try {
  const root = realpathSync(projectRoot);
  before = snapshot(root, join(stagingRoot, "before")); subjectDigest = before.digest;
  const issues = validateLocalUnitManifest(join(stagingRoot, "before"), before.manifest);
  // Yield once so concurrent edits are observed by the second read-back.
  await Promise.resolve();
  let after: Snapshot;
  try { after = snapshot(realpathSync(projectRoot), join(stagingRoot, "after")); }
  catch (error) { return result("uncertain", [`LOCAL_WORKFLOW_SOURCE_CHANGED: ${String(error)}`]); }
  if (after.digest !== before.digest) return result("uncertain", ["LOCAL_WORKFLOW_SOURCE_CHANGED: 검증 도중 원본이 바뀌었습니다. 다시 검증하세요."]);
  if (expected && expected.subjectDigest !== before.digest) issues.push("LOCAL_WORKFLOW_STALE: 이전 검증 이후 원본이 변경되었습니다. 다시 검증하세요.");
  return result(issues.length ? "failed" : "passed", issues);
 } catch (error) {
  return result(String(error).includes("LOCAL_WORKFLOW_SOURCE_CHANGED") ? "uncertain" : "failed", [String(error)]);
 } finally { rmSync(stagingRoot, { recursive: true, force: true }); }
}
