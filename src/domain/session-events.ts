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

export const SESSION_EVENT_STATUSES = ["pending", "running", "passed", "failed", "blocked"] as const;

export type SessionEventCategory = (typeof SESSION_EVENT_CATEGORIES)[number];
export type SessionEventStatus = (typeof SESSION_EVENT_STATUSES)[number];

export const SESSION_EVENT_TYPES = [
	"session.started",
	"session.resumed",
	"session.ended",
	"model.changed",
	"turn.started",
	"turn.completed",
	"message.user",
	"message.assistant.started",
	"message.assistant.completed",
	"message.assistant.failed",
	"command.started",
	"command.output",
	"command.completed",
	"evidence.recorded",
	"warning.recorded",
] as const;

export type SessionEventType = (typeof SESSION_EVENT_TYPES)[number];

export interface SessionEvent {
	schemaVersion: 1;
	id: string;
	sessionId: string;
	sequence: number;
	timestamp: string;
	category: SessionEventCategory;
	type: SessionEventType;
	status: SessionEventStatus;
	title: string;
	body: string;
	correlationId: string | null;
	turnId: string | null;
	itemId: string | null;
	metadata: Record<string, unknown>;
}

export interface SessionEventInput {
	category: SessionEventCategory;
	type: SessionEventType;
	status: SessionEventStatus;
	title: string;
	body: string;
	correlationId?: string | null;
	turnId?: string | null;
	itemId?: string | null;
	metadata?: Record<string, unknown>;
}
