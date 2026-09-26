type HelpRow = readonly [command: string, description: string];

function formatHelpRow(command: string, description: string): string {
	const commandWidth : number = [...command].reduce(
		(width, character) => width + (/\p{Script=Hangul}/u.test(character) ? 2 : 1),
		0,
	);
	const padding      : string = " ".repeat(Math.max(1, 48 - commandWidth));

	return `  ${command}${padding}${description}`.trimEnd();
}

function formatHelpSection(title: string, rows: readonly HelpRow[]): string {
	return [title, ...rows.map(([command, description]) => formatHelpRow(command, description))].join("\n");
}

const USAGE_ROWS: readonly HelpRow[] = [
	["www",                                             "WWW Execution Console · F2–F9 화면 · Ctrl+P 명령"],
	["www --runtime-config <json>",                     "7-Stage brokered 실행 · 파일/게시 범위 지정 · 격리 미검증"],
	["www --execution-lane pi",                         "실험적 내장 Pi text lane으로 WWW 실행"],
	["www router",                                      "호환 Claude·Gemini·OpenAI·Z.AI Router 실행"],
	["",                                                "Native 승인·Sandbox·Skill은 제공하지 않음"],
	["www router --resume <session-id>",                "기존 Router 세션 재개"],
	["www auth status",                                 "모델 인증 상태 확인"],
	["www auth login <공급자> [oauth|api-key]",         "구독 계정 또는 API 키 로그인"],
	["www auth logout <공급자>",                        "저장된 인증 삭제"],
	["www workflow check <RPA-ID>",                     "로컬 참조 사전 검사 (원격 미검증)"],
	["www workflow show|resume <Run-ID>",               "결과 조회·중단 검사 재개"],
	["www development help",                            "Issue·Unit·SQLite·Obsidian 개발 기록 명령"],
	["www sessions",                                    "레거시 SessionRuntime 세션 목록"],
	["www threads",                                     "현재 프로젝트의 Codex native thread 목록"],
	["www --resume",                                    "현재 프로젝트의 native thread를 선택해 재개"],
	["www --resume <native-thread-id>",                 "지정한 native thread 바로 재개"],
];

const WWW_COMMAND_ROWS: readonly HelpRow[] = [
	["/stats · /dashboard · /monitor",                  "Observability View 직접 열기"],
	["r/R · 1/2/3 · Esc",                               "View 회전·직접 이동·Workbench 복귀"],
	["/model [모델] [추론 강도]",                       "현재·다음 실행의 Codex 모델 변경"],
	["/source <id|latest|clear>",                       "Trace source 선택"],
	["/trace <activity-id>",                            "선택 Plan에 결속된 정확한 Activity Trace 선택"],
	["/tnote",                                          "마지막 질문을 packet-only 종료 보고서로 수동 캡처"],
	["/approve · /approve-session · /decline",          "Codex native 승인 응답"],
	["/cancel",                                         "현재 native turn 중단"],
	["/exit",                                           "Workbench를 안전하게 종료"],
];

const ROUTER_COMMAND_ROWS: readonly HelpRow[] = [
	["/login [provider]",                               "OAuth 또는 API 키 연결"],
	["/model [provider/model] [low|medium|high|ultra]", "Claude·Gemini·OpenAI·Z.AI 모델 변경"],
	["/logout <provider>",                              "저장된 인증 삭제"],
	["/usage",                                          "Codex·Claude 사용량 갱신"],
];

/** `www --help`가 출력하는 최상위 CLI 명령과 WWW·Router 명령 카탈로그다. */
const WWW_HELP_TEXT: string = [
	formatHelpSection("사용법:", USAGE_ROWS),
	formatHelpSection("WWW Execution Console 명령:", WWW_COMMAND_ROWS),
	formatHelpSection("호환 Router 명령:", ROUTER_COMMAND_ROWS),
].join("\n\n");

export function wwwHelpText(): string { return WWW_HELP_TEXT; }
