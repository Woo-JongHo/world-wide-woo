import      { existsSync, readFileSync, realpathSync, statSync } from "node:fs"   ;
import      { extname, isAbsolute, join, relative, resolve     } from "node:path" ;
import * as ts                                                         from "typescript/unstable/ast";
import YAML                                                            from "yaml";

export interface LocalUnit {
	id   : string                                               ;
	name : string                                               ;
	code : { path: string; symbol: string; members?: string[] } ;
}

export interface LocalUnitManifest {
	schemaVersion: 1;
	units: LocalUnit[]
}
interface NamedDeclaration {
	name    : string                                      ;
	kind    : "class" | "function" | "interface" | "type" ;
	members : Set<string>                                 ;
}

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

function containedFile(root: string, localPath: string): string | undefined {
	if (!localPath || isAbsolute(localPath) || localPath.split(/[\\/]/u).includes("..")) return undefined;
	const path = resolve(root, localPath);
	if (!existsSync(path) || !statSync(path).isFile()) return undefined;
	const canonicalRoot = realpathSync(root)                     ;
	const canonicalPath = realpathSync(path)                     ;
	const offset        = relative(canonicalRoot, canonicalPath) ;
	if (offset === ".." || offset.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(offset)) return undefined;
	return canonicalPath;
}

export function validateLocalUnitManifest(projectRoot: string, manifest: LocalUnitManifest): string[] {
	const errors : string[] = []                ;
	const ids               = new Set<string>() ;
	const owners            = new Set<string>() ;
	for (const unit of manifest.units) {
		if (!/^Code-\d{3}$/u.test(unit.id)) errors.push(`${unit.id}: Code-NNN 형식이어야 합니다.`);
		if (ids.has(unit.id)) errors.push(`${unit.id}: Code-ID가 중복됩니다.`);
		ids.add(unit.id);
		if (typeof unit.name !== "string" || !unit.name.trim()) errors.push(`${unit.id}: 이름이 필요합니다.`);

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
	}
	return errors;
}

function scanNamedDeclarations(source: string): NamedDeclaration[] {
	const scanner                             = ts.createScanner(true, ts.LanguageVariant.Standard, source) ;
	const declarations   : NamedDeclaration[] = []                                                          ;
	let depth                                 = 0                                                           ;
	let pending          : NamedDeclaration["kind"] | undefined                                             ;
	let activeClass      : NamedDeclaration | undefined                                                     ;
	let possibleMember   : string | undefined                                                               ;
	const templateDepths : number[]           = []                                                          ;
	let previousEnd                           = -1                                                          ;
	let previousToken    : ts.SyntaxKind | undefined                                                        ;

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
