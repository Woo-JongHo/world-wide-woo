import { describe, expect, test } from "bun:test";
import type { ArtifactCandidate } from "../src/core/domain/development/artifact-control";
import {
	artifactCandidateDigest,
	renderArtifactCandidate,
	validateArtifactCandidate,
} from "../src/core/domain/development/artifact-control";

function signed(overrides: Partial<ArtifactCandidate> = {}): ArtifactCandidate {
	const candidate: ArtifactCandidate = {
		schemaVersion   : "1.0",
		candidateId     : "ARTIFACT-CANDIDATE-TEST-1",
		kind            : "github-issue",
		sourceRevision  : "git:1111111111111111111111111111111111111111",
		intent          : "관찰된 문제를 등록한다",
		target          : { repository: "Woo-JongHo/world-wide-woo", issue: null },
		content         : { issueType: "bug", title: "로그인 뒤 화면이 멈춘다", statement: "로그인 완료 뒤 진행 표시가 사라지지 않는다.", details: ["로그인 버튼을 누른다", "완료 뒤 화면을 확인한다"] },
		links           : { linear: null },
		expectedBefore  : null,
		validation      : [{ id: "DUPLICATE", status: "pass", evidence: "열린·닫힌 이슈 검색 결과 중복 없음" }],
		candidateDigest : "",
		...overrides,
	};
	candidate.candidateDigest = artifactCandidateDigest(candidate);
	return candidate;
}

describe("Artifact Candidate control", () => {
	const linearIssue = {
		title       : "렌더 지연을 제거한다",
		purpose     : "긴 응답 중 입력이 멈추는 문제를 해결한다.",
		included    : ["긴 응답 렌더"],
		excluded    : ["터미널 교체"],
		done        : ["성능 기준을 통과한다"],
		connections : ["Parent: WOO-679"],
	};

	test("같은 Candidate를 결정적으로 렌더링한다", () => {
		const candidate = signed();
		expect(validateArtifactCandidate(candidate)).toEqual([]);
		expect(renderArtifactCandidate(candidate)).toBe(renderArtifactCandidate(candidate));
		expect(renderArtifactCandidate(candidate)).toContain("## 문제\n\n로그인 완료 뒤");
	});

	test("기존 Linear Issue Candidate의 4절 렌더를 유지한다", () => {
		const candidate = signed({ kind: "linear-issue", content: linearIssue });
		expect(validateArtifactCandidate(candidate)).toEqual([]);
		expect(renderArtifactCandidate(candidate)).toBe([
			"# 렌더 지연을 제거한다",
			"",
			"## 목적",
			"",
			"긴 응답 중 입력이 멈추는 문제를 해결한다.",
			"",
			"## 범위",
			"",
			"### 포함",
			"",
			"- 긴 응답 렌더",
			"",
			"### 제외",
			"",
			"- 터미널 교체",
			"",
			"## 완료 조건",
			"",
			"- 성능 기준을 통과한다",
			"",
			"## 연결",
			"",
			"- Parent: WOO-679",
			"",
		].join("\n"));
	});

	test("상세 Linear Issue Candidate를 계약의 6절 순서로 렌더링한다", () => {
		const candidate = signed({
			kind:    "linear-issue",
			content: { ...linearIssue, result: "긴 응답 중에도 입력이 이어진다.", behavior: ["긴 draft 변경분만 계산한다", "기존 scroll anchor를 유지한다"] },
		});
		expect(validateArtifactCandidate(candidate)).toEqual([]);
		const rendered = renderArtifactCandidate(candidate);
		expect([...rendered.matchAll(/^## (.+)$/gmu)].map(match => match[1])).toEqual(["목적", "결과", "범위", "동작", "완료 조건", "연결"]);
		expect(rendered).toContain("## 결과\n\n긴 응답 중에도 입력이 이어진다.");
		expect(rendered).toContain("## 동작\n\n- 긴 draft 변경분만 계산한다\n- 기존 scroll anchor를 유지한다");
	});

	test("Linear Issue의 result와 behavior 중 하나만 지정하면 거부한다", () => {
		const candidate = signed({ kind: "linear-issue", content: { ...linearIssue, result: "입력이 이어진다." } });
		expect(validateArtifactCandidate(candidate)).toEqual(["linear-issue.content: result와 behavior는 함께 지정해야 합니다."]);
	});

	test("Linear Issue의 알 수 없는 content key를 pair 오류와 구분해 거부한다", () => {
		const candidate = signed({ kind: "linear-issue", content: { ...linearIssue, unexpected: "허용되지 않는다" } });
		expect(validateArtifactCandidate(candidate)).toEqual(["linear-issue.content: 정해진 필드만 허용합니다."]);
	});

	test("Linear Issue의 기존 필수 content key 누락을 거부한다", () => {
		const { connections: _connections, ...missingConnections } = linearIssue;
		const candidate = signed({ kind: "linear-issue", content: missingConnections });
		expect(validateArtifactCandidate(candidate)).toEqual(["linear-issue.content: title/purpose와 included/excluded/done/connections가 필요합니다."]);
	});

	test("digest 변조와 stale expectedBefore를 차단한다", () => {
		const candidate = signed({ expectedBefore: { title: "이전" } });
		candidate.content.title = "승인 뒤 바뀐 제목";
		expect(validateArtifactCandidate(candidate)).toContain("candidateDigest: 현재 Candidate 내용과 일치하지 않습니다.");
		const fresh = signed({ expectedBefore: { title: "이전" } });
		expect(validateArtifactCandidate(fresh, { title: "현재" })).toContain("EXPECTED_BEFORE_STALE: 대상이 Candidate 작성 뒤 변경됐습니다.");
	});

	test("GitHub Issue 유형 접두어와 미실행 검증을 거부한다", () => {
		const candidate = signed({ content: { issueType: "enhancement", title: "[Feature] 새 기능", statement: "기능이 필요하다.", details: ["현재 수동으로 처리한다"] }, validation: [{ id: "DUPLICATE", status: "not-run", evidence: "아직 검색하지 않음" }] });
		const errors = validateArtifactCandidate(candidate);
		expect(errors.some(error => error.includes("유형 접두어"))).toBeTrue();
		expect(errors.some(error => error.includes("게시할 수 없습니다"))).toBeTrue();
	});

	test("PR은 네 연결과 위험·복구를 빠짐없이 요구한다", () => {
		const candidate = signed({ kind: "github-pr", content: { title: "제어면을 연결한다", summary: "Candidate 경계를 추가한다.", before: "표면별 형식이 다르다.", after: "공통 Candidate로 렌더한다.", checks: ["bun test PASS"], risk: "기존 템플릿 사용자에게 필드가 달라진다.", rollback: "템플릿과 스킬 변경을 되돌린다." }, links: { linear: "WOO-844", code: "Code-014", obsidian: "obsidian://open?vault=www", receipt: ".www/receipts/example.json" } });
		expect(validateArtifactCandidate(candidate)).toEqual([]);
		const body = renderArtifactCandidate(candidate);
		for (const heading of ["변경 요약", "사용자 동작", "검증", "연결", "위험과 복구"]) expect(body).toContain(`## ${heading}`);
	});

	test("Obsidian Candidate의 여러 줄 절과 경로 제목을 Vault 문서로 렌더링한다", () => {
		const sections = Object.fromEntries([
			"1. Intent", "2. Scope", "3. Desired Behavior", "4. Domain Contract", "5. State Model",
			"6. Data & Runtime Flow", "7. Identity & Persistence Contract", "8. Integration Contract",
			"9. Failure & Recovery Contract", "10. Acceptance Contract", "11. Verification Strategy",
			"12. Implementation Map", "13. Current State & Gaps", "14. Decisions & Evidence", "Change Log",
		].map(heading => [heading, `첫 문단\n\n두 번째 문단: ${heading}`]));
		const candidate = signed({
			kind    : "obsidian-canonical",
			target  : { relativePath: "Login/Gemini — 구독 계정으로 로그인한다.md" },
			content : { properties: { capability: "Gemini subscription authentication" }, sections },
		});
		expect(validateArtifactCandidate(candidate)).toEqual([]);
		const rendered = renderArtifactCandidate(candidate);
		expect(rendered).toContain("# Gemini — 구독 계정으로 로그인한다\n");
		expect(rendered).toContain("## 1. Intent\n\n첫 문단\n\n두 번째 문단");
	});

	test("신뢰하지 않은 JSON의 null content와 links를 오류로 반환하고 죽지 않는다", () => {
		const candidate = signed() as unknown as Record<string, unknown>;
		candidate.content = null;
		candidate.links = null;
		expect(() => validateArtifactCandidate(candidate as unknown as ArtifactCandidate)).not.toThrow();
		expect(validateArtifactCandidate(candidate as unknown as ArtifactCandidate)).toContain("content: object가 필요합니다.");
	});
});
