import type { TuiFeatureUnitDescriptor } from "@/adapters/inbound/tui/features/feature.types";

export const usageUnits = [
	{ id: "TUI-F009-U01", featureId: "TUI-F009", key: "provider-quota-context-hud", title: "Provider 잔여량·Context HUD", status: "active" },
	{ id: "TUI-F009-U02", featureId: "TUI-F009", key: "usage-dashboard", title: "Provider·Session Usage Dashboard", status: "active" },
] as const satisfies readonly TuiFeatureUnitDescriptor[];
