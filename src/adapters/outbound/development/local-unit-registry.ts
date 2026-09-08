import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import * as ts from "typescript/unstable/ast";
import YAML from "yaml";

export interface LocalUnit {
	id: string;
	name: string;
	code: { path: string; symbol: string; members?: string[] };
	linear: string[];
	obsidian?: string;
}

export interface LocalUnitManifest { schemaVersion: 1; units: LocalUnit[] }
export interface LocalUnitSyncResult { units: number; links: number; digest: string; indexPath: string }

interface TraceabilityLedger {
	projectId?: string;
	issues?: Array<{ id?: string }>;
	entities?: Array<{ kind?: string; id?: string }>;
}

interface NamedDeclaration {
	name: string;
	kind: "class" | "function" | "interface" | "type";
	members: Set<string>;
}

const digest = (value: string): string => createHash("sha256").update(value).digest("hex");
const canonical = (value: unknown): string => {
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
	return JSON.stringify(value);
};

export function loadLocalUnitManifest(projectRoot: string): LocalUnitManifest {
	const path = join(projectRoot, ".woo/units.yaml");
	if (!existsSync(path)) throw new Error("LOCAL_UNIT_MANIFEST_MISSING: .woo/units.yaml");
	let value: LocalUnitManifest;
	try {
		value = YAML.parse(readFileSync(path, "utf8")) as LocalUnitManifest;
	} catch (error) {
		throw new Error(`LOCAL_UNIT_MANIFEST_INVALID: ${String(error)}`);
	}
	if (value?.schemaVersion !== 1 || !Array.isArray(value.units)) throw new Error("LOCAL_UNIT_MANIFEST_INVALID: schemaVersion 1과 units 배열이 필요합니다.");
	return value;
}

function findLedgerPath(projectRoot: string): string {
	for (const name of ["traceability-v3.json", "traceability-v2.json"]) {
		const path = join(projectRoot, ".www/control-ledger", name);
		if (existsSync(path)) return path;
	}
	throw new Error("LOCAL_UNIT_LEDGER_MISSING: traceability-v3.json 또는 traceability-v2.json이 필요합니다.");
}

function loadLedger(projectRoot: string): { projectId: string; issueIds: Set<string> } {
	const ledger = JSON.parse(readFileSync(findLedgerPath(projectRoot), "utf8")) as TraceabilityLedger;
	if (typeof ledger.projectId !== "string" || !ledger.projectId.trim()) throw new Error("LOCAL_UNIT_LEDGER_INVALID: projectId가 필요합니다.");
	const issueIds = new Set<string>();
	for (const issue of ledger.issues ?? []) if (typeof issue.id === "string") issueIds.add(issue.id);
	for (const entity of ledger.entities ?? []) if (entity.kind === "issue" && typeof entity.id === "string") issueIds.add(entity.id);
	return { projectId: ledger.projectId, issueIds };
}

function containedFile(root: string, localPath: string): string | undefined {
	if (!localPath || isAbsolute(localPath) || localPath.split(/[\\/]/u).includes("..")) return undefined;
	const path = resolve(root, localPath);
	if (!existsSync(path) || !statSync(path).isFile()) return undefined;
	const canonicalRoot = realpathSync(root);
	const canonicalPath = realpathSync(path);
	const offset = relative(canonicalRoot, canonicalPath);
	if (offset === ".." || offset.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(offset)) return undefined;
	return canonicalPath;
}

export function validateLocalUnitManifest(projectRoot: string, manifest: LocalUnitManifest, obsidianRoot?: string): string[] {
	const errors: string[] = [];
	const ids = new Set<string>();
	const owners = new Set<string>();
	const { issueIds } = loadLedger(projectRoot);
	for (const unit of manifest.units) {
		if (!/^Code-\d{3}$/u.test(unit.id)) errors.push(`${unit.id}: Code-NNN 형식이어야 합니다.`);
		if (ids.has(unit.id)) errors.push(`${unit.id}: Code-ID가 중복됩니다.`);
		ids.add(unit.id);
		if (typeof unit.name !== "string" || !unit.name.trim()) errors.push(`${unit.id}: 이름이 필요합니다.`);
		if (!Array.isArray(unit.linear) || !unit.linear.length) errors.push(`${unit.id}: Linear 연결이 필요합니다.`);
		const linearIds = Array.isArray(unit.linear) ? unit.linear : [];
		if (new Set(linearIds).size !== linearIds.length) errors.push(`${unit.id}: Linear 연결이 중복됩니다.`);
		for (const issueId of linearIds) if (typeof issueId !== "string" || !issueIds.has(issueId)) errors.push(`${unit.id}: 원장에 없는 Linear Issue ${issueId}`);

		const codePath = typeof unit.code?.path === "string" ? containedFile(projectRoot, unit.code.path) : undefined;
		if (!unit.code || !codePath || ![".ts", ".tsx", ".mts", ".cts"].includes(extname(unit.code.path))) {
			errors.push(`${unit.id}: 코드 경로가 저장소 안에 존재하는 TypeScript 파일이어야 합니다.`);
			continue;
		}
		if (typeof unit.code.symbol !== "string" || !unit.code.symbol.trim()) {
			errors.push(`${unit.id}: 코드 symbol이 필요합니다.`);
			continue;
		}
		const owner = `${unit.code.path}#${unit.code.symbol}`;
		if (owners.has(owner)) errors.push(`${unit.id}: 코드 소유자 ${owner}가 중복됩니다.`);
		owners.add(owner);
		const declarations = scanNamedDeclarations(readFileSync(codePath, "utf8")).filter(item => item.name === unit.code.symbol);
		if (declarations.length !== 1) errors.push(`${unit.id}: ${owner} 선언을 정확히 하나 찾을 수 있어야 합니다.`);

		if (unit.code.members !== undefined && (!Array.isArray(unit.code.members) || unit.code.members.some(member => typeof member !== "string" || !member.trim()))) errors.push(`${unit.id}: members는 비어 있지 않은 문자열 배열이어야 합니다.`);
		const members = Array.isArray(unit.code.members) ? unit.code.members : [];
		if (new Set(members).size !== members.length) errors.push(`${unit.id}: member가 중복됩니다.`);
		if (members.length && declarations[0]?.kind !== "class") errors.push(`${unit.id}: members는 class 선언에서만 사용할 수 있습니다.`);
		for (const member of members) if (!declarations[0]?.members.has(member)) errors.push(`${unit.id}: ${owner}.${member}를 찾을 수 없습니다.`);
		if (unit.obsidian && obsidianRoot && !containedFile(obsidianRoot, unit.obsidian)) errors.push(`${unit.id}: Obsidian 문서가 없습니다: ${unit.obsidian}`);
	}
	return errors;
}

function scanNamedDeclarations(source: string): NamedDeclaration[] {
	const scanner = ts.createScanner(true, ts.LanguageVariant.Standard, source);
	const declarations: NamedDeclaration[] = [];
	let depth = 0;
	let pending: NamedDeclaration["kind"] | undefined;
	let activeClass: NamedDeclaration | undefined;
	let possibleMember: string | undefined;
	const templateDepths: number[] = [];
	let previousEnd = -1;
	let previousToken: ts.SyntaxKind | undefined;

	for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFile; token = scanner.scan()) {
		if (scanner.getTokenEnd() <= previousEnd) throw new Error(`TYPE_SCRIPT_SCAN_STALLED: offset ${scanner.getTokenStart()}`);
		previousEnd = scanner.getTokenEnd();
		if (token === ts.SyntaxKind.SlashToken && tokenAllowsRegularExpression(previousToken)) {
			token = scanner.reScanSlashToken();
			previousEnd = scanner.getTokenEnd();
		}
		if (depth === 0) {
			if (token === ts.SyntaxKind.ClassKeyword) pending = "class";
			else if (token === ts.SyntaxKind.FunctionKeyword) pending = "function";
			else if (token === ts.SyntaxKind.InterfaceKeyword) pending = "interface";
			else if (token === ts.SyntaxKind.TypeKeyword) pending = "type";
			else if (pending && token === ts.SyntaxKind.Identifier) {
				const declaration = { name: scanner.getTokenText(), kind: pending, members: new Set<string>() };
				declarations.push(declaration);
				activeClass = pending === "class" ? declaration : undefined;
				pending = undefined;
			}
		} else if (depth === 1 && activeClass) {
			if (token === ts.SyntaxKind.Identifier) possibleMember = scanner.getTokenText();
			else if (possibleMember && token === ts.SyntaxKind.OpenParenToken) {
				activeClass.members.add(possibleMember);
				possibleMember = undefined;
			} else if (![ts.SyntaxKind.PublicKeyword, ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword, ts.SyntaxKind.StaticKeyword, ts.SyntaxKind.AsyncKeyword].includes(token)) possibleMember = undefined;
		}

		if (token === ts.SyntaxKind.TemplateHead) {
			depth += 1;
			templateDepths.push(depth);
		} else if (token === ts.SyntaxKind.OpenBraceToken) depth += 1;
		else if (token === ts.SyntaxKind.CloseBraceToken && templateDepths.at(-1) === depth) {
			const templateToken = scanner.reScanTemplateToken(false);
			previousEnd = scanner.getTokenEnd();
			if (templateToken === ts.SyntaxKind.TemplateTail) {
				templateDepths.pop();
				depth -= 1;
				if (depth === 0) activeClass = undefined;
			}
		} else if (token === ts.SyntaxKind.CloseBraceToken) {
			depth -= 1;
			if (depth === 0) activeClass = undefined;
		}
		previousToken = token;
	}
	return declarations;
}

function tokenAllowsRegularExpression(token: ts.SyntaxKind | undefined): boolean {
	return token === undefined || [
		ts.SyntaxKind.OpenParenToken,
		ts.SyntaxKind.OpenBracketToken,
		ts.SyntaxKind.OpenBraceToken,
		ts.SyntaxKind.CommaToken,
		ts.SyntaxKind.SemicolonToken,
		ts.SyntaxKind.ColonToken,
		ts.SyntaxKind.QuestionToken,
		ts.SyntaxKind.EqualsToken,
		ts.SyntaxKind.EqualsGreaterThanToken,
		ts.SyntaxKind.ReturnKeyword,
		ts.SyntaxKind.CaseKeyword,
		ts.SyntaxKind.ThrowKeyword,
		ts.SyntaxKind.DeleteKeyword,
		ts.SyntaxKind.TypeOfKeyword,
		ts.SyntaxKind.VoidKeyword,
		ts.SyntaxKind.NewKeyword,
		ts.SyntaxKind.InKeyword,
		ts.SyntaxKind.OfKeyword,
		ts.SyntaxKind.YieldKeyword,
		ts.SyntaxKind.AwaitKeyword,
		ts.SyntaxKind.BarBarToken,
		ts.SyntaxKind.AmpersandAmpersandToken,
		ts.SyntaxKind.QuestionQuestionToken,
		ts.SyntaxKind.ExclamationToken,
	].includes(token);
}

function normalizedUnit(unit: LocalUnit): LocalUnit {
	return {
		id: unit.id,
		name: unit.name,
		code: {
			path: unit.code.path,
			symbol: unit.code.symbol,
			...(unit.code.members?.length ? { members: [...unit.code.members].sort() } : {}),
		},
		linear: [...new Set(unit.linear)].sort(),
		...(unit.obsidian ? { obsidian: unit.obsidian } : {}),
	};
}

export function syncLocalUnitRegistry(options: { projectRoot: string; dataRoot?: string; obsidianRoot?: string; checkOnly?: boolean }): LocalUnitSyncResult {
	const projectRoot = resolve(options.projectRoot);
	const manifest = loadLocalUnitManifest(projectRoot);
	const errors = validateLocalUnitManifest(projectRoot, manifest, options.obsidianRoot);
	if (errors.length) throw new Error(errors.join("\n"));
	const ledger = loadLedger(projectRoot);
	const indexPath = join(resolve(options.dataRoot ?? process.env.WWW_DATA_DIR ?? join(homedir(), ".local/share/www")), "development/index.sqlite");
	const units = manifest.units.map(normalizedUnit).sort((left, right) => left.id.localeCompare(right.id));
	const valueDigest = digest(canonical({ schemaVersion: manifest.schemaVersion, units }));
	if (!options.checkOnly) {
		mkdirSync(dirname(indexPath), { recursive: true, mode: 0o700 });
		const db = new Database(indexPath, { create: true, strict: true });
		try {
			db.run("PRAGMA busy_timeout = 10000");
			db.run("PRAGMA journal_mode = WAL");
			db.run("PRAGMA foreign_keys = ON");
			db.run("CREATE TABLE IF NOT EXISTS local_code_units (project TEXT NOT NULL, code_id TEXT NOT NULL, name TEXT NOT NULL, path TEXT NOT NULL, symbol TEXT NOT NULL, members TEXT NOT NULL, obsidian TEXT, payload_digest TEXT NOT NULL, PRIMARY KEY(project,code_id), UNIQUE(project,path,symbol))");
			const unitColumns = db.query<{ name: string }, []>("PRAGMA table_info(local_code_units)").all();
			if (!unitColumns.some(column => column.name === "members")) db.run("ALTER TABLE local_code_units ADD COLUMN members TEXT NOT NULL DEFAULT '[]'");
			db.run("CREATE TABLE IF NOT EXISTS local_code_linear (project TEXT NOT NULL, code_id TEXT NOT NULL, issue_id TEXT NOT NULL, PRIMARY KEY(project,code_id,issue_id), FOREIGN KEY(project,code_id) REFERENCES local_code_units(project,code_id) ON DELETE CASCADE)");
			db.run("CREATE TABLE IF NOT EXISTS local_code_meta (project TEXT NOT NULL PRIMARY KEY, manifest_digest TEXT NOT NULL)");
			db.run("BEGIN IMMEDIATE");
			db.query("DELETE FROM local_code_linear WHERE project = ?").run(ledger.projectId);
			db.query("DELETE FROM local_code_units WHERE project = ?").run(ledger.projectId);
			db.query("DELETE FROM local_code_meta WHERE project = ?").run(ledger.projectId);
			const insertUnit = db.query("INSERT INTO local_code_units(project,code_id,name,path,symbol,members,obsidian,payload_digest) VALUES (?,?,?,?,?,?,?,?)");
			const insertLink = db.query("INSERT INTO local_code_linear(project,code_id,issue_id) VALUES (?,?,?)");
			for (const unit of units) {
				insertUnit.run(ledger.projectId, unit.id, unit.name, unit.code.path, unit.code.symbol, canonical(unit.code.members ?? []), unit.obsidian ?? null, digest(canonical(unit)));
				for (const issueId of unit.linear) insertLink.run(ledger.projectId, unit.id, issueId);
			}
			db.query("INSERT INTO local_code_meta(project,manifest_digest) VALUES (?,?)").run(ledger.projectId, valueDigest);
			db.run("COMMIT");
		} catch (error) {
			try { db.run("ROLLBACK"); } catch {}
			throw error;
		} finally {
			db.close();
		}
	}
	return { units: units.length, links: units.reduce((count, unit) => count + unit.linear.length, 0), digest: valueDigest, indexPath };
}
