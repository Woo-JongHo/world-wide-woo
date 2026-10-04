import      { readFileSync, writeFileSync } from "node:fs"                           ;
import      { resolve                     } from "node:path"                         ;
import      { loadSourceGraph             } from "../test/architecture/import-graph" ;
import type { SourceNode                  } from "../test/architecture/import-graph" ;
import      { parseFiles, plan            } from "./reorder-sections"                ;
import type { Statement                   } from "./reorder-sections"                ;
import      { scanFunctionParagraphs      } from "./function-paragraphs"             ;
import type { FunctionParagraph           } from "./function-paragraphs"             ;

// Generated projection of docs/workflows/FEATURE_IMPLEMENTATION_CONTRACT.md: every TUI feature read in chapter order.

type Graph = ReadonlyMap<string, SourceNode>;

interface FeatureChapters {
	readonly feature    : string                        ;
	readonly chapters   : ReadonlyMap<string, string[]> ;
	readonly findings   : readonly string[]             ;
	readonly types      : readonly string[]             ;
	readonly paragraphs : readonly string[]             ;
}

const FEATURE_ROOT = "adapters/inbound/tui/features/"                            ;
const MAP_PATH     = resolve(import.meta.dir, "../docs/features/FEATURE_MAP.md") ;
const CHAPTERS     = [
	"0. 연결",
	"1. 정의",
	"2. 흐름",
	"3. 경계",
	"4. 입력·조작",
	"5. 외부 효과",
	"6. 해석",
	"7. 표현",
	"8. 조립",
	"9. 검증",
] as const;

async function main(args: readonly string[]): Promise<void> {
	const [command, feature] = args;
	const source   = await loadSourceGraph(resolve(import.meta.dir, "../src"))                                                                          ;
	const tests    = await loadSourceGraph(resolve(import.meta.dir, "../test"))                                                                         ;
	const parsed   = await parseFiles(resolve(import.meta.dir, "../src"), [...source.keys()].filter(path => path.startsWith(FEATURE_ROOT)))             ;
	const scanned  = await scanFunctionParagraphs(resolve(import.meta.dir, "../src"), [...source.keys()].filter(path => path.startsWith(FEATURE_ROOT))) ;
	const features = featureNames(source).map(name => projectFeature(name, source, tests, parsed, scanned))                                             ;
	if (command === "report" && feature) return void process.stdout.write(renderFeature(requireFeature(features, feature)));
	const rendered = renderMap(features);
	if (command === "build") return void writeFileSync(MAP_PATH, rendered);
	if (command === "check") {
		if (readFileSync(MAP_PATH, "utf8") !== rendered) throw new Error("Feature Map is stale: bun run feature-map:build");
		return void process.stdout.write(`Feature Map current: ${features.length} features\n`);
	}
	throw new Error("Usage: bun scripts/feature-map.ts <build|check|report <feature>>");
}

/** Every feature folder name; root files such as feature-registry.ts are not features. */
function featureNames(source: Graph): string[] {
	const names = [...source.keys()].filter(path => path.startsWith(FEATURE_ROOT) && path.slice(FEATURE_ROOT.length).includes("/"));
	return [...new Set(names.map(path => path.slice(FEATURE_ROOT.length).split("/")[0]!))].sort();
}

function projectFeature(feature: string, source: Graph, tests: Graph, parsed: ReadonlyMap<string, { readonly statements: readonly Statement[] }>, scanned: readonly FunctionParagraph[]): FeatureChapters {
	const prefix   = `${FEATURE_ROOT}${feature}/`                                      ;
	const own      = [...source.keys()].filter(path => path.startsWith(prefix)).sort() ;
	const imported = unique(own.flatMap(path => source.get(path)?.imports ?? []))      ;
	const ports    = imported.filter(path => path.startsWith("core/ports/"))           ;
	const chapters = new Map<string, string[]>([
		["0. 연결",      own.filter(path => path.includes("/registration/"))],
		["1. 정의",      imported.filter(path => path.startsWith("core/domain/"))],
		["2. 흐름",      imported.filter(path => path.startsWith("core/application/") || path.startsWith("core/runtime/"))],
		["3. 경계",      ports],
		["4. 입력·조작", own.filter(path => path.includes("/controller/"))],
		["5. 외부 효과", implementers(ports, source)],
		["6. 해석",      own.filter(path => path.includes("/view-model/"))],
		["7. 표현",      [...own.filter(path => path.includes("/view/")), ...imported.filter(path => path.startsWith("adapters/inbound/tui/foundation/"))]],
		["8. 조립",      assemblers(own, source)],
		["9. 검증",      testsCovering(own, tests)],
	]);
	const text = (path: string) => source.get(path)?.text ?? "";
	return { feature, chapters, findings: own.flatMap(path => sectionOrderFindings(path, text(path))), types: own.flatMap(path => typeOrderFindings(path, parsed.get(path)?.statements ?? [])), paragraphs: paragraphFindings(own, scanned) };
}

/** Outbound classes that import a port the feature uses and declare `implements`; type-only consumers are excluded. */
function implementers(ports: readonly string[], source: Graph): string[] {
	return [...source.values()]
		.filter(node => node.path.startsWith("adapters/outbound/") && /\bimplements\b/u.test(node.text) && node.imports.some(path => ports.includes(path)))
		.map(node => node.path)
		.sort();
}

function assemblers(own: readonly string[], source: Graph): string[] {
	return [...source.values()]
		.filter(node => (node.path === "app.ts" || node.path.startsWith("adapters/inbound/tui/shell/")) && node.imports.some(path => own.includes(path)))
		.map(node => node.path)
		.sort();
}

function testsCovering(own: readonly string[], tests: Graph): string[] {
	return [...tests.values()]
		.filter(node => node.imports.some(path => own.includes(sourcePathOfTestImport(path))))
		.map(node => `test/${node.path}`)
		.sort();
}

/**
 * Candidate §3-after-§4 findings from top-level lines: a public declaration below the first internal one.
 * Report only. Zero findings do not prove the whole section order; types and constants are not checked.
 * Classes with `extends` or `static` members are tagged because moving them can change initialization order.
 */
export function sectionOrderFindings(path: string, text: string): string[] {
	const lines         = withoutBlockComments(text).split("\n")                                                               ;
	const reexported    = new Set([...lines.join("\n").matchAll(/^export \{([^}]*)\}/gmu)].flatMap(match => names(match[1]!))) ;
	const isPublic      = (line: string) => PUBLIC_DECLARATION.test(line) || reexported.has(declaredName(line))                ;
	const firstInternal = lines.findIndex(line => INTERNAL_DECLARATION.test(line) && !isPublic(line))                          ;
	if (firstInternal < 0) return [];
	return lines.flatMap((line, index) => index > firstInternal && isPublic(line)
		? [`${path}:${index + 1} 공개 선언이 내부 처리(${firstInternal + 1}줄) 뒤에 있음${initializationRisk(line, text)}`]
		: []);
}

/** §1-after-§2 findings: exactly the types `reorder-sections.ts types` would move (same AST plan, `typeof` types excluded). */
export function typeOrderFindings(path: string, statements: readonly Statement[]): string[] {
	return plan("types", statements).moved.map(statement => `${path} 공개 타입 ${statement.name}이 첫 실행 선언 뒤에 있음`);
}

const PUBLIC_DECLARATION   = /^export (?:default )?(?:(?:async )?function\b|(?:abstract )?class\b|const \w+\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\(|function\b|\w+\s*=>))/u ;
const INTERNAL_DECLARATION = /^(?:(?:async )?function\b|(?:abstract )?class\b|const \w+\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\(|function\b|\w+\s*=>))/u                     ;

function withoutBlockComments(text: string): string {
	return text.replace(/\/\*[\s\S]*?\*\//gu, comment => comment.replace(/[^\n]/gu, " "));
}

function declaredName(line: string): string {
	return /^(?:async )?(?:function\*?|(?:abstract )?class|const)\s+(\w+)/u.exec(line)?.[1] ?? "";
}

function names(list: string): string[] {
	return list.split(",").map(entry => entry.trim().split(/\s+as\s+/u)[0]!.replace(/^type\s+/u, "")).filter(Boolean);
}

function initializationRisk(line: string, text: string): string {
	return /\bclass\b/u.test(line) && (/\bextends\b/u.test(line) || /\bstatic\b/u.test(withoutBlockComments(text))) ? " — 초기화 순서 확인 필요(extends/static)" : "";
}

function renderMap(features: readonly FeatureChapters[]): string {
	const head = [
		"# Feature Map",
		"",
		"> 생성 파일 — `bun run feature-map:build`로 다시 만든다. 손으로 고치지 않는다.",
		"> 형식: [Feature Implementation Contract](../workflows/FEATURE_IMPLEMENTATION_CONTRACT.md)",
		"> 장은 기능 폴더 파일의 **직접 import**에서 추정한 후보다. `미발견`은 책임이 없다는 뜻이 아니다. 전이 의존·주입 경로·파일 안의 책임은 추적하지 않는다.",
		"> 외부 효과는 기능이 쓰는 Port를 import하고 `implements`를 선언한 outbound 파일만 센다. 검증은 기능 폴더를 직접 import하는 테스트만 센다.",
		"> 절 순서 열은 최상위 선언 줄 패턴의 후보 수다(§3·§4). 타입 순서 열은 첫 실행 선언 뒤에 있는 공개 타입 수다(§1·§2). 문단 열은 첫 처리 문장 뒤에 선언이 있는 함수 수다(F3). 0은 전체 순서 준수의 증거가 아니다.",
		"",
		"| 기능 | " + CHAPTERS.join(" | ") + " | 절 순서 후보 | 타입 순서 후보 | 문단 후보 |",
		"|---|" + CHAPTERS.map(() => "---:").join("|") + "|---:|---:|---:|",
		...features.map(entry => `| ${entry.feature} | ${CHAPTERS.map(name => entry.chapters.get(name)?.length || "·").join(" | ")} | ${entry.findings.length || "·"} | ${entry.types.length || "·"} | ${entry.paragraphs.length || "·"} |`),
		"",
	];
	return [...head, ...features.map(renderFeature)].join("\n");
}

function renderFeature(entry: FeatureChapters): string {
	const chapters = CHAPTERS.map(name => {
		const paths = entry.chapters.get(name) ?? [];
		return `- **${name}** ${paths.length ? paths.map(path => `\`${path}\``).join(", ") : "미발견"}`;
	});
	const findings   = entry.findings.length ? ["", "절 순서 후보:", ...entry.findings.map(finding => `- ${finding}`)] : []  ;
	const types      = entry.types.length ? ["", "타입 순서 후보:", ...entry.types.map(finding => `- ${finding}`)] : []      ;
	const paragraphs = entry.paragraphs.length ? ["", "문단 후보:", ...entry.paragraphs.map(finding => `- ${finding}`)] : [] ;
	return [`## ${entry.feature}`, "", ...chapters, ...findings, ...types, ...paragraphs, ""].join("\n");
}

/** F3 candidates: functions in the feature that declare a value after their first step (same rule as `function-paragraphs.ts`). */
function paragraphFindings(own: readonly string[], scanned: readonly FunctionParagraph[]): string[] {
	return scanned.filter(paragraph => paragraph.interleaved && own.includes(paragraph.path)).map(paragraph => `${paragraph.path}:${paragraph.line} ${paragraph.name} ${paragraph.shape}`);
}

function requireFeature(features: readonly FeatureChapters[], feature: string): FeatureChapters {
	const found = features.find(entry => entry.feature === feature);
	if (!found) throw new Error(`Unknown feature: ${feature} (${features.map(entry => entry.feature).join(", ")})`);
	return found;
}

function sourcePathOfTestImport(path: string): string {
	const relative = path.replace(/^(?:\.\.\/)+src\//u, "");
	return relative.endsWith(".ts") ? relative : `${relative}.ts`;
}

function unique(values: readonly string[]): string[] {
	return [...new Set(values)].sort();
}

if (import.meta.main) await main(process.argv.slice(2));
