import { describe, expect, test }        from "bun:test";
import { ComposerDraftPersistenceQueue } from "../src/adapters/inbound/tui/shell/composer-draft-persistence";
import type { ComposerDraftController }  from "../src/core/ports/persistence/composer-draft-port";

interface EditorState {
	generation : number ;
	text       : string ;
}

describe("composer draft persistence queue", () => {
	test("serializes an in-flight clear before shutdown saves the newer editor generation", async () => {
		const clear                = deferred<void>()            ;
		const events : string[]    = []                          ;
		let persisted              = "이전 초안"                 ;
		const state  : EditorState = { generation: 0, text: "" } ;
		const controller: ComposerDraftController = {
			initialText : persisted,
			save        : async text => { events.push(`save:${text}`); persisted = text; },
			clear       : async () => { events.push("clear:start"); await clear.promise; persisted = ""; events.push("clear:end"); },
		};
		const persistence = new ComposerDraftPersistenceQueue(controller, () => state.generation, () => state.text);

		const clearing = persistence.clearIfCurrent(0);
		await waitFor(() => events.includes("clear:start"));
		state.generation = 1;
		state.text = "종료 직전 새 초안";
		const shutdownSave = persistence.saveLatest();
		await Bun.sleep(0);
		expect(events).toEqual(["clear:start"]);

		clear.resolve();
		await Promise.all([clearing, shutdownSave]);

		expect(persisted).toBe("종료 직전 새 초안");
		expect(events.at(-1)).toBe("save:종료 직전 새 초안");
	});

	test("retries the latest generation when another edit lands during compensating save", async () => {
		const clear                = deferred<void>()            ;
		const firstSave            = deferred<void>()            ;
		const events : string[]    = []                          ;
		let persisted              = "이전 초안"                 ;
		let saveCount              = 0                           ;
		const state  : EditorState = { generation: 0, text: "" } ;
		const controller: ComposerDraftController = {
			initialText : persisted,
			save        : async text => {
				saveCount += 1;
				events.push(`save:${text}`);
				if (saveCount === 1) await firstSave.promise;
				persisted = text;
			},
			clear: async () => { events.push("clear"); await clear.promise; persisted = ""; },
		};
		const persistence = new ComposerDraftPersistenceQueue(controller, () => state.generation, () => state.text);

		const clearing = persistence.clearIfCurrent(0);
		await waitFor(() => events.includes("clear"));
		state.generation = 1;
		state.text = "보상 저장 첫 세대";
		clear.resolve();
		await waitFor(() => events.includes("save:보상 저장 첫 세대"));
		state.generation = 2;
		state.text = "보상 저장 최신 세대";
		firstSave.resolve();
		await clearing;

		expect(persisted).toBe("보상 저장 최신 세대");
		expect(events).toEqual(["clear", "save:보상 저장 첫 세대", "save:보상 저장 최신 세대"]);
	});

	test("keeps an accepted clear when the editor generation is unchanged", async () => {
		const events : string[]    = []                          ;
		let persisted              = "제출한 초안"               ;
		const state  : EditorState = { generation: 3, text: "" } ;
		const controller: ComposerDraftController = {
			initialText : persisted,
			save        : async text => { events.push(`save:${text}`); persisted = text; },
			clear       : async () => { events.push("clear"); persisted = ""; },
		};
		const persistence = new ComposerDraftPersistenceQueue(controller, () => state.generation, () => state.text);

		await persistence.clearIfCurrent(3);

		expect(persisted).toBe("");
		expect(events).toEqual(["clear"]);
	});
});

function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } {
	let settle = (_value: T): void => { throw new Error("Deferred promise was not initialized."); };
	const promise = new Promise<T>((resolve) => { settle = resolve; });
	return { promise, resolve: settle };
}

async function waitFor(predicate: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (predicate()) return;
		await Bun.sleep(1);
	}
	throw new Error("Timed out waiting for composer persistence observation.");
}
