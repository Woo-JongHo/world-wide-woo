import type { TuiFeatureUnitDescriptor } from "../feature.types";

export const authenticationUnits = [
	{ id: "TUI-F014-U01", featureId: "TUI-F014", key: "provider-login", title: "Provider 로그인·인증 방식 선택", status: "active" },
	{ id: "TUI-F014-U02", featureId: "TUI-F014", key: "provider-logout", title: "Provider 인증 삭제", status: "active" },
] as const satisfies readonly TuiFeatureUnitDescriptor[];
