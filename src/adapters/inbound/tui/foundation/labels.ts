export type WorkbenchDisplayMode = "bypass mode" | "manual mode" | "plan mode";

/** One user-facing mode label shared by the frame and the bottom HUD. */
export function runtimeModeLabel(
	permissionMode?: "manual" | "all",
	collaborationMode?: "manual" | "plan",
): WorkbenchDisplayMode {
	if (permissionMode === "all") return "bypass mode";
	return collaborationMode === "plan" ? "plan mode" : "manual mode";
}

/** Human-readable model identity; the stored provider/model id remains unchanged. */
export function workbenchModelLabel(model: string | undefined): string {
	if (!model) return "–";
	const normalized = model.trim()                                                                                          ;
	const title      = (value: string): string => value ? `${value[0].toUpperCase()}${value.slice(1).toLowerCase()}` : value ;
	const gpt        = /^gpt-(.+)$/iu.exec(normalized)                                                                       ;
	if (gpt) return `GPT-${gpt[1].split("-").map(title).join("-")}`;
	const claude = /^claude-(.+)$/iu.exec(normalized);
	if (claude) {
		const parts = claude[1].split("-");
		const family = title(parts.shift() ?? "");
		const version = parts.length >= 2 && parts.every(part => /^\d+$/u.test(part))
			? ` ${parts.join(".")}`
			: parts.length ? ` ${parts.map(title).join(" ")}` : "";
		return `Claude ${family}${version}`;
	}
	const glm = /^glm-(.+)$/iu.exec(normalized);
	if (glm) return `GLM-${glm[1].split("-").map(title).join("-")}`;
	return normalized.split(/[-_]/u).map(title).join(" ");
}

const EFFORT_LABELS: Readonly<Record<string, string>> = {
	low    : "Low",
	medium : "Middle",
	high   : "High",
	xhigh  : "xHigh",
	max    : "Max",
	ultra  : "Ultra",
};

/** Stable product copy for reasoning effort; protocol values remain lowercase. */
export function workbenchEffortLabel(effort: string | null | undefined): string {
	if (!effort) return "–";
	return EFFORT_LABELS[effort.toLowerCase()] ?? effort;
}
