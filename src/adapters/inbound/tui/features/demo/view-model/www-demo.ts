import type { ProjectActivity }      from "@/core/domain/execution/project-activity";
import { REQUEST_STAGES }            from "@/core/domain/execution/request-runtime";
import type { RequestRuntimeRecord } from "@/core/domain/execution/request-runtime";
import { projectWorkFlow }           from "@/core/domain/work";
import type { WorkbenchSnapshot }    from "@/core/domain/work/workbench";
import type { UsageSnapshot }        from "@/core/ports/observability/usage-monitor-port";

export const WWW_DEMO_PAGES = ["execution", "dashboard", "usage", "context", "cache", "workflow", "plan"] as const;
export type WwwDemoPage = typeof WWW_DEMO_PAGES[number];

export interface WwwDemoState {
	readonly snapshot: WorkbenchSnapshot;
	readonly usage: readonly UsageSnapshot[];
}

function demoActivities(): ProjectActivity[] {
	const threadId = "demo-thread", turnId = "demo-turn";
	const activity = (id: string, sequence: number, kind: ProjectActivity["kind"], phase: ProjectActivity["phase"], payload: ProjectActivity["payload"]): ProjectActivity => ({
		schemaVersion: 1, id, projectId: "www-demo", sequence, recordedAt: `2026-09-22T09:00:0${sequence}.000Z`, kind, phase,
		provider: "openai-codex", nativeRefs: { threadId, turnId, itemId: id }, sourceDigest: `sha256:${"d".repeat(64)}`, payload,
	});
	return [
		activity("demo-request", 1, "message", "completed", { role: "user", text: "Figma 기준으로 Workbench Monitoring MVP를 보여줘." }),
		activity("demo-plan", 2, "progress", "updated", { method: "turn/plan/updated", params: { plan: [
			{ step : "관측 가능한 값과 미관측 값을 분리한다" , status : "completed"  },
			{ step : "다섯 Monitoring 화면을 구현한다"       , status : "inProgress" },
			{ step : "실제 viewport를 비교 검증한다"         , status : "pending"    },
		] } }),
		activity("demo-tool", 3, "tool", "completed", { method: "item/completed", params: { item: { type: "commandExecution", command: "bun test test/www-ui.test.ts", aggregatedOutput: "96 pass · 0 fail", exitCode: 0 } } }),
		activity("demo-response", 4, "message", "completed", { role: "assistant", text: "MVP 화면을 실제 데이터 계약에 맞춰 구성했습니다. R/E로 화면을 이동할 수 있습니다." }),
		activity("demo-file", 5, "file-change", "completed", { method: "item/completed", params: { item: { type: "fileChange", path: "src/adapters/inbound/tui/features/demo/view-model/www-demo.ts", changes: 3 } } }),
		activity("demo-warning", 6, "tool", "failed", { method: "item/completed", params: { item: { type: "commandExecution", command: "visual viewport audit", aggregatedOutput: "1 visual mismatch retained for review", exitCode: 1 } } }),
	];
}

function demoRequest(): RequestRuntimeRecord {
	const statuses = ["completed", "completed", "completed", "completed", "running", "pending", "pending"] as const;
	return {
		schemaVersion: 1, protocolVersion: 2, requestId: "demo-request", threadId: "demo-thread", turnId: "demo-turn",
		objective: "Figma 기준 Monitoring MVP를 구현하고 검증한다", status: "running", attempt: 1, previousAttempts: [], deliveries: [], requiredDeliveries: [], events: [],
		startedAt: "2026-09-22T09:00:00.000Z", completedAt: null, issues: [], actions: [],
		stages: REQUEST_STAGES.map((id, index) => ({
			id, status: statuses[index], goal: `${id} 단계의 공개 근거`, input: [], owner: "orchestrator", model: index === 4 ? "gpt-6-astra" : null,
			agents: index === 4 ? ["demo-reviewer"] : [], tools: [], output: index < 4 ? "완료" : null, evidence: [], decision: null, skipReason: null,
			startedAt: index <= 4 ? "2026-09-22T09:00:00.000Z" : null, completedAt: index < 4 ? "2026-09-22T09:00:04.000Z" : null,
			next: REQUEST_STAGES[index + 1] ?? null, evidenceAfterSequence: 0, tasks: [],
		})),
	};
}

export function createWwwDemoState(_base: WorkbenchSnapshot, clock = Date.now): WwwDemoState {
	const now = clock(), activities = demoActivities();
	const snapshot: WorkbenchSnapshot = {
		projectId: "www-demo", revision: 1, journalSequence: activities.length, phase: "working", threadId: "demo-thread", activeTurnId: "demo-turn",
		model: "gpt-6-astra", activeModel: "gpt-6-astra", effort: "low", permissionMode: "manual", collaborationMode: "manual",
		sessionGoal: { text: "DEMO DATA · synthetic fixtures · not live telemetry", sourceActivityId: "demo-request", updatedAt: new Date(now).toISOString() },
		contextUsage: { usedTokens: 1_230_000, contextWindow: 1_500_000, percent: 82 },
		sessionUsage: {
			totalTokens: 189_500, observedTotalTokens: 189_500, unattributedTokens: 3_200,
			models: [
				{ model: "gpt-6-astra", effort: "low", interactiveRootTurns: 8, interactiveTokens: 126_000, detachedInvocations: 2, detachedTokens: 18_200, totalTokens: 144_200 },
				{ model: "gpt-5.6-luna", effort: "medium", interactiveRootTurns: 0, interactiveTokens: 0, detachedInvocations: 7, detachedTokens: 42_100, totalTokens: 42_100 },
			],
			observationCoverage: { interactive: true, detached: true },
		},
		skillInventory: { count: 6, names: ["woo-entry", "tdd", "figma-design-to-code", "woo-linear-activity", "woo-obsidian-canonical", "woo-commit"], sourceRevision: "demo", digest: "d".repeat(64) },
		mcpServers: [
			{ name : "figma"  , enabled : true , status : "connected" , tools : ["get_design_context"] },
			{ name : "linear" , enabled : true , status : "connected" , tools : ["issues", "comments"] },
			{ name : "github" , enabled : true , status : "connected" , tools : ["pull_requests"]      },
		],
		cacheObservations: [
			{ id : "context-projection" , state : "ready" , entries : 12 , logicalBytes : 84_320 , hits : 96 , misses : 8 , evictions : 1 , latencyMs : 0.7 , lastAccessedAt : new Date(now - 2_000).toISOString()  },
			{ id : "model-catalog"      , state : "ready" , entries : 14 , logicalBytes : 18_200 , hits : 11 , misses : 2 , evictions : 0 , latencyMs : 42  , lastAccessedAt : new Date(now - 12_000).toISOString() },
			{ id : "dashboard-data"     , state : "ready" , entries : 1  , logicalBytes : 9_600  , hits : 18 , misses : 1 , evictions : 0 , latencyMs : 88  , lastAccessedAt : new Date(now - 5_000).toISOString()  },
			{ id : "session-read"       , state : "ready" , entries : 4  , logicalBytes : 32_400 , hits : 34 , misses : 2 , evictions : 0 , latencyMs : 1.2 , lastAccessedAt : new Date(now - 1_000).toISOString()  },
		],
		activities,
		chat: [
			{ id: "demo-chat-user", activityId: "demo-request", role: "user", content: String(activities[0].payload.text), status: "completed" },
			{ id: "demo-chat-assistant", activityId: "demo-response", role: "assistant", content: String(activities[3].payload.text), status: "completed" },
		],
		configurationSource: "defaults", recordingReadOnly: false, activityCount: activities.length,
		evaluationRequired: false, selectedAgentRef: null, selectedAgentDetail: null, delegationDetailActivities: 0,
		hud: { showUsage: true, showContext: true }, slash: { mcp: true, clear: true, compact: true },
		tnotes: [
			{ id: "demo-note-1", title: "Figma 의미 계약", summary: "Context 비율과 MCP 개수는 서로 다른 관측값이다.", sourceActivityIds: ["demo-plan"], updatedAt: new Date(now - 60_000).toISOString() },
			{ id: "demo-note-2", title: "시각 수락", summary: "넓은 화면과 80열 화면을 함께 검증한다.", sourceActivityIds: ["demo-warning"], updatedAt: new Date(now - 30_000).toISOString() },
		],
		todo: { version: 1, revision: 3, ownerSessionId: "demo-thread", storyId: "WOO-913", title: "Figma MVP 수락", updatedAt: new Date(now).toISOString(), items: [
			{ id : "demo-todo-1" , content : "계측 의미를 분리한다"            , status : "completed"   , evidenceIds : ["demo-plan"]    , details : [] },
			{ id : "demo-todo-2" , content : "7개 화면의 시각 밀도를 보강한다" , status : "in_progress" , evidenceIds : ["demo-file"]    , details : [] },
			{ id : "demo-todo-3" , content : "실제 viewport 수락을 받는다"     , status : "blocked"     , evidenceIds : ["demo-warning"] , details : [] },
		]},
		planActivityStatus: "ready",
		chatQueue: [
			{ id: "demo-queue-1", content: "오른쪽 rail의 상태 대비를 높인다", queuedAt: new Date(now - 20_000).toISOString() },
			{ id: "demo-queue-2", content: "provider 색상 막대를 최종 확인한다", queuedAt: new Date(now - 10_000).toISOString(), goal: true },
		], draft: "", reasoningDraft: "", selectedActivityId: null,
		pendingApproval: { requestId: "demo-approval", callbackId: null, kind: "command", refs: {}, availableDecisions: ["accept", "decline"], params: { command: "publish visual acceptance", reason: "DEMO DATA · approval state example" } },
		actionResult: null, deliveryUncertain: false, error: null, developmentRecordingError: null,
		liveActivity   : { kind: "tool", method: "demo", text: "DEMO DATA · R previous · E next · Esc exit", nativeRefs: { threadId: "demo-thread", turnId: "demo-turn", itemId: "demo-tool" } },
		workFlow       : projectWorkFlow(activities, new Map(), { expectedThreadKey: "demo-thread", selectedTurnId: "demo-turn", hash: { sha256Hex: value => new Bun.CryptoHasher("sha256").update(value).digest("hex") } }),
		requestRuntime : [demoRequest()],
		delegation: [{ sourceThreadId: "demo-thread", turnId: "demo-turn", activityIds: ["demo-tool", "demo-warning"], itemIds: ["demo-reviewer", "demo-auditor", "demo-researcher"], tasks: [
			{ ref : "demo-reviewer-ref"   , id : "demo-reviewer"   , attempt : 1 , parentId : "demo-thread" , parentRef : null , role : "reviewer"   , status : "running"   , task : "Figma와 MVP 화면을 비교한다"    , model : "gpt-6-astra"   , reasoningEffort : "low"    , activities : [] , result : null                     },
			{ ref : "demo-researcher-ref" , id : "demo-researcher" , attempt : 1 , parentId : "demo-thread" , parentRef : null , role : "researcher" , status : "completed" , task : "provider quota 원천을 확인한다" , model : "gpt-5.6-luna"  , reasoningEffort : "medium" , activities : [] , result : "4개 provider 관측 완료" },
			{ ref : "demo-auditor-ref"    , id : "demo-auditor"    , attempt : 1 , parentId : "demo-thread" , parentRef : null , role : "auditor"    , status : "failed"    , task : "좁은 viewport 시각 수락"        , model : "gpt-5.6-terra" , reasoningEffort : "high"   , activities : [] , result : "rail 대비 보강 필요"    },
		] }],
	};
	const usage: UsageSnapshot[] = [
		{ provider : "openai-codex" , state : "ready" , fetchedAt : now , limits : [{ label: "5 hours", remainingPercent: 74, resetsAt: now + 7_200_000, status: "ok" }, { label: "7 days", remainingPercent: 61, resetsAt: now + 345_600_000, status: "ok" }]       },
		{ provider : "anthropic"    , state : "ready" , fetchedAt : now , limits : [{ label: "7 days", remainingPercent: 72, resetsAt: now + 432_000_000, status: "ok" }, { label: "5 hours", remainingPercent: 38, resetsAt: now + 9_000_000, status: "warning" }]  },
		{ provider : "google"       , state : "ready" , fetchedAt : now , limits : [{ label: "weekly", remainingPercent: 83, resetsAt: now + 302_400_000, status: "ok" }, { label: "5 hours", remainingPercent: 66, resetsAt: now + 12_600_000, status: "ok" }]      },
		{ provider : "zai"          , state : "ready" , fetchedAt : now , limits : [{ label: "weekly", remainingPercent: 57, resetsAt: now + 259_200_000, status: "ok" }, { label: "5 hours", remainingPercent: 29, resetsAt: now + 10_800_000, status: "warning" }] },
	];
	return { snapshot, usage };
}
