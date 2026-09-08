import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { artifactCandidateDigest, renderArtifactCandidate, validateArtifactCandidate, type ArtifactCandidate } from "../src/core/domain/development/artifact-control";
import { renderRpaProject, renderRpaTask, type RpaDescriptionMap } from "../src/core/domain/development/rpa-description";

function fixture(): RpaDescriptionMap {
	return JSON.parse(readFileSync(new URL("./fixtures/rpa-description-map.json", import.meta.url), "utf8"));
}

function sign(candidate: ArtifactCandidate): ArtifactCandidate {
	candidate.candidateDigest = artifactCandidateDigest(candidate);
	return candidate;
}

function candidate(surface: "project" | "task"): ArtifactCandidate {
	const map = fixture();
	const task = map.tasks[0]!;
	return sign({
		schemaVersion: "1.0",
		candidateId: "ARTIFACT-CANDIDATE-RPA-TEMPLATE-TEST",
		kind: surface === "project" ? "linear-project" : "linear-issue",
		sourceRevision: map.project.mapRef.revision,
		intent: "가상 RPA Description의 고정 템플릿 경로를 검증한다",
		target: { projectId: map.project.id, ...(surface === "task" ? { issueUrl: task.issueUrl } : {}) },
		content: surface === "project" ? { profile: "rpa-project-v1", map } : { profile: "rpa-task-v1", map, taskId: task.id },
		links: {},
		expectedBefore: { description: "기존 가상 본문" },
		validation: [{ id: "FIXTURE", status: "pass", evidence: "가상 입력의 구조 검증; 실제 업무 수락이 아님" }],
		candidateDigest: "",
	});
}

describe("RPA Description Artifact 경로", () => {
	test("공통 Candidate가 Project와 Task를 동일한 고정 엔진으로 렌더한다", () => {
		const project = candidate("project");
		const task = candidate("task");
		expect(validateArtifactCandidate(project)).toEqual([]);
		expect(validateArtifactCandidate(task)).toEqual([]);
		expect(renderArtifactCandidate(project)).toBe(renderRpaProject(project.content.map as RpaDescriptionMap));
		expect(renderArtifactCandidate(task)).toBe(renderRpaTask(task.content.map as RpaDescriptionMap, task.content.taskId as string));
	});

	test("유효한 map이어도 다른 대상과 revision으로 게시할 수 없다", () => {
		const c = candidate("task");
		c.target.projectId = "another-project";
		c.target.issueUrl = "https://linear.app/woo-world/issue/WOO-999999";
		c.sourceRevision = "another-revision";
		const errors = validateArtifactCandidate(sign(c));
		for (const key of ["rpa.target.projectId", "rpa.target.issueUrl", "rpa.sourceRevision"]) expect(errors.some(error => error.startsWith(key))).toBeTrue();
	});

	test("프로필 추가 필드와 누락 Task를 거부해 자유 본문 우회를 막는다", () => {
		const c = candidate("task");
		c.content.markdown = "## 고객 결정 이력\n임의 추가";
		c.content.taskId = "absent-task";
		const errors = validateArtifactCandidate(sign(c));
		expect(errors.some(error => error.startsWith("rpa.content"))).toBeTrue();
		expect(errors.some(error => error.startsWith("rpa.taskId"))).toBeTrue();
		expect(() => renderArtifactCandidate(c)).toThrow();
	});

	test("map 변경은 승인 digest를 무효화하고 대상의 동시 변경은 stale로 판정한다", () => {
		const c = candidate("project");
		const map = c.content.map as RpaDescriptionMap;
		c.content.map = { ...map, project: { ...map.project, purpose: "승인 후 변경된 목적" } };
		expect(validateArtifactCandidate(c).some(error => error.startsWith("candidateDigest"))).toBeTrue();
		expect(validateArtifactCandidate(sign(c), { description: "다른 사용자가 바꾼 본문" }).some(error => error.startsWith("EXPECTED_BEFORE_STALE"))).toBeTrue();
	});

	test("잘못된 map은 게시 렌더에 도달하지 않는다", () => {
		const c = candidate("project");
		c.content.map = null;
		expect(validateArtifactCandidate(sign(c)).length).toBeGreaterThan(0);
		expect(() => renderArtifactCandidate(c)).toThrow();
	});
});
