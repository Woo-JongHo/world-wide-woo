import { expect, test } from "bun:test";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { fit } from "../src/adapters/inbound/tui/foundation/theme/astra-theme";

function legacyFit(value: string, width: number): string {
	if (width <= 0) return "";
	const clipped = truncateToWidth(value, width, "…");
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

const CASES = [
	"",
	"plain text",
	"\u001b[38;2;95;174;255m색상 한글\u001b[39m",
	"\u001b]8;;https://example.com\u0007링크 👩🏽‍💻\u001b]8;;\u0007",
	"\u001b]8;;https://example.com\u001b\\링크 e\u0301\u001b]8;;\u001b\\",
	"A👩🏽‍💻B🇰🇷C",
	"e\u0301 cafe\u0301",
	"가나다라마바사",
	"a\tb\t한글",
	"a\u0000b\u0007c",
	"a\nb",
	"\u001b[31m\u001b[0m",
	"가a",
	"길이가 매우 긴 👩🏽‍💻 문장입니다",
] as const;

test("ANSI와 grapheme 경계에서 legacy fit의 바이트 출력을 보존한다", () => {
	for (const value of CASES) {
		for (const width of [-1, 0, 1, 2, 3, 4, 5, 8, 12, 20, 40]) {
			expect(fit(value, width)).toBe(legacyFit(value, width));
		}
	}
});
