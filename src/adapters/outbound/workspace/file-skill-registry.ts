import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import YAML from "yaml";
import type { SkillDescriptor, SkillRegistryPort, SkillRegistrySnapshot } from "../../../core/skills/skill-registry.js";
import { validateSkillRegistry } from "../../../core/skills/skill-registry.js";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export class FileSkillRegistry implements SkillRegistryPort {
	constructor(private readonly projectRoot: string) {}

	async load(): Promise<SkillRegistrySnapshot> {
		const root = resolve(this.projectRoot, ".agents/skills"), canonicalRoot = await realpath(root);
		const entries = await readdir(canonicalRoot, { withFileTypes: true });
		const sourceRevision = this.revision();
		const skills: SkillDescriptor[] = [];
		for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
			if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
			const path = join(canonicalRoot, entry.name, "SKILL.md");
			if (!(await lstat(path).catch(() => null))?.isFile()) continue;
			const canonicalPath = await realpath(path);
			if (relative(canonicalRoot, canonicalPath).startsWith("..")) throw new Error(`SKILL_PATH_ESCAPE: ${entry.name}`);
			const bytes = await readFile(canonicalPath, "utf8"), match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(bytes);
			if (!match) throw new Error(`SKILL_FRONTMATTER_MISSING: ${entry.name}`);
			const metadata = YAML.parse(match[1]!) as Record<string, unknown>;
			if (metadata.name !== entry.name || typeof metadata.description !== "string") throw new Error(`SKILL_METADATA_INVALID: ${entry.name}`);
			skills.push(Object.freeze({ name: entry.name, description: metadata.description, path: `.agents/skills/${entry.name}/SKILL.md`, digest: sha256(bytes), sourceRevision }));
		}
		const unsigned = { schemaVersion: 1 as const, root: ".agents/skills", sourceRevision, skills: Object.freeze(skills) };
		const snapshot = Object.freeze({ ...unsigned, digest: sha256(JSON.stringify(unsigned)) });
		const errors = validateSkillRegistry(snapshot);
		if (errors.length) throw new Error(errors.join("\n"));
		return snapshot;
	}

	private revision(): string {
		const sha = Bun.spawnSync(["git", "-C", this.projectRoot, "rev-parse", "HEAD"]).stdout.toString().trim();
		const dirty = Bun.spawnSync(["git", "-C", this.projectRoot, "status", "--porcelain", "--", ".agents/skills"]).stdout.length > 0;
		if (!/^[0-9a-f]{40}$/u.test(sha)) throw new Error("SKILL_SOURCE_REVISION_UNAVAILABLE");
		return `git:${sha}${dirty ? ":dirty" : ""}`;
	}
}
