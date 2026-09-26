import { Key, matchesKey }              from "@earendil-works/pi-tui";
import type { Component }               from "@earendil-works/pi-tui";
import type { NoteFeatureProjection }   from "@/core/application/orchestration/workbench-feature-reads";
import { TNotesSourceView }             from "@/adapters/inbound/tui/features/tnote/view/t-notes-source-view";
import { projectTNoteBrowserViewModel } from "@/adapters/inbound/tui/features/tnote/view-model/tnote-browser-view-model";
import { renderTNoteBrowserView }       from "@/adapters/inbound/tui/features/tnote/view/tnote-browser-view";

/** Owns only transient selection/open state; durable Summary and Note state stays in Core. */
export class TNoteBrowserController implements Component {
	private selectedIndex                           = -1     ;
	private mode                : "list" | "detail" = "list" ;
	private readonly sourceView : TNotesSourceView           ;

	public constructor(
		private readonly getProjection: () => NoteFeatureProjection,
		private readonly requestRender: () => void,
		private readonly close: () => void,
	) {
		this.sourceView = new TNotesSourceView(
			() => {
				const projection = this.getProjection();
				return {
					tnotes: projection.notes,
					tnoteVisibleLimit: Math.max(1, projection.notes.length),
					...(projection.summaryMaxChars === undefined ? {} : { tnoteSummaryMaxChars: projection.summaryMaxChars }),
					...(projection.summaryMaxLines === undefined ? {} : { tnoteSummaryMaxLines: projection.summaryMaxLines }),
				};
			},
			() => this.getProjection().notes[this.selectedIndex]?.id ?? null,
		);
	}

	public invalidate(): void { this.sourceView.invalidate(); }

	public render(width: number): string[] {
		if (this.selectedIndex < 0) this.selectedIndex = Math.max(0, this.getProjection().notes.length - 1);
		const state = projectTNoteBrowserViewModel(this.getProjection(), this.selectedIndex, this.mode);
		this.selectedIndex = state.selectedIndex;
		this.mode = state.mode;
		return renderTNoteBrowserView(state, this.sourceView.render(width), width);
	}

	public handleInput(data: string): void {
		if (matchesKey(data, Key.escape)) {
			if (this.mode === "detail") this.mode = "list";
			else return this.close();
		} else if (matchesKey(data, Key.left) || matchesKey(data, Key.backspace)) {
			this.mode = "list";
		} else if (matchesKey(data, Key.enter)) {
			if (this.getProjection().notes.length > 0) this.mode = "detail";
		} else if (matchesKey(data, Key.up)) {
			this.move(-1);
		} else if (matchesKey(data, Key.down)) {
			this.move(1);
		} else return;
		this.requestRender();
	}

	private move(delta: number): void {
		const length = this.getProjection().notes.length;
		if (length === 0) return;
		this.selectedIndex = (this.selectedIndex + delta + length) % length;
	}
}
