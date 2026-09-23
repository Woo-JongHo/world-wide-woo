#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const targetArgument = process.argv[2];
const symbolArguments = process.argv.slice(3);

if (!targetArgument || symbolArguments.length === 0) {
	throw new Error("usage: 05_inspect-hover.mjs <file> <symbol[#occurrence]> [symbol[#occurrence] ...]");
}

function repositoryFile(value) {
	const target = resolve(root, value);
	const path = relative(root, target).replaceAll("\\", "/");
	if (!path || path === ".." || path.startsWith("../")) throw new Error(`file must be inside repository: ${value}`);
	if (!existsSync(target) || !statSync(target).isFile()) throw new Error(`file does not exist: ${value}`);
	const physical = relative(realpathSync(root), realpathSync(target)).replaceAll("\\", "/");
	if (physical === ".." || physical.startsWith("../")) throw new Error(`file resolves outside repository: ${value}`);
	if (!/\.[cm]?tsx?$/u.test(path)) throw new Error(`file must be TypeScript: ${value}`);
	return { path, target };
}

const file = repositoryFile(targetArgument);
const target = file.target;
const source = readFileSync(target, "utf8");
const binary = resolve(root, "node_modules/.bin/tsc");
const server = spawn(binary, ["--lsp", "--stdio"], { cwd: root, stdio: ["pipe", "pipe", "pipe"] });

let nextId = 1;
let buffer = Buffer.alloc(0);
let stderr = "";
const pending = new Map();
const serverExit = new Promise(resolveExit => server.once("exit", (code, signal) => {
	const error = new Error(stderr.trim() || `TypeScript LSP exited with ${code ?? signal ?? "unknown"}`);
	for (const waiting of pending.values()) waiting.reject(error);
	pending.clear();
	resolveExit({ code, signal });
}));

function send(message) {
	const body = JSON.stringify(message);
	server.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}

function request(method, params, timeoutMs = 10_000) {
	const id = nextId++;
	return new Promise((resolveRequest, rejectRequest) => {
		const timeout = setTimeout(() => {
			pending.delete(id);
			rejectRequest(new Error(`LSP request timed out: ${method}`));
		}, timeoutMs);
		pending.set(id, {
			resolve: value => { clearTimeout(timeout); resolveRequest(value); },
			reject: error => { clearTimeout(timeout); rejectRequest(error); },
		});
		send(params === undefined
			? { jsonrpc: "2.0", id, method }
			: { jsonrpc: "2.0", id, method, params });
	});
}

function notify(method, params) {
	send(params === undefined
		? { jsonrpc: "2.0", method }
		: { jsonrpc: "2.0", method, params });
}

server.stderr.on("data", chunk => { stderr += chunk.toString("utf8"); });
server.stdout.on("data", chunk => {
	buffer = Buffer.concat([buffer, chunk]);
	while (true) {
		const headerEnd = buffer.indexOf("\r\n\r\n");
		if (headerEnd < 0) return;
		const header = buffer.subarray(0, headerEnd).toString("utf8");
		const length = Number(/Content-Length: (\d+)/iu.exec(header)?.[1]);
		const bodyStart = headerEnd + 4;
		if (!Number.isFinite(length) || buffer.length < bodyStart + length) return;
		const message = JSON.parse(buffer.subarray(bodyStart, bodyStart + length).toString("utf8"));
		buffer = buffer.subarray(bodyStart + length);
		if (message.method && message.id !== undefined) {
			const result = message.method === "workspace/configuration"
				? (message.params?.items ?? []).map(() => null)
				: null;
			send({ jsonrpc: "2.0", id: message.id, result });
			continue;
		}
		if (message.id === undefined) continue;
		const waiting = pending.get(message.id);
		if (!waiting) continue;
		pending.delete(message.id);
		if (message.error) waiting.reject(new Error(JSON.stringify(message.error)));
		else waiting.resolve(message.result);
	}
});

server.on("error", error => {
	for (const waiting of pending.values()) waiting.reject(error);
	pending.clear();
});

function hoverMarkdown(hover) {
	const contents = hover?.contents;
	if (typeof contents === "string") return contents;
	if (Array.isArray(contents)) return contents.map(item => typeof item === "string" ? item : item.value).join("\n");
	return contents?.value ?? "";
}

function hoverDocumentation(hover) {
	return hoverMarkdown(hover)
		.replace(/```[\s\S]*?```/gu, "")
		.replace(/^\s*---\s*$/gmu, "")
		.trim();
}

function parseSymbolArgument(value) {
	const match = /^([A-Za-z_$][A-Za-z0-9_$]*)(?:#([1-9]\d*))?$/u.exec(value);
	if (!match) throw new Error(`invalid TypeScript symbol selector: ${value}`);
	return { label: value, name: match[1], occurrence: Number(match[2] ?? "1"), explicit: Boolean(match[2]) };
}

function flattenSymbols(items, output = []) {
	for (const item of items ?? []) {
		const position = item.selectionRange?.start ?? item.location?.range?.start;
		if (typeof item.name === "string" && position) output.push({ name: item.name, position });
		flattenSymbols(item.children, output);
	}
	return output;
}

function comparePosition(left, right) {
	return left.position.line - right.position.line || left.position.character - right.position.character;
}

const rootUri = pathToFileURL(root).href;
const uri = pathToFileURL(target).href;

let opened = false;
let verificationError = null;
try {
	await request("initialize", {
		processId: process.pid,
		rootUri,
		capabilities: {
			textDocument: {
				documentSymbol: { hierarchicalDocumentSymbolSupport: true },
				hover: { contentFormat: ["markdown", "plaintext"] },
			},
		},
		workspaceFolders: [{ uri: rootUri, name: "99_www" }],
	});
	notify("initialized", {});
	notify("textDocument/didOpen", { textDocument: { uri, languageId: "typescript", version: 1, text: source } });
	opened = true;

	const response = await request("textDocument/documentSymbol", { textDocument: { uri } });
	const symbols = flattenSymbols(response).sort(comparePosition);
	if (symbols.length === 0) throw new Error(`document symbols missing: ${file.path}`);

	for (const value of symbolArguments) {
		const selector = parseSymbolArgument(value);
		const matches = symbols.filter(symbol => symbol.name === selector.name);
		if (matches.length === 0) throw new Error(`symbol declaration not found: ${selector.name}`);
		if (!selector.explicit && matches.length > 1) {
			throw new Error(`ambiguous symbol declaration: ${selector.name}; use ${selector.name}#1..#${matches.length}`);
		}
		const symbol = matches[selector.occurrence - 1];
		if (!symbol) throw new Error(`symbol occurrence not found: ${selector.label}; available=${matches.length}`);
		const hover = await request("textDocument/hover", { textDocument: { uri }, position: symbol.position });
		const documentation = hoverDocumentation(hover);
		if (!documentation) throw new Error(`hover documentation missing: ${selector.label}`);
		console.log(`${selector.label}: ${documentation}`);
	}
} catch (error) {
	verificationError = error;
}

if (opened && server.exitCode === null && server.signalCode === null) {
	notify("textDocument/didClose", { textDocument: { uri } });
}
let forcedShutdown = false;
if (server.exitCode === null && server.signalCode === null) {
	try {
		await request("shutdown", undefined, 1_000);
		notify("exit");
	} catch {
		forcedShutdown = true;
		if (server.exitCode === null && server.signalCode === null) server.kill("SIGTERM");
	}
}
const { code: exitCode } = await serverExit;
const exitMessage = stderr.trim();
const knownWatcherPanic = /panic: assignment to entry in nil map[\s\S]*lspwatcher/u.test(exitMessage);
const knownWatcherClose = /^context canceled(?:\n|$)[\s\S]*lspwatcher: closed/u.test(exitMessage);
if (!forcedShutdown && exitCode !== 0 && exitMessage !== "context canceled" && !knownWatcherPanic && !knownWatcherClose) {
	throw new Error(exitMessage || `TypeScript LSP exited with ${exitCode}`);
}
if (knownWatcherPanic) console.error("TypeScript LSP watcher panic occurred after hover verification; verified responses were preserved.");
if (knownWatcherClose) console.error("TypeScript LSP watcher closed after hover verification; verified responses were preserved.");
if (verificationError) throw verificationError;
