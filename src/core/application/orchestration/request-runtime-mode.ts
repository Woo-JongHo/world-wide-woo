export type RequestRuntimeMode = "off" | "observe" | "broker";

export interface RequestRuntimePolicyOptions {
	readonly mode?                  : RequestRuntimeMode ;
	readonly capabilitiesConfigured : boolean            ;
	readonly resuming               : boolean            ;
}

/**
 * Owns the mode selection rules shared by request queueing, Native dispatch,
 * Runtime tools, and projections. A goal promotes only that request from off
 * to observational Runtime; it never grants brokered capabilities.
 */
export class RequestRuntimePolicy {
	public readonly mode: RequestRuntimeMode;

	public constructor(private readonly options: RequestRuntimePolicyOptions) {
		this.mode = options.mode ?? (options.capabilitiesConfigured ? "broker" : "observe");
		if (this.mode === "broker" && !options.capabilitiesConfigured) {
			throw new Error("Brokered Runtime requires explicit request capabilities.");
		}
		if (this.mode !== "broker" && options.capabilitiesConfigured) {
			throw new Error("Request capabilities require brokered Runtime mode.");
		}
	}

	public get brokered(): boolean {
		return this.mode === "broker";
	}

	public modeForRequest(goal: boolean): RequestRuntimeMode {
		return this.mode === "off" && goal ? "observe" : this.mode;
	}

	public manages(goal: boolean): boolean {
		return this.modeForRequest(goal) !== "off";
	}

	/** A resumed v1 thread cannot be silently upgraded to the v2 protocol. */
	public protocolVersion(hasBrokeredHistory: boolean): 1 | 2 {
		return this.brokered && (!this.options.resuming || hasBrokeredHistory) ? 2 : 1;
	}
}
