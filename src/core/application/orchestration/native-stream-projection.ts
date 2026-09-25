import type { NativeRefs }                   from "@/core/domain/execution/native-session.js";
import type { WorkbenchLiveActivity }        from "@/core/domain/work/workbench.js";
import { sanitizePartialAssistantResponse }  from "@/core/domain/review/redaction.js";
import type { NativeEventDeltaProjection }   from "@/core/application/orchestration/native-event-projection.js";
import { nativeItemIdentity, sameTurnOwner } from "@/core/application/orchestration/workbench-projections.js";

const LIVE_ACTIVITY_TAIL_CHARACTER_LIMIT   = 32 * 1024 - 128 ;
const ASSISTANT_DRAFT_TAIL_CHARACTER_LIMIT = 28 * 1024 - 128 ;
const REASONING_DRAFT_TAIL_CHARACTER_LIMIT = 16 * 1024 - 128 ;

interface BoundedTextProjection {
	readonly tail: string;
	readonly omittedCharacters: number;
}

interface StreamingTextProjection {
	readonly identity : string                ;
	readonly state    : BoundedTextProjection ;
	readonly text     : string                ;
}

export interface NativeTerminalProjectionScope {
	readonly itemScoped        : boolean       ;
	readonly completedIdentity : string | null ;
	readonly terminalTurn      : boolean       ;
	readonly refs              : NativeRefs    ;
}

export interface NativeStreamSnapshot {
	readonly draft                 : string                       ;
	readonly draftNativeRefs       : NativeRefs | null            ;
	readonly reasoningDraft        : string                       ;
	readonly reasoningSummaryDraft : string                       ;
	readonly liveActivity          : WorkbenchLiveActivity | null ;
}

/** Owns volatile Native delta accumulation and terminal projection cleanup. */
export class NativeStreamProjection {
	private draft                 = "" ;
	private reasoningDraft        = "" ;
	private reasoningSummaryDraft = "" ;

	private draftIdentity            : string | null = null ;
	private reasoningIdentity        : string | null = null ;
	private reasoningSummaryIdentity : string | null = null ;

	private draftNativeRefs            : NativeRefs | null = null ;
	private reasoningNativeRefs        : NativeRefs | null = null ;
	private reasoningSummaryNativeRefs : NativeRefs | null = null ;

	private draftProjection            = emptyBoundedTextProjection() ;
	private reasoningProjection        = emptyBoundedTextProjection() ;
	private reasoningSummaryProjection = emptyBoundedTextProjection() ;

	private draftEnvelopeClipped = false;

	private liveActivity: WorkbenchLiveActivity | null = null;
	private liveActivityProjection = emptyBoundedTextProjection();

	public get snapshot(): NativeStreamSnapshot {
		return {
			draft                 : this.draft,
			draftNativeRefs       : this.draftNativeRefs,
			reasoningDraft        : this.reasoningDraft,
			reasoningSummaryDraft : this.reasoningSummaryDraft,
			liveActivity          : this.liveActivity,
		};
	}

	public apply(event: NativeEventDeltaProjection): boolean {
		const itemIdentity = nativeItemIdentity(event.refs);
		if (!itemIdentity) return false;
		if (event.channel === "reasoning-summary") {
			const projection = projectStreamingText(
				this.reasoningSummaryIdentity,
				itemIdentity,
				this.reasoningSummaryProjection,
				event.text,
				REASONING_DRAFT_TAIL_CHARACTER_LIMIT,
			);
			this.reasoningSummaryIdentity   = projection.identity ;
			this.reasoningSummaryNativeRefs = event.refs          ;
			this.reasoningSummaryProjection = projection.state    ;
			this.reasoningSummaryDraft      = projection.text     ;
			return true;
		}
		if (event.channel === "reasoning") {
			const projection = projectStreamingText(
				this.reasoningIdentity,
				itemIdentity,
				this.reasoningProjection,
				event.text,
				REASONING_DRAFT_TAIL_CHARACTER_LIMIT,
			);
			this.reasoningIdentity   = projection.identity ;
			this.reasoningNativeRefs = event.refs          ;
			this.reasoningProjection = projection.state    ;
			this.reasoningDraft      = projection.text     ;
			return true;
		}
		if (event.channel === "assistant") {
			this.applyAssistantDelta(itemIdentity, event);
			return true;
		}
		this.applyActivityDelta(event);
		return true;
	}

	public clearTerminal(scope: NativeTerminalProjectionScope): void {
		if (shouldClearTerminalProjection(this.draftIdentity, this.draftNativeRefs, scope)) {
			this.draft                = ""                           ;
			this.draftIdentity        = null                         ;
			this.draftNativeRefs      = null                         ;
			this.draftProjection      = emptyBoundedTextProjection() ;
			this.draftEnvelopeClipped = false                        ;
		}
		if (shouldClearTerminalProjection(this.reasoningIdentity, this.reasoningNativeRefs, scope)) {
			this.reasoningDraft      = ""                           ;
			this.reasoningIdentity   = null                         ;
			this.reasoningNativeRefs = null                         ;
			this.reasoningProjection = emptyBoundedTextProjection() ;
		}
		if (shouldClearTerminalProjection(this.reasoningSummaryIdentity, this.reasoningSummaryNativeRefs, scope)) {
			this.reasoningSummaryDraft      = ""                           ;
			this.reasoningSummaryIdentity   = null                         ;
			this.reasoningSummaryNativeRefs = null                         ;
			this.reasoningSummaryProjection = emptyBoundedTextProjection() ;
		}
		const liveActivityIdentity = this.liveActivity ? nativeItemIdentity(this.liveActivity.nativeRefs) : null;
		if (shouldClearTerminalProjection(liveActivityIdentity, this.liveActivity?.nativeRefs ?? null, scope)) {
			this.liveActivity = null;
			this.liveActivityProjection = emptyBoundedTextProjection();
		}
	}

	private applyAssistantDelta(itemIdentity: string, event: NativeEventDeltaProjection): void {
		if (this.draftIdentity && itemIdentity !== this.draftIdentity) {
			this.draftProjection = emptyBoundedTextProjection();
			this.draftEnvelopeClipped = false;
		}
		this.draftIdentity = itemIdentity;
		this.draftNativeRefs = event.refs;
		const candidate = this.draftProjection.tail + event.text;
		const projection = appendBoundedText(this.draftProjection, event.text, ASSISTANT_DRAFT_TAIL_CHARACTER_LIMIT);
		// Sanitize before clipping: losing a private envelope opener must never turn
		// its tail into public prose. Keep the last known public fragment until final.
		if (!this.draftEnvelopeClipped) {
			const publicText = sanitizePartialAssistantResponse(candidate);
			const isEnvelope = /^\s*<(?:analysis|results|files|answer|next_steps)\s*>/iu.test(candidate);
			this.draft = isEnvelope
				? appendBoundedText(emptyBoundedTextProjection(), publicText, ASSISTANT_DRAFT_TAIL_CHARACTER_LIMIT).text
				: projection.text;
			if (isEnvelope && projection.state.omittedCharacters > 0) {
				this.draftEnvelopeClipped = true;
				this.draft += "\n… 응답 앞부분이 생략되어 이후 공개 본문 표시를 보류합니다 …";
			}
		}
		this.draftProjection = projection.state;
	}

	private applyActivityDelta(event: NativeEventDeltaProjection): void {
		const continuesSameActivity = this.liveActivity?.method === event.method
			&& this.liveActivity.nativeRefs.threadId === event.refs.threadId
			&& this.liveActivity.nativeRefs.itemId === event.refs.itemId
			&& this.liveActivity.nativeRefs.turnId === event.refs.turnId;
		if (!continuesSameActivity) this.liveActivityProjection = emptyBoundedTextProjection();
		const projection = appendBoundedText(this.liveActivityProjection, event.text, LIVE_ACTIVITY_TAIL_CHARACTER_LIMIT);
		this.liveActivityProjection = projection.state;
		this.liveActivity = {
			method     : event.method,
			kind       : event.activityKind === "message" ? "progress" : event.activityKind,
			text       : projection.text,
			nativeRefs : event.refs,
		};
	}
}

function emptyBoundedTextProjection(): BoundedTextProjection {
	return { tail: "", omittedCharacters: 0 };
}

function projectStreamingText(
	currentIdentity: string | null,
	nextIdentity: string,
	current: BoundedTextProjection,
	delta: string,
	characterLimit: number,
): StreamingTextProjection {
	const state = currentIdentity && currentIdentity !== nextIdentity
		? emptyBoundedTextProjection()
		: current;
	const projection = appendBoundedText(state, delta, characterLimit);
	return { identity: nextIdentity, ...projection };
}

function shouldClearTerminalProjection(
	identity: string | null,
	refs: NativeRefs | null,
	scope: NativeTerminalProjectionScope,
): boolean {
	if (scope.itemScoped) return Boolean(scope.completedIdentity && scope.completedIdentity === identity);
	if (scope.terminalTurn) return sameTurnOwner(refs, scope.refs);
	return true;
}

function appendBoundedText(
	current: BoundedTextProjection,
	delta: string,
	tailCharacterLimit: number,
): { state: BoundedTextProjection; text: string } {
	let tail = `${current.tail}${delta}`;
	let omittedCharacters = current.omittedCharacters;
	if (tail.length > tailCharacterLimit) {
		omittedCharacters += tail.length - tailCharacterLimit;
		tail = tail.slice(-tailCharacterLimit);
	}
	return {
		state: { tail, omittedCharacters },
		text: omittedCharacters > 0 ? `… 이전 출력 ${omittedCharacters}자 생략\n${tail}` : tail,
	};
}
