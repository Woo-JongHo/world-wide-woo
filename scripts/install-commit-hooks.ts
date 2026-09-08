#!/usr/bin/env bun
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { repositoryRoot } from "../src/adapters/outbound/git/git-commit-control.js";

const root = repositoryRoot(resolve(process.argv[2] ?? "."));
execFileSync("git", ["-C", root, "config", "core.hooksPath", ".githooks"]);
let baseline = "";
try { baseline = execFileSync("git", ["-C", root, "config", "--get", "woo.receiptBaseline"], { encoding: "utf8" }).trim(); } catch { /* first install */ }
if (!baseline) {
	baseline = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
	execFileSync("git", ["-C", root, "config", "woo.receiptBaseline", baseline]);
}
console.log(`Woo commit hooks installed: baseline=${baseline}`);

