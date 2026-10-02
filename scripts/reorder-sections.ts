import      { readFileSync, writeFileSync } from "node:fs"                   ;
import      { resolve                     } from "node:path"                 ;
import      { SyntaxKind                  } from "typescript/unstable/ast"   ;
import      { API                         } from "typescript/unstable/async" ;

// Section reordering for docs/workflows/FEATURE_IMPLEMENTATION_CONTRACT.md, driven by the TypeScript AST.
// Only whole top-level statements move, with their leading comments and decorators; statement text is never edited.
//   functions — internal `function` declarations above the last public declaration move to the end (§3 before §4)
//   types     — exported `type`/`interface` declarations below the first runtime statement move above it (§1 before §2),
//               except types that use `typeof`, which stay next to the value they derive from
// After writing, the file is parsed again; if the statements are not the same set in the planned order, it is restored.

export type Command = "functions" | "types";

/** Role of one top-level statement for reordering. */
export type StatementRole = "public" | "internal-function" | "internal-overload" | "public-type" | "derived-type" | "runtime" | "other";

/** One top-level statement: its role and its source text including leading trivia (blank lines, comments, decorators). */
export interface Statement {
	readonly role : StatementRole ;
	readonly name : string        ;
	readonly text : string        ;
}

/** A parsed file: the file header (shebang, pragmas, comments before the first blank line), statements, trailing text and line ending. */
export interface ParsedFile {
	readonly eol        : "\n" | "\r\n"        ;
	readonly head       : string               ;
	readonly statements : readonly Statement[] ;
	readonly tail       : string               ;
}

/** Planned order of a file and the statements that move. */
export interface Plan {
	readonly order : readonly Statement[] ;
	readonly moved : readonly Statement[] ;
}

/** Reorders internal functions to the end (`functions`) or public types upward (`types`); pure, no I/O. */
export function plan(command: Command, statements: readonly Statement[]): Plan {
	return command === "functions" ? planFunctions(statements) : planTypes(statements);
}

/** Renders a planned order back to text. Moved statements and their new neighbors get one separating blank line. */
export function render(file: ParsedFile, planned: Plan): string {
	const moved = new Set(planned.moved);
	const body  = planned.order.map((statement, index) => {
		const previous = planned.order[index - 1];
		if (index === 0) return statement === file.statements[0] ? statement.text : stripLeadingBlankLines(statement.text);
		if (moved.has(statement) || (previous && moved.has(previous))) return separated(statement, previous, file.eol);
		return statement.text;
	});
	return file.head + body.join("") + file.tail;
}

/** Parses files with the TypeScript project service and returns their top-level statements. */
export async function parseFiles(root: string, files: readonly string[]): Promise<Map<string, ParsedFile>> {
	const absolute = files.map(file => resolve(root, file)) ;
	const api      = new API({ cwd: root })                 ;
	try {
		const snapshot = await api.updateSnapshot({ openFiles: absolute }) ;
		const parsed   = new Map<string, ParsedFile>()                     ;
		for (const [index, path] of absolute.entries()) {
			const project = await snapshot.getDefaultProjectForFile(path) ;
			const source  = await project?.program.getSourceFile(path)    ;
			if (!source) throw new Error(`cannot parse ${files[index]}`);
			parsed.set(files[index]!, toParsedFile(readFileSync(path, "utf8"), source.statements as unknown as readonly SyntaxNode[]));
		}
		return parsed;
	} finally {
		await api.close();
	}
}

async function main(args: readonly string[]): Promise<void> {
	const [command, ...files] = args;
	if (command !== "functions" && command !== "types") throw new Error("Usage: bun scripts/reorder-sections.ts <functions|types> <file...>");
	const root               = process.cwd()                 ;
	const before             = await parseFiles(root, files) ;
	const planned            = new Map<string, Plan>()       ;
	const written : string[] = []                            ;
	try {
		for (const [file, parsed] of before) {
			const result = plan(command, parsed.statements);
			planned.set(file, result);
			if (!result.moved.length) continue;
			writeFileSync(resolve(root, file), render(parsed, result));
			written.push(file);
		}
		const after = written.length ? await parseFiles(root, written) : new Map<string, ParsedFile>()               ;
		const drift = written.filter(file => !sameStatements(planned.get(file)!.order, after.get(file)!.statements)) ;
		if (drift.length) throw new Error(`reparsed statements differ from the plan: ${drift.join(", ")}`);
	} catch (error) {
		for (const file of written) writeFileSync(resolve(root, file), sourceText(before.get(file)!));
		throw new Error(`${error instanceof Error ? error.message : String(error)} — restored ${written.length} file(s)`);
	}
	for (const [file, result] of planned) process.stdout.write(`${file} ${command} moved ${result.moved.length}${movedNames(result)}\n`);
}

function planFunctions(statements: readonly Statement[]): Plan {
	const lastPublic = statements.findLastIndex(statement => statement.role === "public")                                                                   ;
	const merged     = new Set(statements.filter(statement => !FUNCTION_ROLES.has(statement.role)).map(statement => statement.name))                        ;
	const bodies     = statements.filter((statement, index) => index < lastPublic && statement.role === "internal-function" && !merged.has(statement.name)) ;
	const names      = new Set(bodies.map(statement => statement.name))                                                                                     ;
	const moved      = statements.filter(statement => bodies.includes(statement) || (statement.role === "internal-overload" && names.has(statement.name)))  ;
	return { order: [...statements.filter(statement => !moved.includes(statement)), ...moved], moved };
}

function planTypes(statements: readonly Statement[]): Plan {
	const firstRuntime = statements.findIndex(statement => isRuntime(statement.role));
	if (firstRuntime < 0) return { order: statements, moved: [] };
	const moved = statements.filter((statement, index) => index > firstRuntime && statement.role === "public-type") ;
	const kept  = statements.filter(statement => !moved.includes(statement))                                        ;
	const at    = kept.indexOf(statements[firstRuntime]!)                                                           ;
	return { order: [...kept.slice(0, at), ...moved, ...kept.slice(at)], moved };
}

/** Minimal shape of an AST node used here; the unstable API exposes more. */
interface SyntaxNode {
	readonly kind       : SyntaxKind                               ;
	readonly pos        : number                                   ;
	readonly end        : number                                   ;
	readonly modifiers? : readonly { readonly kind: SyntaxKind }[] ;
	readonly name?      : { readonly text?: string }               ;
	readonly body?      : unknown                                  ;
	forEachChild<T>(visit: (child: SyntaxNode) => T | undefined): T | undefined;
}

const FUNCTION_ROLES : ReadonlySet<StatementRole> = new Set(["public", "internal-function", "internal-overload"])                     ;
const FILE_PRAGMA    : RegExp                     = /^(?:#!|\/\/\/ ?<|\/\/ ?@ts-|\/\/ ?eslint|\/\* ?eslint|\/\/ ?@jsx|\/\*\* ?@jsx)/u ;

/**
 * Statement ranges start at the AST full start; a comment ending a statement's last line stays with that statement.
 * The file header — shebang, pragma comments and anything before the first statement's last blank line — never moves.
 */
function toParsedFile(text: string, nodes: readonly SyntaxNode[]): ParsedFile {
	const eol = text.includes("\r\n") ? "\r\n" : "\n";
	if (!nodes.length) return { eol, head: text, statements: [], tail: "" };
	const ends    = nodes.map(node => node.end + trailingCommentLength(text, node.end)) ;
	const headEnd = fileHeaderEnd(text, nodes[0]!.pos, nodes[0]!.end)                   ;
	return {
		eol,
		head       : text.slice(0, headEnd),
		statements : nodes.map((node, index) => ({ role: roleOf(node, text), name: nameOf(node), text: text.slice(index ? ends[index - 1] : headEnd, ends[index]) })),
		tail       : text.slice(ends.at(-1)),
	};
}

/** End of the file header inside the first statement's leading trivia: past the last blank line and every pragma line. */
function fileHeaderEnd(text: string, start: number, end: number): number {
	const trivia  = /^(?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/|#![^\n]*)*/u.exec(text.slice(start, end))?.[0] ?? "" ;
	let   headEnd = start                                                                                    ;
	let   offset  = start                                                                                    ;
	for (const line of trivia.split(/(?<=\n)/u)) {
		offset += line.length;
		if (!line.endsWith("\n")) break;
		if (!line.trim() || FILE_PRAGMA.test(line.trimStart())) headEnd = offset;
	}
	return headEnd;
}

function trailingCommentLength(text: string, end: number): number {
	return /^[ \t]*(?:\/\/[^\n]*|\/\*(?:(?!\*\/)[^\n])*\*\/[ \t]*)(?=\r?\n|$)/u.exec(text.slice(end))?.[0].length ?? 0;
}

function roleOf(node: SyntaxNode, text: string): StatementRole {
	const exported = node.modifiers?.some(modifier => modifier.kind === SyntaxKind.ExportKeyword) ?? false;
	if (node.kind === SyntaxKind.TypeAliasDeclaration || node.kind === SyntaxKind.InterfaceDeclaration) {
		if (!exported) return "other";
		return usesTypeQuery(node) ? "derived-type" : "public-type";
	}
	if (node.kind === SyntaxKind.FunctionDeclaration) return exported ? "public" : node.body ? "internal-function" : "internal-overload";
	if (node.kind === SyntaxKind.ClassDeclaration || node.kind === SyntaxKind.VariableStatement) return exported ? "public" : "runtime";
	if (node.kind === SyntaxKind.ImportDeclaration || node.kind === SyntaxKind.ImportEqualsDeclaration || node.kind === SyntaxKind.ExportDeclaration) return "other";
	if (node.kind === SyntaxKind.ExportAssignment) return "public";
	if (node.kind === SyntaxKind.ExpressionStatement && /^\s*(["'])use [\w ]+\1;?\s*$/u.test(text.slice(node.pos, node.end))) return "other";
	return "runtime";
}

function nameOf(node: SyntaxNode): string {
	return node.name?.text ?? SyntaxKind[node.kind] ?? "statement";
}

function usesTypeQuery(node: SyntaxNode): boolean {
	return node.forEachChild(child => child.kind === SyntaxKind.TypeQuery || usesTypeQuery(child) ? true : undefined) ?? false;
}

function isRuntime(role: StatementRole): boolean {
	return role === "public" || role === "internal-function" || role === "internal-overload" || role === "runtime";
}

/** Overload groups and one-line statements of the same role stay packed; otherwise one blank line separates neighbors. */
function separated(statement: Statement, previous: Statement | undefined, eol: string): string {
	const overload = previous?.role === "internal-overload" && previous.name === statement.name                                                ;
	const packed   = overload || (previous !== undefined && singleLine(previous) && singleLine(statement) && previous.role === statement.role) ;
	return `${packed ? eol : eol + eol}${stripLeadingBlankLines(statement.text)}`;
}

function stripLeadingBlankLines(text: string): string {
	return text.replace(/^(?:[ \t]*\r?\n)+/u, "");
}

function singleLine(statement: Statement): boolean {
	return !stripLeadingBlankLines(statement.text).includes("\n");
}

/** Same statements in the same order, compared on text without leading blank lines. */
function sameStatements(expected: readonly Statement[], actual: readonly Statement[]): boolean {
	const code = (statement: Statement) => stripLeadingBlankLines(statement.text);
	return expected.length === actual.length && expected.every((statement, index) => code(statement) === code(actual[index]!));
}

function sourceText(file: ParsedFile): string {
	return file.head + file.statements.map(statement => statement.text).join("") + file.tail;
}

function movedNames(result: Plan): string {
	return result.moved.length ? ` (${result.moved.map(statement => statement.name).join(", ")})` : "";
}

if (import.meta.main) await main(process.argv.slice(2));
