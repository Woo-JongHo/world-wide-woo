/** 언어 무관 순수 유틸. tab은 4칸 정지, 한글·한자·가나는 2칸으로 화면 표시 폭을 계산한다. */
export function displayWidth(value: string): number {
	let width = 0;
	for (const character of value) {
		if (character === "\t") {
			width += 4 - width % 4;
		} else if (/[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(character)) {
			width += 2;
		} else {
			width += 1;
		}
	}
	return width;
}
