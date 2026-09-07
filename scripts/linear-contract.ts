#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";

export type LinearContractIssue = Record<string, unknown> & {
	id: string;
	uuid?: string;
	title: string;
	description?: string;
	parentId?: string | null;
	projectMilestone?: { id?: string; name?: string } | string | null;
	declaredChanges?: string[];
};
export type LinearContract = { hierarchy: any; titles: any; bodies: Record<string, string[]>; connections: Record<string, unknown>; protectedMetadata: string[] };
type Issue = LinearContractIssue;
type Contract = LinearContract;
const UNFILLED_TEMPLATE_MARKER = /(?:TODO|TBD|WIP|추후 작성|N\/A|<encoded-path>|<uuid>|<git-sha-or-run-id>)/u;

export function parseSnapshot(value: unknown): Issue[] {
	if (!value || typeof value !== "object" || !Array.isArray((value as any).issues) || (value as any).hasNextPage !== false) throw new Error("snapshot requires issues[] and hasNextPage=false");
	const issues = (value as any).issues as Issue[];
	for (const issue of issues) for (const field of ["id", "uuid", "title", "description", "parentId", "projectMilestone", "project", "archivedAt", "status", "labels", "priority"]) if (!(field in issue)) throw new Error(`${issue.id ?? "unknown"}: snapshot missing ${field}`);
	for (const issue of issues) for (const field of ["id", "uuid", "title"] as const) if (typeof issue[field] !== "string" || !issue[field].trim()) throw new Error(`${issue.id ?? "unknown"}: snapshot missing ${field}`);
	return issues;
}

export function loadLinearContract(projectRoot = resolve(import.meta.dir, "..")): Contract {
	return YAML.parse(readFileSync(resolve(projectRoot, "docs/planning/linear-development/ISSUE_CONTRACT.yaml"), "utf8")) as Contract;
}

function headings(description: string): string[] {
	const withoutFences = description.replace(/```[\s\S]*?```/gu, "");
	return [...withoutFences.matchAll(/^##\s+(.+)$/gmu)].map(match => match[1]!.trim());
}

function normalizedConnectionLine(line: string | undefined): string {
	const normalized = (line ?? "")
		.replace(/^\*\s+/u, "- ")
		.replace(/\]\(<(obsidian:\/\/[^>]+)>\)$/u, "]($1)");
	const nativePr = /^- GitHub: <pull-request\b[^>]*>(?:[^<]*#)(\d+)<\/pull-request>$/u.exec(normalized);
	return nativePr ? `- GitHub: [#${nativePr[1]}](https://github.com/Woo-JongHo/world-wide-woo/pull/${nativePr[1]})` : normalized;
}

function validateBody(issue: Issue, required: string[], contract: Contract): string[] {
	const errors: string[] = [];
	const body = String(issue.description ?? "");
	const actual = headings(body);
	if (JSON.stringify(actual) !== JSON.stringify(required)) errors.push(`${issue.id}: sections must be exactly ${required.join(" -> ")}`);
	if (UNFILLED_TEMPLATE_MARKER.test(body)) errors.push(`${issue.id}: unfilled template marker is not allowed`);
	for (const heading of required) {
		const match = new RegExp(`^## ${heading}\\s*\\r?\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "mu").exec(body);
		if (!match?.[1]?.trim()) errors.push(`${issue.id}: empty ${heading}`);
	}
	if (required.includes("범위")) {
		const scope = /^## 범위\s*\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/mu.exec(body)?.[1] ?? "";
		for (const part of ["포함", "제외"]) {
			const match = new RegExp(`^### ${part}\\s*\\r?\\n([\\s\\S]*?)(?=^### |(?![\\s\\S]))`, "mu").exec(scope);
			if (!match?.[1]?.trim()) errors.push(`${issue.id}: 범위 ${part} must be non-empty`);
		}
	}
	const connection = /^## 연결\s*\r?\n([\s\S]*)$/mu.exec(body)?.[1] ?? "";
	const connectionLines = connection.split(/\r?\n/u).map(normalizedConnectionLine);
	const codeLine = connectionLines.find(line => line.startsWith("- Code-ID:"));
	if (!codeLine || !(new RegExp(String(contract.connections.codeIdPattern), "u")).test(codeLine)) errors.push(`${issue.id}: invalid plain Code-ID line`);
	if (/Code-\d{3}\]\(/u.test(codeLine ?? "")) errors.push(`${issue.id}: Code-ID must not be linked`);
	if (!(new RegExp(String(contract.connections.obsidianPattern), "u")).test(connectionLines.find(line => line.startsWith("- Obsidian:")) ?? "")) errors.push(`${issue.id}: invalid Obsidian link`);
	const githubLine = connectionLines.find(line => line.startsWith("- GitHub:"));
	if (githubLine && !(new RegExp(String(contract.connections.githubPattern), "u")).test(githubLine)) errors.push(`${issue.id}: invalid GitHub link`);
	return errors;
}

function merged(snapshot: Issue[], draft?: Issue[]): { issues: Issue[]; errors: string[] } {
	if (!draft) return { issues: snapshot, errors: [] };
	const errors: string[] = [];
	const known = new Set(["id", "title", "description", "parentId", "status", "labels", "projectMilestone", "project", "priority", "archivedAt", "declaredChanges"]);
	const ids = new Set<string>();
	const issues = snapshot.map(issue => ({ ...issue }));
	for (const change of draft) {
		if (ids.has(change.id)) errors.push(`${change.id}: duplicate draft id`); ids.add(change.id);
		for (const key of Object.keys(change)) if (!known.has(key)) errors.push(`${change.id}: unknown draft field ${key}`);
		const old = issues.find(issue => issue.id === change.id);
		if (!old) { issues.push({ ...change }); continue; }
		for (const field of (YAML.parse(readFileSync(resolve(import.meta.dir, "../docs/planning/linear-development/ISSUE_CONTRACT.yaml"), "utf8")) as Contract).protectedMetadata) {
			if (!(field in change)) continue;
			const normalize = (value: unknown) => field === "labels" && Array.isArray(value) ? [...value].sort() : value;
			if (JSON.stringify(normalize(old[field])) !== JSON.stringify(normalize(change[field])) && !change.declaredChanges?.includes(field)) errors.push(`${change.id}: ${field} change must be declared`);
		}
		Object.assign(old, change);
	}
	return { issues, errors };
}

export function validate(snapshot: Issue[], draft: Issue[] | undefined, contract: Contract, scope = "Chat"): string[] {
	const state = merged(snapshot, draft);
	const errors = [...state.errors];
	const issues = state.issues;
	if (new Set(issues.map(issue => issue.id)).size !== issues.length) errors.push("duplicate snapshot id");
	if (scope !== "Traceability") {
		const features = contract.hierarchy.workbench.features as Record<string, any>;
		for (const [name, feature] of Object.entries(features).filter(([name]) => name === scope)) {
			const parent = issues.find(issue => issue.id === feature.parent);
			if (!parent || parent.parentId !== contract.hierarchy.workbench.root) errors.push(`${name}: invalid feature parent`);
			const children = issues.filter(issue => issue.parentId === feature.parent && issue.archivedAt == null && !["Canceled", "Duplicate"].includes(String(issue.status)));
			for (let number = feature.numbered[0]; number <= feature.numbered[1]; number++) if (children.filter(issue => issue.title.startsWith(`${String(number).padStart(2, "0")}. `)).length !== 1) errors.push(`${name}: numbered issue ${number} must exist exactly once`);
			for (const collection of [feature.exception, feature.test]) if (!children.some(issue => issue.id === collection)) errors.push(`${name}: missing collection ${collection}`);
			if (scope === name) {
				if (parent) errors.push(...validateBody(parent, contract.bodies.parent, contract));
				for (const child of children) errors.push(...validateBody(child, child.id === feature.exception ? contract.bodies.exception : child.id === feature.test ? contract.bodies.test : contract.bodies.numbered, contract));
			}
		}
		if (issues.some(issue => issue.id === "WOO-683" && issue.archivedAt == null && !["Canceled", "Duplicate"].includes(String(issue.status)))) errors.push("WOO-683: forbidden active intermediate");
	}
	if (scope === "Traceability") for (const id of contract.hierarchy.traceability.issues as string[]) {
		const issue = issues.find(value => value.id === id);
		if (!issue || issue.parentId !== contract.hierarchy.traceability.parent) errors.push(`${id}: invalid traceability parent`);
		else {
			const milestone = typeof issue.projectMilestone === "string" ? issue.projectMilestone : issue.projectMilestone?.name;
			if (milestone !== contract.hierarchy.traceability.milestone) errors.push(`${id}: invalid traceability milestone`);
			errors.push(...validateBody(issue, contract.bodies.traceability, contract));
		}
	}
	return errors;
}

if (import.meta.main) {
	const snapshotPath = process.argv[2];
	if (!snapshotPath) throw new Error("usage: linear-contract <snapshot> [draft] [--scope Chat|Traceability]");
	const draftPath = process.argv[3]?.startsWith("--") ? undefined : process.argv[3];
	const scopeIndex = process.argv.indexOf("--scope");
	const scope = scopeIndex >= 0 ? process.argv[scopeIndex + 1] : "Chat";
	const contract = loadLinearContract();
	const snapshot = parseSnapshot(JSON.parse(readFileSync(resolve(snapshotPath), "utf8")));
	const draft = draftPath ? JSON.parse(readFileSync(resolve(draftPath), "utf8")).issues as Issue[] : undefined;
	const errors = validate(snapshot, draft, contract, scope);
	if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
	console.log(`Linear contract OK: ${scope}`);
}
