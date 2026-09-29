import { afterEach, beforeEach, describe, expect, test }        from "bun:test";
import { stripTerminalSequences, visibleWidth }                 from "@earendil-works/pi-tui";
import {
	WorkbenchWelcomeView,
	workbenchWelcomeLogoFrame,
} from "../src/adapters/inbound/tui/features/chat/view/workbench-welcome";
import {
	OCTOPUS_INTRO_DURATION_MS,
	OCTOPUS_INTRO_TURNS,
	octopusScanFrame,
} from "../src/adapters/inbound/tui/features/chat/view/octopus-scan";
import type { LinearProjectDashboard } from "../src/core/domain/work/linear-dashboard";

describe("workbench welcome intro", () => {
	let noColor: string | undefined, reducedMotion: string | undefined;
	beforeEach(() => { noColor = process.env.NO_COLOR; reducedMotion = process.env.WWW_REDUCED_MOTION; delete process.env.NO_COLOR; delete process.env.WWW_REDUCED_MOTION; });
	afterEach(() => {
		if (noColor === undefined) delete process.env.NO_COLOR; else process.env.NO_COLOR = noColor;
		if (reducedMotion === undefined) delete process.env.WWW_REDUCED_MOTION; else process.env.WWW_REDUCED_MOTION = reducedMotion;
	});
	test("keeps the three-color WWW wordmark stable for an indefinite idle state", () => {
		const opening = workbenchWelcomeLogoFrame(0).join("\n")     ;
		const moving  = workbenchWelcomeLogoFrame(900).join("\n")   ;
		const resting = workbenchWelcomeLogoFrame(2_400).join("\n") ;

		expect(opening                        )    .toBe     (moving                         ) ;
		expect(moving                         )    .toBe     (resting                        ) ;
		expect(stripTerminalSequences(opening))    .toBe     (stripTerminalSequences(resting)) ;
		expect(stripTerminalSequences(resting))    .toContain("██╗"                          ) ;
	});

	test("shows the WWW wordmark without the point-cloud octopus", () => {
		const view = new WorkbenchWelcomeView();
		const output = view.render(100).map(stripTerminalSequences).join("\n");
		expect(output                    )    .toContain          ("██╗"                               ) ;
		expect(output                    ).not.toContain          ("ORBITING PAIR"                     ) ;
		expect(output                    ).not.toContain          ("GUARDIAN"                          ) ;
		expect(output                    )    .toContain          ("WHAT'S NEW"                        ) ;
		expect(output                    )    .toContain          ("QUICK START"                       ) ;
		expect(output                    )    .toContain          ("/monitor"                          ) ;
		expect(output                    )    .toContain          ("/context"                          ) ;
		expect(output                    )    .toContain          ("Ctrl+P"                            ) ;
		expect(output                    ).not.toContain          ("?             모든 명령 보기"         ) ;
		expect(output                    )    .toContain          ("TIP"                               ) ;
		expect(output                    )    .toContain          ("Wooni · Native Project Workbench"  ) ;
		expect(output                    )    .toContain          ("v0.0.22"                           ) ;
		expect(output                    ).not.toContain          ("WOONI"                             ) ;
		expect(output                    ).not.toContain          ("wooni@worldwide:~$"                ) ;
		expect(output                    ).not.toContain          ("Three Body"                        ) ;
		expect(output                    ).not.toMatch            (/[\u2801-\u28ff]/u                  ) ;
		expect(view.render(80, 32).length)    .toBeLessThanOrEqual(32                                  ) ;
		expect(view.render(80, 14).length)    .toBeLessThanOrEqual(14                                  ) ;
	});

	test("shows new, quick start, and open Linear issues across the intro", () => {
		const dashboard: LinearProjectDashboard = {
			state: "ready", projectName: "World Wide Woo", fetchedAt: "2026-09-29T00:00:00Z",
			issues: [{ id: "WOO-907", title: "Intro 화면을 정리한다", status: "In Progress", statusType: "started", dueDate: null, updatedAt: "2026-09-29T00:00:00Z" }],
			update: null, comments: [], milestones: [], error: null,
		};
		const rows = new WorkbenchWelcomeView(() => "ko", () => dashboard).render(120, 40).map(stripTerminalSequences);
		const output = rows.join("\n");
		expect(output).toContain("WHAT'S NEW");
		expect(output).toContain("QUICK START");
		expect(output).toContain("열린 LINEAR 이슈");
		expect(output).toContain("WOO-907");
		expect(output).toContain("In Progress · 2026-09-29");
		expect(rows.find(row => row.includes("WHAT'S NEW"))).toContain("QUICK START");
		expect(rows.find(row => row.includes("WHAT'S NEW"))).toContain("열린 LINEAR 이슈");
	});

		test("turns in depth three times and settles front-on with bounded rows at every terminal size", () => {
		const frame = (elapsed: number) => stripTerminalSequences(octopusScanFrame(elapsed, 64, 23).join("\n"));
		expect(OCTOPUS_INTRO_TURNS             )    .toBe(3                               ) ;
		expect(frame(0)                        ).not.toBe(frame(600)                      ) ;
		expect(frame(600)                      ).not.toBe(frame(1200)                     ) ;
		expect(frame(0)                        )    .toBe(frame(OCTOPUS_INTRO_DURATION_MS)) ;
		expect(frame(OCTOPUS_INTRO_DURATION_MS))    .toBe(frame(10_000)                   ) ;
		for (const width of [1, 8, 36, 80, 120, 160]) for (const height of [1, 4, 14, 32]) {
			const rows = new WorkbenchWelcomeView().render(width, height);
			expect(rows.length).toBeLessThanOrEqual(height);
			expect(rows.every(row => visibleWidth(row) <= width)).toBe(true);
		}
	});

	test("keeps the wordmark bounded in tall terminals", () => {
		const view = new WorkbenchWelcomeView();
		const rows = view.render(100, 40);
		expect(rows.length                                ).toBeLessThanOrEqual(40                        ) ;
		expect(rows.every(row => visibleWidth(row) <= 100)).toBe               (true                      ) ;
		expect(rows.join("\n")                            ).toContain          ("Native Project Workbench") ;
	});

	test("requests one initial repaint and does not replay on a second entry", async () => {
		let repaints = 0;
		const view = new WorkbenchWelcomeView();
		try {
			view.playIntro(() => repaints++);
			await Bun.sleep(65);
			const settledRepaints = repaints;
			view.playIntro(() => repaints++);
			await Bun.sleep(65);
			expect(settledRepaints).toBe(1);
			expect(repaints).toBe(settledRepaints);
		} finally { view.dispose(); }
	});

	test("reduced motion and NO_COLOR render a static welcome without scheduling animation", async () => {
		for (const key of ["WWW_REDUCED_MOTION", "NO_COLOR"]) {
			const previous = process.env[key];
			process.env[key] = "1";
			let repaints = 0;
			const view = new WorkbenchWelcomeView();
			try {
				view.playIntro(() => repaints++);
				const first = view.render(80, 24).join("\n");
				await Bun.sleep(65);
				expect(view.render(80, 24).join("\n")).toBe(first);
				expect(repaints).toBe(1);
				if (key === "NO_COLOR") expect(first).not.toContain("\x1b[");
			} finally { view.dispose(); if (previous === undefined) delete process.env[key]; else process.env[key] = previous; }
		}
	});
});
