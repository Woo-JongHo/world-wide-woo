import { wrapTextWithAnsi } from "@earendil-works/pi-tui";
import {
	projectBackgroundWorkState,
	type BackgroundWorkState,
	type NativeApprovalRequest,
} from "../../../../../core/domain/execution/native-session";
import { sanitizeTerminalTextExcerpt } from "../../../../../core/domain/execution/terminal";
import { workbenchApprovalDecisions, type WorkbenchSnapshot } from "../../../../../core/domain/work/workbench";
import { colors } from "../../foundation/theme/theme";

const APPROVAL_DETAIL_MAX_CHARS = 200;

export function approvalKindLabel(kind: NativeApprovalRequest["kind"]): string {
	if (kind === "command") return "명령";
	if (kind === "file-change") return "파일 변경";
	return "권한";
}

export function approvalParamText(request: NativeApprovalRequest, key: string): string | null {
	const value = request.params[key];
	if (typeof value !== "string" || !value.trim()) return null;
	return sanitizeTerminalTextExcerpt(value, APPROVAL_DETAIL_MAX_CHARS, "head-tail")
		.replace(/\t/gu, "    ")
		.trim();
}

export function approvalFallback(request: NativeApprovalRequest): string {
	if (request.kind === "command") return "명령 실행에 승인이 필요합니다.";
	if (request.kind === "file-change") return "파일 변경에 승인이 필요합니다.";
	return "추가 권한이 필요합니다.";
}

export function approvalDetailLabel(request: NativeApprovalRequest): string {
	if (request.kind === "command") return "명령";
	if (request.kind === "file-change") return "변경";
	return "권한";
}

function approvalInstruction(request: NativeApprovalRequest): string {
	return workbenchApprovalDecisions(request).length > 0
		? "승인 선택 화면 · ↑↓ 또는 숫자로 선택 · Enter 결정"
		: "이 요청은 결정 선택지를 제공하지 않습니다. /cancel 로 중단하세요.";
}

export function approvalCardRows(
	request: NativeApprovalRequest,
	queueDepth: number,
	background: BackgroundWorkState,
	width: number,
): string[] {
	const command = approvalParamText(request, "command");
	const reason = approvalParamText(request, "reason");
	const cwd = approvalParamText(request, "cwd");
	return [
		colors.warning(`승인 필요 · ${approvalKindLabel(request.kind)}`),
		`${colors.accent(approvalDetailLabel(request))} · ${command ?? approvalFallback(request)}`,
		`${colors.accent("이유")} · ${reason ?? approvalFallback(request)}`,
		...(cwd ? [`${colors.accent("경로")} · ${cwd}`] : []),
		colors.muted(approvalInstruction(request)),
		colors.warning("승인할까요? 현재 턴은 Input 답변을 기다립니다."),
		colors.muted(`백그라운드 작업 · ${background}`),
		...(queueDepth > 0 ? [colors.muted(`대기 메시지 ${queueDepth}개 · 승인 후 순서대로 전송`)] : []),
	].flatMap(row => wrapTextWithAnsi(row, Math.max(1, width)));
}

export function projectApprovalBackgroundState(activities: WorkbenchSnapshot["activities"]): BackgroundWorkState {
	return projectBackgroundWorkState(activities.flatMap((activity) => {
		const params = activity.payload.params;
		if (!params || typeof params !== "object" || Array.isArray(params)) return [];
		const item = (params as Readonly<Record<string, unknown>>).item;
		return item && typeof item === "object" && !Array.isArray(item) ? [item] : [];
	}));
}
