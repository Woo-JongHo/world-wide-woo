import {
	ProcessTerminal,
	SelectList,
	TuiAltScreen,
	type Component,
} from "@earendil-works/pi-tui";
import type { NativeThreadSummary } from "../../../../../core/domain/execution/native-session";
import { colors, selectListTheme } from "../../foundation/theme/theme";
import { a, astraEditorTheme, fit, safe } from "../../foundation/theme/astra-theme";

function threadPreview(thread: NativeThreadSummary): string {
	return thread.preview.replace(/\s+/gu, " ").trim() || "(미리보기 없음)";
}

function threadDescription(thread: NativeThreadSummary): string {
	const updatedAt = new Date(thread.updatedAt * 1_000).toLocaleString("ko-KR");
	return `${thread.status} · ${updatedAt} · ${thread.id}`;
}

export class NativeThreadPicker implements Component {
	private readonly list: SelectList;

	public constructor(
		threads: readonly NativeThreadSummary[],
		onSelect: (threadId: string) => void,
		onCancel: () => void,
		private readonly design?: "astra",
	) {
		this.list = new SelectList(
			threads.map(thread => ({
				value: thread.id,
				label: design ? safe(threadPreview(thread)) : threadPreview(thread),
				description: design ? safe(threadDescription(thread)) : threadDescription(thread),
			})),
			Math.min(10, Math.max(1, threads.length)),
			design ? astraEditorTheme.selectList : selectListTheme,
			{ minPrimaryColumnWidth: 28, maxPrimaryColumnWidth: 48 },
		);
		this.list.onSelect = item => onSelect(item.value);
		this.list.onCancel = onCancel;
	}

	public invalidate(): void {
		this.list.invalidate();
	}

	public render(width: number): string[] {
		if (this.design) return [a.strong("astra") + a.muted(" / resume"), "", a.text("계속할 작업을 선택하세요"), a.muted("↑↓ 선택 / Enter 재개 / Esc 취소"), "", ...this.list.render(Math.max(1, width - 4))].map(row => fit("  " + row, width));
		return [
			colors.accent("재개할 Codex 세션 선택"),
			colors.muted("↑↓ 이동 · Enter 재개 · Esc 취소"),
			"",
			...this.list.render(width),
		];
	}

	public handleInput(data: string): void {
		this.list.handleInput(data);
	}
}

/** Opens a short-lived native-thread picker before the project Workbench starts. */
export function selectNativeThread(threads: readonly NativeThreadSummary[], design?: "astra"): Promise<string | null> {
	if (threads.length === 0) return Promise.resolve(null);
	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		throw new Error("대화형 터미널이 아닙니다. www --resume <native-thread-id>를 사용하세요.");
	}
	const tui = new TuiAltScreen(new ProcessTerminal(), true);
	return new Promise((resolve, reject) => {
		let settled = false;
		const finish = (threadId: string | null): void => {
			if (settled) return;
			settled = true;
			tui.stop();
			resolve(threadId);
		};
		const picker = new NativeThreadPicker(threads, id => finish(id), () => finish(null), design);
		try {
			tui.setLayoutRoot(picker);
			tui.setFocus(picker);
			tui.start();
		} catch (error) {
			if (!settled) {
				settled = true;
				tui.stop();
				reject(error);
			}
		}
	});
}
