#!/usr/bin/env bun
import { resolve } from "node:path";
import { syncLocalUnitRegistry } from "../src/adapters/outbound/development/local-unit-registry.js";

const command = process.argv[2] ?? "check";
if (command !== "check" && command !== "sync") throw new Error("사용법: bun run units:check | bun run units:sync");
const result = syncLocalUnitRegistry({
	projectRoot: resolve("."),
	obsidianRoot: process.env.WWW_DEVELOPMENT_VAULT,
	checkOnly: command === "check",
});
console.log(`${result.units} Units · ${result.links} Linear links · ${command === "sync" ? "SQLite synchronized" : "valid"} · ${result.digest}`);
