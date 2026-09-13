import type { RequestRuntimeRecord, RequestStageStatus } from "../execution/request-runtime";
import type { TodoDocument, TodoItemStatus } from "./todos";

const todoStatus = (s: RequestStageStatus): TodoItemStatus => s === "running" ? "in_progress" : s === "skipped" || s === "completed" ? "completed" : s === "failed" || s === "blocked" ? "blocked" : "pending";
const label = (s: string) => Array.from(s.replace(/\s+/gu, " ").trim()).slice(0, 120).join("");

/** Fixed seven parents; Native-authored work stays beneath its owning stage. */
export function projectRequestTodo(r: RequestRuntimeRecord, ownerSessionId: string, revision: number): TodoDocument {
	return { version: 1, revision, requestId: r.requestId, ownerSessionId, storyId: null, title: label(r.objective),
		updatedAt: r.events.at(-1)?.at ?? r.startedAt,
		items: r.stages.map(s => ({ id: s.id.toLowerCase(), content: label(s.id + (s.skipReason ? ` · 생략: ${s.skipReason}` : "")), status: todoStatus(s.status), evidenceIds: s.evidence.map(e => e.activityId).slice(-8),
			details: s.tasks.map(t => ({ id: `${s.id.toLowerCase()}_${t.id}`, content: label((s.status === "skipped" ? "생략: " : "") + t.title), status: s.status === "skipped" ? "completed" : t.status === "running" ? s.status === "running" ? "in_progress" : "blocked" : t.status, evidenceIds: [] })) })),
	};
}

/** Destination-specific views of one record. External publication still uses Artifact Control. */
export function projectRequestDestinations(r: RequestRuntimeRecord): { chat: string; linear: string; obsidian: string; github: string } {
	const evidence = [...new Map(r.stages.flatMap(s => s.evidence).map(e => [e.activityId, e])).values()];
	const decision = r.stages.find(s => s.id === "DECIDE")?.decision;
	const execution = r.stages.find(s => s.id === "EXECUTE");
	const verification = r.stages.find(s => s.id === "VERIFY");
	const identity = `Request: ${r.requestId}\nThread: ${r.threadId ?? "unbound"}\nTurn: ${r.turnId ?? "pending"}`;
	const unresolved = r.actions.filter(x => x.status === "unconfirmed");
	const missing = r.requiredDeliveries.filter(x => !r.deliveries.some(d => d.target === x.target && d.artifact === x.artifact));
	const summary = `${r.objective}\n상태: ${r.status} · 시도 ${r.attempt}${unresolved.length ? `\n실행 결과 미확인: ${unresolved.map(x => x.operationId).join(", ")} · 재실행 금지, read-back 필요` : ""}${missing.length ? `\n필수 전달 미완료: ${missing.map(x => `${x.target} → ${x.artifact}`).join(", ")}` : ""}`;
	const checks = `${verification?.status}: ${verification?.output ?? "미관측"}`;
	return {
		chat: `${summary}\n${execution?.output ?? "실행 결과 미관측"}\n검증: ${checks}`,
		linear: `${summary}\n변경: ${execution?.output ?? "미관측"}\n검증: ${checks}\n${identity}`,
		obsidian: `${identity}\n\n${summary}\n\n${r.stages.map(s => `## ${s.id} — ${s.status}\n\n${s.output ?? "미관측"}\n${s.skipReason ? `생략 이유: ${s.skipReason}\n` : ""}${s.tasks.map(t => `- ${t.status} ${t.title} (dependencies: ${t.dependsOn.join(", ")})`).join("\n")}`).join("\n\n")}\n\n## 공개 결정\n\n${decision ? JSON.stringify(decision, null, 2) : "미관측"}\n\n## Evidence\n\n${evidence.map(e => `${e.activityId} #${e.sequence} ${e.sourceDigest}`).join("\n")}`,
		github: `${summary}\n\n변경\n${execution?.output ?? "미관측"}\n\n검증\n${checks}\n\n${evidence.filter(e => e.kind === "file-change" || e.kind === "tool").map(e => `${e.activityId} ${e.sourceDigest}`).join("\n")}\n\n${identity}`,
	};
}
