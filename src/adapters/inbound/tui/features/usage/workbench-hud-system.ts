/**
 * Stable visual contract for the workbench HUD. The composer owns the active
 * model tab; the bottom strip owns runtime mode and measured provider/context
 * telemetry. Keep this independent from provider adapters so the UI remains
 * comparable while credentials change.
 */
export const WORKBENCH_HUD_SYSTEM = Object.freeze({
	composer: Object.freeze({ leftCap: "╭─", divider: "─" }),
	strip: Object.freeze({ separator: " │ ", modeMarker: "●", meterCells: 12 }),
	providers: Object.freeze(["Codex", "Claude", "Gemini", "Z.AI"] as const),
});

export function compactTokenCount(value: number): string {
	if (!Number.isFinite(value) || value < 0) return "—";
	if (value < 1_000) return String(Math.round(value));
	if (value < 1_000_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1).replace(/\.0$/u, "")}k`;
	return `${(value / 1_000_000).toFixed(1).replace(/\.0$/u, "")}m`;
}
