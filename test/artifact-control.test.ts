import      { describe, expect, test      } from "bun:test"                                        ;
import type { ArtifactCandidate           } from "../src/core/domain/development/artifact-control" ;
import      {
              artifactCandidateDigest   ,
              renderArtifactCandidate   ,
              validateArtifactCandidate ,
                                          } from "../src/core/domain/development/artifact-control" ;

function signed(overrides: Partial<ArtifactCandidate> = {}): ArtifactCandidate {
	const candidate: ArtifactCandidate = {
		schemaVersion   : "1.0",
		candidateId     : "ARTIFACT-CANDIDATE-TEST-1",
		kind            : "github-issue",
		sourceRevision  : "git:1111111111111111111111111111111111111111",
		intent          : "관찰된 문제를 등록한다",
		target          : { repository: "Woo-JongHo/world-wide-woo", issue: null },
		content         : { issueType: "bug", title: "로그인 뒤 화면이 멈춘다", statement: "로그인 완료 뒤 진행 표시가 사라지지 않는다.", details: ["로그인 버튼을 누른다", "완료 뒤 화면을 확인한다"] },
		links           : {},
		expectedBefore  : null,
		validation      : [{ id: "DUPLICATE", status: "pass", evidence: "열린·닫힌 이슈 검색 결과 중복 없음" }],
		candidateDigest : "",
		...overrides,
	};
	candidate.candidateDigest = artifactCandidateDigest(candidate);
	return candidate;
}

describe("Artifact Candidate control", () => {
	test("같은 Candidate를 결정적으로 렌더링한다", () => {
		const candidate = signed();
		expect(validateArtifactCandidate(candidate)).toEqual  ([]                                ) ;
		expect(renderArtifactCandidate(candidate)  ).toBe     (renderArtifactCandidate(candidate)) ;
		expect(renderArtifactCandidate(candidate)  ).toContain("## 문제\n\n로그인 완료 뒤"       ) ;
	});

	test("폐기된 외부 artifact 종류를 거부한다", () => {
		for (const kind of ["linear-issue", "linear-project", "linear-project-comment", "linear-project-update", "obsidian-canonical"]) {
			const candidate = signed({ kind: kind as ArtifactCandidate["kind"] });
			expect(validateArtifactCandidate(candidate)).toContain("kind: 지원하지 않는 artifact입니다.");
			expect(() => renderArtifactCandidate(candidate)).toThrow("지원하지 않는 artifact");
		}
	});

	test("digest 변조와 stale expectedBefore를 차단한다", () => {
		const candidate = signed({ expectedBefore: { title: "이전" } });
		candidate.content.title = "승인 뒤 바뀐 제목";
		expect(validateArtifactCandidate(candidate)).toContain("candidateDigest: 현재 Candidate 내용과 일치하지 않습니다.");
		const fresh = signed({ expectedBefore: { title: "이전" } });
		expect(validateArtifactCandidate(fresh, { title: "현재" })).toContain("EXPECTED_BEFORE_STALE: 대상이 Candidate 작성 뒤 변경됐습니다.");
	});

	test("GitHub Issue 유형 접두어와 미실행 검증을 거부한다", () => {
		const candidate = signed({ content: { issueType: "enhancement", title: "[Feature] 새 기능", statement: "기능이 필요하다.", details: ["현재 수동으로 처리한다"] }, validation: [{ id: "DUPLICATE", status: "not-run", evidence: "아직 검색하지 않음" }] }) ;
		const errors    = validateArtifactCandidate(candidate)                                                                                                                                                                                                    ;
		expect(errors.some(error => error.includes("유형 접두어"))).toBeTrue();
		expect(errors.some(error => error.includes("게시할 수 없습니다"))).toBeTrue();
	});

	test("PR은 로컬 증거 연결과 위험·복구를 요구한다", () => {
		const candidate = signed({ kind: "github-pr", content: { title: "제어면을 연결한다", summary: "Candidate 경계를 추가한다.", before: "표면별 형식이 다르다.", after: "공통 Candidate로 렌더한다.", checks: ["bun test PASS"], risk: "기존 템플릿 사용자에게 필드가 달라진다.", rollback: "템플릿과 스킬 변경을 되돌린다." }, links: { receipt: ".www/receipts/example.json" } });
		expect(validateArtifactCandidate(candidate)).toEqual([]);
		for (const key of ["linear", "obsidian", "code"]) {
			const legacy = signed({ ...candidate, links: { ...candidate.links, [key]: "legacy" } });
			expect(validateArtifactCandidate(legacy)).toContain(`github-pr.links.${key}: 폐기된 관리 연결입니다.`);
		}
		const body = renderArtifactCandidate(candidate);
		for (const heading of ["변경 요약", "사용자 동작", "검증", "연결", "위험과 복구"]) expect(body).toContain(`## ${heading}`);
	});

	test("신뢰하지 않은 JSON의 null content와 links를 오류로 반환하고 죽지 않는다", () => {
		const candidate = signed() as unknown as Record<string, unknown>;
		candidate.content = null;
		candidate.links = null;
		expect(() => validateArtifactCandidate(candidate as unknown as ArtifactCandidate)).not.toThrow();
		expect(validateArtifactCandidate(candidate as unknown as ArtifactCandidate)).toContain("content: object가 필요합니다.");
	});
});
