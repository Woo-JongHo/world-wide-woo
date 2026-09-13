## manualQa

### surfaceEvidence

| scenario id | criterion reference | surface | exact invocation | verdict | artifactRefs |
|---|---|---|---|---|---|
| S-TUI-REGISTRY | `.omo/evidence/2026-09-13-tui-unit-catalog-impl.md` implementation contract; `.omo/evidence/2026-09-13-tui-unit-inventory.md` candidate catalog | Bun test runner and the imported TUI feature registry | `bun test test/tui-feature-registry.test.ts` | PASS | `A1`, `A2` |
| S-CHAT-FACADE | `.omo/evidence/2026-09-13-chat-views-split.md` preserved behavior and public facade | Bun tests importing `WorkbenchChatView` through its existing module path | `bun test test/workbench-views.test.ts test/chat-render-acceptance.test.ts test/workbench-lifecycle-noise.test.ts test/delegation-tree-view.test.ts test/workbench-tracer-view.test.ts` | PASS | `A3` |
| S-CORE-EXTRACTIONS | `.omo/evidence/2026-09-13-project-workbench-extract-impl.md` and `.omo/evidence/2026-09-13-native-plan-revision-impl.md` | Bun unit/integration tests and source architecture checks | `bun test test/native-event-projection.test.ts test/completed-turn-note-scope.test.ts test/project-workbench.test.ts test/work-flow.test.ts test/workflow-projection.test.ts test/native-plan-wiring.test.ts test/architecture.test.ts` | PASS | `A4` |
| S-TYPESCRIPT | Current `package.json` `check` script | Repository TypeScript CLI | `bun run check` | PASS | `A5` |
| S-LOCAL-UNITS | Current `package.json` `units:check` script | Repository local units CLI | `bun run units:check` | PASS | `A6` |
| S-ARCHITECTURE | Current `package.json` test runner and `test/architecture.test.ts` | Bun architecture test suite | `bun test test/architecture.test.ts` | PASS | `A7` |
| S-ALL-TESTS | Current `package.json` `test` script | Full Bun test suite | `bun test` | PASS | `A8` |

### adversarialCases

| scenario id | criterion reference | adversarial class | expected behavior | verdict | artifactRefs |
|---|---|---|---|---|---|
| ADV-CHAT-UNSAFE-BODY | Chat public projection and compatibility contract | malformed role/status and body-bearing failed, cancelled, or streaming messages | Keep only safe public text, label unknown states, and continue rendering later messages. | PASS | `A3` |
| ADV-NATIVE-OVERSIZED-EVIDENCE | `native-event-projection.ts` bounded public projection contract | oversized nested Native evidence and completed reasoning payload | Redact reasoning content and bound/sanitize projected evidence while retaining only the public summary. | PASS | `A4` |
| ADV-NOTE-CROSS-TURN | `completed-turn-note-scope.ts` ownership contract | incomplete, reversed, cross-turn, non-owning, or interleaved foreign-thread selector | Reject invalid scopes and select only the target completed turn and its owning outbound question. | PASS | `A4` |
| ADV-PLAN-MALFORMED-IDENTITY | `native-plan-revision.ts` fail-closed contract | malformed Markdown, duplicate/status collapse, ambiguous revision identity, injected digest collision | Reject malformed or ambiguous revisions, preserve orphan attribution, and throw on an injected full digest collision. | PASS | `A4` |
| ADV-REG-RETIRED-ID-COLLISION | TUI unit ID retirement contract | reserved-ID reuse | Not applicable because the current catalog reserves no retired IDs (`TUI_RETIRED_FEATURE_UNIT_IDS` is empty). | not_applicable | `A2` |

### artifactRefs

| id | kind | description | path |
|---|---|---|---|
| A1 | test transcript | Registry contract tests: 16 features, 35 exact titles, uniqueness, parent linkage, sequential numbering, and retired-ID non-reuse assertion; 4 pass / 158 assertions. | `.omo/evidence/2026-09-13-tui-core-independent-qa.md` — `Registry 16/35 contract` |
| A2 | runtime comparison transcript | Corrected runtime registry versus inventory ordered comparison: 35/35 exact ID/title pairs, retired ID list empty, exit code 0. | `.omo/evidence/2026-09-13-tui-core-independent-qa.md` — `Corrected independent registry-to-inventory comparison` |
| A3 | test transcript | Existing chat facade render consumers and adversarial message cases: 114 pass / 1,195 assertions across 5 files. | `.omo/evidence/2026-09-13-tui-core-independent-qa.md` — `Chat facade compatibility and render consumers` |
| A4 | test transcript | Three Core extraction suites, caller regressions, malformed/oversized inputs, and architecture: 200 pass / 2,530 assertions across 7 files. | `.omo/evidence/2026-09-13-tui-core-independent-qa.md` — `Core extractions and call-site regressions` |
| A5 | CLI transcript | Full TypeScript check; exit code 0. | `.omo/evidence/2026-09-13-tui-core-independent-qa.md` — `TypeScript check` |
| A6 | CLI transcript | Local unit/Linear-link check; exit code 0; output includes 5 Units and 32 links. | `.omo/evidence/2026-09-13-tui-core-independent-qa.md` — `Local units check` |
| A7 | test transcript | Architecture suite; 13 pass / 1,554 assertions. | `.omo/evidence/2026-09-13-tui-core-independent-qa.md` — `Architecture suite` |
| A8 | test transcript | Full repository suite; 1,199 pass / 0 fail / 9,609 assertions across 133 files. | `.omo/evidence/2026-09-13-tui-core-independent-qa.md` — `Complete test suite` |
no skip/only declarations found

exit_code=0
```
