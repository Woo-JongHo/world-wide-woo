export const WORK_REFERENCE_KINDS = [
	"initiative",
	"epic",
	"story",
	"linear-issue",
	"project-activity",
	"native",
	"code",
	"test",
	"evidence",
] as const;

export type WorkReferenceKind = (typeof WORK_REFERENCE_KINDS)[number];

interface CanonicalReference<Kind extends WorkReferenceKind> {
	readonly kind: Kind;
	/** Identifier in this reference's canonical system; never rewritten as another kind. */
	readonly id: string;
}

export interface LinearIssueReference extends CanonicalReference<"linear-issue"> {
	readonly uuid: string;
	readonly url: string;
}

export type WorkReference =
	| CanonicalReference<"initiative" | "epic" | "story" | "project-activity" | "native" | "code" | "test" | "evidence">
	| LinearIssueReference;

export interface WorkTraceabilityLink {
	readonly from: WorkReference;
	readonly relation: "implements" | "verifies" | "evidences" | "tracks" | "originated-from";
	readonly to: WorkReference;
}

/** Thin relation manifest. It intentionally stores no title, description, status, or acceptance text. */
export interface WorkTraceabilityManifest {
	readonly schemaVersion: 1;
	readonly references: readonly WorkReference[];
	readonly links: readonly WorkTraceabilityLink[];
}

const relationEndpoints: Readonly<Record<
	WorkTraceabilityLink["relation"],
	readonly [from: readonly WorkReferenceKind[], to: readonly WorkReferenceKind[]]
>> = {
	implements: [["initiative", "epic", "story", "linear-issue"], ["code"]],
	tracks: [["initiative", "epic", "story"], ["epic", "story", "linear-issue"]],
	verifies: [["test", "evidence"], ["epic", "story", "linear-issue", "code"]],
	evidences: [["evidence"], ["epic", "story", "linear-issue", "code"]],
	"originated-from": [["project-activity"], ["native"]],
};

const patterns: Readonly<Record<WorkReferenceKind, RegExp>> = {
	initiative: /^INIT-\d{3,}$/u,
	epic: /^EP-\d{3,}$/u,
	story: /^ST-\d{3,}-\d{2,}$/u,
	"linear-issue": /^WOO-\d+$/u,
	"project-activity": /^[^\s]+$/u,
	native: /^[^\s]+$/u,
	code: /^(?:src|scripts)\/.+\.ts$/u,
	test: /^test\/.+\.ts$/u,
	evidence: /^\.www\/evidence\/.+\.(?:json|md)$/u,
};
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function parseWorkTraceabilityManifest(value: unknown): WorkTraceabilityManifest {
	if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.references) || !Array.isArray(value.links)) {
		throw new Error("Invalid work traceability manifest");
	}
	const references = value.references.map(parseReference);
	const known = new Map<string, WorkReference>();
	for (const reference of references) {
		const key = referenceKey(reference);
		if (known.has(key)) throw new Error(`Duplicate work reference: ${key}`);
		known.set(key, reference);
	}
	const links = value.links.map(parseLink);
	const identities = new Set<string>();
	for (const link of links) {
		for (const endpoint of [link.from, link.to]) {
			const declared = known.get(referenceKey(endpoint));
			if (!declared || JSON.stringify(declared) !== JSON.stringify(endpoint)) {
				throw new Error(`Dangling work reference: ${referenceKey(endpoint)}`);
			}
		}
		const identity = `${referenceKey(link.from)}|${link.relation}|${referenceKey(link.to)}`;
		if (identities.has(identity)) throw new Error(`Duplicate work traceability link: ${identity}`);
		identities.add(identity);
	}
	return Object.freeze({ schemaVersion: 1, references: Object.freeze(references), links: Object.freeze(links) });
}

export function relatedWorkReferences(manifest: WorkTraceabilityManifest, reference: WorkReference): readonly WorkReference[] {
	const key = referenceKey(reference);
	const related = new Map<string, WorkReference>();
	for (const link of relatedWorkLinks(manifest, reference)) {
		if (referenceKey(link.from) === key) related.set(referenceKey(link.to), link.to);
		if (referenceKey(link.to) === key) related.set(referenceKey(link.from), link.from);
	}
	return Object.freeze([...related.values()]);
}

export function relatedWorkLinks(
	manifest: WorkTraceabilityManifest,
	reference: WorkReference,
): readonly WorkTraceabilityLink[] {
	assertReference(reference);
	const key = referenceKey(reference);
	return Object.freeze(manifest.links.filter(link =>
		referenceKey(link.from) === key || referenceKey(link.to) === key,
	));
}

/** @linear WOO-695 */
export function findWorkReference(
	manifest: WorkTraceabilityManifest,
	query: string,
): WorkReference | undefined {
	const normalized = query.trim();
	if (!normalized) return undefined;
	const matches = manifest.references.filter(reference => {
		if (referenceKey(reference) === normalized || reference.id === normalized) return true;
		return reference.kind === "linear-issue"
			&& (reference.uuid.toLowerCase() === normalized.toLowerCase() || reference.url === normalized);
	});
	if (matches.length > 1) throw new Error(`Ambiguous work reference: ${normalized}`);
	return matches[0];
}

export function referenceKey(reference: WorkReference): string {
	assertReference(reference);
	return `${reference.kind}:${reference.id}`;
}

export function isRepositoryPathReference(reference: WorkReference): boolean {
	return reference.kind === "code" || reference.kind === "test" || reference.kind === "evidence";
}

/** Repository-backed references are part of the ledger contract, not descriptive labels. */
function parseLink(value: unknown): WorkTraceabilityLink {
	if (!isRecord(value)) throw new Error("Invalid work traceability link");
	const relation = value.relation;
	if (!["implements", "verifies", "evidences", "tracks", "originated-from"].includes(String(relation))) {
		throw new Error(`Invalid work traceability relation: ${String(relation)}`);
	}
	const typedRelation = relation as WorkTraceabilityLink["relation"];
	const from = parseReference(value.from);
	const to = parseReference(value.to);
	const [allowedFrom, allowedTo] = relationEndpoints[typedRelation];
	if (!allowedFrom.includes(from.kind) || !allowedTo.includes(to.kind)) {
		throw new Error(`Invalid ${typedRelation} direction: ${from.kind} -> ${to.kind}`);
	}
	return Object.freeze({ from, relation: typedRelation, to });
}

function parseReference(value: unknown): WorkReference {
	if (!isRecord(value) || typeof value.kind !== "string" || typeof value.id !== "string") throw new Error("Invalid work reference");
	const base = { kind: value.kind as WorkReferenceKind, id: value.id };
	if (base.kind !== "linear-issue") {
		assertReference(base as WorkReference);
		return Object.freeze(base as WorkReference);
	}
	if (typeof value.uuid !== "string" || !uuidPattern.test(value.uuid)) throw new Error(`Invalid Linear UUID: ${String(value.uuid)}`);
	if (typeof value.url !== "string" || !isLinearIssueUrl(value.url, value.id)) throw new Error(`Invalid Linear issue URL: ${String(value.url)}`);
	const reference: LinearIssueReference = { kind: "linear-issue", id: value.id, uuid: value.uuid, url: value.url };
	assertReference(reference);
	return Object.freeze(reference);
}

function assertReference(reference: WorkReference): void {
	const pattern = patterns[reference.kind];
	if (!pattern || !pattern.test(reference.id)) throw new Error(`Invalid ${reference.kind} reference: ${reference.id}`);
	if (reference.kind === "linear-issue" && (!uuidPattern.test(reference.uuid) || !isLinearIssueUrl(reference.url, reference.id))) {
		throw new Error(`Invalid Linear issue reference: ${reference.id}`);
	}
}

function isLinearIssueUrl(value: string, issueId: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "https:" && url.hostname === "linear.app" && url.pathname.split("/").includes(issueId);
	} catch {
		return false;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}
