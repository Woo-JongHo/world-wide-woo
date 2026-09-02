import { Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";
import type { NativeApprovalRequest } from "../../domain/native-session";
import { workbenchApprovalDecisions, type WorkbenchApprovalDecision } from "../../domain/workbench";
import { colors } from "./theme";
import { approvalDetailLabel, approvalFallback, approvalKindLabel, approvalParamText } from "./workbench-views";

const DECISION_LABEL: Record<WorkbenchApprovalDecision, string> = {
	accept: "승인",
	acceptForSession: "이번 세션 동안 승인",
	decline: "거절",
	cancel: "중단",
};

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
	private readonly decisions: readonly WorkbenchApprovalDecision[];
	private selected = 0;
	private resolving = false;

	public constructor(
		private readonly request: NativeApprovalRequest,
		private readonly requestRender: () => void,
		private readonly onResolve: (decision: WorkbenchApprovalDecision) => void,
		private readonly onClose: () => void,
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
		const command = approvalParamText(this.request, "command");
		const reason = approvalParamText(this.request, "reason");
		const cwd = approvalParamText(this.request, "cwd");
		const detail: string[] = [
			colors.warning(`승인 필요 · ${approvalKindLabel(this.request.kind)}`),
			"",
			`${colors.accent(approvalDetailLabel(this.request))} · ${command ?? approvalFallback(this.request)}`,
			`${colors.accent("이유")} · ${reason ?? approvalFallback(this.request)}`,
			...(cwd ? [`${colors.accent("경로")} · ${cwd}`] : []),
			"",
		];
		const options = this.decisions.length > 0
			? this.decisions.map((decision, index) => {
				const marker = index === this.selected ? colors.accent("▸") : " ";
				const label = `${index + 1}. ${DECISION_LABEL[decision]}`;
				return `${marker} ${index === this.selected ? colors.text(label) : colors.muted(label)}`;
			})
			: [colors.muted("이 요청은 결정 선택지를 제공하지 않습니다. /cancel 로 중단하세요.")];
		const footer = this.resolving
			? colors.muted("결정을 전달하는 중입니다.")
			: colors.muted("↑↓ 선택 · Enter 결정 · Esc 닫기 · /approve 로도 가능");
		return [...detail, ...options, "", footer].flatMap(row => wrapTextWithAnsi(row, inner)).map(row => fit(row, inner));
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
