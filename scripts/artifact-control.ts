#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderArtifactCandidate, validateArtifactCandidate, type ArtifactCandidate } from "../src/core/domain/development/artifact-control.js";

function value(flag: string): string | undefined {
	const index = process.argv.indexOf(flag);
	return index < 0 ? undefined : process.argv[index + 1];
}

const command = process.argv[2];
const candidatePath = value("--candidate");
if (!command || !candidatePath || !["validate", "render"].includes(command)) throw new Error("usage: artifact-control validate|render --candidate <path> [--actual-before <path>] [--out <path>]");
const candidate = JSON.parse(readFileSync(resolve(candidatePath), "utf8")) as ArtifactCandidate;
const actualPath = value("--actual-before");
const actual = actualPath ? JSON.parse(readFileSync(resolve(actualPath), "utf8")) : undefined;
const errors = validateArtifactCandidate(candidate, actual);
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
if (command === "validate") console.log(`Artifact Candidate OK: ${candidate.kind} ${candidate.candidateId}`);
else {
	const output = renderArtifactCandidate(candidate), outputPath = value("--out");
	if (outputPath) writeFileSync(resolve(outputPath), output, { flag: "wx" }); else process.stdout.write(output);
}
