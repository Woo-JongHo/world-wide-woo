#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	renderRpaProject,
	renderRpaTask,
	validateRpaDescriptionMap,
	type RpaDescriptionMap,
} from "../src/core/domain/development/rpa-description.js";

function option(name: string): string | undefined {
	const index = process.argv.indexOf(name);
	return index < 0 ? undefined : process.argv[index + 1];
}

function usage(): never {
	throw new Error("사용법: rpa-description validate --map <경로> | render --map <경로> --surface project|task [--task <ID>] | check --map <경로> --surface project|task [--task <ID>] --actual <경로>");
}

const command = process.argv[2];
const mapPath = option("--map");
if (!command || !mapPath || !["validate", "render", "check"].includes(command)) usage();

let raw: unknown;
try { raw = JSON.parse(readFileSync(resolve(mapPath), "utf8")); }
catch (error) { throw new Error(`RPA map을 읽을 수 없습니다 '${mapPath}': ${error instanceof Error ? error.message : String(error)}`); }

const errors = validateRpaDescriptionMap(raw);
if (errors.length) {
	console.error(errors.join("\n"));
	process.exit(1);
}
const map = raw as RpaDescriptionMap;

if (command === "validate") {
	console.log(`RPA 설명 map 검증 통과: ${map.project.id} (Task ${map.tasks.length}개)`);
	process.exit(0);
}

const surface = option("--surface");
const taskId = option("--task");
if (surface !== "project" && surface !== "task") usage();
if (surface === "task" && !taskId) usage();
if (surface === "project" && taskId) usage();
const rendered = surface === "project" ? renderRpaProject(map) : renderRpaTask(map, taskId!);

if (command === "render") process.stdout.write(rendered);
else {
	const actualPath = option("--actual");
	if (!actualPath) usage();
	let actual: string;
	try { actual = readFileSync(resolve(actualPath), "utf8"); }
	catch (error) { throw new Error(`비교할 RPA 설명을 읽을 수 없습니다 '${actualPath}': ${error instanceof Error ? error.message : String(error)}`); }
	if (normalize(actual) !== normalize(rendered)) {
		console.error(`RPA 설명이 생성 결과와 다릅니다: ${actualPath}`);
		process.exit(1);
	}
	console.log(`RPA 설명이 생성 결과와 일치합니다: ${actualPath}`);
}

function normalize(value: string): string {
	return value.replace(/\r\n/gu, "\n").replace(/\n+$/u, "");
}
