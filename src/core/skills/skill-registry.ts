export interface SkillDescriptor {
	readonly name: string;
	readonly description: string;
	readonly path: string;
	readonly digest: string;
	readonly sourceRevision: string;
}

export interface SkillRegistrySnapshot {
	readonly schemaVersion: 1;
	readonly root: string;
	readonly sourceRevision: string;
	readonly skills: readonly SkillDescriptor[];
	readonly digest: string;
}

export interface SkillRegistryPort {
	load(): Promise<SkillRegistrySnapshot>;
}

export function validateSkillRegistry(snapshot: SkillRegistrySnapshot): string[] {
	const errors: string[] = [];
	if (snapshot.schemaVersion !== 1) errors.push("registry schemaVersion은 1이어야 합니다.");
	if (!snapshot.root || !snapshot.sourceRevision || !/^[0-9a-f]{64}$/u.test(snapshot.digest)) errors.push("registry root, revision, digest가 필요합니다.");
	const names = new Set<string>(), paths = new Set<string>();
	for (const skill of snapshot.skills) {
		if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(skill.name)) errors.push(`invalid skill name: ${skill.name}`);
		if (!skill.description.trim()) errors.push(`${skill.name}: description이 필요합니다.`);
		if (!/^[0-9a-f]{64}$/u.test(skill.digest)) errors.push(`${skill.name}: digest가 올바르지 않습니다.`);
		if (names.has(skill.name)) errors.push(`duplicate skill name: ${skill.name}`);
		if (paths.has(skill.path)) errors.push(`duplicate skill path: ${skill.path}`);
		names.add(skill.name); paths.add(skill.path);
	}
	return errors;
}
