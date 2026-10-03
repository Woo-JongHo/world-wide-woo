import      { readFileSync } from "node:fs"                   ;
import      { resolve      } from "node:path"                 ;
import      { SyntaxKind   } from "typescript/unstable/ast"   ;
import      { API          } from "typescript/unstable/async" ;

// Function paragraph candidates for docs/workflows/FEATURE_IMPLEMENTATION_CONTRACT.md (F1 guard → F2 prepare → F3 steps → F4 result).
// Each statement directly in a function body is classified; nested statements belong to their parent statement.
//   G guard   — `if` without `else` whose only statement is return/throw/continue/break, or a bare throw
//   D prepare — variable declaration
//   B step    — any other statement
//   R result  — return
// A candidate is a declaration after the first step: the function prepares a new value in the middle of its steps.
// Guards and declarations may alternate before the first step (staged guards). Report only, never a rewrite.

/** One classified statement letter. */
export type ParagraphKind = "G" | "D" | "B" | "R";

/** Paragraph shape of one function body. */
export interface FunctionParagraph {
	readonly path        : string  ;
	readonly line        : number  ;
	readonly name        : string  ;
	readonly shape       : string  ;
	readonly interleaved : boolean ;
}

/** True when a declaration appears after the first step statement. */
export function isInterleaved(shape: string): boolean {
	return /B[^D]*D/u.test(shape);
}

/** Function paragraphs of every function-like body with at least `minimum` statements in the given files. */
export async function scanFunctionParagraphs(root: string, files: readonly string[], minimum = 1): Promise<FunctionParagraph[]> {
	const absolute = files.map(file => resolve(root, file)) ;
	const api      = new API({ cwd: root })                 ;
	try {
		const snapshot                       = await api.updateSnapshot({ openFiles: absolute }) ;
		const found    : FunctionParagraph[] = []                                                ;
		for (const [index, path] of absolute.entries()) {
			const project = await snapshot.getDefaultProjectForFile(path) ;
			const source  = await project?.program.getSourceFile(path)    ;
			if (!source) throw new Error(`cannot parse ${files[index]}`);
			collect(source as unknown as SyntaxNode, files[index]!, readFileSync(path, "utf8"), minimum, found);
		}
		return found;
	} finally {
		await api.close();
	}
}

async function main(args: readonly string[]): Promise<void> {
	const files    = args.filter(arg => !arg.startsWith("--"))                      ;
	const all      = args.includes("--all")                                         ;
	const found    = await scanFunctionParagraphs(process.cwd(), files)             ;
	const reported = all ? found : found.filter(paragraph => paragraph.interleaved) ;
	for (const paragraph of reported) process.stdout.write(`${paragraph.path}:${paragraph.line} ${paragraph.name} ${paragraph.shape}\n`);
	process.stdout.write(`${found.length} functions, ${found.filter(paragraph => paragraph.interleaved).length} with a declaration after the first step\n`);
}

/** Minimal shape of an AST node used here; the unstable API exposes more. */
interface SyntaxNode {
	readonly kind           : SyntaxKind                 ;
	readonly pos            : number                     ;
	readonly end            : number                     ;
	readonly name?          : { readonly text?: string } ;
	readonly body?          : SyntaxNode                 ;
	readonly statements?    : readonly SyntaxNode[]      ;
	readonly thenStatement? : SyntaxNode                 ;
	readonly elseStatement? : SyntaxNode                 ;
	forEachChild<T>(visit: (child: SyntaxNode) => T | undefined): T | undefined;
}

const FUNCTION_KINDS = new Set([
	SyntaxKind.FunctionDeclaration,
	SyntaxKind.FunctionExpression,
	SyntaxKind.ArrowFunction,
	SyntaxKind.MethodDeclaration,
	SyntaxKind.Constructor,
	SyntaxKind.GetAccessor,
	SyntaxKind.SetAccessor,
]);

const DECLARATIONS = new Set([SyntaxKind.VariableStatement, SyntaxKind.FunctionDeclaration, SyntaxKind.ClassDeclaration]);

const EXITS = new Set([SyntaxKind.ReturnStatement, SyntaxKind.ThrowStatement, SyntaxKind.ContinueStatement, SyntaxKind.BreakStatement]);

/** `owner` names an arrow or function expression after the property or variable that holds it. */
function collect(node: SyntaxNode, path: string, text: string, minimum: number, found: FunctionParagraph[], owner?: string): void {
	const statements = FUNCTION_KINDS.has(node.kind) && node.body?.kind === SyntaxKind.Block ? node.body.statements ?? [] : [];
	if (statements.length >= minimum) {
		const shape = statements.map(classify).join("");
		found.push({ path, line: lineOf(text, node.pos), name: node.name?.text ?? owner ?? "(anonymous)", shape, interleaved: isInterleaved(shape) });
	}
	const name = node.kind === SyntaxKind.PropertyDeclaration || node.kind === SyntaxKind.VariableDeclaration || node.kind === SyntaxKind.PropertyAssignment ? node.name?.text : undefined;
	node.forEachChild(child => { collect(child, path, text, minimum, found, name); return undefined; });
}

/** Local type declarations have no runtime effect and are skipped; local functions and classes prepare values like declarations. */
function classify(statement: SyntaxNode): ParagraphKind | "" {
	if (statement.kind === SyntaxKind.TypeAliasDeclaration || statement.kind === SyntaxKind.InterfaceDeclaration) return "";
	if (statement.kind === SyntaxKind.ReturnStatement) return "R";
	if (statement.kind === SyntaxKind.ThrowStatement || isGuard(statement)) return "G";
	if (DECLARATIONS.has(statement.kind)) return "D";
	return "B";
}

function isGuard(statement: SyntaxNode): boolean {
	if (statement.kind !== SyntaxKind.IfStatement || statement.elseStatement || !statement.thenStatement) return false;
	const then = statement.thenStatement                                         ;
	const body = then.kind === SyntaxKind.Block ? then.statements ?? [] : [then] ;
	return body.length === 1 && EXITS.has(body[0]!.kind);
}

/** 1-based line of the first non-trivia character at or after `pos`. */
function lineOf(text: string, pos: number): number {
	const trivia = /^(?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*/u.exec(text.slice(pos))?.[0].length ?? 0;
	return text.slice(0, pos + trivia).split("\n").length;
}

if (import.meta.main) await main(process.argv.slice(2));
