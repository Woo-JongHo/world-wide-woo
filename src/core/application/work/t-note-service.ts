import { createHash, randomUUID }                                          from "node:crypto";
import { createTNotePacket, sanitizeTNoteText, tNoteSourceIdempotencyKey } from "@/core/domain/work/t-notes.js";
import type {
	TNoteActivitySource,
	TNoteDraft,
	TNoteDraftInput,
	TNoteSourceActivity,
	TNoteSourceRange,
} from "@/core/domain/work/t-notes.js";
import { assertDetachedPolicy }                                            from "@/core/application/orchestration/detached-text-generator.js";
import type {
	DetachedGenerationPolicy,
	DetachedTextGenerator,
} from "@/core/application/orchestration/detached-text-generator.js";

/**
 * provenance 보유 Summary 산출물의 append-only 내구 경계다.
 *
 * source idempotency key가 append identity다. 같은 immutable source capture의 append는 최초 record를 반환하며
 * `id`와 `sequence`은 그 영구 identity/순서다. 영속 구현은 store instance와 process를
 * 넘겨 read-dedupe-append를 원자화한다. 호출이 throw하면 Core는 read-back으로 그 source key를
 * 대조한 뒤에만 기존 record로 복구한다.
 */
export interface TNoteDraftStore {
	append(input: TNoteDraftInput): Promise<TNoteDraft>;
	/** projectId에 속한 append 순서를 보존해 돌려준다. */
	readAll(projectId: string): Promise<readonly TNoteDraft[]>;
}

export interface CreateTNoteInput {
	readonly projectId   : string                         ;
	readonly range       : TNoteSourceRange               ;
	readonly activities  : readonly TNoteActivitySource[] ;
	readonly instruction : string                         ;
	/** Generated 질문 must exactly match this normalized completed question. */
	readonly expectedQuestion: string;
}

export type TNoteOperationFailure = "generation" | "storage" | "read";

/** Stable failure classification for callers that must render generation, persistence, and read errors separately. */
export class TNoteOperationError extends Error {
	public constructor(
		public readonly operation: TNoteOperationFailure,
		message: string,
		public readonly original: unknown,
	) {
		super(message);
		this.name = "TNoteOperationError";
	}
}

/**
 * Activity/turn provenance를 가진 Summary 산출물을 생성·검증하고 append-only Note record로
 * 보존한다. Summary와 Note를 휘발/영속으로 나누지 않는다: packet digest가 원본 근거이고,
 * Note의 id·sequence가 저장 순서다.
 */
export class TNoteService {
	public constructor(
		private readonly generator: DetachedTextGenerator,
		private readonly store: TNoteDraftStore,
		private readonly clock: () => Date = () => new Date(),
		private readonly idFactory: () => string = randomUUID,
	) {}

	/**
	 * 생성·검증·append가 모두 성공해야 새 record를 반환한다. generator 또는 store 실패는
 * 이전 Note를 바꾸지 않는다. append 응답만 유실된 경우에는 source key read-back으로
	 * 저장된 record를 돌려준다. read-back에도 없을 때만 호출자가 실패를 보고 재시도한다.
	 */
	public async create(input: CreateTNoteInput, signal?: AbortSignal): Promise<TNoteDraft> {
		if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid Note request");
		const instruction = sanitizeTNoteText(input.instruction, 4 * 1024);
		if (instruction.length === 0) throw new Error("Invalid Note instruction");
		const packet                            = createTNotePacket(input.projectId, input.range, input.activities, this.clock().toISOString(), digest) ;
		const policy : DetachedGenerationPolicy = Object.freeze({ cwd: "", noTools: true, network: false, readOnly: true, ephemeral: true })            ;
		let result   : Awaited<ReturnType<DetachedTextGenerator["generate"]>>                                                                           ;
		try {
			result = await this.generator.generate(Object.freeze({ packet, instruction, policy }), signal);
			assertDetachedPolicy(policy, result?.isolation);
			const text = result.text;
			if (typeof text !== "string" || text.length === 0 || new TextEncoder().encode(text).byteLength > 64 * 1024) {
				throw new Error("Detached generator returned unsafe Note text");
			}
			const validation = validateCanonicalTNote(text, input.expectedQuestion);
			if (!validation.valid) throw new Error(validation.reason);
		} catch (error) {
			if (signal?.aborted) throw error;
			throw operationError("generation", error);
		}
		const text = result.text;
		const persistedText = appendObservedTestSummary(text, packet.activities);
		return this.appendOrRecover(Object.freeze({
			id: this.idFactory(),
			createdAt: this.clock().toISOString(),
			packet,
			text: persistedText,
			provenance: result.provenance,
		}));
	}

	public async readAll(projectId: string): Promise<readonly TNoteDraft[]> {
		try {
			return await this.store.readAll(projectId);
		} catch (error) {
			throw operationError("read", error);
		}
	}

	private async appendOrRecover(input: TNoteDraftInput): Promise<TNoteDraft> {
		try {
			return await this.store.append(input);
		} catch (appendError) {
			try {
				const sourceKey = tNoteSourceIdempotencyKey(input.packet);
				const existing = (await this.store.readAll(input.packet.projectId))
					.find(draft => tNoteSourceIdempotencyKey(draft.packet) === sourceKey);
				if (existing) return existing;
			} catch {
				// The original append failure is the actionable error when read-back is unavailable.
			}
			throw operationError("storage", appendError);
		}
	}
}

function operationError(operation: TNoteOperationFailure, original: unknown): TNoteOperationError {
	const detail = original instanceof Error ? original.message : String(original);
	return new TNoteOperationError(operation, `Note ${operation} failed: ${detail}`, original);
}

function digest(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }

export interface CanonicalTNoteValidation {
	readonly valid: boolean;
	readonly reason: string;
}

export interface CanonicalTNoteReport {
	readonly question   : string                                    ;
	readonly plan       : string                                    ;
	readonly process    : string                                    ;
	readonly conclusion : string                                    ;
	readonly version    : "request-report-v2" | "legacy-five-field" ;
	/** Runtime-observed test summary appended after detached generation succeeds. */
	readonly test?: string;
}

export interface LegacyCanonicalTNote {
	readonly question : string ;
	readonly why      : string ;
	readonly result   : string ;
}

export function parseCanonicalTNoteReport(text: string): CanonicalTNoteReport | null {
	const [reportText, ...testParts] = text.trim().split(/\r?\nTest:\r?\n/u);
	if (testParts.length > 1) return null;
	const test = testParts[0]?.trim();
	if (testParts.length === 1 && !test) return null;
	const current = /^질문:[ \t]*(\S(?:[^\r\n]*\S)?)\r?\nPlan:[ \t]*(\S(?:[^\r\n]*\S)?)\r?\n과정:[ \t]*(\S(?:[^\r\n]*\S)?)\r?\n결론:[ \t]*(\S(?:[^\r\n]*\S)?)$/u.exec(reportText ?? "");
	if (current) return Object.freeze({ question: current[1], plan: current[2], process: current[3], conclusion: current[4], version: "request-report-v2", ...(test ? { test } : {}) });
	const previous = /^질문:[ \t]*(\S(?:[^\r\n]*\S)?)\r?\nReason:[ \t]*(\S(?:[^\r\n]*\S)?)\r?\nProposal:[ \t]*(\S(?:[^\r\n]*\S)?)\r?\nAction:[ \t]*(\S(?:[^\r\n]*\S)?)\r?\nResult:[ \t]*(\S(?:[^\r\n]*\S)?)$/u.exec(reportText ?? "");
	if (!previous) return null;
	return Object.freeze({ question: previous[1], plan: `${previous[2]} ${previous[3]}`, process: previous[4], conclusion: previous[5], version: "legacy-five-field", ...(test ? { test } : {}) });
}

export function parseLegacyCanonicalTNote(text: string): LegacyCanonicalTNote | null {
	const match = /^질문:[ \t]*(\S(?:[^\r\n]*\S)?)\r?\n왜:[ \t]*(\S(?:[^\r\n]*\S)?)\r?\n결과:[ \t]*(\S(?:[^\r\n]*\S)?)$/u.exec(text.trim());
	if (!match) return null;
	return Object.freeze({ question: match[1], why: match[2], result: match[3] });
}

/** New generation is five-field; allowLegacy is only for replaying older injected sources. */
export function validateCanonicalTNote(
	text: string,
	expectedQuestion: string,
	options: { readonly allowLegacy?: boolean; readonly allowRuntimeTestSummary?: boolean } = {},
): CanonicalTNoteValidation {
	const report = parseCanonicalTNoteReport(text);
	const legacy = options.allowLegacy ? parseLegacyCanonicalTNote(text) : null;
	if (!report && !legacy) return { valid: false, reason: "Detached generator returned malformed Note text" };
	if (report?.version === "legacy-five-field" && !options.allowLegacy) return { valid: false, reason: "Detached generator returned legacy Note text" };
	if (report?.test && !options.allowRuntimeTestSummary) return { valid: false, reason: "Detached generator must not generate the runtime Test summary" };
	const question = report?.question ?? legacy?.question;
	if (question !== expectedQuestion) return { valid: false, reason: "Detached generator returned mismatched Note question" };
	const fields = report
		? [report.plan, report.process, report.conclusion]
		: legacy ? [legacy.why, legacy.result] : [];
	if (fields.some(hasRawEvidence)) {
		return { valid: false, reason: "Detached generator returned prohibited raw evidence" };
	}
	if (fields.some(field => /(?:숨은 사고|chain[ -]?of[ -]?thought)/iu.test(field))) {
		return { valid: false, reason: "Detached generator returned hidden reasoning" };
	}
	const completedAction = report ? `${report.process}\n${report.conclusion}` : legacy?.result ?? "";
	if (/(?:다음 할 일|(?:내일|추후|후속|다음에|이후|곧|계속).{0,24}(?:하겠습니다|합니다|할 예정|할 계획|진행하겠습니다|진행합니다|처리하겠습니다|처리합니다|검토하겠습니다|검토합니다|수정하겠습니다|수정합니다|배포하겠습니다|배포합니다)|(?:하겠습니다|합니다|할 예정|할 계획|진행하겠습니다|진행합니다|처리하겠습니다|처리합니다|검토하겠습니다|검토합니다|수정하겠습니다|수정합니다|배포하겠습니다|배포합니다).{0,24}(?:내일|추후|후속|다음에|이후|곧|계속))/u.test(completedAction)) {
		return { valid: false, reason: "Detached generator returned future action" };
	}
	return { valid: true, reason: "" };
}

type TestStatus = "passed" | "failed" | "unknown";

interface TestObservation {
	readonly command    : string        ;
	readonly durationMs : number | null ;
	readonly status     : TestStatus    ;
}

/** Test evidence is derived from the completed external-runtime activity packet, never generated prose. */
function appendObservedTestSummary(text: string, activities: readonly TNoteSourceActivity[]): string {
	const tests = activities.flatMap(activity => {
		const observation = testObservation(activity);
		return observation ? [observation] : [];
	});
	const passed = tests.filter(test => test.status === "passed").length;
	const lines = tests.length
		? tests.map((test, index) => `${String(index + 1).padStart(2, "0")}. ${test.command} : ${formatDuration(test.durationMs)} · ${test.status}`)
		: ["테스트 실행 관측 없음"];
	return `${text}\nTest:\nTotal ${passed}/${tests.length}\n${lines.join("\n")}`;
}

function testObservation(activity: TNoteSourceActivity): TestObservation | null {
	if (!activity.kind.endsWith(".completed")) return null;
	let payload: unknown;
	try { payload = JSON.parse(activity.body); } catch { return null; }
	const item = commandResult(payload);
	if (!item) return null;
	const command = oneLine(item.command ?? item.cmd);
	if (!command || !isTestCommand(command)) return null;
	const exitCode = numberValue(item.exitCode);
	const status = testStatus(item.status, exitCode);
	return Object.freeze({
		command: sanitizeTNoteText(command, 400),
		durationMs: numberValue(item.durationMs),
		status,
	});
}

function commandResult(payload: unknown): Readonly<Record<string, unknown>> | null {
	const root = record(payload);
	const params = record(root?.params);
	for (const candidate of [record(params?.item), params, record(root?.item), root]) {
		if (candidate && typeof (candidate.command ?? candidate.cmd) === "string") return candidate;
	}
	return null;
}

function isTestCommand(command: string): boolean {
	return /(?:^|\s)(?:(?:bun|npm|pnpm|yarn|npx)\s+(?:run\s+)?(?:test|tests|vitest|jest)|(?:go|cargo)\s+test|pytest|vitest|jest|gradlew(?:\.bat)?\s+\S*test|mvn\s+\S*test|phpunit|rspec)\b/iu.test(command);
}

function testStatus(value: unknown, exitCode: number | null): TestStatus {
	if (exitCode === 0) return "passed";
	if (exitCode !== null) return "failed";
	const status = typeof value === "string" ? value.toLowerCase() : "";
	if (/(?:passed|success|succeeded|completed)/u.test(status)) return "passed";
	if (/(?:failed|error|cancelled|canceled)/u.test(status)) return "failed";
	return "unknown";
}

function formatDuration(value: number | null): string {
	if (value === null) return "시간 미관측";
	const seconds = Math.round(value / 100) / 10;
	return `${seconds.toFixed(seconds % 1 === 0 ? 0 : 1)}s`;
}

function oneLine(value: unknown): string {
	return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}

function numberValue(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : null;
}

function hasRawEvidence(field: string): boolean {
	return /(?:```|(?:^|\s)(?:(?:[\w.-]+\/)*[\w.-]+\.[\w-]+)\s*(?:와|및|,)\s*(?:(?:[\w.-]+\/)*[\w.-]+\.[\w-]+)|(?:^|\s)(?:FAIL|expected|received|stdout|stderr|AssertionError|assertion|stack(?: trace)?|traceback|test result)\b)/iu.test(field);
}
