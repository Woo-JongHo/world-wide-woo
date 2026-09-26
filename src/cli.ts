#!/usr/bin/env bun

import { PRODUCT_VERSION } from "@/product-version"; // 배포 버전 출력
import { wwwHelpText }     from "@/adapters/inbound/cli/www-help"; // CLI 도움말 표현

import type { RunAppOptions }          from "@/app"; // Workbench 실행 옵션
import type { NativeThreadSummary }    from "@/core/domain/execution/native-session"; // Native thread 목록 항목
import type { RecentSessionSummary }   from "@/core/ports/persistence/session-repository"; // 레거시 세션 목록 항목
import type { RunLegacyRouterOptions } from "@/legacy-router-app"; // 호환 Router 실행 옵션

// GROUP     | FUNCTION                 | INPUT              | RETURN                      | CALLS                                                                                                                           | ROLE
// BOOTSTRAP | writeWorkbenchBootstrap  | write, isTTY       | void                        | -                                                                                                                               | Workbench 첫 화면 문구 출력
// BOOTSTRAP | writeRouterBootstrap     | write, isTTY       | void                        | -                                                                                                                               | Router 부팅 문구 출력
// BOOTSTRAP | writeWwwBootstrap        | write, isTTY       | stop                        | paint, setInterval, clearInterval                                                                                               | WWW 진행 애니메이션 시작
// BOOTSTRAP | paint                    | -                  | void                        | write, setInterval                                                                                                              | 진행 프레임 1장 출력
// LOAD      | loadWwwModule            | -                  | app module                  | writeWwwBootstrap                                                                                                               | App 모듈 적재
// ROUTE     | isLegacySessionId        | value              | boolean                     | -                                                                                                                               | 레거시 세션 ID 형태 판정
// ROUTE     | writeInformationalOutput | args, dependencies | boolean                     | writeOut, wwwHelpText                                                                                                           | help·version 즉시 출력
// WWW       | parseWwwOptions          | args               | options, selectResumeThread | -                                                                                                                               | WWW 호환 alias 플래그 해석
// WWW       | selectResumeThread       | dependencies       | ThreadSelection             | listNativeThreads, selectNativeThread                                                                                           | 재개 스레드 선택
// WWW       | runWwwCommand            | args, dependencies | Promise                     | parseWwwOptions, selectResumeThread, runWww                                                                                     | WWW 호환 alias 실행
// ROUTER    | runRouterCommand         | args, dependencies | Promise                     | runRouter, isLegacySessionId                                                                                                    | router 명령 실행
// SESSIONS  | writeSessions            | dependencies       | Promise                     | listSessions, writeOut                                                                                                          | 세션 목록 출력
// SESSIONS  | writeThreads             | dependencies       | Promise                     | listNativeThreads, writeOut                                                                                                     | native thread 목록 출력
// WWW       | resumeWww                | args, dependencies | Promise                     | selectResumeThread, runWww                                                                                                      | 스레드 재개
// RUN       | dispatchCommand          | args, dependencies | Promise                     | runWww, writeOut, runDevelopment, runAuth, runWorkflow, runWwwCommand, runRouterCommand, writeSessions, writeThreads, resumeWww | 명령 분기
// RUN       | runCli                   | args, dependencies | exit code                   | writeInformationalOutput, dispatchCommand, writeError                                                                           | CLI 진입점

type AppOptions      = RunAppOptions;                   // Workbench·WWW 선택 입력. 생략한 항목은 애플리케이션 기본값 사용
type RouterOptions   = RunLegacyRouterOptions;          // 호환 Router 시작 입력. 세션 미지정 시 새 세션 시작
type SessionList     = RecentSessionSummary[];          // CLI에 표시할 레거시 세션 목록
type ThreadList      = readonly NativeThreadSummary[];  // CLI가 조회한 수정 불가능한 Native thread 목록
type ThreadSelection = string | null;                   // 선택된 Native thread ID. null은 사용자 선택 취소

//  NAME               : ( PARAM   : TYPE          ) => RETURN TYPE               ; // DESCRIPTION
export interface CLIDependencies {
	// Run
	runApp             : ( options : AppOptions    ) => Promise<void>;             // 호환 Workbench 실행
	runWww             : ( options : AppOptions    ) => Promise<void>;             // 기본 WWW 실행
	runRouter          : ( options : RouterOptions ) => Promise<void>;             // Multi-provider Router 실행
	runAuth            : ( args    : string[]      ) => Promise<void>;             // 인증 명령 실행
	runDevelopment     : ( args    : string[]      ) => Promise<string>;           // 개발 기록 명령 실행
	runWorkflow        : ( args    : string[]      ) => Promise<string>;           // 로컬 Workflow 명령 실행

	// List
	listSessions       : ()                          => Promise<SessionList>;      // 레거시 세션 조회
	listNativeThreads  : ()                          => Promise<ThreadList>;       // Native thread 조회

	// Select
	selectNativeThread : ( threads : ThreadList    ) => Promise<ThreadSelection>;  // 재개할 thread 선택

	// Write
	writeOut           : ( value   : string        ) => void;                      // 표준 출력
	writeError         : ( value   : string        ) => void;                      // 오류 출력
}

/** @deprecated 새 코드에서는 `CLIDependencies`를 사용한다. */
export type CliDependencies = CLIDependencies;

//  NAME               : KIND  ( PARAMETERS      ) => { PRELUDE                      const { IMPORT NAME         } = await import("MODULE PATH                                                 "); ACTION TARGET                                    }
const productionDependencies: CLIDependencies = {
	runApp             : async (options) => { writeWorkbenchBootstrap();   const { runApp              } = await import("@/app");                                                        await  runApp(options); },
	runWww             : async (options) => {                              const { runWww            } = await loadWwwModule();                                                      await  runWww(options); },
	runRouter          : async (options) => { writeRouterBootstrap();      const { runLegacyRouter     } = await import("@/legacy-router-app");                                          await  runLegacyRouter(options); },
	runAuth            : async ( args  ) => {                              const { runAuth             } = await import("@/app");                                                        await  runAuth(args); },
	runWorkflow        : async ( args  ) => {                              const { runLocalWorkflowCli } = await import("@/adapters/outbound/development/local-workflow-cli");           return runLocalWorkflowCli(args, process.cwd()); },
	runDevelopment     : async ( args  ) => {                              const { runDevelopmentCli   } = await import("@/adapters/outbound/development/development-cli");              return runDevelopmentCli(args); },
	listSessions       : async ()        => {                              const { listSessions        } = await import("@/app");                                                        return listSessions(); },
	listNativeThreads  : async ()        => {                              const { listNativeThreads   } = await import("@/app");                                                        return listNativeThreads(); },
	selectNativeThread : async (threads) => {                              const { selectNativeThread  } = await import("@/adapters/inbound/tui/features/session/view/native-thread-picker"); return selectNativeThread(threads, "www"); },
	writeOut           : ( value ) => console.log   (value),
	writeError         : ( value ) => console.error (value),
};

export function writeWorkbenchBootstrap(                                                                                                         // 첫 화면을 먼저 보여준 뒤 App Server와 TUI 모듈을 불러온다.
	write : (value: string) => void = value => process.stdout.write(value),
	isTTY : boolean                 = process.stdout.isTTY,
): void {
	if (!isTTY) return;
	write(`\r\x1b[2K🐙 Wooni v${PRODUCT_VERSION} · 프로젝트 Workbench를 여는 중…\n`);
}

export function writeRouterBootstrap(
	write : (value: string) => void = value => process.stdout.write(value),
	isTTY : boolean                 = process.stdout.isTTY,
): void {
	if (!isTTY) return;
	write("\r\x1b[2K🐙 Wooni · 호환 Multi-provider Router를 여는 중…\n");
}

export function writeWwwBootstrap(
	write : (value: string) => void = value => process.stdout.write(value),
	isTTY : boolean                 = process.stdout.isTTY,
): () => void {
	if (!isTTY) return () => {};
	let frame = 0;
	const paint = () => {
		const position = frame++ % 13;
		write(`\r\x1b[2Kwww v${PRODUCT_VERSION} [${"░".repeat(position)}███${"░".repeat(12 - position)}]`);
	};
	paint();
	const timer = setInterval(paint, 80);
	timer.unref();
	return () => {
		clearInterval(timer);
		write("\r\x1b[2K");
	};
}

async function loadWwwModule(): Promise<typeof import("@/app")> {
	const stop = writeWwwBootstrap();
	try {
		return await import("@/app");
	} finally {
		stop();
	}
}

function isLegacySessionId(value: string): boolean {
	return /^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(value);
}

function writeInformationalOutput(
	args         : string[],
	dependencies : CLIDependencies,
): boolean {
	if (args[0] !== "development" && (args.includes("--help") || args.includes("-h"))) {
		dependencies.writeOut(wwwHelpText());
		return true;
	}

	if (args[0] !== "development" && (args.includes("--version") || args.includes("-v"))) {
		dependencies.writeOut(PRODUCT_VERSION);
		return true;
	}

	return false;
}

function parseWwwOptions(args: string[]): { options: AppOptions; selectResumeThread: boolean } {
	const options : AppOptions  = {};
	const seen    : Set<string> = new Set<string>();

	let selectResumeThread = false;

	for (let index = 1; index < args.length; index += 1) {
		const flag  = args[index];
		const value = args[index + 1];

		if (flag === undefined) break;

		if (seen.has(flag)) {
			throw new Error(`중복 옵션: ${flag}`);
		}

		seen.add(flag);

		if (flag === "--resume") {
			selectResumeThread = true;

			if (value && !value.startsWith("--")) {
				options.resumeThreadId = value;
				index += 1;
			}
		} else if (flag === "--execution-lane" && (value === "pi" || value === "codex")) {
			options.executionLane = value;
			index += 1;
		} else if (flag === "--runtime-config" && value && !value.startsWith("--")) {
			options.runtimeConfig = value;
			index += 1;
		} else {
			throw new Error("사용법: www [--resume [id]] [--execution-lane codex|pi] [--runtime-config <json>]");
		}
	}

	return { options, selectResumeThread: selectResumeThread && !options.resumeThreadId };
}

async function selectResumeThread(dependencies: CLIDependencies): Promise<ThreadSelection> {
	const threads = await dependencies.listNativeThreads();

	if (!threads.length) {
		throw new Error("현재 프로젝트에서 재개할 Codex native thread가 없습니다.");
	}

	return dependencies.selectNativeThread(threads);
}

async function runWwwCommand(
	args         : string[],
	dependencies : CLIDependencies,
): Promise<void> {
	const parsed = parseWwwOptions(args);

	if (parsed.selectResumeThread) {
		const resumeThreadId = await selectResumeThread(dependencies);

		if (!resumeThreadId) return;
		parsed.options.resumeThreadId = resumeThreadId;
	}

	await dependencies.runWww(parsed.options);
}

async function runRouterCommand(
	args         : string[],
	dependencies : CLIDependencies,
): Promise<void> {
	if (args.length === 1) {
		await dependencies.runRouter({});
		return;
	}

	const resumeSessionId = args[2];

	if (args.length === 3
		&& args[1] === "--resume"
		&& resumeSessionId !== undefined
		&& isLegacySessionId(resumeSessionId)) {
		await dependencies.runRouter({ resumeSessionId });
		return;
	}

	throw new Error("사용법: www router [--resume <session-id>]");
}

async function writeSessions(dependencies: CLIDependencies): Promise<void> {
	const sessions = await dependencies.listSessions();

	if (sessions.length === 0) {
		dependencies.writeOut("저장된 세션이 없습니다.");
	}

	for (const session of sessions) {
		dependencies.writeOut(`${session.id}  ${new Date(session.updatedAt).toLocaleString("ko-KR")}`);
	}
}

async function writeThreads(dependencies: CLIDependencies): Promise<void> {
	const threads = await dependencies.listNativeThreads();

	if (threads.length === 0) {
		dependencies.writeOut("현재 프로젝트의 Codex native thread가 없습니다.");
	}

	for (const thread of threads) {
		const updatedAt : string = new Date(thread.updatedAt * 1_000).toLocaleString("ko-KR");
		const preview   : string = thread.preview.replace(/\s+/gu, " ").trim() || "(미리보기 없음)";

		dependencies.writeOut(`${thread.id}  ${thread.status}  ${updatedAt}  ${preview}`);
	}
}

async function resumeWww(
	args         : string[],
	dependencies : CLIDependencies,
): Promise<void> {
	const threadId = args[1] || await selectResumeThread(dependencies);

	if (threadId) {
		await dependencies.runWww({ resumeThreadId: threadId });
	}
}

async function dispatchCommand(
	args         : string[],
	dependencies : CLIDependencies,
): Promise<void> {
	const command = args[0];

	if (!command) {
		await dependencies.runWww({});
		return;
	}

	if (command === "--execution-lane" && args.length === 2 && (args[1] === "pi" || args[1] === "codex")) {
		await dependencies.runWww({ executionLane: args[1] });
		return;
	}
	if (command === "--runtime-config") {
		await runWwwCommand(["www", ...args], dependencies);
		return;
	}

	switch (command) {
	case "development" : dependencies.writeOut     (await dependencies.runDevelopment(args.slice(1))); return;
	case "auth"        : await dependencies.runAuth(args.slice(1));                                    return;
	case "workflow"    : dependencies.writeOut     (await dependencies.runWorkflow   (args.slice(1))); return;
	case "astra"       : await runWwwCommand       (args, dependencies);                               return;
	case "router"      : await runRouterCommand    (args, dependencies);                               return;
	case "sessions"    : await writeSessions       (dependencies);                                     return;
	case "threads"     : await writeThreads        (dependencies);                                     return;
	case "--resume"    : await resumeWww           (args, dependencies);                               return;
	default             : throw new Error(`알 수 없는 명령입니다: ${args.join(" ")}`);
	}
}

export async function runCli(
	args         : string[],
	dependencies : CLIDependencies = productionDependencies,
): Promise<number> {
	if (writeInformationalOutput(args, dependencies)) return 0;

	try {
		await dispatchCommand(args, dependencies);
		return 0;
	} catch (error) {
		dependencies.writeError(error instanceof Error ? error.message : String(error));
		return 1;
	}
}

if (import.meta.main) {
	process.exitCode = await runCli(process.argv.slice(2));
}
