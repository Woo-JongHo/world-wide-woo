interface AlignmentFixture {
	first: string;
	second: readonly string[];
	third: string | undefined;
	/** JSDoc으로 끊긴 행은 별도 의미 단위라 같은 표로 묶지 않는다. */
	fourth: number;
}

class AlignmentClass {
	readonly one: string;
	private readonly two: number;
	three: boolean;
}

const alpha: string = "a";
const beta: number = 2;
const gamma: boolean = true;

const pairOnlyOne: string = "x";
const pairOnlyTwo: string = "y";

type Conditional = string extends string ? "yes" : "no";

function exclusions(value: Conditional): string[] {
	const kept: string[] = [];
	for (let index = 0; index < 3; index += 1) kept.push(value);
	;
	const run = (item: string) => { const inner: string = item; return inner; };
	return [run("a"), run("b"), run("c")];
}

const rows = [
	{ heading: "SOURCE", minWidth: 7, weight: 0 },
	{ heading: "DISTRIBUTION", minWidth: 4, weight: 1 },
	{ heading: "SIZE", minWidth: 6, weight: 0 },
];
