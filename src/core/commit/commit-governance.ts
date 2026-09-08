import { createHash } from "node:crypto";

export type CommitType = "feat" | "fix" | "perf" | "refactor" | "test" | "docs" | "build" | "ci" | "chore" | "revert";
export type CommitState = "complete" | "checkpoint" | "red" | null;
export type CommitDecision = "ready" | "split" | "not-ready";
export type AxisResult = "pass" | "fail" | "unknown";

export interface CommitAxis { result: AxisResult; evidence: string }
export interface CommitValidation {
	id: string;
	class: "deterministic" | "semantic" | "advisory";
	severity: "blocking" | "warning";
	expected: "pass" | "fail";
	result: "pass" | "fail" | "not-run";
	evidence: string;
	command?: string;
}
export interface CommitCandidate {
	schemaVersion: "1.0";
	id: string;
	intent: string;
	type: CommitType;
	scope: string;
	baseHead: string;
	contentDigest: string;
	impactedScopes?: string[];
	state: CommitState;
	decision: CommitDecision;
	result: string;
	why: string;
	paths: string[];
	axes: { samePurpose: CommitAxis; rollbackTogether: CommitAxis; sharedValidation: CommitAxis; oneHeadline: CommitAxis };
	validations: CommitValidation[];
	boundaries: string[];
	refs: string[];
	blockers: string[];
	next: string | null;
	bodyRequired?: boolean;
}
export interface CommitPolicy {
	messageProfile: "korean-result" | "conventional";
	subjectMaxLength: number;
	subjectSoftLength: number;
	requireScope: boolean;
	requireType: boolean;
	requireHumanAuthorization: boolean;
	fullFileStagingOnly: boolean;
	protectedBranches: string[];
	allowedTypes: CommitType[];
	scopes: Record<string, string>;
}

const VAGUE = /^(?:update|modify|changes?|fix issue|작업|수정|정리|기타|여러 작업)$/iu;
const ID = /^COMMIT-CANDIDATE-[A-Z0-9][A-Z0-9-]*$/u;
const SCOPE = /^[a-z][a-z0-9-]*$/u;

export function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
	if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
	return JSON.stringify(value);
}
export const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
export const candidateDigest = (candidate: CommitCandidate): string => sha256(canonicalJson(candidate));

function clean(value: string, label: string, errors: string[]): void {
	if (!value || value !== value.trim() || /[\r\n]/u.test(value)) errors.push(`${label}: 한 줄의 비어 있지 않은 값이어야 합니다.`);
}

/** @linear WOO-844 */
/** @Unit Code-014 */
export class CommitControlPlane {
	constructor(readonly policy: CommitPolicy) {}

	validate(candidate: CommitCandidate, requireReady = false): string[] {
		const errors: string[] = [];
		if (candidate.schemaVersion !== "1.0") errors.push("schemaVersion: 1.0이어야 합니다.");
		if (!ID.test(candidate.id)) errors.push("id: COMMIT-CANDIDATE-* 형식이어야 합니다.");
		for (const [label, value] of [["intent", candidate.intent], ["result", candidate.result], ["why", candidate.why]] as const) clean(value, label, errors);
		if (!this.policy.allowedTypes.includes(candidate.type)) errors.push(`type: 허용되지 않은 값 ${candidate.type}`);
		if (!SCOPE.test(candidate.scope) || !this.policy.scopes[candidate.scope]) errors.push(`scope: 등록되지 않은 경계 ${candidate.scope}`);
		if (!/^[0-9a-f]{40}$/u.test(candidate.baseHead)) errors.push("baseHead: 40자 Git SHA가 필요합니다.");
		if (!/^[0-9a-f]{64}$/u.test(candidate.contentDigest)) errors.push("contentDigest: 64자 SHA-256이 필요합니다.");
		if (!candidate.paths.length || new Set(candidate.paths).size !== candidate.paths.length) errors.push("paths: 하나 이상의 고유 경로가 필요합니다.");
		for (const path of candidate.paths) if (path.startsWith("/") || path.endsWith("/") || path.split(/[\\/]/u).some(part => !part || part === "." || part === "..")) errors.push(`paths: 안전한 저장소 상대 경로가 아닙니다: ${path}`);
		if (!candidate.boundaries.length) errors.push("boundaries: 포함 경계가 필요합니다.");
		if (!candidate.refs.length) errors.push("refs: 요청·이슈·결정 참조가 필요합니다.");
		if (!candidate.validations.length) errors.push("validations: 검증이 하나 이상 필요합니다.");
		if (VAGUE.test(candidate.result)) errors.push("result: 구체적인 완료 상태를 설명해야 합니다.");
		const axes = Object.entries(candidate.axes ?? {});
		if (axes.length !== 4) errors.push("axes: 네 atomicity 축이 모두 필요합니다.");
		for (const [name, axis] of axes) if (!axis.evidence.trim()) errors.push(`axes.${name}: 근거가 필요합니다.`);
		if (candidate.decision === "ready") {
			if (!candidate.state) errors.push("ready 후보에는 state가 필요합니다.");
			for (const [name, axis] of axes) if (axis.result !== "pass") errors.push(`axes.${name}: ready 후보는 pass여야 합니다.`);
			for (const validation of candidate.validations) if (validation.severity === "blocking" && (validation.result === "not-run" || validation.result !== validation.expected)) errors.push(`validation.${validation.id}: blocking 검증이 기대값과 다릅니다.`);
			if (candidate.blockers.length) errors.push("blockers: ready 후보에는 blocker가 없어야 합니다.");
		} else {
			if (candidate.state !== null) errors.push("split/not-ready 후보의 state는 null이어야 합니다.");
			if (!candidate.blockers.length) errors.push("split/not-ready 후보에는 blocker가 필요합니다.");
		}
		if ((candidate.state === "checkpoint" || candidate.state === "red") && !candidate.next?.trim()) errors.push(`${candidate.state}: 다음 단계가 필요합니다.`);
		if (candidate.state === "complete" && candidate.next !== null) errors.push("complete: 다음 단계는 null이어야 합니다.");
		if (requireReady && candidate.decision !== "ready") errors.push(`decision: 실행 가능한 ready가 아닙니다 (${candidate.decision}).`);
		const subject = this.subject(candidate);
		if (subject.length > this.policy.subjectMaxLength) errors.push(`subject: ${this.policy.subjectMaxLength}자를 넘습니다 (${subject.length}).`);
		if (this.bodyRequired(candidate) && candidate.bodyRequired === false) errors.push("bodyRequired: 이 변경에는 본문이 필요합니다.");
		return errors;
	}

	subject(candidate: CommitCandidate): string {
		const marker = candidate.state === "checkpoint" ? "[checkpoint] " : candidate.state === "red" ? "[red] " : "";
		return this.policy.messageProfile === "conventional"
			? `${candidate.type}(${candidate.scope}): ${marker}${candidate.result}`
			: `${marker}${candidate.result}`;
	}

	bodyRequired(candidate: CommitCandidate): boolean {
		return candidate.bodyRequired === true || candidate.state !== "complete" || candidate.paths.length > 1 || candidate.impactedScopes?.length !== undefined && candidate.impactedScopes.length > 0 || ["build", "ci", "revert"].includes(candidate.type);
	}

	render(candidate: CommitCandidate): string {
		const errors = this.validate(candidate, true); if (errors.length) throw new Error(errors.join("\n"));
		const subject = this.subject(candidate);
		if (!this.bodyRequired(candidate)) return `${subject}\n`;
		const lines = [subject, "", "이유:", candidate.why, "", "경계:", ...candidate.boundaries.map(value => `- ${value}`), "", "검증:"];
		for (const validation of candidate.validations) lines.push(`- ${validation.id}: ${validation.result.toUpperCase()} (예상 ${validation.expected.toUpperCase()}) — ${validation.evidence}`);
		lines.push("", "참조:", ...candidate.refs.map(value => `- ${value}`), "", "정규화 영수증:", `- ${candidate.id} sha256:${candidateDigest(candidate)}`);
		if (candidate.next) lines.push("", "다음:", candidate.next);
		return `${lines.join("\n")}\n`;
	}
}
