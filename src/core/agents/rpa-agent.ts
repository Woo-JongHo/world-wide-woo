import type { SkillRegistrySnapshot } from "../skills/skill-registry.js";

export type RpaIntent = "new-development" | "test" | "maintenance" | "reconcile" | "monitor";

export interface RpaScenario {
	readonly schemaVersion: 1;
	readonly intent: RpaIntent;
	readonly processId: string | null;
	readonly taskId: string | null;
	readonly unitIds: readonly string[];
	readonly skillNames: readonly string[];
	readonly registryDigest: string;
	readonly requiresProcessDefinition: boolean;
}

const CHAINS: Record<RpaIntent, readonly string[]> = {
	"new-development": ["rpa-intake", "rpa-map", "rpa-build", "rpa-safety", "rpa-publish", "rpa-reconcile"],
	test: ["rpa-safety", "rpa-publish", "rpa-reconcile"],
	maintenance: ["rpa-intake", "rpa-maintenance", "rpa-safety", "rpa-publish", "rpa-reconcile"],
	reconcile: ["rpa-reconcile"],
	monitor: [],
};

export function classifyRpaIntent(text: string): RpaIntent | null {
	const value = text.normalize("NFKC").toLowerCase();
	const matches = ([
		["monitor", /(?:monitor|모니터|실행\s*상태|현재\s*상황)/u],
		["reconcile", /(?:reconcile|정합|drift|연결\s*검사)/u],
		["maintenance", /(?:유지보수|버그|오류|장애|고객\s*요청|로그)/u],
		["test", /(?:테스트|검증|예외\s*처리)/u],
		["new-development", /(?:신규|새\s*업무|개발\s*시작|자동화\s*개발)/u],
	] as const).filter(([, pattern]) => pattern.test(value)).map(([intent]) => intent);
	return matches.length === 1 ? matches[0] : null;
}

export function planRpaScenario(input: { intent: RpaIntent; registry: SkillRegistrySnapshot; processId?: string; taskId?: string; unitIds?: readonly string[] }): RpaScenario {
	const chain = CHAINS[input.intent];
	const available = new Set(input.registry.skills.map(skill => skill.name));
	const missing = chain.filter(name => !available.has(name));
	if (missing.length) throw new Error(`RPA_SKILL_MISSING: ${missing.join(", ")}`);
	const processId = input.processId?.trim() || null;
	if (processId && !/^RPA-[A-Z0-9]+(?:-[A-Z0-9]+)*$/u.test(processId)) throw new Error("RPA_PROCESS_ID_INVALID");
	return Object.freeze({ schemaVersion: 1, intent: input.intent, processId, taskId: input.taskId?.trim() || null, unitIds: Object.freeze([...(input.unitIds ?? [])]), skillNames: Object.freeze([...chain]), registryDigest: input.registry.digest, requiresProcessDefinition: input.intent !== "monitor" && processId === null });
}
