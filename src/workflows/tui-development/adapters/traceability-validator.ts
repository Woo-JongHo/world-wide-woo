import { existsSync, readFileSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";
import * as ts from "typescript/unstable/ast";
import { API } from "typescript/unstable/async";
import YAML from "yaml";
import { validateLedger, type TraceabilityLedger } from "../../../system/public.js";
import { digestLedger } from "./traceability-digest.js";

type LinearSnapshotIssue = { id: string; uuid: string; description?: string; projectMilestone?: { name?: string } | string | null };

function parseFrontmatter(text: string): Record<string, unknown> | null {
	const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(text);
	return match ? YAML.parse(match[1]!) as Record<string, unknown> : null;
}

function codeIds(description: string | undefined): string[] {
	const line = description?.match(/^[-*] Code-ID:\s*(.+)$/mu)?.[1] ?? "";
	return [...line.matchAll(/Code-\d{3}/gu)].map(match => match[0]!).sort();
}

function isWithin(root: string, candidate: string): boolean {
	const path = relative(root, candidate);
	return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`));
}

/** @Unit Code-007 */
export async function validateTraceability(options: {
	projectRoot: string;
	ledger: TraceabilityLedger;
	vaultRoot: string;
	linearSnapshot?: readonly LinearSnapshotIssue[];
}): Promise<string[]> {
	const { projectRoot, ledger, vaultRoot, linearSnapshot } = options;
	const errors = validateLedger(ledger, digestLedger(ledger));
	let canonicalVaultRoot: string | null = null;
	let canonicalNoteRoot: string | null = null;
	try {
		canonicalVaultRoot = realpathSync(resolve(vaultRoot));
		canonicalNoteRoot = realpathSync(resolve(canonicalVaultRoot, ledger.vault.relativeRoot));
		if (!isWithin(canonicalVaultRoot, canonicalNoteRoot)) errors.push("Obsidian relative root escapes the real vault root");
	} catch (error) {
		errors.push(`Obsidian vault root cannot be resolved: ${String(error)}`);
	}
	const observed = new Map<string, Array<{ path: string; symbol: string }>>();
	const api = new API({ cwd: projectRoot });
	try {
		const configPath = resolve(projectRoot, "tsconfig.json");
		const snapshot = await api.updateSnapshot({ openProjects: [configPath] });
		const project = snapshot.getProject(configPath);
		if (!project) errors.push("TypeScript project could not be loaded");
		else for (const path of execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", "src/**/*.ts", "src/*.ts"], { cwd: projectRoot, encoding: "utf8" }).trim().split("\n").filter(Boolean)) {
			const absolute = resolve(projectRoot, path);
			if (!existsSync(absolute)) continue;
			const source = await project.program.getSourceFile(absolute);
			if (!source) { errors.push(`source is missing from TypeScript project: ${path}`); continue; }
			for (const statement of source.statements) {
				if (!ts.isClassDeclaration(statement) && !ts.isFunctionDeclaration(statement)) continue;
				const ranges = ts.getLeadingCommentRanges(source.text, statement.pos) ?? [];
				for (const range of ranges) for (const match of source.text.slice(range.pos, range.end).matchAll(/@Unit\s+(Code-\d{3})/gu)) {
					const list = observed.get(match[1]!) ?? [];
					list.push({ path, symbol: statement.name?.text ?? "" });
					observed.set(match[1]!, list);
				}
			}
		}
	} finally { await api.close(); }

	for (const unit of ledger.units) {
		const declarations = observed.get(unit.key) ?? [];
		if (declarations.length !== 1) errors.push(`${unit.key}: expected one @Unit declaration, observed ${declarations.length}`);
		else if (!unit.locations.some(location => location.path === declarations[0]!.path && location.symbol === declarations[0]!.symbol)) errors.push(`${unit.key}: @Unit declaration does not match registered symbol`);
	}
	for (const key of observed.keys()) if (!ledger.units.some(unit => unit.key === key)) errors.push(`${key}: unregistered @Unit declaration`);

	for (const note of ledger.notes) {
		try {
			const uri = new URL(note.uri);
			const expectedFile = [ledger.vault.relativeRoot, note.relativePath]
				.filter(part => part !== "." && part !== "")
				.join("/")
				.replaceAll(/\/{2,}/gu, "/");
			if (uri.protocol !== "obsidian:" || uri.hostname !== "open" || uri.searchParams.get("vault") !== ledger.vault.id || uri.searchParams.get("file") !== expectedFile) {
				errors.push(`${note.id}: Obsidian URI differs from registered vault/path`);
			}
		} catch {
			errors.push(`${note.id}: invalid Obsidian URI`);
		}
		const path = resolve(vaultRoot, ledger.vault.relativeRoot, note.relativePath);
		if (!existsSync(path)) { errors.push(`${note.id}: Obsidian note does not exist: ${path}`); continue; }
		let canonicalPath: string;
		try { canonicalPath = realpathSync(path); }
		catch (error) { errors.push(`${note.id}: Obsidian note cannot be resolved: ${String(error)}`); continue; }
		if (!canonicalVaultRoot || !canonicalNoteRoot || !isWithin(canonicalVaultRoot, canonicalPath) || !isWithin(canonicalNoteRoot, canonicalPath)) {
			errors.push(`${note.id}: Obsidian note escapes the real vault root`); continue;
		}
		const frontmatter = parseFrontmatter(readFileSync(canonicalPath, "utf8"));
		if (!frontmatter) { errors.push(`${note.id}: frontmatter is required`); continue; }
		for (const field of ["linear_id", "linear_uuid", "unit_id", "unit_uuid", "record_type", "source_revision", "updated_at"]) if (!(field in frontmatter)) errors.push(`${note.id}: missing frontmatter ${field}`);
		const issue = ledger.issues.find(value => value.id === frontmatter.linear_id);
		const unit = ledger.units.find(value => value.key === frontmatter.unit_id);
		if (!issue || issue.uuid !== frontmatter.linear_uuid) errors.push(`${note.id}: Linear id/UUID mismatch`);
		if (!unit || unit.uuid !== frontmatter.unit_uuid) errors.push(`${note.id}: Unit key/UUID mismatch`);
		if (frontmatter.record_type !== note.recordType) errors.push(`${note.id}: record_type mismatch`);
		if (frontmatter.source_revision !== note.sourceRevision) errors.push(`${note.id}: source_revision differs from relation ledger`);
		if (!ledger.edges.some(edge => edge.from === `issue:${frontmatter.linear_id}` && edge.relation === "detailed-by" && edge.to === `note:${note.id}`)) errors.push(`${note.id}: note is not connected to its Linear issue`);
		if (!ledger.edges.some(edge => edge.from === `issue:${frontmatter.linear_id}` && edge.relation === "implemented-by" && edge.to === `unit:${frontmatter.unit_id}`)) errors.push(`${note.id}: note Unit is not connected to its Linear issue`);
	}

	for (const run of ledger.runs) {
		const evidencePath = resolve(projectRoot, run.evidencePath);
		if (!isWithin(resolve(projectRoot), evidencePath) || !existsSync(evidencePath)) { errors.push(`${run.id}: validation evidence is missing or outside the repository`); continue; }
		try {
			const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as Record<string, unknown>;
			if (evidence.runId !== run.id || evidence.runPurpose !== run.purpose || evidence.sourceState !== run.sourceState || evidence.sourceRevision !== run.sourceRevision) {
				errors.push(`${run.id}: validation evidence provenance differs from relation ledger`);
			}
		} catch (error) { errors.push(`${run.id}: validation evidence cannot be parsed: ${String(error)}`); }
	}

	if (linearSnapshot) for (const issue of ledger.issues) {
		const live = linearSnapshot.find(value => value.id === issue.id);
		if (!live) { errors.push(`${issue.id}: missing from Linear readback`); continue; }
		if (live.uuid !== issue.uuid) errors.push(`${issue.id}: Linear UUID differs from ledger`);
		const expected = ledger.edges.filter(edge => edge.from === `issue:${issue.id}` && edge.relation === "implemented-by").map(edge => edge.to.slice("unit:".length)).sort();
		const actual = codeIds(live.description);
		if (JSON.stringify(expected) !== JSON.stringify(actual)) errors.push(`${issue.id}: plain Code-ID line differs from ledger (${actual.join(", ")} != ${expected.join(", ")})`);
		if (/Code-\d{3}\]\(/u.test(live.description ?? "")) errors.push(`${issue.id}: Code-ID must not be a link`);
	}
	return errors;
}
