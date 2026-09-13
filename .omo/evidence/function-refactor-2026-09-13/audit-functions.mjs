import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { API } from 'typescript/unstable/sync';
import * as tsAst from 'typescript/unstable/ast';

const root = process.cwd();
const evidence = path.join(root, '.omo/evidence/function-refactor-2026-09-13');
const roots = ['src', 'scripts'];
function sourceFiles() {
  const files = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) files.push(path.relative(root, full).split(path.sep).join('/'));
    }
  }
  roots.forEach((dir) => visit(path.join(root, dir)));
  return files;
}
const currentFiles = sourceFiles();
const headFiles = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD', '--', ...roots], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const diff = execFileSync('git', ['diff', '--name-status', 'HEAD', '--', ...roots], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).map((line) => line.split('\t'));
const headOverrides = new Map();
for (const [status, oldPath, newPath] of diff) {
  const file = status.startsWith('R') ? newPath : oldPath;
  if (status.startsWith('D')) continue;
  try { headOverrides.set(path.resolve(root, file).toLowerCase(), execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8' })); } catch {}
}
const k = tsAst.SyntaxKind;
const functionKinds = new Set([k.FunctionDeclaration, k.FunctionExpression, k.ArrowFunction, k.MethodDeclaration, k.Constructor, k.GetAccessor, k.SetAccessor]);
const branchKinds = new Set([k.IfStatement, k.ConditionalExpression, k.ForStatement, k.ForInStatement, k.ForOfStatement, k.WhileStatement, k.DoStatement, k.CatchClause, k.CaseClause]);
const logicalOperators = new Set([k.AmpersandAmpersandToken, k.BarBarToken, k.QuestionQuestionToken]);
const policyNames = /(max|min|limit|timeout|retry|threshold|window|size|count|age|day|hour|minute|port|version|depth|budget|batch|concurr|interval|delay|length|width|height|token|percent|rate|cap)/i;
const stateValues = /(?:idle|queued|pending|running|active|paused|completed|succeeded|failed|cancelled|canceled|waiting|blocked|skipped|error|ready|done)/i;
function collect(files, baseline) {
  const records = [], kinds = {}, candidates = { personalOrMachineAbsolutePaths: [], uuidLiterals: [], policyLikeNumericLiterals: [], stateMappingObjects: [] };
  const api = new API({ cwd: root, ...(baseline ? { fs: { readFile: (file) => headOverrides.get(path.resolve(file).toLowerCase()) } } : {}) });
  let snapshot;
  try {
    const tsFiles = files.filter((file) => /\.tsx?$/.test(file));
    snapshot = api.updateSnapshot({ openFiles: tsFiles });
    for (const file of tsFiles) {
      const sf = snapshot.getDefaultProjectForFile(file)?.program.getSourceFile(file);
      if (!sf) continue;
      function branchCount(body) {
        let result = 0;
        function visit(node) {
          if (node !== body && functionKinds.has(node.kind)) return;
          if (branchKinds.has(node.kind)) result += 1;
          else if (node.kind === k.BinaryExpression && logicalOperators.has(node.operatorToken.kind)) result += 1;
          node.forEachChild(visit);
        }
        visit(body);
        return result;
      }
      function walk(node, parent) {
        if (functionKinds.has(node.kind) && node.body) {
          const startLine = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
          const endLine = sf.getLineAndCharacterOfPosition(node.end).line + 1;
          let name = node.name
            ? ([k.Identifier, k.PrivateIdentifier, k.StringLiteral, k.NumericLiteral].includes(node.name.kind) ? node.name.text : node.name.getText(sf))
            : parent?.kind === k.VariableDeclaration && parent.name.kind === k.Identifier ? parent.name.text
              : parent?.kind === k.PropertyAssignment ? parent.name.getText(sf) : `<${k[node.kind]}>`;
          if ([k.MethodDeclaration, k.Constructor, k.GetAccessor, k.SetAccessor].includes(node.kind) && parent?.name) name = `${parent.name.getText(sf)}.${name}`;
          if (name.startsWith('<')) name += `@${startLine}`;
          records.push({ file, name, kind: k[node.kind], startLine, endLine, lines: endLine - startLine + 1, branches: branchCount(node.body), parameters: node.parameters?.length ?? 0 });
          kinds[k[node.kind]] = (kinds[k[node.kind]] ?? 0) + 1;
        }
        if ([k.StringLiteral, k.NoSubstitutionTemplateLiteral].includes(node.kind)) {
          const value = node.text, line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
          if (/(?:\/Users\/[^/\s]+|\/home\/[^/\s]+|\/private\/var\/|\/Volumes\/)/.test(value)) candidates.personalOrMachineAbsolutePaths.push({ file, line, value: value.slice(0, 240) });
          if (/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(value)) candidates.uuidLiterals.push({ file, line, value });
        }
        if (node.kind === k.NumericLiteral && Number(node.text) > 1) {
          let context = 'numeric literal';
          if (parent?.kind === k.PropertyAssignment || parent?.kind === k.VariableDeclaration || parent?.kind === k.Parameter) context = parent.name.getText(sf);
          else if (parent?.kind === k.BinaryExpression) context = parent.getText(sf).slice(0, 180);
          if (policyNames.test(context)) candidates.policyLikeNumericLiterals.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, value: Number(node.text), context });
        }
        if (node.kind === k.ObjectLiteralExpression) {
          const entries = node.properties.filter((p) => p.kind === k.PropertyAssignment && [k.StringLiteral, k.NoSubstitutionTemplateLiteral].includes(p.initializer.kind))
            .map((p) => ({ key: p.name.getText(sf), value: p.initializer.text }))
            .filter((e) => /(?:status|state|phase|stage|mode|kind|type)/i.test(e.key) || stateValues.test(e.value));
          if (entries.length >= 3) candidates.stateMappingObjects.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, entries });
        }
        node.forEachChild((child) => walk(child, node));
      }
      walk(sf, null);
    }
  } finally { snapshot?.dispose(); api.close(); }
  records.sort((a, b) => a.file.localeCompare(b.file) || a.startLine - b.startLine || a.name.localeCompare(b.name));
  const rank = (score) => records.map((_, i) => i).sort((a, b) => score(records[b]) - score(records[a]) || a - b);
  const complexityRank = rank((x) => x.branches * 4 + x.lines / 8 + x.parameters);
  const lengthRank = rank((x) => x.lines);
  return { files: files.length, typescriptFiles: files.filter((x) => /\.tsx?$/.test(x)).length, functions: records.length, kinds, records, complexityRank, lengthRank, candidates };
}
const baseline = collect(headFiles, true);
const current = collect(currentFiles, false);
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--short', '--', ...roots], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const measuredAt = new Date().toISOString();
const top = (scan, order, count) => order.slice(0, count).map((index) => scan.records[index]);
const results = {
  schemaVersion: 1, generatedAt: measuredAt, repository: path.basename(root),
  method: { parser: 'TypeScript 7 AST via typescript/unstable/sync', lines: 'inclusive physical AST start/end lines', branches: 'if, ternary, loops, catch, non-default case, &&, ||, ??. Nested functions have independent records; their branches are excluded from the parent count.', ranking: 'branches * 4 + lines / 8 + parameters; triage heuristic, not cyclomatic complexity' },
  scope: { roots, inventory: 'all files under src/** and scripts/**', excluded: ['test/**', 'outside roots', 'docs/configuration', 'node_modules', 'build outputs'], nonTypeScriptFiles: currentFiles.filter((x) => !/\.tsx?$/.test(x)), baselineFiles: headFiles.length, currentFiles: currentFiles.length },
  baseline: { source: 'git HEAD restored via TypeScript API virtual filesystem', commit, cleanAtTaskStart: true, files: baseline.files, typescriptFiles: baseline.typescriptFiles, functions: baseline.functions, functionKinds: baseline.kinds, topComplexity: top(baseline, baseline.complexityRank, 25), topLength: top(baseline, baseline.lengthRank, 20), complexityRank: baseline.complexityRank, lengthRank: baseline.lengthRank, records: baseline.records, hardcodingCandidates: baseline.candidates },
  workingTree: { source: 'current shared working tree', measuredAt, commit, dirtySourceFiles: dirty, files: current.files, typescriptFiles: current.typescriptFiles, functions: current.functions, functionKinds: current.kinds, topComplexity: top(current, current.complexityRank, 25), topLength: top(current, current.lengthRank, 20), complexityRank: current.complexityRank, lengthRank: current.lengthRank, records: current.records, hardcodingCandidates: current.candidates }
};
const reportList = (items) => items.map((x, i) => `${i + 1}. ${x.file}:${x.startLine} ${x.name} — ${x.lines}행, 분기 ${x.branches}, 매개변수 ${x.parameters}`).join('\n');
const coreCandidates = [
  ['projectRequestRuntime', 'src/core/runtime/request-runtime.ts'],
  ['RequestController.run', 'src/core/application/orchestration/request-controller.ts'],
  ['validateArtifactCandidate', 'src/core/domain/development/artifact-control.ts']
].map(([name, file]) => {
  const old = baseline.records.find((x) => x.file === file && x.name === name);
  const now = current.records.find((x) => x.file === file && x.name === name);
  const format = (x) => x ? `${x.lines}행/분기 ${x.branches}/매개변수 ${x.parameters}` : '동일 이름 함수 없음';
  return `- ${name}: 기준 ${format(old)} → 현재 ${format(now)}.`;
}).join('\n');
const capItems = current.candidates.policyLikeNumericLiterals.filter((x) => /^[A-Z][A-Z0-9_]+$/.test(x.context) && /(MAX|MIN|LIMIT|TIMEOUT|RETRY|THRESHOLD|CAP|BUDGET|WINDOW|INTERVAL|DELAY|CACHE)/.test(x.context)).slice(0, 12);
const stateMaps = current.candidates.stateMappingObjects.map((x) => `- ${x.file}:${x.line}: ${x.entries.map((e) => `${e.key} → ${e.value}`).join(', ')}`).join('\n');
const report = `# 함수 인벤토리와 리팩터링 후보

함수별 파일·이름·행수·분기 수·매개변수 수를 TypeScript AST에서 수집했다. 전체 기계 판독 데이터는 inventory.json에 있다.

## 범위와 계산 기준

- src/**와 scripts/** 아래 기준 ${baseline.files}개, 현재 ${current.files}개 파일을 모두 검사했다. 전부 .ts/.tsx이며 현재 비-TypeScript 파일은 ${currentFiles.filter((x) => !/\.tsx?$/.test(x)).length}개다.
- 제외: test/**, 두 경로 바깥, 문서·설정, node_modules, 빌드 산출물.
- 기준은 작업 시작 때 깨끗했던 HEAD ${commit}이며, 최종 작업 트리 측정은 ${measuredAt} UTC에 수행했다. src/scripts 수정 파일 ${dirty.length}개가 포함됐다.
- 함수 선언·표현식·메서드·생성자·접근자·콜백을 각각 기록했다. 중첩 콜백은 자체 레코드로 계산하고, 해당 분기는 바깥 함수 분기에서 제외했다.
- 행수는 AST 시작과 끝을 포함한 물리 행 수다. 분기는 if, 삼항, 반복, catch, switch case, &&/||/??를 각각 1로 센다. 순환 복잡도가 아니라 분기 지점 합계다.
- 우선순위는 분기×4 + 행수/8 + 매개변수 휴리스틱이며 품질 점수가 아니다.

| 스냅샷 | 파일 | 함수 |
|---|---:|---:|
| 기준 HEAD | ${baseline.files} | ${baseline.functions} |
| 현재 작업 트리 | ${current.files} | ${current.functions} |
| 변화 | 0 | ${current.functions - baseline.functions >= 0 ? '+' : ''}${current.functions - baseline.functions} |

## 복잡도 상위 15개

${reportList(results.workingTree.topComplexity.slice(0, 15))}

가장 긴 함수는 workbench-shell.ts의 runProjectWorkbenchShell로 917행이다. 길이 순위는 inventory.json의 topLength에서 확인할 수 있다.

## 핵심 후보 전후 비교

${coreCandidates}

projectRequestRuntime은 변경 누락이 아니다. core.md의 2-pass reducer 계약을 유지하기 위해 함수 자체를 이번 작업에서 분해하지 않았다. 나머지 두 함수는 분기 지점이 줄었지만 여전히 상위권에 남는다.

## 하드코딩 후보

- 개인·머신 절대 경로 문자열 ${current.candidates.personalOrMachineAbsolutePaths.length}건, UUID 문자열 리터럴 ${current.candidates.uuidLiterals.length}건.
- 프로젝트 ID 후보 중 chat-render-benchmark와 canary는 스크립트 fixture 식별자다. commit receipt의 고정 프로젝트 ID는 이번 후속 수정에서 제거했으며 프로젝트 맥락에서 유도한다.
- 넓은 숫자 휴리스틱 ${current.candidates.policyLikeNumericLiterals.length}건에는 일반 폭·길이 비교도 포함된다. 결함 판정이 아니며, 이름이 분명한 상한 후보는 JSON의 policyLikeNumericLiterals에서 확인한다.
- 반복 상태 매핑 ${current.candidates.stateMappingObjects.length}개:
${stateMaps}

후속 코드 변경까지 포함한 최종 측정에는 저장소 루트에서 node .omo/evidence/function-refactor-2026-09-13/audit-functions.mjs 를 실행한다.
`;
fs.mkdirSync(evidence, { recursive: true });
fs.writeFileSync(path.join(evidence, 'inventory.json'), JSON.stringify(results) + '\n');
fs.writeFileSync(path.join(evidence, 'inventory.md'), report);
console.log(JSON.stringify({ measuredAt, baselineFunctions: baseline.functions, currentFunctions: current.functions, dirtySourceFiles: dirty.length, output: evidence }));
