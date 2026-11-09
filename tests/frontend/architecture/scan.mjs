// Shared scanner and rule collectors for the architecture guard tests (frontend.md §2.4, §5).
// Not a test file (no `.test.mjs`), so tests/frontend/run.mjs does not run it on its own.
//
// Import edges come from the TypeScript AST (the `typescript` devDependency), never from a regex, so
// imports inside comments or strings are not counted and every import form is (static, `export … from`,
// `import x = require()`, dynamic `import()`, and `import('x').T` type nodes).
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export { ts };
export const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
export const here = fileURLToPath(new URL('./', import.meta.url));
export const srcRoot = 'client/src';

// ---------------------------------------------------------------------------------------------------------
// Files

/** Repo-relative POSIX paths of every file under client/src ending in one of `extensions`, sorted. */
export function listSources(extensions = ['.ts']) {
  const out = [];
  (function walk(folder) {
    for (const entry of readdirSync(join(repoRoot, folder), { withFileTypes: true })) {
      const path = `${folder}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (extensions.some(ext => entry.name.endsWith(ext))) out.push(path);
    }
  })(srcRoot);
  return out.sort();
}

export const readSource = file => readFileSync(join(repoRoot, file), 'utf8');
export const readJson = name => JSON.parse(readFileSync(join(here, name), 'utf8'));

/** The canonical feature map (PLAN.md "Canonical feature list"), shared with the backend parity test. */
export const featureMapPath = 'docs/feature-map.json';
export const readFeatureMap = () => JSON.parse(readFileSync(join(repoRoot, featureMapPath), 'utf8'));
/** The map's rows whose own folder is client/src/features/<name> (kind `feature`), in map order. */
export const mappedFeatures = (map = readFeatureMap()) => map.features.filter(row => row.kind === 'feature');

/** `wc -l` semantics (the plan's baseline command): the number of newline characters. */
export const lineCount = text => text.split('\n').length - 1;

/**
 * Where a client/src file belongs. `features/admin-tags` is part of `media-tags` (PLAN.md canonical
 * feature list: admin-tags is folded into media-tags on both sides).
 * @returns {{ area: string, feature?: string }}
 */
export function classify(file) {
  const inner = file.startsWith(`${srcRoot}/`) ? file.slice(srcRoot.length + 1) : file;
  const parts = inner.split('/');
  if (parts[0] === 'features' && parts.length > 2) {
    return { area: 'feature', feature: parts[1] === 'admin-tags' ? 'media-tags' : parts[1] };
  }
  return { area: parts.length > 1 ? parts[0] : '(root)' };
}

/**
 * A feature's own bridge file: `features/<f>/**​/host.ts`, `host-*.ts` or `*-host.ts`. C1 moves
 * `host/<f>-host.ts` to `features/<f>/host*.ts` (seerr gets several, media-tags gets host.ts,
 * rules-host.ts and admin/host.ts), so all of these names count.
 */
export function isFeatureHostFile(file) {
  if (classify(file).area !== 'feature') return false;
  const base = posix.basename(file);
  return base === 'host.ts' || base.startsWith('host-') || base.endsWith('-host.ts');
}

// ---------------------------------------------------------------------------------------------------------
// Parsing

const parsed = new Map();
/** Parse a repo-relative .ts file once (syntax only). */
export function parse(file) {
  if (!parsed.has(file)) {
    parsed.set(file, ts.createSourceFile(file, readSource(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS));
  }
  return parsed.get(file);
}

let cachedProgram;
/** One type-checked program over client/tsconfig.json (needed only for the raw-global rule). */
export function program() {
  if (!cachedProgram) {
    const config = ts.getParsedCommandLineOfConfigFile(join(repoRoot, 'client/tsconfig.json'), {}, {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: d => { throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n')); },
    });
    cachedProgram = ts.createProgram({ rootNames: config.fileNames, options: config.options });
  }
  return cachedProgram;
}

function resolveRelative(from, specifier) {
  const base = posix.normalize(posix.join(posix.dirname(from), specifier));
  const candidates = [base, `${base}.ts`, `${base}/index.ts`];
  if (/\.m?js$/.test(base)) candidates.push(base.replace(/\.m?js$/, '.ts'));
  for (const candidate of candidates) {
    const abs = join(repoRoot, candidate);
    if (existsSync(abs) && statSync(abs).isFile()) return candidate;
  }
  return null;
}

/**
 * Every module reference in a file.
 * kind: import | export | import-equals | dynamic-import | import-type (an `import('x').T` type node).
 * typeOnly: erased at build time. client/tsconfig.json sets `verbatimModuleSyntax`, so only an
 * `import type` / `export type` clause is erased; `import { type A } from 'x'` still emits `import 'x'`
 * (a runtime side-effect import), so it counts as runtime here.
 * target: the resolved repo-relative file for a relative specifier, else null.
 * @returns {{ specifier: string, target: string|null, typeOnly: boolean, kind: string, line: number }[]}
 */
export function moduleReferences(file, sf = parse(file)) {
  const refs = [];
  const add = (node, literal, kind, typeOnly) => {
    if (!literal || !ts.isStringLiteralLike(literal)) return;
    const specifier = literal.text;
    refs.push({
      specifier,
      target: specifier.startsWith('.') ? resolveRelative(file, specifier) : null,
      typeOnly,
      kind,
      line: lineOf(sf, node),
    });
  };
  (function visit(node) {
    if (ts.isImportDeclaration(node)) {
      add(node, node.moduleSpecifier, 'import', Boolean(node.importClause?.isTypeOnly));
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      add(node, node.moduleSpecifier, 'export', node.isTypeOnly);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node, node.moduleReference.expression, 'import-equals', node.isTypeOnly);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      add(node, node.arguments[0], 'dynamic-import', false);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node, node.argument.literal, 'import-type', true);
    }
    ts.forEachChild(node, visit);
  })(sf);
  return refs;
}

export const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

/** Strip parentheses, `as`, `satisfies`, `!` and `<T>` casts around an expression. */
export function unwrap(expression) {
  let e = expression;
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e)
    || ts.isTypeAssertionExpression(e) || ts.isSatisfiesExpression(e)) e = e.expression;
  return e;
}

/** `a.b`, `a?.b` and `a['b']` → { object, name }; anything else → null. */
export function memberAccess(node) {
  if (ts.isPropertyAccessExpression(node)) return { object: node.expression, name: node.name.text };
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
    return { object: node.expression, name: node.argumentExpression.text };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------
// Ratchet: current {file: {key: count}} against a baseline of the same shape.

/**
 * @returns {{ regressions: string[], improvements: string[] }} regressions: a (file, key) pair that is new or
 * whose count grew. improvements: a recorded pair whose count fell or vanished (the baseline can be lowered).
 */
export function compareCounts(current, baseline) {
  const regressions = [];
  const improvements = [];
  for (const [file, keys] of Object.entries(current)) {
    for (const [key, count] of Object.entries(keys)) {
      const allowed = baseline[file]?.[key] ?? 0;
      if (count > allowed) regressions.push(`${file}: ${key} ×${count} (baseline ${allowed})`);
    }
  }
  for (const [file, keys] of Object.entries(baseline)) {
    for (const [key, allowed] of Object.entries(keys)) {
      const count = current[file]?.[key] ?? 0;
      if (count < allowed) improvements.push(`${file}: ${key} ×${count} (baseline ${allowed}; lower it)`);
    }
  }
  return { regressions: regressions.sort(), improvements: improvements.sort() };
}

const bump = (map, file, key) => {
  map[file] ??= {};
  map[file][key] = (map[file][key] ?? 0) + 1;
};

/** Sort a {file: {key: n}} or {file: n} map for stable JSON. */
export function sortedMap(map) {
  return Object.fromEntries(Object.keys(map).sort().map(file => [file,
    typeof map[file] === 'object' ? Object.fromEntries(Object.keys(map[file]).sort().map(k => [k, map[file][k]])) : map[file]]));
}

// ---------------------------------------------------------------------------------------------------------
// §2.4 rules 1 and 2: imports

/** Runtime imports of these `features/<f>/public-api.ts` files are allowed (they re-export only pure modules). */
export const PURE_PUBLIC_APIS = new Set([]);

const CONTEXT = `${srcRoot}/host/context.ts`;

/**
 * Rule 1 (feature import rule) and rule 2 (host rule). A feature file may import its own feature, core/,
 * contracts/, host/context.ts, features/shared/ and `import type` from another feature's public-api.ts.
 * host/** may not import features/**.
 * @returns {{ violations: Record<string, Record<string, number>>, unresolved: string[], edges: Map<string, Set<string>> }}
 *   edges: runtime import edges between files of the same feature (for the cycle check).
 */
export function importViolations(files = listSources()) {
  const violations = {};
  const unresolved = [];
  const edges = new Map();
  for (const file of files) {
    const from = classify(file);
    for (const ref of moduleReferences(file)) {
      if (!ref.specifier.startsWith('.')) continue;   // client/src has no package imports today
      if (!ref.target) { unresolved.push(`${file}:${ref.line} ${ref.specifier}`); continue; }
      const to = classify(ref.target);
      if (from.area === 'feature') {
        if (to.area === 'feature' && to.feature === from.feature) {
          if (!ref.typeOnly) {
            if (!edges.has(file)) edges.set(file, new Set());
            edges.get(file).add(ref.target);
          }
          continue;
        }
        if (to.area === 'core' || to.area === 'contracts' || ref.target === CONTEXT) continue;
        if (to.area === 'feature' && to.feature === 'shared') continue;
        if (to.area === 'feature' && ref.target === `${srcRoot}/features/${to.feature}/public-api.ts`
          && (ref.typeOnly || PURE_PUBLIC_APIS.has(ref.target))) continue;
        bump(violations, file, `import ${ref.target}`);
      } else if (from.area === 'host' && to.area === 'feature') {
        bump(violations, file, `host-import ${ref.target}`);
      }
    }
  }
  return { violations, unresolved, edges };
}

/**
 * Import cycles inside one feature: strongly connected components (Tarjan) of the runtime same-feature
 * import graph that have more than one file or a self-import. Type-only imports are erased and never form
 * a runtime cycle, so they are left out.
 * @returns {string[][]} each component's files, sorted.
 */
export function cycles(edges) {
  let index = 0;
  const stack = [];
  const info = new Map();
  const out = [];
  const nodes = [...new Set([...edges.keys(), ...[...edges.values()].flatMap(s => [...s])])].sort();
  function strong(v) {
    info.set(v, { index, low: index, on: true });
    index++;
    stack.push(v);
    for (const w of [...(edges.get(v) ?? [])].sort()) {
      if (!info.has(w)) { strong(w); info.get(v).low = Math.min(info.get(v).low, info.get(w).low); }
      else if (info.get(w).on) info.get(v).low = Math.min(info.get(v).low, info.get(w).index);
    }
    if (info.get(v).low === info.get(v).index) {
      const component = [];
      let w;
      do { w = stack.pop(); info.get(w).on = false; component.push(w); } while (w !== v);
      if (component.length > 1 || edges.get(v)?.has(v)) out.push(component.sort());
    }
  }
  for (const v of nodes) if (!info.has(v)) strong(v);
  return out.sort((a, b) => a[0].localeCompare(b[0]));
}

// ---------------------------------------------------------------------------------------------------------
// §2.4 rules 3 and 4: internals and the raw global

const GLOBAL_NAMES = new Set(['window', 'globalThis', 'self']);

/**
 * Rule 4's platform files (frontend.md §2.4 rule 4, §5.2; step 1 decision, applied in C4): the core platform hosts
 * that stay in host/ after C1 and core/lifecycle-entry.ts. They are how the platform reaches the global, not features.
 */
export const PLATFORM_GLOBAL_FILES = new Set([
  'core-host.ts', 'api-host.ts', 'dom-host.ts', 'navigation-host.ts', 'session-host.ts', 'ui-host.ts',
  'admin-config-host.ts', 'bootstrap-pages-host.ts',
].map(name => `${srcRoot}/host/${name}`).concat(`${srcRoot}/core/lifecycle-entry.ts`));

function typeIsGlobal(type, checker, seen = new Set()) {
  if (seen.has(type)) return false;
  seen.add(type);
  if (type.isUnionOrIntersection()) return type.types.some(t => typeIsGlobal(t, checker, seen));
  const name = type.getSymbol()?.getName();
  if (name === 'Window' || name === 'globalThis') return true;
  return type.isClassOrInterface() && (checker.getBaseTypes(type) ?? []).some(t => typeIsGlobal(t, checker, seen));
}

/** Does this declaration hold the browser global (`x = window`, `{ host: window }`, `{ host } = f()`)? */
function declarationIsGlobal(d, checker, seen) {
  if (seen.has(d)) return false;
  seen.add(d);
  if ((ts.isVariableDeclaration(d) || ts.isPropertyAssignment(d)) && ts.isIdentifier(d.name) && d.initializer) {
    return isGlobalReference(d.initializer, checker, seen);
  }
  if (ts.isShorthandPropertyAssignment(d)) {
    return (checker.getShorthandAssignmentValueSymbol(d)?.declarations ?? []).some(x => declarationIsGlobal(x, checker, seen));
  }
  if (ts.isBindingElement(d) && ts.isObjectBindingPattern(d.parent) && ts.isVariableDeclaration(d.parent.parent)
    && d.parent.parent.initializer) {
    const name = (d.propertyName ?? d.name).getText();
    const property = checker.getTypeAtLocation(d.parent.parent.initializer).getProperty(name);
    return (property?.declarations ?? []).some(x => declarationIsGlobal(x, checker, seen));
  }
  return false;
}

/**
 * Does `expression` evaluate to the browser global (window/globalThis/self)? Follows what the hosts
 * actually do: `const host: X = window` aliases (casts included), `{ host } = bridge()` destructuring and
 * `{ host: window }` properties, `host.window`, functions that `return window` (in any file, through the
 * checker), and anything typed `Window`, `typeof globalThis` or an interface extending Window.
 */
export function isGlobalReference(expression, checker, seen = new Set()) {
  const e = unwrap(expression);
  if (seen.has(e)) return false;
  seen.add(e);
  if (ts.isIdentifier(e)) {
    let symbol = checker.getSymbolAtLocation(e);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    const declarations = symbol?.declarations ?? [];
    if (GLOBAL_NAMES.has(e.text) && declarations.every(d => d.getSourceFile().isDeclarationFile)) return true;
    if (declarations.some(d => declarationIsGlobal(d, checker, seen))) return true;
  } else if (ts.isPropertyAccessExpression(e)) {
    if (GLOBAL_NAMES.has(e.name.text)) return true;
    const declarations = checker.getSymbolAtLocation(e.name)?.declarations ?? [];
    if (declarations.some(d => declarationIsGlobal(d, checker, seen))) return true;
  } else if (ts.isCallExpression(e)) {
    const declaration = checker.getResolvedSignature(e)?.declaration;
    if (declaration && !seen.has(declaration) && functionReturnsGlobal(declaration, checker, seen)) return true;
  }
  return typeIsGlobal(checker.getTypeAtLocation(e), checker);
}

function functionReturnsGlobal(declaration, checker, seen) {
  seen.add(declaration);
  const body = declaration.body;
  if (!body) return false;
  if (!ts.isBlock(body)) return isGlobalReference(body, checker, seen);
  let found = false;
  (function visit(node) {
    if (found || (node !== body && ts.isFunctionLike(node))) return;
    if (ts.isReturnStatement(node) && node.expression && isGlobalReference(node.expression, checker, seen)) found = true;
    ts.forEachChild(node, visit);
  })(body);
  return found;
}

/**
 * Rule 3 (internals) and rule 4 (raw global), from the type-checked program.
 * Rule 3 flags every `.internals` / `['internals']` access except on `this`: today every one of them is on a
 * JE bridge (`JE`, `je`, `JE()`), and counting all of them closes the `const b = JE; b.internals` loophole.
 * It is allowed only in a feature host file, and there only for slots the feature owns
 * (internals-owners.json; a whole-object access `JE.internals` is the owner's own object).
 * Rule 4 flags `.JellyfinEnhanced` read off the browser global (and `{ JellyfinEnhanced } = window`),
 * allowed only in host/context.ts, features/<f>/host*.ts, bootstrap/**, and PLATFORM_GLOBAL_FILES: the core platform
 * hosts that stay in host/ after C1 and core/lifecycle-entry.ts (frontend.md §2.4 rule 4, §5.2; step C4).
 */
export function bridgeViolations(owners) {
  const violations = {};
  const prog = program();
  const checker = prog.getTypeChecker();
  for (const sf of prog.getSourceFiles()) {
    if (sf.isDeclarationFile) continue;
    const file = posix.relative(repoRoot.replaceAll('\\', '/'), sf.fileName.replaceAll('\\', '/'));
    if (!file.startsWith(`${srcRoot}/`)) continue;
    const where = classify(file);
    const hostFile = isFeatureHostFile(file);
    const globalAllowed = hostFile || file === CONTEXT || where.area === 'bootstrap' || PLATFORM_GLOBAL_FILES.has(file);
    (function visit(node) {
      const access = memberAccess(node);
      if (access?.name === 'internals' && unwrap(access.object).kind !== ts.SyntaxKind.ThisKeyword) {
        const parent = memberAccess(node.parent);
        const slot = parent && node.parent.expression === node ? parent.name : '*';
        if (!hostFile) bump(violations, file, `internals ${slot}`);
        else if (slot !== '*' && !(owners[slot] ?? []).includes(where.feature)) {
          bump(violations, file, `internals-foreign ${slot}`);
        }
      }
      if (!globalAllowed) {
        if (access?.name === 'JellyfinEnhanced' && isGlobalReference(access.object, checker)) {
          bump(violations, file, 'raw-global JellyfinEnhanced');
        } else if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer
          && node.name.elements.some(el => (el.propertyName ?? el.name).getText(sf) === 'JellyfinEnhanced')
          && isGlobalReference(node.initializer, checker)) {
          bump(violations, file, 'raw-global JellyfinEnhanced');
        }
      }
      ts.forEachChild(node, visit);
    })(sf);
  }
  return violations;
}

// ---------------------------------------------------------------------------------------------------------
// §5.3 generated markers

/**
 * Generated files under client/src (frontend.md §5.3). An entry with a `/` is a path; a bare name is looked up
 * by basename anywhere under client/src, so B2's moves of the GEN files need no edit here.
 */
export const GENERATED_SOURCES = [
  'client/src/contracts/generated.ts',
  'client/src/contracts/schema.ts',
  'status-vocabulary.ts',
  'compact-quality.ts',
  'per-user-props.ts',
  'genre-table.ts',
];
// Not listed (coordinator decision E1 (a), step-logs/lane-lm.md): awards-data.ts, rating-data.ts and
// media-language.ts are hand-written source-of-truth tables (no generator; scripts/build_poster_assets.py only
// reads them), and quality-data.ts is hand-written apart from the aspect-ratio region that
// scripts/generate_technical_ratios.py rewrites between its in-body markers. None carries a file header or
// linguist-generated, and all four stay under the file-size guardrail.

/** Other generated outputs that must carry `linguist-generated` in .gitattributes (§5.3). */
export const GENERATED_OUTPUTS = [
  'client/generated-manifest.json',
  'Jellyfin.Plugin.JellyfinEnhanced/js/**/*.js.map',
];

/**
 * The file's header: the comments before its first token (after a BOM or shebang).
 * A generated header starts with `Generated by <tool>` or `GENERATED by <tool>` and the tool path exists, e.g.
 * `// Generated by tools/ClientContracts. Do not edit.`
 * @returns {{ header: string, generated: boolean, tool: string|null, toolExists: boolean }}
 */
export function generatedHeader(text) {
  const start = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const ranges = ts.getLeadingCommentRanges(text, ts.getShebang(text.slice(start))?.length ?? start) ?? [];
  const header = ranges.map(r => text.slice(r.pos, r.end)).join('\n');
  const first = ranges[0] ? text.slice(ranges[0].pos, ranges[0].end).replace(/^\/[/*]+\s*/, '') : '';
  const match = /^(?:Generated|GENERATED) by\s+([^\s;,]+?)[.;,]?(?:\s|$)/.exec(first);
  const tool = match?.[1] ?? null;
  return { header, generated: Boolean(match), tool, toolExists: Boolean(tool && existsSync(join(repoRoot, tool))) };
}

/**
 * Resolve GENERATED_SOURCES to files. A bare name must match exactly one file under client/src.
 * @returns {{ entry: string, files: string[] }[]}
 */
export function generatedSourceFiles(sources = listSources()) {
  return GENERATED_SOURCES.map(entry => ({
    entry,
    files: entry.includes('/') ? sources.filter(f => f === entry) : sources.filter(f => posix.basename(f) === entry),
  }));
}

/** path → its `linguist-generated` attribute value (`true`, `unspecified`, …), or null without git. */
export function linguistGenerated(paths) {
  const result = spawnSync('git', ['check-attr', '--stdin', 'linguist-generated'], {
    cwd: repoRoot, input: paths.join('\n') + '\n', encoding: 'utf8',
  });
  if (result.error || result.status !== 0) return null;
  const values = new Map();
  for (const line of result.stdout.split('\n')) {
    const at = line.lastIndexOf(': linguist-generated: ');
    if (at >= 0) values.set(line.slice(0, at), line.slice(at + ': linguist-generated: '.length));
  }
  return values;
}

/** Tracked files for a GENERATED_OUTPUTS pattern (git pathspec glob), or null without git. */
export function trackedFiles(pattern) {
  const result = spawnSync('git', ['ls-files', '-z', '--', `:(glob)${pattern}`], { cwd: repoRoot, encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  return result.stdout.split('\0').filter(Boolean).sort();
}

/**
 * §5.3 gaps: {entry: ['header' | 'gitattributes' | 'missing' | 'ambiguous']}.
 * header: the generated source does not start with a `Generated by <existing tool>` header.
 * gitattributes: the file (or, for an output glob, any tracked match) lacks `linguist-generated=true`.
 * @returns {{ gaps: Record<string, string[]>, gitAvailable: boolean }}
 */
export function generatedGaps() {
  const gaps = {};
  const add = (entry, gap) => { (gaps[entry] ??= []).push(gap); };
  const checked = [];   // {entry, files} whose files must all be linguist-generated
  for (const { entry, files } of generatedSourceFiles()) {
    if (files.length !== 1) { add(entry, files.length ? 'ambiguous' : 'missing'); continue; }
    const marker = generatedHeader(readSource(files[0]));
    if (!marker.generated || !marker.toolExists) add(entry, 'header');
    checked.push({ entry, files });
  }
  let values = null;
  const outputs = GENERATED_OUTPUTS.map(entry => ({ entry, files: entry.includes('*') ? trackedFiles(entry) : [entry] }));
  if (outputs.every(o => o.files !== null)) {
    for (const o of outputs) {
      if (o.files.length) checked.push(o);
      else add(o.entry, 'missing');
    }
    values = linguistGenerated(checked.flatMap(c => c.files));
  }
  if (values) {
    for (const { entry, files } of checked) if (files.some(f => values.get(f) !== 'true')) add(entry, 'gitattributes');
  }
  for (const entry of Object.keys(gaps)) gaps[entry].sort();
  return { gaps, gitAvailable: values !== null };
}

// ---------------------------------------------------------------------------------------------------------
// §5.1 file size

export const MAX_LINES = 800;
export const MAX_STYLE_LINES = 1500;

/** The limit for a client/src file: none for a marked generated file, 1500 for `*-styles.ts`/`*.css`, else 800. */
export function lineLimit(file, text = readSource(file)) {
  if (generatedHeader(text).generated) return Infinity;
  return file.endsWith('-styles.ts') || file.endsWith('.css') ? MAX_STYLE_LINES : MAX_LINES;
}

/** {file: lines} for every client/src .ts/.css file over its limit. */
export function sizeOffenders(files = listSources(['.ts', '.css'])) {
  const out = {};
  for (const file of files) {
    const text = readSource(file);
    const lines = lineCount(text);
    if (lines > lineLimit(file, text)) out[file] = lines;
  }
  return out;
}

/** Drop `_comment`-style keys from a baseline or map file. */
export const withoutComments = map => Object.fromEntries(Object.entries(map).filter(([key]) => !key.startsWith('_')));

// ---------------------------------------------------------------------------------------------------------
// Feature map → CONTRIBUTING.md "Where things live" (backend.md §7.6)

/** The table rows of CONTRIBUTING.md's "Where things live" section, rendered from docs/feature-map.json. */
export function whereThingsLiveRows(map = readFeatureMap()) {
  const code = path => `\`${path}/\``;
  return map.features.map(row => {
    const name = `\`${row.name}\`${row.kind === 'area' ? ' (area)' : ''}`;
    const client = row.client.map(path => code(path.slice(srcRoot.length + 1))).join(', ');
    const backend = row.backend ? code(row.backend)
      : row.backendServedBy ? `none (served by ${code(row.backendServedBy)})` : 'none';
    const tests = [...row.tests.frontend, ...row.tests.backend].map(code).join(', ') || '–';
    return `| ${name} | ${client} | ${backend} | ${tests} |`;
  });
}
