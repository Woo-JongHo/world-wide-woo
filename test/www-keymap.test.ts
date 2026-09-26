import { describe, expect, test } from "bun:test";
import { readFileSync }           from "node:fs";
import { join }                   from "node:path";
import {
	WWW_DOC_EXTRA,
	WWW_HELP_ACTIONS,
	WWW_KEYMAP,
	WWW_KEYS,
	WWW_SCROLL_KEYS,
	WWW_VIEWS,
} from "../src/adapters/inbound/tui/foundation/keyboard/www-keymap";
import type { WwwKeyAction }      from "../src/adapters/inbound/tui/foundation/keyboard/www-keymap";
import { HelpView }               from "../src/adapters/inbound/tui/shell/www-surface";

const actions = Object.keys(WWW_KEYMAP) as WwwKeyAction[];

const docSnippets = (): string[] => [...new Set([...actions.flatMap(action => [...WWW_KEYMAP[action].doc]), ...WWW_DOC_EXTRA])];

describe("Www 키맵", () => {
	test("에디터 소유 종료를 제외한 모든 동작이 keyId·F키·뷰 번호 중 하나는 소유한다", () => {
		for (const action of actions) {
			const binding = WWW_KEYMAP[action];
			const owned = (binding.keys?.length ?? 0) + (binding.functionKey ? 1 : 0) + (binding.viewNumber ? 1 : 0);
			if (action === "session.exit") {
				expect(owned).toBe(0);
				continue;
			}
			expect(owned, action).toBeGreaterThan(0);
		}
	});

	test("같은 키를 두 동작이 소유하지 않는다", () => {
		const owned = actions.filter(action => action !== "scroll.move").flatMap(action => [...(WWW_KEYMAP[action].keys ?? []), WWW_KEYMAP[action].functionKey, WWW_KEYMAP[action].viewNumber].filter(Boolean) as string[]);
		const scroll = Object.values(WWW_SCROLL_KEYS).flat();
		expect(new Set(WWW_KEYMAP["scroll.move"].keys ?? []).size).toBe(scroll.length);
		expect([...(WWW_KEYMAP["scroll.move"].keys ?? [])].sort()).toEqual([...scroll].sort());
		const all = [...owned, ...scroll];
		expect(new Set(all).size).toBe(all.length);
	});

	test("페이지 9종이 F2–F9와 뷰 1–9를 순서대로 파생한다", () => {
		expect(WWW_KEYS.map(([key, command]) => [key, command])).toEqual([["f2", "/chat"], ["f3", "/todo"], ["f4", "/monitor"], ["f5", "/stats"], ["f6", "/dashboard"], ["f7", "/map"], ["f8", "/context"], ["f9", "/test"]]);
		expect(WWW_VIEWS.map(([key, command]) => [key, command])).toEqual([["1", "/chat"], ["2", "/todo"], ["3", "/monitor"], ["4", "/stats"], ["5", "/dashboard"], ["6", "/map"], ["7", "/context"], ["8", "/test"], ["9", "/workflow"]]);
	});

	test("HelpView가 키맵에서 파생된다 (F9 누락 회귀 방지)", () => {
		const help = new HelpView().render(80).join("\n");
		for (const action of WWW_HELP_ACTIONS) for (const label of WWW_KEYMAP[action].doc) expect(help).toContain(label);
		expect(help).toContain("F2–F9");
		expect(help).not.toContain("F2–F8");
	});

	test("실행 콘솔 문서의 키보드 표가 키맵과 일치한다", () => {
		const doc = readFileSync(join(import.meta.dir, "../docs/WWW_EXECUTION_CONSOLE.md"), "utf8");
		for (const snippet of docSnippets()) expect(doc).toContain(snippet);
	});
});
