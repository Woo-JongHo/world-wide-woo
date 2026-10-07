import      { expect, test                                 } from "bun:test"                                      ;
import      { stripTerminalSequences, visibleWidth, VStack } from "@earendil-works/pi-tui"                        ;
import      { renderLayoutFrame                            } from "@earendil-works/pi-tui/dist/layout.js"         ;
import      { wwwFixture                                   } from "./fixtures/www-snapshot"                       ;
import      {
              WwwExecutionHeading                        ,
              WwwHeader                                  ,
              WwwHud                                     ,
              WwwWorkspace                               ,
                                                           } from "../src/adapters/inbound/tui/shell/www-surface" ;

const widths  = [40, 70, 120, 160] as const ;
const heights = [10, 13, 24, 42] as const   ;

for (const width of widths) {
	for (const height of heights) {
		test(`execution viewport ${width}×${height} fits and keeps controls`, () => {
			const snapshot  = wwwFixture("working")                      ;
			const workspace = new WwwWorkspace(() => snapshot, () => []) ;
			const root = new VStack([
				{ component : new WwwHeader(() => snapshot, () => "execution", "/repo/www") , basis : 2 , minSize : 2               },
				{ component : new WwwExecutionHeading(() => snapshot)                       , basis : 2 , minSize : 2               },
				{ component : workspace.component                                           , basis : 0 , grow    : 1 , minSize : 1 },
				{ component : new WwwHud(() => snapshot)                                    , basis : 2 , minSize : 1 , maxSize : 2 },
			]);
			const frame = renderLayoutFrame(root, width, height, () => {}) ;
			const plain = frame.lines.map(stripTerminalSequences)          ;
			expect(frame.lines                                         )    .toHaveLength(height          ) ;
			expect(frame.lines.every(row => visibleWidth(row) <= width))    .toBe        (true            ) ;
			expect(plain.join("\n")                                    )    .toContain   ("WORKING"       ) ;
			expect(plain.join("\n")                                    )    .toContain   ("PLAN"          ) ;
			expect(plain.join("\n")                                    )    .toContain   ("14% 28k / 200k") ;
			expect(plain.join("\n")                                    ).not.toContain   ("Esc 중단"      ) ;
		});
	}
}
