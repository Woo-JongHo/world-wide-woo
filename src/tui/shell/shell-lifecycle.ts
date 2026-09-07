export async function settleWithin(operation: Promise<unknown>, timeoutMs: number): Promise<boolean> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<false>((resolve) => {
		timer = setTimeout(() => resolve(false), timeoutMs);
	});
	const completed = operation.then(() => true as const, () => true as const);
	const result = await Promise.race([completed, timeout]);
	if (timer) clearTimeout(timer);
	return result;
}
