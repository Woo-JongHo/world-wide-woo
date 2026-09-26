export interface ComposerDraftController {
	/** Loaded before a shell starts; persistence never writes directly into a live editor. */
	readonly initialText: string;
	save(text: string): Promise<void>;
	clear(): Promise<void>;
}
