/** Describe only a single recognized invocation; compound shell syntax needs interpretation. */
export function immediateShellSummary(command: string, language: "ko" | "en"): string | null {
	const invocation = command.trim()                      ;
	const control    = invocation.replace(/'[^']*'/gu, "") ;
	if (/[|;&<>`\n]|\$\(/u.test(control)) return null;
	const match = /^(cat|head|tail|sed|rg|git|jq)\s+(.+)$/u.exec(invocation);
	if (!match) return null;
	const executable    = match[1]!        ;
	const argumentsText = match[2]!.trim() ;
	if (!argumentsText) return null;
	const labels: Record<string, readonly [string, string]> = {
		cat  : ["파일 내용 읽기", "Read file contents"],
		head : ["파일 앞부분 읽기", "Read the beginning of a file"],
		tail : ["파일 끝부분 읽기", "Read the end of a file"],
		sed  : ["텍스트 처리", "Process text"],
		rg   : ["텍스트·파일 검색", "Search text or files"],
		git  : ["Git 명령 실행", "Run Git command"],
		jq   : ["JSON 처리", "Process JSON"],
	};
	return `${labels[executable]![language === "en" ? 1 : 0]}: ${argumentsText}`;
}
