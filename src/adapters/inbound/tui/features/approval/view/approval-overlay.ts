import { Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { Component }                                                   from "@earendil-works/pi-tui";
import type { NativeApprovalRequest }                                       from "@/core/domain/execution/native-session";
import { workbenchApprovalDecisions, workbenchExternalMutationCandidates }  from "@/core/domain/work/workbench";
import type { WorkbenchApprovalDecision, WorkbenchExternalMutationKind }    from "@/core/domain/work/workbench";
import { colors }                                                           from "@/adapters/inbound/tui/foundation/theme/theme";
import type { TuiColors }                                                   from "@/adapters/inbound/tui/foundation/theme/theme";
import { projectApprovalRequest }                                           from "@/adapters/inbound/tui/features/approval/view/approval-presentation";

function decisionLabel(decision: WorkbenchApprovalDecision): string {
	if (decision === "accept") return "승인";
	if (decision === "acceptForSession") return "이번 세션 동안 승인";
	if (decision === "decline") return "거절";
	if (decision === "cancel") return "중단";
	if ("acceptWithExecpolicyAmendment" in decision) return "향후 같은 명령도 허용";
	if ("applyNetworkPolicyAmendment" in decision) return "네트워크 정책을 저장하고 허용";
	return "서버가 제안한 정책 변경";
}

function fit(text: string, width: number): string {
	const clipped = truncateToWidth(text, Math.max(0, width), "");
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

/**
 * Modal decision surface for a pending Native approval.  The decision is a discrete
 * selection, never parsed from chat text: a sentence that merely mentions approval must
 * not be able to run a shell command, and the ledger records a chosen decision rather
 * than an inferred intent.  `/approve` and its siblings remain a second entrance.
 */
export class ApprovalOverlay implements Component {
	private readonly decisions: readonly WorkbenchApprovalDecision[] ;
	private selected  = 0                                            ;
	private resolving = false                                        ;

	public constructor(
		private readonly request: NativeApprovalRequest,
		private readonly requestRender: () => void,
		private readonly onResolve: (decision: WorkbenchApprovalDecision) => void,
		private readonly onClose: () => void,
		private readonly ui: TuiColors = colors,
	) {
		this.decisions = workbenchApprovalDecisions(request);
	}

	public invalidate(): void {}

	/** Exposed so the shell can label its own cancel notice without re-deriving the request. */
	public get requestId(): NativeApprovalRequest["requestId"] {
		return this.request.requestId;
	}

	public render(width: number): string[] {
		const inner = Math.max(1, width);
		const presentation = projectApprovalRequest(this.request);
		const detail: string[] = [
			this.ui.warning(`승인 필요 · ${presentation.kind}`),
			"",
			`${this.ui.accent(presentation.detailLabel)} · ${presentation.detail}`,
			`${this.ui.accent("이유")} · ${presentation.reason}`,
			...(presentation.cwd ? [`${this.ui.accent("경로")} · ${presentation.cwd}`] : []),
			"",
		];
		const mutations = workbenchExternalMutationCandidates(this.request).flatMap((candidate, index) => [
			this.ui.accent(`${index + 1}. ${mutationKindLabel(candidate.kind)} · ${candidate.status}`),
			`${this.ui.accent("대상")} · ${candidate.target}`,
			`${this.ui.accent("내용")} · ${candidate.content}`,
			`${this.ui.accent("현재 상태")} · ${candidate.currentState}`,
			`${this.ui.accent("실행 범위")} · ${candidate.scope}`,
			"",
		]);
		return [...detail, ...mutations].flatMap(row => wrapTextWithAnsi(row, inner)).map(row => fit(row, inner)).concat(this.renderActions(inner));
	}

	/** Www pins the real decision controls while the candidate body scrolls. */
	public renderActions(width: number): string[] {
		const inner = Math.max(1, width);
		const options = this.decisions.length > 0
			? this.decisions.map((decision, index) => {
				const marker = index === this.selected ? this.ui.accent("▸") : " ";
				const label = `${index + 1}. ${decisionLabel(decision)}`;
				return `${marker} ${index === this.selected ? this.ui.text(label) : this.ui.muted(label)}`;
			})
			: [this.ui.muted("이 요청은 결정 선택지를 제공하지 않습니다. /cancel 로 중단하세요.")];
		const footer = this.resolving
			? this.ui.muted("결정을 전달하는 중입니다.")
			: this.ui.muted("↑↓ 선택 · Enter 결정 · Esc 닫기 (승인 보류) · /approve 로도 가능");
		return [...options, "", footer].flatMap(row => wrapTextWithAnsi(row, inner)).map(row => fit(row, inner));
	}

	public handleInput(data: string): void {
		if (this.resolving) return;
		// Arrows are checked first: they share the escape prefix, and an escape test that
		// ran earlier would swallow them.
		if (this.decisions.length > 0 && matchesKey(data, Key.up)) {
			this.selected = (this.selected + this.decisions.length - 1) % this.decisions.length;
			this.requestRender();
			return;
		}
		if (this.decisions.length > 0 && matchesKey(data, Key.down)) {
			this.selected = (this.selected + 1) % this.decisions.length;
			this.requestRender();
			return;
		}
		if (matchesKey(data, Key.escape)) {
			this.onClose();
			return;
		}
		if (this.decisions.length === 0) return;
		const shortcut = Number.parseInt(data, 10);
		if (Number.isInteger(shortcut) && shortcut >= 1 && shortcut <= this.decisions.length) {
			this.selected = shortcut - 1;
			this.resolve();
			return;
		}
		if (matchesKey(data, Key.enter)) this.resolve();
	}

	private resolve(): void {
		const decision = this.decisions[this.selected];
		if (!decision) return;
		this.resolving = true;
		this.requestRender();
		this.onResolve(decision);
	}
}

function mutationKindLabel(kind: WorkbenchExternalMutationKind): string {
	return ({ commit: "커밋", push: "Push", issue: "GitHub Issue", "linear-issue": "Linear Issue", "linear-project-comment": "Linear Project Comment", "linear-project-update": "Linear Project Update", "obsidian-canonical": "Obsidian 정본", "github-pr": "GitHub PR" })[kind];
}
