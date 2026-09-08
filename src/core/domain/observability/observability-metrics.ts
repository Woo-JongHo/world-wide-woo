export function observedElapsedMs(startedAt: string | null, endedAt: string | null): number | null {
	if (!startedAt || !endedAt) return null;
	const start = Date.parse(startedAt);
	const end = Date.parse(endedAt);
	return Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : null;
}

export function observedCompletionPercent(completed: number, total: number): number | null {
	if (!Number.isSafeInteger(completed) || !Number.isSafeInteger(total) || completed < 0 || total <= 0 || completed > total) return null;
	return Math.round((completed / total) * 10_000) / 100;
}

export function sumAttributedTokens(values: readonly number[]): number | null {
	if (values.length === 0) return null;
	if (values.some(value => !Number.isSafeInteger(value) || value < 0)) return null;
	return values.reduce((total, value) => total + value, 0);
}
