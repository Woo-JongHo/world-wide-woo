// Shared golden comparison for the function paragraph rollout: same input, same output, or exit 1.
export interface GoldenCase { readonly label: string; readonly before: () => unknown; readonly after: () => unknown }

export function runGolden(name: string, cases: readonly GoldenCase[]): void {
	const differences: string[] = [];
	let   throwing                = 0 ;
	for (const entry of cases) {
		const before = settle(entry.before), after = settle(entry.after);
		if (before.startsWith("THROWS ")) throwing++;
		if (before !== after) differences.push(`${entry.label}\n    before ${before.slice(0, 300)}\n    after  ${after.slice(0, 300)}`);
	}
	console.log(`golden ${name}: ${cases.length} cases, ${differences.length} differences, ${throwing} cases throw in both`);
	for (const difference of differences.slice(0, 5)) console.log(`  ${difference}`);
	// A comparison where the old version always throws proves nothing about the rendered output.
	if (differences.length || throwing === cases.length) process.exit(1);
}

/** Serializes a result or the thrown error, so a changed exception is also a difference. */
function settle(run: () => unknown): string {
	try { return JSON.stringify(run()) ?? "undefined"; } catch (error) { return `THROWS ${error instanceof Error ? error.message : String(error)}`; }
}

/** Every combination of the given widths with each input. */
export function across<T>(inputs: readonly T[], widths: readonly number[]): { readonly input: T; readonly width: number; readonly label: string }[] {
	return inputs.flatMap((input, index) => widths.map(width => ({ input, width, label: `#${index} width=${width}` })));
}
