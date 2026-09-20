#!/usr/bin/env bun

import      { PRODUCT_VERSION }         from "@/product-version";                                                                                // 배포 버전 출력

import type { RunAppOptions }           from "@/app";                                                                                            // Workbench 실행 옵션
import type { NativeThreadSummary }     from "@/core/domain/execution/native-session";                                                           // Native thread 목록 항목
import type { RecentSessionSummary }    from "@/core/ports";                                                                                     // 레거시 세션 목록 항목
import type { RunLegacyRouterOptions }  from "@/legacy-router-app";                                                                              // 호환 Router 실행 옵션

/** Workbench와 Astra를 시작할 때 사용하는 선택 입력이다. 생략한 항목은 애플리케이션 기본값을 사용한다. */
type AppOptions = RunAppOptions;

/** 호환 Router 시작 입력이다. 재개할 세션을 지정하지 않으면 새 세션을 시작한다. */
type RouterOptions = RunLegacyRouterOptions;

/** CLI에 표시할 레거시 세션 목록이다. */
type SessionList = RecentSessionSummary[];

/** CLI가 조회한 Native thread의 수정 불가능한 목록이다. */
type ThreadList = readonly NativeThreadSummary[];

/** 선택된 Native thread ID다. null은 사용자가 선택을 취소했다는 뜻이다. */
type ThreadSelection = string | null;

//  NAME               : ( PARAM   : TYPE          ) => RETURN TYPE               ; // DESCRIPTION
export interface CliDependencies {
	// Run
	runApp             : ( options : AppOptions    ) => Promise< void            >; // 호환 Workbench 실행
	runAstra           : ( options : AppOptions    ) => Promise< void            >; // 기본 Astra 실행
	runRouter          : ( options : RouterOptions ) => Promise< void            >; // Multi-provider Router 실행
	runAuth            : ( args    : string[]      ) => Promise< void            >; // 인증 명령 실행
	runDevelopment     : ( args    : string[]      ) => Promise< string          >; // 개발 기록 명령 실행
	runWorkflow        : ( args    : string[]      ) => Promise< string          >; // 로컬 Workflow 명령 실행

	// List
	listSessions       : ()                          => Promise< SessionList     >; // 레거시 세션 조회
	listNativeThreads  : ()                          => Promise< ThreadList      >; // Native thread 조회

	// Select
	selectNativeThread : ( threads : ThreadList    ) => Promise< ThreadSelection >; // 재개할 thread 선택

	// Write
	writeOut           : ( value   : string        ) => void                      ; // 표준 출력
	writeError         : ( value   : string        ) => void                      ; // 오류 출력
}

//  NAME               : KIND  ( PARAMETERS      ) => { PRELUDE                      const { IMPORT NAME         } = await import("MODULE PATH                                                 "); ACTION TARGET                                    }
const productionDependencies: CliDependencies = {
	runApp             : async ( options         ) => { writeWorkbenchBootstrap();   const { runApp              } = await import("@/app");                                                        await  runApp(options);                          },
	runAstra           : async ( options         ) => { writeAstraBootstrap();       const { runAstra            } = await import("@/app");                                                        await  runAstra(options);                        },
	runRouter          : async ( options         ) => { writeRouterBootstrap();      const { runLegacyRouter     } = await import("@/legacy-router-app");                                          await  runLegacyRouter(options);                 },
	runAuth            : async ( args            ) => {                              const { runAuth             } = await import("@/app");                                                        await  runAuth(args);                            },
	runWorkflow        : async ( args            ) => {                              const { runLocalWorkflowCli } = await import("@/adapters/outbound/development/local-workflow-cli");           return runLocalWorkflowCli(args, process.cwd()); },
	runDevelopment     : async ( args            ) => {                              const { runDevelopmentCli   } = await import("@/adapters/outbound/development/development-cli");              return runDevelopmentCli(args);                  },
	listSessions       : async (                 ) => {                              const { listSessions        } = await import("@/app");                                                        return listSessions();                           },
	listNativeThreads  : async (                 ) => {                              const { listNativeThreads   } = await import("@/app");                                                        return listNativeThreads();                      },
	selectNativeThread : async ( threads         ) => {                              const { selectNativeThread  } = await import("@/adapters/inbound/tui/features/session/native-thread-picker"); return selectNativeThread(threads, "astra");    },
	writeOut           :       ( value           ) => console.log   (value),
	writeError         :       ( value           ) => console.error (value),
};

export function writeWorkbenchBootstrap(                                                                                                         // 첫 화면을 먼저 보여준 뒤 App Server와 TUI 모듈을 불러온다.
	write : (value: string) => void = value => process.stdout.write(value),
	isTTY : boolean                 = process.stdout.isTTY,
): void {
	if (!isTTY) return;
	write("\r\x1b[2K🐙 Wooni · 프로젝트 Workbench를 여는 중…\n");
}

export function writeRouterBootstrap(
	write : (value: string) => void = value => process.stdout.write(value),
	isTTY : boolean                 = process.stdout.isTTY,
): void {
	if (!isTTY) return;
	write("\r\x1b[2K🐙 Wooni · 호환 Multi-provider Router를 여는 중…\n");
}

export function writeAstraBootstrap(
	write : (value: string) => void = value => process.stdout.write(value),
	isTTY : boolean                 = process.stdout.isTTY,
): void {
	if (!isTTY) return;
	write("\r\x1b[2Kastra / Execution Console을 여는 중…\n");
}

function helpText(): string {
	const row = (command: string, description = ""): string => {
		const commandWidth : number = [...command].reduce(
			(width, character) => width + (/\p{Script=Hangul}/u.test(character) ? 2 : 1),
			0,
		);
		const padding      : string = " ".repeat(Math.max(1, 48 - commandWidth));

		return `  ${command}${padding}${description}`.trimEnd();
	};

	return [
		"사용법:",
		row("www",                                               "Astra Execution Console · F2–F8 화면 · Ctrl+P 명령"),
		row("www astra [--resume [id]]",                         "Astra Execution Console · F2–F8 화면 · Ctrl+P 명령"),
		row("www astra --runtime-config <json>",                 "7-Stage brokered 실행 · 파일/게시 범위 지정 · 격리 미검증"),
		row("www --execution-lane pi",                           "실험적 내장 Pi text lane으로 Astra 실행"),
		row("www router",                                        "호환 Claude·Gemini·OpenAI·Z.AI Router 실행"),
		row("",                                                  "Native 승인·Sandbox·Skill은 제공하지 않음"),
		row("www router --resume <session-id>",                  "기존 Router 세션 재개"),
		row("www auth status",                                   "모델 인증 상태 확인"),
		row("www auth login <공급자> [oauth|api-key]",           "구독 계정 또는 API 키 로그인"),
		row("www auth logout <공급자>",                          "저장된 인증 삭제"),
		row("www workflow check <RPA-ID>",                       "로컬 참조 사전 검사 (원격 미검증)"),
		row("www workflow show|resume <Run-ID>",                 "결과 조회·중단 검사 재개"),
		row("www development help",                              "Issue·Unit·SQLite·Obsidian 개발 기록 명령"),
		row("www sessions",                                      "레거시 SessionRuntime 세션 목록"),
		row("www threads",                                       "현재 프로젝트의 Codex native thread 목록"),
		row("www --resume",                                      "현재 프로젝트의 native thread를 선택해 재개"),
		row("www --resume <native-thread-id>",                   "지정한 native thread 바로 재개"),
		"",
		"Astra Execution Console 명령:",
		row("/stats · /dashboard · /monitor",                    "Observability View 직접 열기"),
		row("r/R · 1/2/3 · Esc",                                 "View 회전·직접 이동·Workbench 복귀"),
		row("/model [모델] [추론 강도]",                         "현재·다음 실행의 Codex 모델 변경"),
		row("/source <id|latest|clear>",                         "Trace source 선택"),
		row("/trace <activity-id>",                              "선택 Plan에 결속된 정확한 Activity Trace 선택"),
		row("/tnote",                                            "마지막 질문을 packet-only 종료 보고서로 수동 캡처"),
		row("/approve · /approve-session · /decline",            "Codex native 승인 응답"),
		row("/cancel",                                           "현재 native turn 중단"),
		row("/exit",                                             "Workbench를 안전하게 종료"),
		"",
		"호환 Router 명령:",
		row("/login [provider]",                                 "OAuth 또는 API 키 연결"),
		row("/model [provider/model] [low|medium|high|ultra]",   "Claude·Gemini·OpenAI·Z.AI 모델 변경"),
		row("/logout <provider>",                                "저장된 인증 삭제"),
		row("/usage",                                            "Codex·Claude 사용량 갱신"),
	].join("\n");
}

function isLegacySessionId(value: string): boolean {
	return /^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(value);
}

function writeInformationalOutput(
	args         : string[],
	dependencies : CliDependencies,
): boolean {
	if (args[0] !== "development" && (args.includes("--help") || args.includes("-h"))) {
		dependencies.writeOut(helpText());
		return true;
	}

	if (args[0] !== "development" && (args.includes("--version") || args.includes("-v"))) {
		dependencies.writeOut(PRODUCT_VERSION);
		return true;
	}

	return false;
}

function parseAstraOptions(args: string[]): { options: AppOptions; selectResumeThread: boolean } {
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
			throw new Error("사용법: www astra [--resume [id]] [--execution-lane codex|pi] [--runtime-config <json>]");
		}
	}

	return { options, selectResumeThread: selectResumeThread && !options.resumeThreadId };
}

async function selectResumeThread(dependencies: CliDependencies): Promise<ThreadSelection> {
	const threads = await dependencies.listNativeThreads();

	if (!threads.length) {
		throw new Error("현재 프로젝트에서 재개할 Codex native thread가 없습니다.");
	}

	return dependencies.selectNativeThread(threads);
}

async function runAstraCommand(
	args         : string[],
	dependencies : CliDependencies,
): Promise<void> {
	const parsed = parseAstraOptions(args);

	if (parsed.selectResumeThread) {
		const resumeThreadId = await selectResumeThread(dependencies);

		if (!resumeThreadId) return;
		parsed.options.resumeThreadId = resumeThreadId;
	}

	await dependencies.runAstra(parsed.options);
}

async function runRouterCommand(
	args         : string[],
	dependencies : CliDependencies,
): Promise<void> {
	if (args.length === 1) {
		await dependencies.runRouter({});
		return;
	}

	const resumeSessionId = args[2];

	if (args.length === 3 && args[1] === "--resume" && resumeSessionId !== undefined && isLegacySessionId(resumeSessionId)) {
		await dependencies.runRouter({ resumeSessionId });
		return;
	}

	throw new Error("사용법: www router [--resume <session-id>]");
}

async function writeSessions(dependencies: CliDependencies): Promise<void> {
	const sessions = await dependencies.listSessions();

	if (sessions.length === 0) {
		dependencies.writeOut("저장된 세션이 없습니다.");
	}

	for (const session of sessions) {
		dependencies.writeOut(`${session.id}  ${new Date(session.updatedAt).toLocaleString("ko-KR")}`);
	}
}

async function writeThreads(dependencies: CliDependencies): Promise<void> {
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

async function resumeAstra(
	args         : string[],
	dependencies : CliDependencies,
): Promise<void> {
	const threadId = args[1] || await selectResumeThread(dependencies);

	if (threadId) {
		await dependencies.runAstra({ resumeThreadId: threadId });
	}
}

async function dispatchCommand(
	args         : string[],
	dependencies : CliDependencies,
): Promise<void> {
	const command = args[0];

	if (!command) {
		await dependencies.runAstra({});
		return;
	}

	if (command === "--execution-lane" && args.length === 2 && (args[1] === "pi" || args[1] === "codex")) {
		await dependencies.runAstra({ executionLane: args[1] });
		return;
	}

	switch (command) {
	case "development":
		dependencies.writeOut(await dependencies.runDevelopment(args.slice(1)));
		return;

	case "auth":
		await dependencies.runAuth(args.slice(1));
		return;

	case "workflow":
		dependencies.writeOut(await dependencies.runWorkflow(args.slice(1)));
		return;

	case "astra":
		await runAstraCommand(args, dependencies);
		return;

	case "router":
		await runRouterCommand(args, dependencies);
		return;

	case "sessions":
		await writeSessions(dependencies);
		return;

	case "threads":
		await writeThreads(dependencies);
		return;

	case "--resume":
		await resumeAstra(args, dependencies);
		return;

	default:
		throw new Error(`알 수 없는 명령입니다: ${args.join(" ")}`);
	}
}

export async function runCli(
	args         : string[],
	dependencies : CliDependencies = productionDependencies,
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
