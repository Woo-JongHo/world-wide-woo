export type TuiFeatureId =
	| "TUI-F001" | "TUI-F002" | "TUI-F003" | "TUI-F004"
	| "TUI-F005" | "TUI-F006" | "TUI-F007" | "TUI-F008"
	| "TUI-F009" | "TUI-F010" | "TUI-F011" | "TUI-F012"
	| "TUI-F013" | "TUI-F014" | "TUI-F015" | "TUI-F016" | "TUI-F017" | "TUI-F018";

type DecimalDigit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

export type TuiFeatureUnitId = `${TuiFeatureId}-U${DecimalDigit}${DecimalDigit}`;

export type TuiFeatureKind = "page" | "embedded" | "interaction";

/** Product capability classification. It does not determine a feature's physical folder or TUI kind. */
export type TuiFeatureProductGroup = "core-work" | "observability" | "control" | "integration";

export type TuiFeatureStatus = "active" | "retired";

export type TuiFeatureUnitStatus = "active" | "legacy" | "unwired" | "retired";

export interface TuiFeatureUnitDescriptor {
	readonly id        : TuiFeatureUnitId     ;
	readonly featureId : TuiFeatureId         ;
	readonly key       : string               ;
	readonly title     : string               ;
	readonly status    : TuiFeatureUnitStatus ;
}

export interface TuiFeatureDescriptor {
	readonly id    : TuiFeatureId ;
	readonly key   : string       ;
	readonly title : string       ;
	/** Display sequence only; equal values are permitted and resolve by stable feature key. */
	readonly order  : number                              ;
	/** TUI display and interaction shape, independent from product capability classification. */
	readonly kind         : TuiFeatureKind                      ;
	readonly productGroup : TuiFeatureProductGroup              ;
	readonly route?       : string                              ;
	readonly status       : TuiFeatureStatus                    ;
	readonly units        : readonly TuiFeatureUnitDescriptor[] ;
}
