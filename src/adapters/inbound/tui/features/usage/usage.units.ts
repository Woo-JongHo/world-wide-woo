import type { TuiFeatureUnitDescriptor } from "../feature.types";

export const usageUnits = [
	{ id: "TUI-F009-U01", featureId: "TUI-F009", key: "provider-quota-context-hud", title: "Provider 잔여량·Context HUD", status: "active" },
] as const satisfies readonly TuiFeatureUnitDescriptor[];
