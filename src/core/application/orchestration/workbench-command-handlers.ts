import type { CanonicalPromotionService }      from "@/core/application/work/canonical-promotion.js";
import type { ReviewService }                  from "@/core/application/review/review-service.js";
import type { ProjectActivity }                from "@/core/domain/execution/project-activity.js";
import type { ReviewPacket, ReviewProvider }   from "@/core/domain/review/review.js";
import type { TNoteDraft }                     from "@/core/domain/work/t-notes.js";
import type { TodoDocument }                   from "@/core/domain/work/todos.js";
import type {
	WorkbenchActionResult,
	WorkbenchCommand,
	WorkbenchCommandReceipt,
	WorkbenchMcpServer,
} from "@/core/domain/work/workbench.js";
import type { WooEntry }                       from "@/core/application/orchestration/woo-entry.js";
import { canonicalTNoteDraft, todoResultBody } from "@/core/application/orchestration/workbench-artifacts.js";
import { stableJson }                          from "@/core/application/orchestration/workbench-projections.js";

export interface WorkbenchMcpManagement {
	listMcpServers     ()                              : Promise<readonly WorkbenchMcpServer[]>;
	setMcpServerEnabled(name: string, enabled: boolean): Promise<void>;
	reloadMcpServers   ()                              : Promise<void>;
}

interface TodoCommandSource {
	create        (title: string, items: readonly string[], storyId?: string): Promise<TodoDocument>;
	add           (content: string, placement: "now" | "after"              ): Promise<TodoDocument>;
	addDetails    (itemId: string, details: readonly string[]               ): Promise<TodoDocument>;
	start         (itemId: string                                           ): Promise<TodoDocument>;
	complete      (itemId: string                                           ): Promise<TodoDocument>;
	block         (itemId: string                                           ): Promise<TodoDocument>;
	reopen        (itemId: string                                           ): Promise<TodoDocument>;
	recordEvidence(evidenceId: string                                       ): Promise<TodoDocument | null>;
	importLegacy  ()                                                         : Promise<string | null>;
}

interface WorkbenchCommandHandlerDependencies {
	readonly projectId          : string                                                                                      ;
	readonly mcp                : () => WorkbenchMcpManagement | null                                                         ;
	readonly wooEntry?          : WooEntry                                                                                    ;
	readonly todos?             : TodoCommandSource                                                                           ;
	readonly promotions?        : CanonicalPromotionService                                                                   ;
	readonly reviews?           : ReviewService                                                                               ;
	readonly note               : (noteId: string) => TNoteDraft | undefined                                                  ;
	readonly activities         : () => readonly ProjectActivity[]                                                            ;
	readonly hasRuntimeRequests : () => boolean                                                                               ;
	readonly setMcpServers      : (servers: readonly WorkbenchMcpServer[]) => void                                            ;
	readonly setActionResult    : (kind: WorkbenchActionResult["kind"], title: string, body: string, digest?: string) => void ;
	readonly publish            : () => void                                                                                  ;
}

/** Handles artifact and management commands that do not own Native turn lifecycle. */
export class WorkbenchCommandHandlers {
	private readonly promotionDrafts = new Map<string, ReturnType<typeof canonicalTNoteDraft>>();
	private readonly reviewPreviews = new Map<string, { provider: ReviewProvider; packet: ReviewPacket }>();

	public constructor(private readonly dependencies: WorkbenchCommandHandlerDependencies) {}

	public async dispatch(commandId: string, command: WorkbenchCommand): Promise<WorkbenchCommandReceipt | null> {
		switch (command.type) {
			case "mcp.refresh"        : return this.refreshMcpServers  (commandId);
			case "mcp.enable"         : return this.setMcpServerEnabled(commandId, command.name, true);
			case "mcp.disable"        : return this.setMcpServerEnabled(commandId, command.name, false);
			case "mcp.reload"         : return this.reloadMcpServers   (commandId);
			case "woo-entry.refresh"  : return this.refreshWooEntry    (commandId);
			case "todo.create"        : return this.mutateTodo         (commandId, "Todo 생성", () => this.requireTodos().create(command.title, command.items, command.storyId));
			case "todo.add"           : return this.mutateTodo         (commandId, "Todo 항목 추가", () => this.requireTodos().add(command.content, command.placement));
			case "todo.details"       : return this.mutateTodo         (commandId, "Todo 세부 항목 추가", () => this.requireTodos().addDetails(command.itemId, command.details));
			case "todo.transition"    : return this.transitionTodo     (commandId, command.action, command.itemId);
			case "todo.evidence"      : return this.recordTodoEvidence (commandId, command.activityId);
			case "todo.import-legacy" : return this.importLegacyTodo   (commandId);
			case "promotion.accept"   : return this.acceptPromotion    (commandId, command.noteId, command.acceptedBy);
			case "promotion.confirm"  : return this.confirmPromotion   (commandId, command.token);
			case "review.preview"     : return this.previewReview      (commandId, command.provider, command.noteId, command.request, command.confirmedPublic);
			case "review.send"        : return this.sendReview         (commandId, command.digest);
			default                   : return null;
		}
	}

	public async loadMcpServers(): Promise<void> {
		const management = this.dependencies.mcp();
		if (!management) return;
		this.dependencies.setMcpServers(await management.listMcpServers());
	}

	private requireMcp(): WorkbenchMcpManagement {
		const management = this.dependencies.mcp();
		if (!management) throw new Error("연결된 App Server는 MCP 서버 관리를 지원하지 않습니다.");
		return management;
	}

	private async refreshMcpServers(commandId: string): Promise<WorkbenchCommandReceipt> {
		this.dependencies.setMcpServers(await this.requireMcp().listMcpServers());
		this.dependencies.publish();
		return { state: "accepted", commandId };
	}

	private async setMcpServerEnabled(commandId: string, name: string, enabled: boolean): Promise<WorkbenchCommandReceipt> {
		const management = this.requireMcp();
		await management.setMcpServerEnabled(name, enabled);
		this.dependencies.setMcpServers(await management.listMcpServers());
		this.dependencies.publish();
		return { state: "accepted", commandId };
	}

	private async reloadMcpServers(commandId: string): Promise<WorkbenchCommandReceipt> {
		const management = this.requireMcp();
		await management.reloadMcpServers();
		this.dependencies.setMcpServers(await management.listMcpServers());
		this.dependencies.publish();
		return { state: "accepted", commandId };
	}

	private async refreshWooEntry(commandId: string): Promise<WorkbenchCommandReceipt> {
		const entry = this.dependencies.wooEntry;
		if (!entry) return { state: "rejected", commandId, reason: "woo-entry가 이 세션에 연결되지 않았습니다." };
		const snapshot = await entry.refresh();
		this.dependencies.publish();
		if (snapshot.state === "blocked") return { state: "rejected", commandId, reason: `woo-entry BLOCKED: ${snapshot.reason}` };
		if (snapshot.state === "loading") return { state: "rejected", commandId, reason: "woo-entry 수집이 아직 끝나지 않았습니다." };
		const signalCount = snapshot.payload.signals.length;
		return {
			state: "accepted",
			commandId,
			message: signalCount > 0 ? `woo-entry를 갱신했습니다 · signal ${signalCount}개` : "woo-entry를 갱신했습니다.",
		};
	}

	private async mutateTodo(commandId: string, title: string, operation: () => Promise<TodoDocument>): Promise<WorkbenchCommandReceipt> {
		if (this.dependencies.hasRuntimeRequests()) return { state: "rejected", commandId, reason: "이 Todo는 Request Runtime의 7단계 기록입니다. 입력창에서 단계의 하위 작업 변경을 요청하세요." };
		const document = await operation();
		this.dependencies.setActionResult("todo", title, todoResultBody(document));
		return { state: "accepted", commandId, message: title };
	}

	private async transitionTodo(commandId: string, action: "start" | "complete" | "block" | "reopen", itemId: string): Promise<WorkbenchCommandReceipt> {
		const todos = this.requireTodos();
		return this.mutateTodo(commandId, `Todo ${action}: ${itemId}`, () => todos[action](itemId));
	}

	private async recordTodoEvidence(commandId: string, activityId: string): Promise<WorkbenchCommandReceipt> {
		if (this.dependencies.hasRuntimeRequests()) return { state: "rejected", commandId, reason: "Runtime Evidence는 Native 단계 보고와 실제 Activity 참조로 연결합니다." };
		if (!this.dependencies.activities().some(activity => activity.id === activityId)) return { state: "rejected", commandId, reason: `Evidence activity를 찾을 수 없습니다: ${activityId}` };
		const document = await this.requireTodos().recordEvidence(activityId);
		if (!document) return { state: "rejected", commandId, reason: "증거를 연결할 진행 중 Todo가 없습니다." };
		this.dependencies.setActionResult("todo", "Todo 증거 연결", todoResultBody(document));
		return { state: "accepted", commandId, message: `${activityId} 증거를 연결했습니다.` };
	}

	private async importLegacyTodo(commandId: string): Promise<WorkbenchCommandReceipt> {
		const imported = await this.requireTodos().importLegacy();
		if (!imported) return { state: "rejected", commandId, reason: "가져올 legacy Todo가 없거나 정본 Todo가 이미 존재합니다." };
		this.dependencies.setActionResult("todo", "Legacy Todo 가져오기", imported);
		return { state: "accepted", commandId, message: "Legacy Todo를 비파괴 방식으로 가져왔습니다." };
	}

	private requireTodos(): TodoCommandSource {
		if (!this.dependencies.todos) throw new Error("Todo 저장소가 연결되지 않았습니다.");
		return this.dependencies.todos;
	}

	private async acceptPromotion(commandId: string, noteId: string, acceptedBy: string): Promise<WorkbenchCommandReceipt> {
		const promotions = this.dependencies.promotions;
		if (!promotions) return { state: "rejected", commandId, reason: "정본 승격 서비스가 연결되지 않았습니다." };
		const note = this.dependencies.note(noteId);
		if (!note) return { state: "rejected", commandId, reason: `Note를 찾을 수 없습니다: ${noteId}` };
		const draft = canonicalTNoteDraft(note, this.dependencies.projectId);
		const accepted = await promotions.accept(draft, acceptedBy);
		this.promotionDrafts.set(accepted.token, draft);
		this.dependencies.setActionResult("promotion", `승격 승인 대기: ${accepted.target}`, `${accepted.diff}\n\n확인 토큰: ${accepted.token}`, accepted.afterDigest);
		return { state: "accepted", commandId, message: "diff를 확인한 뒤 one-time token으로 승격을 확정하세요." };
	}

	private async confirmPromotion(commandId: string, token: string): Promise<WorkbenchCommandReceipt> {
		const promotions = this.dependencies.promotions;
		if (!promotions) return { state: "rejected", commandId, reason: "정본 승격 서비스가 연결되지 않았습니다." };
		const draft = this.promotionDrafts.get(token);
		if (!draft) return { state: "rejected", commandId, reason: "알 수 없거나 이미 사용한 승격 토큰입니다." };
		const promoted = await promotions.promote(draft, token);
		if (promoted.status === "promoted") this.promotionDrafts.delete(token);
		this.dependencies.setActionResult("promotion", promoted.status === "promoted" ? `정본 승격 완료: ${promoted.target}` : `승격 재승인 필요: ${promoted.reason}`, promoted.diff, promoted.afterDigest);
		if (promoted.status !== "promoted") return { state: "rejected", commandId, reason: `승격 초안이 오래되었습니다: ${promoted.reason}` };
		return { state: "accepted", commandId, message: "정본 파일에 기록했습니다. Git 상태는 uncommitted입니다." };
	}

	private async previewReview(commandId: string, provider: ReviewProvider, noteId: string, request: string, confirmedPublic: true): Promise<WorkbenchCommandReceipt> {
		const reviews = this.dependencies.reviews;
		if (!reviews) return { state: "rejected", commandId, reason: "외부 리뷰 서비스가 연결되지 않았습니다." };
		if (confirmedPublic !== true) return { state: "rejected", commandId, reason: "Note를 public으로 명시 확인해야 합니다." };
		const note = this.dependencies.note(noteId);
		if (!note) return { state: "rejected", commandId, reason: `Note를 찾을 수 없습니다: ${noteId}` };
		const preview = reviews.preview({ purpose: { value: `Note ${note.id} 독립 검토`, sensitivity: "public" }, request: { value: request, sensitivity: "public" }, context: { value: note.text, sensitivity: "public" } });
		this.reviewPreviews.set(preview.packet.digest, { provider, packet: preview.packet });
		this.dependencies.setActionResult("review", `${provider} 전송 미리보기`, stableJson(preview.packet), preview.packet.digest);
		return { state: "accepted", commandId, message: "표시된 exact digest를 승인해 전송하세요." };
	}

	private async sendReview(commandId: string, digest: string): Promise<WorkbenchCommandReceipt> {
		const reviews = this.dependencies.reviews;
		if (!reviews) return { state: "rejected", commandId, reason: "외부 리뷰 서비스가 연결되지 않았습니다." };
		const preview = this.reviewPreviews.get(digest);
		if (!preview) return { state: "rejected", commandId, reason: "승인할 리뷰 preview digest를 찾을 수 없습니다." };
		const delivery = await reviews.send({ packet: preview.packet, acceptedDigest: digest, provider: preview.provider });
		this.reviewPreviews.delete(digest);
		const provenance = stableJson({ packetDigest: delivery.packetDigest, resultDigest: delivery.resultDigest, version: delivery.version, sentAt: delivery.sentAt, receivedAt: delivery.receivedAt });
		this.dependencies.setActionResult("review", `${delivery.provider}/${delivery.model} 검토 결과`, `${delivery.result}\n\nprovenance: ${provenance}`, delivery.resultDigest);
		return { state: "accepted", commandId, message: "독립 리뷰 결과와 provenance를 저장했습니다." };
	}
}
