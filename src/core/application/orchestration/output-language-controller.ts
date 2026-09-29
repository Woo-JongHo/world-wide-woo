import type { OutputLanguage } from "@/core/domain/execution/output-language.js";
import { OutputLanguageSelection } from "@/core/domain/execution/output-language.js";

/** Serializes rapid UI selections so the last choice also wins on disk. */
export class OutputLanguageController {
	private requested: OutputLanguage;
	private pending: Promise<void> = Promise.resolve();

	constructor(
		private readonly selection: OutputLanguageSelection,
		private readonly persist: (language: OutputLanguage) => Promise<void>,
		private readonly changed: (language: OutputLanguage) => void,
	) { this.requested = selection.get(); }

	select(language: OutputLanguage): Promise<void> {
		this.requested = language;
		this.pending = this.pending.catch(() => undefined).then(async () => {
			const next = this.requested;
			if (next === this.selection.get()) return;
			try {
				await this.persist(next);
				this.selection.set(next);
				this.changed(next);
			} catch (error) {
				if (this.requested === next) this.requested = this.selection.get();
				throw error;
			}
		});
		return this.pending;
	}

	cycle(): Promise<void> { return this.select(this.requested === "ko" ? "en" : "ko"); }
}
