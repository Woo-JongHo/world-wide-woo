#!/usr/bin/env bun

import { listSessions, runApp, runAuth } from "./app";
import packageJson from "../package.json" with { type: "json" };

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
	console.log([
		"사용법:",
		"  www                         월드 와이드 우 TUI 실행",
		"  www auth status             모델 인증 상태 확인",
		"  www auth login <공급자> [oauth|api-key]",
		"                              구독 계정 또는 API 키 로그인",
		"  www auth logout <공급자>    저장된 인증 삭제",
		"  www sessions                 저장된 세션 목록",
		"  www --resume <세션 ID>       기존 세션 재개",
		"",
		"TUI 키:",
		"  /model  Router · 모델 설정",
		"  /login  로그인 · 계정",
		"  /usage  Codex·Claude 사용량 갱신",
		"  Ctrl+C  입력 지우기 · 응답 중단 · 종료",
	].join("\n"));
} else if (args.includes("--version") || args.includes("-v")) {
	console.log(packageJson.version);
} else {
	try {
		if (args[0] === "auth") await runAuth(args.slice(1));
		else if (args[0] === "sessions") {
			const sessions = await listSessions();
			if (sessions.length === 0) console.log("저장된 세션이 없습니다.");
			for (const session of sessions) {
				console.log(`${session.id}  ${new Date(session.updatedAt).toLocaleString("ko-KR")}`);
			}
		}
		else if (args[0] === "--resume") {
			if (!args[1]) throw new Error("재개할 세션 ID를 지정하세요.");
			await runApp({ sessionId: args[1] });
		}
		else if (args.length === 0) await runApp();
		else throw new Error(`알 수 없는 명령입니다: ${args.join(" ")}`);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
