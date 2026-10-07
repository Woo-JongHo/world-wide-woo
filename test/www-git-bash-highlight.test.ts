import      { describe, expect, test         } from "bun:test"                                                     ;
import      {
              stripTerminalSequences       ,
              visibleWidth                 ,
                                             } from "@earendil-works/pi-tui"                                       ;
import chalk from "chalk";
import      { wwwFixture                     } from "./fixtures/www-snapshot"                                      ;
import      { WwwTranscriptView, wwwToolRows } from "../src/adapters/inbound/tui/features/chat/view/www-execution" ;

describe("WWW Git Bash highlighting", () => {
	test("syntax color keeps the exact command and output inside the card", () => {
		const level = chalk.level;
		chalk.level = 3;
		try {
			const snapshot = wwwFixture("ready")                                             ;
			const source   = snapshot.activities.find(activity => activity.id === "tool-2")! ;
			const activity = { ...source, id: "git-highlight", nativeRefs: { ...source.nativeRefs, itemId: "git-highlight" }, payload: {
				method: "item/completed", params: { item: { type: "commandExecution", command: "git diff -- src/app.ts", exitCode: 0,
					aggregatedOutput: "diff --git a/src/app.ts b/src/app.ts\n-old\n+new\n?? src/new.ts" } },
			} };
			const rows     = wwwToolRows(activity, 80, true)  ;
			const rendered = rows.join("\n")                  ;
			const plain    = stripTerminalSequences(rendered) ;
			expect(plain).toContain("$ git diff -- src/app.ts") ;
			expect(plain).toContain("-old"                    ) ;
			expect(plain).toContain("+new"                    ) ;
			expect(plain).toContain("?? src/new.ts"           ) ;
			const added   = rows.find(row => row.includes("+new"))! ;
			const removed = rows.find(row => row.includes("-old"))! ;
			expect(added                                     )    .toContain("\u001b[38;"                   ) ;
			expect(removed                                   )    .toContain("\u001b[38;"                   ) ;
			expect(added                                     ).not.toBe     (removed.replace("-old", "+new")) ;
			expect(rows.every(row => visibleWidth(row) <= 80))    .toBe     (true                           ) ;
			snapshot.activities = [...snapshot.activities, activity];
			const transcript = new WwwTranscriptView(snapshot).render(80).join("\n");
			expect(stripTerminalSequences(transcript)).toContain("$ git diff -- src/app.ts");
			expect(transcript).toContain("\u001b[38;");
		} finally { chalk.level = level; }
	});
});
