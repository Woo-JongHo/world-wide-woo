import { createHash } from "node:crypto";
import YAML from "yaml";
import { OBSIDIAN_SECTIONS } from "./obsidian-contract.js";
import { renderRpaProject, renderRpaTask, validateRpaDescriptionMap, type RpaDescriptionMap } from "./rpa-description.js";

export const ARTIFACT_KINDS = ["linear-issue", "linear-project", "linear-project-comment", "linear-project-update", "obsidian-canonical", "github-issue", "github-pr"] as const;
export type ArtifactKind = typeof ARTIFACT_KINDS[number];

const PROJECT_ACTIVITY_TYPES = ["feature", "improvement", "refactor", "fix", "verification", "operations"] as const;
const PROJECT_ACTIVITY_STATES = ["complete", "in-progress", "blocked"] as const;
const PROJECT_UPDATE_HEALTH = ["onTrack", "atRisk", "offTrack"] as const;

export interface ArtifactValidation {
	id: string;
	status: "pass" | "fail" | "not-run";
	evidence: string;
}

export interface ArtifactCandidate {
	schemaVersion: "1.0" | "1.1";
	candidateId: string;
	kind: ArtifactKind;
	sourceRevision: string;
	intent: string;
	target: Record<string, unknown>;
	content: Record<string, unknown>;
	links: Record<string, string | null>;
	expectedBefore: Record<string, unknown> | null;
	validation: ArtifactValidation[];
	candidateDigest: string;
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

const line = (value: unknown): value is string => typeof value === "string" && value.trim() === value && value.length > 0 && !/[\r\n]/u.test(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const lines = (value: unknown): value is string[] => Array.isArray(value) && value.length > 0 && value.every(line);
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const keysExactly = (value: Record<string, unknown>, keys: string[]): boolean => JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());

export function validateArtifactCandidate(candidate: ArtifactCandidate, actualBefore?: unknown): string[] {
	const errors: string[] = [];
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

	const content = object(candidate.content) ? candidate.content : {};
	const links = object(candidate.links) ? candidate.links : {};
	const rpaTask = candidate.kind === "linear-issue" && content.profile === "rpa-task-v1";
	if (candidate.kind === "linear-project" || rpaTask) {
		const project = candidate.kind === "linear-project";
		if (!keysExactly(content, project ? ["profile", "map"] : ["profile", "map", "taskId"])) errors.push("rpa.content: 정해진 템플릿 필드만 허용합니다.");
		if (content.profile !== (project ? "rpa-project-v1" : "rpa-task-v1")) errors.push("rpa.profile: 지원하는 고정 템플릿을 지정해야 합니다.");
		const mapErrors = validateRpaDescriptionMap(content.map);
		errors.push(...mapErrors);
		if (!mapErrors.length) {
			const map = content.map as RpaDescriptionMap;
			if (candidate.sourceRevision !== map.project.mapRef.revision) errors.push("rpa.sourceRevision: rpa-map revision과 일치해야 합니다.");
			if (!object(candidate.target) || candidate.target.projectId !== map.project.id) errors.push("rpa.target.projectId: map의 Linear Project와 일치해야 합니다.");
			if (!project) {
				const task = map.tasks.find(item => item.id === content.taskId);
				if (!task) errors.push("rpa.taskId: map에 등록된 Task가 필요합니다.");
				else if (!object(candidate.target) || candidate.target.issueUrl !== task.issueUrl) errors.push("rpa.target.issueUrl: Task의 Linear 이슈와 일치해야 합니다.");
			}
		}
	}
	if (candidate.kind === "linear-issue" && !rpaTask) {
		if (!keysExactly(content, ["title", "purpose", "included", "excluded", "done", "connections"])) errors.push("linear-issue.content: 정해진 필드만 허용합니다.");
		if (!line(content.title) || !line(content.purpose) || !lines(content.included) || !lines(content.excluded) || !lines(content.done) || !lines(content.connections)) errors.push("linear-issue.content: title/purpose와 included/excluded/done/connections가 필요합니다.");
	}
	if (candidate.kind === "linear-project-comment") {
		const legacy = candidate.schemaVersion === "1.0";
		const required = legacy ? ["requirement", "work", "types", "connections", "state", "next"] : ["changes", "impacts", "categories", "verification", "connections"];
		if (!keysExactly(content, required)) errors.push("linear-project-comment.content: 정해진 필드만 허용합니다.");
		if (!line(candidate.target.projectId)) errors.push("linear-project-comment.target.projectId: Project ID가 필요합니다.");
		if (!object(candidate.expectedBefore) || !keysExactly(candidate.expectedBefore, ["latestCommentId"]) || (candidate.expectedBefore.latestCommentId !== null && !line(candidate.expectedBefore.latestCommentId))) errors.push("linear-project-comment.expectedBefore: latestCommentId가 필요합니다.");
		if (legacy) {
			if (!line(content.requirement) || !lines(content.work) || !lines(content.connections) || !line(content.next)) errors.push("linear-project-comment.content: requirement/work/connections/next가 필요합니다.");
			if (!Array.isArray(content.types) || !content.types.length || content.types.some(type => !PROJECT_ACTIVITY_TYPES.includes(type as typeof PROJECT_ACTIVITY_TYPES[number]))) errors.push("linear-project-comment.content.types: feature|improvement|refactor|fix|verification|operations 중 하나 이상이어야 합니다.");
			if (!PROJECT_ACTIVITY_STATES.includes(content.state as typeof PROJECT_ACTIVITY_STATES[number])) errors.push("linear-project-comment.content.state: complete|in-progress|blocked여야 합니다.");
		} else {
			if (!lines(content.changes) || !lines(content.impacts) || !lines(content.verification) || !lines(content.connections)) errors.push("linear-project-comment.content: changes/impacts/verification/connections가 필요합니다.");
			if (!Array.isArray(content.categories) || !content.categories.length || content.categories.some(type => !PROJECT_ACTIVITY_TYPES.includes(type as typeof PROJECT_ACTIVITY_TYPES[number]))) errors.push("linear-project-comment.content.categories: feature|improvement|refactor|fix|verification|operations 중 하나 이상이어야 합니다.");
		}
	}
	if (candidate.kind === "linear-project-update") {
		const required = ["version", "delivered", "included", "verification", "connections", "sourceCommentIds", "health"];
		if (!keysExactly(content, required)) errors.push("linear-project-update.content: 정해진 필드만 허용합니다.");
		if (!line(candidate.target.projectId)) errors.push("linear-project-update.target.projectId: Project ID가 필요합니다.");
		if (!object(candidate.expectedBefore) || !keysExactly(candidate.expectedBefore, ["latestUpdateId"]) || (candidate.expectedBefore.latestUpdateId !== null && !line(candidate.expectedBefore.latestUpdateId))) errors.push("linear-project-update.expectedBefore: latestUpdateId가 필요합니다.");
		if (!/^0\.0\.\d+$/u.test(String(content.version ?? "")) || !lines(content.delivered) || !lines(content.included) || !lines(content.verification) || !lines(content.connections) || !lines(content.sourceCommentIds)) errors.push("linear-project-update.content: version과 delivered/included/verification/connections/sourceCommentIds가 필요합니다.");
		if (!PROJECT_UPDATE_HEALTH.includes(content.health as typeof PROJECT_UPDATE_HEALTH[number])) errors.push("linear-project-update.content.health: onTrack|atRisk|offTrack여야 합니다.");
	}
	if (candidate.kind === "github-issue") {
		if (!keysExactly(content, ["issueType", "title", "statement", "details"])) errors.push("github-issue.content: 정해진 필드만 허용합니다.");
		if (!(["bug", "enhancement"] as unknown[]).includes(content.issueType) || !line(content.title) || !line(content.statement) || !lines(content.details)) errors.push("github-issue.content: issueType/title/statement/details가 필요합니다.");
		if (typeof content.title === "string" && /^(?:\[[^\]]+\]|(?:feat|fix|bug|feature)(?:\([^)]*\))?:)/iu.test(content.title)) errors.push("github-issue.title: 유형 접두어를 제거해야 합니다.");
	}
	if (candidate.kind === "github-pr") {
		const required = ["title", "summary", "before", "after", "checks", "risk", "rollback"];
		if (!keysExactly(content, required)) errors.push("github-pr.content: 정해진 필드만 허용합니다.");
		if (!required.slice(0, 4).every(key => line(content[key])) || !lines(content.checks) || !line(content.risk) || !line(content.rollback)) errors.push("github-pr.content: 모든 PR 계약 필드가 필요합니다.");
		for (const key of ["linear", "code", "obsidian", "receipt"]) if (!line(links[key])) errors.push(`github-pr.links.${key}: 연결이 필요합니다.`);
	}
	if (candidate.kind === "obsidian-canonical") {
		if (!keysExactly(content, ["properties", "sections"])) errors.push("obsidian-canonical.content: properties와 sections만 허용합니다.");
		const sections = content.sections;
		if (!object(content.properties) || !object(sections)) errors.push("obsidian-canonical.content: properties와 sections object가 필요합니다.");
		else for (const heading of OBSIDIAN_SECTIONS) if (!text(sections[heading])) errors.push(`obsidian-canonical.sections.${heading}: 내용이 필요합니다.`);
	}
	return errors;
}

const bullets = (values: unknown): string => (values as string[]).map(value => `- ${value}`).join("\n");

export function renderArtifactCandidate(candidate: ArtifactCandidate): string {
	const errors = validateArtifactCandidate(candidate);
	if (errors.length) throw new Error(errors.join("\n"));
	const c = candidate.content;
	if (candidate.kind === "linear-project") return renderRpaProject(c.map as RpaDescriptionMap);
	if (candidate.kind === "linear-issue" && c.profile === "rpa-task-v1") return renderRpaTask(c.map as RpaDescriptionMap, c.taskId as string);
	if (candidate.kind === "linear-issue") return `# ${c.title}\n\n## 목적\n\n${c.purpose}\n\n## 범위\n\n### 포함\n\n${bullets(c.included)}\n\n### 제외\n\n${bullets(c.excluded)}\n\n## 완료 조건\n\n${bullets(c.done)}\n\n## 연결\n\n${bullets(c.connections)}\n`;
	if (candidate.kind === "linear-project-comment") {
		if (candidate.schemaVersion === "1.0") return `**요구**\n${bullets([c.requirement])}\n\n**작업**\n${bullets(c.work)}\n\n**유형**\n${bullets((c.types as string[]).map(projectActivityTypeLabel))}\n\n**연결**\n${bullets(c.connections)}\n\n**상태**\n- ${projectActivityStateLabel(c.state)} — ${c.next}\n`;
		return `## 변경\n\n${bullets(c.changes)}\n\n## 영향\n\n${bullets(c.impacts)}\n\n## 분류\n\n${(c.categories as string[]).map(projectActivityCategoryLabel).join(" · ")}\n\n## 검증\n\n${bullets(c.verification)}\n\n## 연결\n\n${bullets(c.connections)}\n`;
	}
	if (candidate.kind === "linear-project-update") return `# ${c.version}\n\n## 전달 기능\n\n${bullets(c.delivered)}\n\n## 함께 반영\n\n${bullets(c.included)}\n\n## 검증\n\n${bullets(c.verification)}\n\n## 작업 Comment\n\n${bullets(c.sourceCommentIds)}\n\n## 연결\n\n${bullets(c.connections)}\n`;
	if (candidate.kind === "github-issue") {
		const bug = c.issueType === "bug";
		return `# ${c.title}\n\n## ${bug ? "문제" : "요청"}\n\n${c.statement}\n\n## ${bug ? "확인 및 재현" : "현재 상황 및 불편"}\n\n${bullets(c.details)}\n`;
	}
	if (candidate.kind === "github-pr") {
		return `# ${c.title}\n\n## 변경 요약\n\n${c.summary}\n\n## 사용자 동작\n\n- 변경 전: ${c.before}\n- 변경 후: ${c.after}\n\n## 검증\n\n${bullets(c.checks)}\n\n## 연결\n\n- Linear: ${candidate.links.linear}\n- Code-ID: ${candidate.links.code}\n- Obsidian: ${candidate.links.obsidian}\n- Receipt: ${candidate.links.receipt}\n\n## 위험과 복구\n\n- 위험: ${c.risk}\n- 복구: ${c.rollback}\n`;
	}
	const properties = c.properties as Record<string, unknown>;
	const sections = c.sections as Record<string, string>;
	const relativePath = String(candidate.target.relativePath ?? "");
	const title = relativePath.split("/").at(-1)?.replace(/\.md$/u, "") ?? String(properties.capability ?? "상세 정본");
	return `---\n${YAML.stringify(properties, { sortMapEntries: true }).trimEnd()}\n---\n\n# ${title}\n\n${OBSIDIAN_SECTIONS.map(heading => `## ${heading}\n\n${sections[heading]}`).join("\n\n")}\n`;
}

function projectActivityTypeLabel(value: string): string {
	return ({ feature: "기능", improvement: "개선", refactor: "리팩터링", fix: "수정", verification: "검증", operations: "운영" } as Record<string, string>)[value] ?? value;
}

function projectActivityCategoryLabel(value: string): string {
	return ({ feature: "Feature", improvement: "Improvement", refactor: "Refactor", fix: "Fix", verification: "Validation", operations: "Operation" } as Record<string, string>)[value] ?? value;
}

function projectActivityStateLabel(value: unknown): string {
	return ({ complete: "완료", "in-progress": "진행 중", blocked: "차단됨" } as Record<string, string>)[String(value)] ?? String(value);
}
