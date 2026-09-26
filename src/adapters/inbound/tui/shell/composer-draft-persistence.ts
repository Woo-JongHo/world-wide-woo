import type { ComposerDraftController } from "@/core/ports/persistence/composer-draft-port";

/** Serializes draft persistence while the TUI Editor remains the live text writer. */
export class ComposerDraftPersistenceQueue {
	private tail: Promise<void> = Promise.resolve();

	public constructor(
		private readonly controller: ComposerDraftController,
		private readonly readGeneration: () => number,
		private readonly readText: () => string,
	) {}

	public clearIfCurrent(expectedGeneration: number): Promise<void> {
		return this.enqueue(async () => {
			if (this.readGeneration() !== expectedGeneration) return;
			await this.controller.clear();
			if (this.readGeneration() !== expectedGeneration) await this.saveStableGeneration();
		});
	}

	public saveLatest(): Promise<void> {
		return this.enqueue(() => this.saveStableGeneration());
	}

	private async saveStableGeneration(): Promise<void> {
		while (true) {
			const generation = this.readGeneration();
			const text       = this.readText()      ;
			await this.controller.save(text);
			if (this.readGeneration() === generation) return;
		}
	}

	private enqueue(operation: () => Promise<void>): Promise<void> {
		const result = this.tail.catch(() => undefined).then(operation);
		this.tail = result.catch(() => undefined);
		return result;
	}
}
