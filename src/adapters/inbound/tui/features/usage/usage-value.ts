/** Fixed-width percentage text; no bar glyphs, blocks, or punctuation meter. */
export function usagePercent(percent: number | undefined): string {
	const label = percent === undefined || !Number.isFinite(percent)
		? "–"
		: `${Math.round(Math.max(0, Math.min(100, percent)))}%`;
	return label.padStart(4, " ");
}

export function compactTokenCount(tokens: number): string {
	if (!Number.isFinite(tokens) || tokens <= 0) return "0";
	if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens >= 10_000_000 ? 0 : 1)}m`;
	if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(tokens >= 100_000 ? 0 : 1)}k`;
	return Math.round(tokens).toString();
}
