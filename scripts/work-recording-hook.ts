#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readlinkSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
	evaluateWorkRecordingGate,
	isWorkRecordingPath,
	type WorkRecordingSnapshot,
} from "../src/core/domain/development/work-recording-gate.js";

interface HookInput {
	readonly cwd?: string;
	readonly hook_event_name?: string;
	readonly session_id?: string;
	readonly turn_id?: string;
	readonly stop_hook_active?: boolean;
}

export function captureWorktreeSnapshot(root: string): WorkRecordingSnapshot {
	const raw = execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], {
		cwd: root,
		encoding: "utf8",
	});
	const records = raw.split("\0");
	const entries: Record<string, string> = {};
	for (let index = 0; index < records.length; index += 1) {
		const record = records[index];
		if (!record || record.length < 4) continue;
		const status = record.slice(0, 2);
		const path = record.slice(3);
		if (isWorkRecordingPath(path)) entries[path] = worktreeEntryDigest(root, path, status);
		if (/[RC]/u.test(status)) {
			const source = records[index + 1];
			if (source) {
				index += 1;
				if (isWorkRecordingPath(source)) entries[source] = worktreeEntryDigest(root, source, `${status}:source`);
			}
		}
	}
	return { entries };
}

export function runWorkRecordingHook(input: HookInput): Record<string, unknown> | null {
	const root = repositoryRoot(input.cwd ?? process.cwd());
	if (!root || !input.session_id) return input.hook_event_name === "Stop" ? {} : null;
	const sessionDirectory = join(gitDirectory(root), "woo", "recording-hook", safeId(input.session_id));
	if (input.hook_event_name === "SessionEnd") {
		rmSync(sessionDirectory, { recursive: true, force: true });
		return null;
	}
	if (!input.turn_id) return input.hook_event_name === "Stop" ? {} : null;
	const statePath = join(sessionDirectory, `${safeId(input.turn_id)}.json`);
	if (input.hook_event_name === "UserPromptSubmit") {
		mkdirSync(dirname(statePath), { recursive: true });
		writeFileSync(statePath, `${JSON.stringify(captureWorktreeSnapshot(root))}\n`, { mode: 0o600 });
		return null;
	}
	if (input.hook_event_name !== "Stop") return null;
	if (input.stop_hook_active) {
		rmSync(statePath, { force: true });
		return {};
	}
	if (!existsSync(statePath)) return {};
	const before = JSON.parse(readFileSync(statePath, "utf8")) as WorkRecordingSnapshot;
	const decision = evaluateWorkRecordingGate({ before, after: captureWorktreeSnapshot(root), stopHookActive: false });
	if (decision.state === "clear") {
		rmSync(statePath, { force: true });
		return {};
	}
	return { decision: "block", reason: decision.reason };
}

function repositoryRoot(cwd: string): string | null {
	try {
		return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" }).trim();
	} catch {
		return null;
	}
}

function gitDirectory(root: string): string {
	const value = execFileSync("git", ["rev-parse", "--git-dir"], { cwd: root, encoding: "utf8" }).trim();
	return isAbsolute(value) ? value : resolve(root, value);
}

function worktreeEntryDigest(root: string, path: string, status: string): string {
	const absolute = join(root, path);
	const hash = createHash("sha256").update(status).update("\0").update(path).update("\0");
	try {
		const stat = lstatSync(absolute);
		if (stat.isSymbolicLink()) hash.update(`<symlink:${readlinkSync(absolute)}>`);
		else if (stat.isFile()) hash.update(readFileSync(absolute));
		else hash.update(`<${stat.isDirectory() ? "directory" : "other"}>`);
	} catch {
		hash.update("<missing>");
	}
	return hash.digest("hex");
}

function safeId(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

if (import.meta.main) {
	try {
		const input = JSON.parse(await Bun.stdin.text()) as HookInput;
		const output = runWorkRecordingHook(input);
		if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		process.stdout.write(`${JSON.stringify({ systemMessage: `작업 기록 훅 진단 필요: ${message}` })}\n`);
	}
}
