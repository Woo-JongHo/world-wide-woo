export const SESSION_EVENT_CATEGORIES = [
	"answer",
	"action",
	"command",
	"change",
	"decision",
	"todo",
	"evidence",
	"warning",
	"blocker",
	"system",
] as const;

export const SESSION_EVENT_STATUSES   = ["pending", "running", "passed", "failed", "blocked"] as const;
export const SESSION_EVENT_TYPES      = [
	"session.started",
	"session.resumed",
	"session.ended",
	"model.changed",
	"turn.started",
	"turn.completed",
	"message.user",
	"message.assistant.started",
	"message.assistant.completed",
	"message.assistant.cancelled",
	"message.assistant.failed",
	"narration.recorded",
	"command.started",
	"command.output",
	"command.completed",
	"todo.updated",
	"evidence.recorded",
	"warning.recorded",
] as const;

export type SessionEventCategory = ( typeof SESSION_EVENT_CATEGORIES )[number];
export type SessionEventStatus   = ( typeof SESSION_EVENT_STATUSES   )[number];
export type SessionEventType     = ( typeof SESSION_EVENT_TYPES      )[number];

/** 저장 전에 작성하는 이벤트 입력이다. 생략 가능한 값은 저장 경계에서 정규화된다. */
export interface SessionEventInput {
	category       : SessionEventCategory     ;
	type           : SessionEventType         ;
	status         : SessionEventStatus       ;
	title          : string                   ;
	body           : string                   ;
	/** 같은 원인이나 작업을 잇는 ID다. 생략하면 저장 시 null이 된다. */
	correlationId ?: string                   ;
	/** 관련 turn ID다. 생략하면 저장 시 null이 된다. */
	turnId        ?: string                   ;
	/** 관련 message 또는 tool item ID다. 생략하면 저장 시 null이 된다. */
	itemId        ?: string                   ;
	/** 이벤트별 확장 데이터다. 생략하면 저장 시 빈 객체가 된다. */
	metadata      ?: Record< string, unknown >;
}

/** 저장과 재생에 사용하는 정규화된 이벤트 기록이다. */
export interface SessionEvent {
	schemaVersion : 1                        ;
	id            : string                   ;
	sessionId     : string                   ;
	sequence      : number                   ;
	timestamp     : string                   ;
	category      : SessionEventCategory     ;
	type          : SessionEventType         ;
	status        : SessionEventStatus       ;
	title         : string                   ;
	body          : string                   ;
	correlationId : string | null            ;
	turnId        : string | null            ;
	itemId        : string | null            ;
	metadata      : Record< string, unknown >;
}
