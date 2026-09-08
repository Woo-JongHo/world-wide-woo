import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";
import { assessRuntimeProvenance, type RuntimeIdentity, type RuntimeProvenance } from "../../../core/domain/execution/runtime-provenance.js";

export interface RuntimeProvenanceEnvironment {
	readonly cwd: () => string;
	readonly entrypoint: () => string | null;
	readonly realpath: (path: string) => string | null;
	readonly exists: (path: string) => boolean;
	readonly readText: (path: string) => string | null;
	readonly git: (cwd: string, args: readonly string[]) => string | null;
}

const productionEnvironment: RuntimeProvenanceEnvironment = {
	cwd: () => process.cwd(),
	entrypoint: () => process.argv[1] ?? null,
	realpath: path => { try { return realpathSync(path); } catch { return null; } },
	exists: existsSync,
	readText: path => { try { return readFileSync(path, "utf8"); } catch { return null; } },
	git: (cwd, args) => { try { return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } },
};

/** Collects the resolved process source identity without treating a package version as proof of code identity. */
export function inspectRuntimeProvenance(environment: RuntimeProvenanceEnvironment = productionEnvironment): RuntimeProvenance {
	const workspaceRoot = environment.realpath(resolve(environment.cwd()));
	const entrypoint = environment.entrypoint();
	const resolvedEntrypoint = entrypoint ? environment.realpath(entrypoint) : null;
	const runtimeRoot = resolvedEntrypoint ? packageRootFor(resolvedEntrypoint, environment) : null;
	return assessRuntimeProvenance(
		identityFor(runtimeRoot, resolvedEntrypoint ?? entrypoint, environment),
		identityFor(workspaceRoot, null, environment),
	);
}

function packageRootFor(entrypoint: string, environment: RuntimeProvenanceEnvironment): string | null {
	let current = dirname(entrypoint);
	for (;;) {
		if (environment.exists(join(current, "package.json"))) return current;
		const parent = dirname(current);
		if (parent === current || current === parse(current).root) return null;
		current = parent;
	}
}

function identityFor(sourceRoot: string | null, entrypoint: string | null, environment: RuntimeProvenanceEnvironment): RuntimeIdentity {
	const packageJson = sourceRoot ? parsePackageJson(environment.readText(join(sourceRoot, "package.json"))) : null;
	const revision = sourceRoot ? environment.git(sourceRoot, ["rev-parse", "HEAD"]) : null;
	const dirtyOutput = sourceRoot ? environment.git(sourceRoot, ["status", "--porcelain=v1", "--untracked-files=normal"]) : null;
	return Object.freeze({
		sourceRoot,
		entrypoint,
		revision: revision && /^[0-9a-f]{40}$/iu.test(revision) ? revision.toLowerCase() : null,
		dirty: dirtyOutput === null ? null : dirtyOutput.length > 0,
		packageName: packageJson?.name ?? null,
		packageVersion: packageJson?.version ?? null,
	});
}

function parsePackageJson(source: string | null): { name: string | null; version: string | null } | null {
	if (!source) return null;
	try {
		const value = JSON.parse(source) as { name?: unknown; version?: unknown };
		return { name: typeof value.name === "string" ? value.name : null, version: typeof value.version === "string" ? value.version : null };
	} catch { return null; }
}
