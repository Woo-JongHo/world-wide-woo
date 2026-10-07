import { createHash } from "node:crypto";

export const ARTIFACT_KINDS = ["github-issue", "github-pr"] as const;
export type ArtifactKind = typeof ARTIFACT_KINDS[number];

export interface ArtifactValidation {
	id       : string                      ;
	status   : "pass" | "fail" | "not-run" ;
	evidence : string                      ;
}

export interface ArtifactCandidate {
	schemaVersion   : "1.0" | "1.1"                  ;
	candidateId     : string                         ;
	kind            : ArtifactKind                   ;
	sourceRevision  : string                         ;
	intent          : string                         ;
	target          : Record<string, unknown>        ;
	content         : Record<string, unknown>        ;
	links           : Record<string, string | null>  ;
	expectedBefore  : Record<string, unknown> | null ;
	validation      : ArtifactValidation[]           ;
	candidateDigest : string                         ;
}

export function canonicalArtifactJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonicalArtifactJson).join(",")}]`;
	if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalArtifactJson(item)}`).join(",")}}`;
	return JSON.stringify(value);
}

export function artifactCandidateDigest(candidate: Omit<ArtifactCandidate, "candidateDigest"> | ArtifactCandidate): string {
	const { candidateDigest: _ignored, ...unsigned } = candidate as ArtifactCandidate;
	return createHash("sha256").update(canonicalArtifactJson(unsigned)).digest("hex");
}

const line        = (value: unknown): value is string => typeof value === "string" && value.trim() === value && value.length > 0 && !/[\r\n]/u.test(value)      ;
const lines       = (value: unknown): value is string[] => Array.isArray(value) && value.length > 0 && value.every(line)                                        ;
const object      = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value)                  ;
const keysExactly = (value: Record<string, unknown>, keys: string[]): boolean => JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()) ;

function validateArtifactEnvelope(candidate: ArtifactCandidate, actualBefore: unknown, errors: string[]): void {
	if (candidate.schemaVersion !== "1.0" && candidate.schemaVersion !== "1.1") errors.push("schemaVersion: 1.0 또는 1.1이어야 합니다.");
	if (!/^ARTIFACT-CANDIDATE-[A-Z0-9][A-Z0-9-]*$/u.test(candidate.candidateId)) errors.push("candidateId: ARTIFACT-CANDIDATE-* 형식이어야 합니다.");
	if (!ARTIFACT_KINDS.includes(candidate.kind)) errors.push("kind: 지원하지 않는 artifact입니다.");
	for (const [name, value] of [["sourceRevision", candidate.sourceRevision], ["intent", candidate.intent]] as const) if (!line(value)) errors.push(`${name}: 한 줄의 비어 있지 않은 값이어야 합니다.`);
	if (!object(candidate.target) || !Object.keys(candidate.target).length) errors.push("target: 대상 식별자가 필요합니다.");
	if (!object(candidate.content)) errors.push("content: object가 필요합니다.");
	if (!object(candidate.links)) errors.push("links: object가 필요합니다.");
	if (candidate.expectedBefore !== null && !object(candidate.expectedBefore)) errors.push("expectedBefore: object 또는 null이어야 합니다.");
	if (!Array.isArray(candidate.validation) || !candidate.validation.length) errors.push("validation: 검증이 하나 이상 필요합니다.");
	for (const check of candidate.validation ?? []) {
		if (!line(check.id) || !line(check.evidence)) errors.push("validation: id와 evidence가 필요합니다.");
		if (check.status !== "pass") errors.push(`validation.${check.id}: ${check.status} 상태는 게시할 수 없습니다.`);
	}
	if (!/^[0-9a-f]{64}$/u.test(candidate.candidateDigest) || candidate.candidateDigest !== artifactCandidateDigest(candidate)) errors.push("candidateDigest: 현재 Candidate 내용과 일치하지 않습니다.");
	if (actualBefore !== undefined && canonicalArtifactJson(candidate.expectedBefore) !== canonicalArtifactJson(actualBefore)) errors.push("EXPECTED_BEFORE_STALE: 대상이 Candidate 작성 뒤 변경됐습니다.");
}

export function validateArtifactCandidate(candidate: ArtifactCandidate, actualBefore?: unknown): string[] {
	const errors: string[] = [];
	validateArtifactEnvelope(candidate, actualBefore, errors);

	const content = object(candidate.content) ? candidate.content : {} ;
	const links   = object(candidate.links) ? candidate.links : {}     ;
	if (candidate.kind === "github-issue") {
		if (!keysExactly(content, ["issueType", "title", "statement", "details"])) errors.push("github-issue.content: 정해진 필드만 허용합니다.");
		if (!(["bug", "enhancement"] as unknown[]).includes(content.issueType)
			|| !line(content.title)
			|| !line(content.statement)
			|| !lines(content.details)) errors.push("github-issue.content: issueType/title/statement/details가 필요합니다.");
		if (typeof content.title === "string" && /^(?:\[[^\]]+\]|(?:feat|fix|bug|feature)(?:\([^)]*\))?:)/iu.test(content.title)) errors.push("github-issue.title: 유형 접두어를 제거해야 합니다.");
	}
	if (candidate.kind === "github-pr") {
		const required = ["title", "summary", "before", "after", "checks", "risk", "rollback"];
		if (!keysExactly(content, required)) errors.push("github-pr.content: 정해진 필드만 허용합니다.");
		if (!required.slice(0, 4).every(key => line(content[key]))
			|| !lines(content.checks)
			|| !line(content.risk)
			|| !line(content.rollback)) errors.push("github-pr.content: 모든 PR 계약 필드가 필요합니다.");
		for (const key of ["linear", "obsidian", "code"]) if (key in links) errors.push(`github-pr.links.${key}: 폐기된 관리 연결입니다.`);
		for (const key of ["receipt"]) if (!line(links[key])) errors.push(`github-pr.links.${key}: 연결이 필요합니다.`);
	}
	return errors;
}

const bullets = (values: unknown): string => (values as string[]).map(value => `- ${value}`).join("\n");

export function renderArtifactCandidate(candidate: ArtifactCandidate): string {
	const errors = validateArtifactCandidate(candidate);
	if (errors.length) throw new Error(errors.join("\n"));
	const c = candidate.content;
	if (candidate.kind === "github-issue") {
		const bug = c.issueType === "bug";
		return `# ${c.title}\n\n## ${bug ? "문제" : "요청"}\n\n${c.statement}\n\n## ${bug ? "확인 및 재현" : "현재 상황 및 불편"}\n\n${bullets(c.details)}\n`;
	}
	if (candidate.kind === "github-pr") {
		return `# ${c.title}\n\n## 변경 요약\n\n${c.summary}\n\n## 사용자 동작\n\n- 변경 전: ${c.before}\n- 변경 후: ${c.after}\n\n## 검증\n\n${bullets(c.checks)}\n\n## 연결\n\n- Receipt: ${candidate.links.receipt}\n\n## 위험과 복구\n\n- 위험: ${c.risk}\n- 복구: ${c.rollback}\n`;
	}
	throw new Error("ARTIFACT_KIND_UNSUPPORTED");
}
