import { describe, expect, test } from "bun:test";
import { artifactCandidateDigest, renderArtifactCandidate, validateArtifactCandidate, type ArtifactCandidate } from "../src/core/domain/development/artifact-control";

function sign(candidate: Omit<ArtifactCandidate, "candidateDigest">): ArtifactCandidate {
	return { ...candidate, candidateDigest: artifactCandidateDigest(candidate) };
}

function comment(): ArtifactCandidate {
	return sign({
		schemaVersion: "1.0", candidateId: "ARTIFACT-CANDIDATE-PROJECT-COMMENT-TEST", kind: "linear-project-comment",
		sourceRevision: "abc1234", intent: "Project Activity Comment 형식을 검증한다", target: { projectId: "project-1" },
		content: { requirement: "요구를 추적한다", work: ["Candidate를 작성했다"], types: ["improvement", "operations"], connections: ["WOO-907"], state: "in-progress", next: "게시 전 read-back을 확인한다" },
		links: { linear: "https://linear.app/woo-world/issue/WOO-907" }, expectedBefore: { latestCommentId: "comment-1" },
		validation: [{ id: "UNIT", status: "pass", evidence: "구조화된 입력" }],
	});
}

function update(): ArtifactCandidate {
	return sign({
		schemaVersion: "1.0", candidateId: "ARTIFACT-CANDIDATE-PROJECT-UPDATE-TEST", kind: "linear-project-update",
		sourceRevision: "abc1234", intent: "Project Update 종합 형식을 검증한다", target: { projectId: "project-1" },
		content: { version: "0.0.17", delivered: ["사용자가 새 기능을 사용한다"], included: ["구조를 정리했다"], verification: ["테스트 통과", "실사용 수락은 남아 있다"], connections: ["WOO-907"], sourceCommentIds: ["comment-1"], health: "atRisk" },
		links: { linear: "https://linear.app/woo-world/issue/WOO-907" }, expectedBefore: { latestUpdateId: "update-1" },
		validation: [{ id: "UNIT", status: "pass", evidence: "Comment ID와 릴리스 경계를 확인" }],
	});
}

function commentV11(): ArtifactCandidate {
	return sign({
		schemaVersion: "1.1", candidateId: "ARTIFACT-CANDIDATE-PROJECT-COMMENT-V11-TEST", kind: "linear-project-comment",
		sourceRevision: "abc1234", intent: "Project Activity Comment의 새 형식을 검증한다", target: { projectId: "project-1" },
		content: { changes: ["Candidate를 작성했다"], impacts: ["이전 승인안의 오게시가 차단된다"], categories: ["improvement", "verification", "operations"], verification: ["단위 테스트 통과"], connections: ["WOO-902"] },
		links: { linear: "https://linear.app/woo-world/issue/WOO-902" }, expectedBefore: { latestCommentId: "comment-1" },
		validation: [{ id: "UNIT", status: "pass", evidence: "구조화된 입력" }],
	});
}

describe("Project Activity Artifact 경로", () => {
	test("Comment를 고정 다섯 항목으로 렌더한다", () => {
		const candidate = comment();
		expect(validateArtifactCandidate(candidate)).toEqual([]);
		expect(renderArtifactCandidate(candidate)).toBe("**요구**\n- 요구를 추적한다\n\n**작업**\n- Candidate를 작성했다\n\n**유형**\n- 개선\n- 운영\n\n**연결**\n- WOO-907\n\n**상태**\n- 진행 중 — 게시 전 read-back을 확인한다\n");
	});

	test("Update는 버전과 직전 Comment ID를 요구한다", () => {
		const candidate = update();
		expect(validateArtifactCandidate(candidate)).toEqual([]);
		expect(renderArtifactCandidate(candidate)).toContain("# 0.0.17\n\n## 전달 기능");
		expect(renderArtifactCandidate(candidate)).toContain("## 작업 Comment\n\n- comment-1");
		candidate.content.sourceCommentIds = [];
		const errors = validateArtifactCandidate({ ...candidate, candidateDigest: artifactCandidateDigest(candidate) });
		expect(errors.some(error => error.startsWith("linear-project-update.content"))).toBeTrue();
	});

	test("Comment 유형과 상태를 제한해 자유 본문 우회를 막는다", () => {
		const candidate = comment();
		candidate.content.types = ["memo"];
		candidate.content.state = "done";
		const errors = validateArtifactCandidate({ ...candidate, candidateDigest: artifactCandidateDigest(candidate) });
		expect(errors.some(error => error.startsWith("linear-project-comment.content.types"))).toBeTrue();
		expect(errors.some(error => error.startsWith("linear-project-comment.content.state"))).toBeTrue();
	});

	test("현재 Project Activity의 직전 identity를 Candidate에 고정한다", () => {
		const candidate = comment();
		candidate.expectedBefore = {};
		expect(validateArtifactCandidate({ ...candidate, candidateDigest: artifactCandidateDigest(candidate) })).toContain("linear-project-comment.expectedBefore: latestCommentId가 필요합니다.");
	});

	test("새 Comment를 변경·영향·분류·검증·연결로 렌더한다", () => {
		const candidate = commentV11();
		expect(validateArtifactCandidate(candidate)).toEqual([]);
		expect(renderArtifactCandidate(candidate)).toBe("## 변경\n\n- Candidate를 작성했다\n\n## 영향\n\n- 이전 승인안의 오게시가 차단된다\n\n## 분류\n\nImprovement · Validation · Operation\n\n## 검증\n\n- 단위 테스트 통과\n\n## 연결\n\n- WOO-902\n");
	});
});
