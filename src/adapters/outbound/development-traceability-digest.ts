import { createHash } from "node:crypto";
import type { TraceabilityLedger } from "../../core/domain/development-traceability.js";

export function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value && typeof value === "object") {
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

export function digestLedger(ledger: Omit<TraceabilityLedger, "payloadDigest"> | TraceabilityLedger): string {
	const { payloadDigest: _ignored, ...payload } = ledger as TraceabilityLedger;
	return createHash("sha256").update(stableJson(payload)).digest("hex");
}
