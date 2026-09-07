export type RecordType = "requirement" | "decision" | "exception" | "test";
export type TraceRef = `unit:${string}` | `issue:${string}` | `note:${string}` | `pr:${string}` | `run:${string}`;

export interface UnitLocation { path: string; symbol: string }
export interface TraceabilityUnit {
	uuid: string;
	key: string;
	name: string;
	lifecycle: "active" | "retired";
	aliases: string[];
	locations: UnitLocation[];
}
export interface TraceabilityIssue { id: string; uuid: string; url: string; milestone: string }
export interface TraceabilityNote { id: string; relativePath: string; uri: string; recordType: RecordType; sourceRevision: string }
export interface TraceabilityPullRequest { id: string; url: string; scope: "chat-v0.1-code-evidence" }
export interface TraceabilityRun {
	id: string;
	purpose: "traceability-validation";
	status: "passed" | "failed" | "cancelled";
	evidencePath: string;
	sourceState: "committed" | "dirty-worktree";
	sourceRevision: string;
}
export interface TraceabilityEdge { from: TraceRef; relation: "implemented-by" | "detailed-by" | "code-evidenced-by" | "verifies" | "recorded-in"; to: TraceRef }
export interface TraceabilityMigration { from: string; to: string; reason: string }

export interface TraceabilityLedger {
	schemaVersion: 2;
	projectId: string;
	vault: { id: string; relativeRoot: string };
	units: TraceabilityUnit[];
	issues: TraceabilityIssue[];
	notes: TraceabilityNote[];
	pullRequests: TraceabilityPullRequest[];
	runs: TraceabilityRun[];
	edges: TraceabilityEdge[];
	tombstones: string[];
	migrations: TraceabilityMigration[];
	payloadDigest: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const UNIT_KEY = /^Code-(\d{3})$/u;

function safeRelativePath(value: string): boolean {
	return Boolean(value) && !value.startsWith("/") && !/^[a-z]:[\\/]/iu.test(value) && !value.split(/[\\/]/u).some(part => part === ".." || part === "." || part === "");
}

export function entityRefs(ledger: TraceabilityLedger): Set<string> {
	return new Set([
		...ledger.units.map(unit => `unit:${unit.key}`),
		...ledger.issues.map(issue => `issue:${issue.id}`),
		...ledger.notes.map(note => `note:${note.id}`),
		...ledger.pullRequests.map(pr => `pr:${pr.id}`),
		...ledger.runs.map(run => `run:${run.id}`),
	]);
}

function duplicate(values: readonly string[]): string[] {
	const seen = new Set<string>();
	return values.filter(value => seen.has(value) || !seen.add(value));
}

/** @Unit Code-006 */
export function validateLedger(ledger: TraceabilityLedger, computedPayloadDigest: string): string[] {
	const errors: string[] = [];
	if (ledger.schemaVersion !== 2) errors.push("ledger schemaVersion must be 2");
	if (!UUID.test(ledger.projectId)) errors.push("projectId must be a UUID");
	if (ledger.payloadDigest !== computedPayloadDigest) errors.push("ledger payload digest mismatch");
	if (!ledger.vault.id || !safeRelativePath(ledger.vault.relativeRoot)) errors.push("vault must use an id and a safe relative root");
	for (const value of duplicate(ledger.units.map(unit => unit.uuid))) errors.push(`duplicate Unit UUID: ${value}`);
	for (const value of duplicate(ledger.units.map(unit => unit.key))) errors.push(`duplicate Unit key: ${value}`);
	for (const value of duplicate(ledger.issues.map(issue => issue.id))) errors.push(`duplicate Linear id: ${value}`);
	for (const value of duplicate(ledger.issues.map(issue => issue.uuid))) errors.push(`duplicate Linear UUID: ${value}`);
	for (const value of duplicate(ledger.notes.map(note => note.id))) errors.push(`duplicate note id: ${value}`);
	for (const value of duplicate(ledger.units.flatMap(unit => unit.locations.map(location => `${location.path}#${location.symbol}`)))) errors.push(`duplicate Unit location: ${value}`);
	for (const value of duplicate(ledger.edges.map(edge => `${edge.from} ${edge.relation} ${edge.to}`))) errors.push(`duplicate edge: ${value}`);
	const aliases = ledger.units.flatMap(unit => unit.aliases.map(alias => `${alias}:${unit.key}`));
	for (const value of duplicate(aliases.map(value => value.split(":")[0]!))) errors.push(`reused Unit alias: ${value}`);
	for (const unit of ledger.units) {
		const match = UNIT_KEY.exec(unit.key);
		if (!match || match[1] === "000") errors.push(`invalid Unit key: ${unit.key}`);
		if (!UUID.test(unit.uuid)) errors.push(`invalid Unit UUID: ${unit.uuid}`);
		if (!unit.name.trim() || !unit.locations.length) errors.push(`${unit.key}: name and location are required`);
		if (unit.lifecycle === "active" && ledger.tombstones.includes(unit.key)) errors.push(`${unit.key}: active Unit reuses a tombstone`);
	}
	for (const issue of ledger.issues) {
		if (!/^WOO-\d+$/u.test(issue.id) || !UUID.test(issue.uuid) || !issue.url.includes(`/issue/${issue.id}/`)) errors.push(`invalid Linear identity: ${issue.id}`);
	}
	for (const note of ledger.notes) if (!safeRelativePath(note.relativePath)) errors.push(`${note.id}: note path must be a safe relative path`);
	for (const pr of ledger.pullRequests) if (pr.scope !== "chat-v0.1-code-evidence") errors.push(`${pr.id}: pull request scope must identify Chat v0.1 code evidence`);
	for (const run of ledger.runs) {
		if (run.purpose !== "traceability-validation") errors.push(`${run.id}: run purpose must be traceability-validation`);
		const expected = run.sourceState === "committed" ? /^git:[0-9a-f]{40}$/u : /^worktree:[0-9a-f]{40}:dirty$/u;
		if (!expected.test(run.sourceRevision)) errors.push(`${run.id}: source revision does not match ${run.sourceState}`);
		if (!safeRelativePath(run.evidencePath)) errors.push(`${run.id}: evidence path must be repository-relative`);
	}
	for (const tombstone of ledger.tombstones) if (!UNIT_KEY.test(tombstone) || tombstone === "Code-000") errors.push(`invalid tombstone: ${tombstone}`);
	for (const migration of ledger.migrations) {
		if (!/^\d{4}$/u.test(migration.from) || !ledger.units.some(unit => unit.key === migration.to && unit.aliases.includes(migration.from))) errors.push(`dangling migration: ${migration.from} -> ${migration.to}`);
	}
	const refs = entityRefs(ledger);
	for (const edge of ledger.edges) {
		if (!refs.has(edge.from) || !refs.has(edge.to)) errors.push(`dangling edge: ${edge.from} ${edge.relation} ${edge.to}`);
		const valid =
			(edge.relation === "implemented-by" && edge.from.startsWith("issue:") && edge.to.startsWith("unit:")) ||
			(edge.relation === "detailed-by" && edge.from.startsWith("issue:") && edge.to.startsWith("note:")) ||
			(edge.relation === "code-evidenced-by" && edge.from.startsWith("issue:") && edge.to.startsWith("pr:")) ||
			(edge.relation === "verifies" && edge.from.startsWith("run:") && (edge.to.startsWith("issue:") || edge.to.startsWith("unit:"))) ||
			(edge.relation === "recorded-in" && edge.from.startsWith("run:") && edge.to.startsWith("note:"));
		if (!valid) errors.push(`invalid edge direction: ${edge.from} ${edge.relation} ${edge.to}`);
	}
	for (const issue of ledger.issues) {
		if (!ledger.edges.some(edge => edge.from === `issue:${issue.id}` && edge.relation === "implemented-by")) errors.push(`${issue.id}: Unit edge is required`);
		if (!ledger.edges.some(edge => edge.from === `issue:${issue.id}` && edge.relation === "detailed-by")) errors.push(`${issue.id}: Obsidian edge is required`);
	}
	for (const note of ledger.notes) {
		const runs = ledger.edges.filter(edge => edge.from.startsWith("run:") && edge.relation === "recorded-in" && edge.to === `note:${note.id}`)
			.map(edge => ledger.runs.find(run => `run:${run.id}` === edge.from)).filter((run): run is TraceabilityRun => Boolean(run));
		if (runs.length !== 1) errors.push(`${note.id}: exactly one validation run must record the note`);
		else if (note.sourceRevision !== runs[0]!.sourceRevision) errors.push(`${note.id}: note source revision differs from validation run`);
	}
	return errors;
}

export function nextUnitKey(ledger: TraceabilityLedger): string {
	const numbers = [...ledger.units.map(unit => unit.key), ...ledger.tombstones]
		.map(key => UNIT_KEY.exec(key)?.[1]).filter((value): value is string => Boolean(value)).map(Number);
	const next = Math.max(0, ...numbers) + 1;
	if (next > 999) throw new Error("Code-NNN namespace exhausted");
	return `Code-${String(next).padStart(3, "0")}`;
}
