#!/usr/bin/env bun

import type { RunAppOptions } from "./app";
import type { NativeThreadSummary } from "./domain/native-session";
import { PRODUCT_VERSION } from "./product-version";

export interface CliDependencies {
	runApp: (options?: RunAppOptions) => Promise<void>;
	runAuth: (args: string[]) => Promise<void>;
	listSessions: () => Promise<Array<{ id: string; updatedAt: string }>>;
	listNativeThreads: () => Promise<readonly NativeThreadSummary[]>;
	selectNativeThread: (threads: readonly NativeThreadSummary[]) => Promise<string | null>;
	writeOut: (value: string) => void;
	writeError: (value: string) => void;
}

const productionDependencies: CliDependencies = {
	runApp: async (options) => {
		writeWorkbenchBootstrap();
		const { runApp } = await import("./app");
		await runApp(options);
	},
	runAuth: async (args) => {
		const { runAuth } = await import("./app");
		await runAuth(args);
	},
	listSessions: async () => {
		const { listSessions } = await import("./app");
		return listSessions();
	},
	listNativeThreads: async () => {
		const { listNativeThreads } = await import("./app");
		return listNativeThreads();
	},
	selectNativeThread: async (threads) => {
		const { selectNativeThread } = await import("./presentation/tui/native-thread-picker");
		return selectNativeThread(threads);
	},
	writeOut: value => console.log(value),
	writeError: value => console.error(value),
};

/** First paint stays dependency-free; App Server and TUI modules load after this line is visible. */
export function writeWorkbenchBootstrap(
	write: (value: string) => void = value => process.stdout.write(value),
	isTTY = process.stdout.isTTY,
): void {
	if (!isTTY) return;
	write("\r\x1b[2Kbori · 프로젝트 Workbench를 여는 중…\n");
}

function helpText(): string {
	return [
		"사용법:",
		"  www                         새 Codex native 3-pane Workbench 실행",
		"  www auth status             모델 인증 상태 확인",
		"  www auth login <공급자> [oauth|api-key]",
		"                              구독 계정 또는 API 키 로그인",
		"  www auth logout <공급자>    저장된 인증 삭제",
		"  www sessions                 레거시 SessionRuntime 세션 목록",
		"  www threads                  현재 프로젝트의 Codex native thread 목록",
		"  www --resume                현재 프로젝트의 native thread를 선택해 재개",
		"  www --resume <native-thread-id>  지정한 native thread 바로 재개",
		"",
		"Workbench 명령:",
		"  /model [모델] [추론 강도]  현재·다음 실행의 Codex 모델 변경",
		"  /source <id|latest|clear>  Trace source 선택",
		"  /tnote  마지막 질문을 packet-only 질문·이유·결과로 수동 캡처",
		"  /approve · /approve-session · /decline  Codex native 승인 응답",
		"  /cancel  현재 native turn 중단",
		"  /exit  Workbench를 안전하게 종료",
	].join("\n");
}

export async function runCli(args: string[], dependencies: CliDependencies = productionDependencies): Promise<number> {
	if (args.includes("--help") || args.includes("-h")) {
		dependencies.writeOut(helpText());
		return 0;
	}
	if (args.includes("--version") || args.includes("-v")) {
		dependencies.writeOut(PRODUCT_VERSION);
		return 0;
	}
	try {
		if (args[0] === "auth") await dependencies.runAuth(args.slice(1));
		else if (args[0] === "sessions") {
			const sessions = await dependencies.listSessions();
			if (sessions.length === 0) dependencies.writeOut("저장된 세션이 없습니다.");
			for (const session of sessions) {
				dependencies.writeOut(`${session.id}  ${new Date(session.updatedAt).toLocaleString("ko-KR")}`);
			}
		}
		else if (args[0] === "threads") {
			const threads = await dependencies.listNativeThreads();
			if (threads.length === 0) dependencies.writeOut("현재 프로젝트의 Codex native thread가 없습니다.");
			for (const thread of threads) {
				const updatedAt = new Date(thread.updatedAt * 1_000).toLocaleString("ko-KR");
				const preview = thread.preview.replace(/\s+/gu, " ").trim() || "(미리보기 없음)";
				dependencies.writeOut(`${thread.id}  ${thread.status}  ${updatedAt}  ${preview}`);
			}
		}
		else if (args[0] === "--resume") {
			let threadId: string | undefined = args[1];
			if (!threadId) {
				const threads = await dependencies.listNativeThreads();
				if (threads.length === 0) throw new Error("현재 프로젝트에서 재개할 Codex native thread가 없습니다.");
				threadId = await dependencies.selectNativeThread(threads) ?? undefined;
			}
			if (threadId) await dependencies.runApp({ resumeThreadId: threadId });
		}
		else if (args.length === 0) await dependencies.runApp({});
		else throw new Error(`알 수 없는 명령입니다: ${args.join(" ")}`);
		return 0;
	} catch (error) {
		dependencies.writeError(error instanceof Error ? error.message : String(error));
		return 1;
	}
}

if (import.meta.main) process.exitCode = await runCli(process.argv.slice(2));
