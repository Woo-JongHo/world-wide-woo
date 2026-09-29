export type OutputLanguage = "ko" | "en";

/** One project session owns its current output language. */
export class OutputLanguageSelection {
	constructor(private current: OutputLanguage = "ko") {}
	get(): OutputLanguage { return this.current; }
	set(language: OutputLanguage): void { this.current = language; }
}
