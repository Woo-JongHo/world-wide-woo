import      {
              expect                      ,
              test                        ,
                                            } from "bun:test"                                                              ;
import      {
              artifactCandidateDigest     ,
              renderArtifactCandidate     ,
                                            } from "../src/core/domain/development/artifact-control"                       ;
import type { ArtifactCandidate             } from "../src/core/domain/development/artifact-control"                       ;
import      { artifactPublicationCapability } from "../src/core/application/orchestration/artifact-publication-capability" ;
import      { GitHubArtifactPublication     } from "../src/adapters/outbound/development/github-artifact-publication"      ;
import type { RequestActionIntent           } from "../src/core/ports/execution/request-action-port"                       ;

function fixture() {
	const candidate: ArtifactCandidate = { schemaVersion: "1.0", candidateId: "ARTIFACT-CANDIDATE-TEST-PUBLISH", kind: "github-issue", sourceRevision: "fixture:1", intent: "테스트 대상의 본문을 갱신한다", target: { repository: "fixture/repo", issue: 7 }, content: { issueType: "bug", title: "진행 상태를 고친다", statement: "상태 표시가 잘못되었다", details: ["테스트 fixture의 상태 확인"] }, links: {}, expectedBefore: { title: "before", body: "before", updatedAt: "revision-1" }, validation: [{ id: "fixture", status: "pass", evidence: "simulated fixture approval, not a remote receipt" }], candidateDigest: "" };
	candidate.candidateDigest = artifactCandidateDigest(candidate);
	let state                                               = { number: 7, html_url: "https://github.com/fixture/repo/issues/7", title: "before", body: "before", updated_at: "revision-1" } ;
	const calls: { method: string; body?: string | null }[] = []                                                                                                                             ;
	let loseResponse                                        = false                                                                                                                          ;
	const request = (async (url: string, options: RequestInit) => {
		expect(url                                              ).toBe("https://api.github.com/repos/fixture/repo/issues/7") ;
		expect(options.redirect                                 ).toBe("error"                                             ) ;
		expect(new Headers(options.headers).get("Authorization")).toBe("Bearer fixture-secret"                             ) ;
		calls.push({ method: options.method!, body: options.body as string });
		if (options.method === "PATCH") {
			const payload = JSON.parse(options.body as string);
			expect(Object.keys(payload).sort()).toEqual(["body", "title"]);
			state = { ...state, ...payload, updated_at: "revision-2" };
			if (loseResponse) throw new Error("response lost after remote write");
		}
		return new Response(JSON.stringify(state), { status: 200 });
	}) as unknown as typeof fetch;
	const port                        = new GitHubArtifactPublication(async () => "fixture-secret", request)                                                                                                ;
	const intent: RequestActionIntent = { requestId: "r", operationId: "publish", stage: "DELIVER", capability: port.capabilityId, expectedRevision: 7, arguments: { candidateId: candidate.candidateId } } ;
	const capability                  = artifactPublicationCapability(port, [candidate], [{ requestId: "r", operationId: "publish", expectedRevision: 7, candidateDigest: candidate.candidateDigest }])     ;
	return { candidate, capability, port, intent, calls, drift: () => { state.title = "changed externally"; }, lose: () => { loseResponse = true; } };
}

test("approved Artifact uses GET/PATCH/GET and returns an identity-bound, secret-free receipt", async () => {
	const f = fixture();
	expect(await f.capability.authorize(f.intent)).toBe(true);
	const result = await f.capability.execute(f.intent, new AbortController().signal);
	expect(result.outcome                    )    .toBe     ("passed"                                                                  ) ;
	expect(result.delivery                   )    .toEqual  ({ target: "github", artifact: "https://github.com/fixture/repo/issues/7" }) ;
	expect(f.calls.map(c => c.method)        )    .toEqual  (["GET", "PATCH", "GET"]                                                   ) ;
	expect(JSON.parse(f.calls[1]!.body!).body)    .toBe     (renderArtifactCandidate(f.candidate)                                      ) ;
	expect(JSON.stringify(result)            ).not.toContain("fixture-secret"                                                          ) ;
});

test("different permit, unsupported target and before-state drift cannot issue a PATCH", async () => {
	const f = fixture(), signal = new AbortController().signal;
	expect(await f.capability.authorize({ ...f.intent, operationId: "other" })).toBe(false);
	await expect(f.capability.execute({ ...f.intent, expectedRevision: 8 }, signal)).rejects.toThrow("PUBLICATION_NOT_AUTHORIZED");
	expect(f.calls).toHaveLength(0);
	f.drift();
	expect((await f.capability.execute(f.intent, signal)).outcome                                        ).toBe   ("failed"              ) ;
	expect(f.calls.map(c => c.method)                                                                    ).toEqual(["GET"]               ) ;
	expect(() => f.port.identity({ ...f.candidate, target: { repository: "../repo", issue: 7 } })        ).toThrow("GITHUB_TARGET_DENIED") ;
	expect(() => f.port.identity({ ...f.candidate, target: { repository: "fixture/repo", issue: null } })).toThrow("GITHUB_TARGET_DENIED") ;
});

test("lost publication response is recovered by GET only; candidate substitution is denied", async () => {
	const f = fixture(), signal = new AbortController().signal;
	const descriptor = f.capability.reconciliation!.prepare(f.intent);
	f.lose();
	await expect(f.capability.execute(f.intent, signal)).rejects.toThrow("response lost");
	const result = await f.capability.reconciliation!.readBack(descriptor, signal);
	expect(result.confirmed).toBe(true);
	expect(f.calls.map(c => c.method)).toEqual(["GET", "PATCH", "GET"]);
	await expect(f.capability.reconciliation!.readBack({ ...descriptor, candidateDigest: "tampered" }, signal)).rejects.toThrow("CANDIDATE_UNAVAILABLE");
	expect(f.calls).toHaveLength(3);
});
