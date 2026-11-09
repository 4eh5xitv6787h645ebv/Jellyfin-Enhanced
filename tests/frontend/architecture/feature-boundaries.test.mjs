// frontend.md §2.4 / §5.2: feature boundaries, strict since step C4 (boundary-baseline.json is gone: any violation
// fails). Imports are read from the TypeScript AST (scan.mjs), never with a regex.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  bridgeViolations, cycles, importViolations, moduleReferences, readJson, repoRoot, ts, withoutComments,
} from './scan.mjs';

const owners = withoutComments(readJson('internals-owners.json'));
const imports = importViolations();

/** Every violation of one group of rules (violation keys starting with one of `rules`) fails: there is no baseline. */
function strict(current, rules, label) {
  const found = Object.entries(current).flatMap(([file, keys]) => Object.entries(keys)
    .filter(([key]) => rules.includes(key.split(' ')[0]))
    .map(([key, count]) => `${file}: ${key} ×${count}`)).sort();
  assert.deepEqual(found, [], `${label}: violations (fix the code; frontend.md §2.4)\n  ${found.join('\n  ')}`);
}

test('the scanner reads every import form from the AST, and none from comments or strings', () => {
  const text = [
    "// import fake from './comment';",
    "/* export * from './block-comment'; */",
    "const s = \"import('./string')\";",
    "import a from './a';",
    "import type { B } from './b';",
    "import { type C } from './c';",
    "import './d';",
    "export { e } from './e';",
    "export type { F } from './f';",
    "export * from './g';",
    "import h = require('./h');",
    "const i = import('./i');",
    "let j: import('./j').J;",
  ].join('\n');
  const sf = ts.createSourceFile('x.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const refs = moduleReferences('client/src/features/x/x.ts', sf).map(r => `${r.kind} ${r.specifier} ${r.typeOnly ? 'type' : 'runtime'}`);
  assert.deepEqual(refs, [
    'import ./a runtime',
    'import ./b type',
    'import ./c runtime',   // verbatimModuleSyntax keeps `import './c'`
    'import ./d runtime',
    'export ./e runtime',
    'export ./f type',
    'export ./g runtime',
    'import-equals ./h runtime',
    'dynamic-import ./i runtime',
    'import-type ./j type',
  ]);
});

test('every relative import in client/src resolves to a file', () => {
  assert.deepEqual(imports.unresolved, []);
});

test('rules 1-2: no cross-feature import and no host/ → features/ import (strict)', () => {
  strict(imports.violations, ['import', 'host-import'], 'feature/host imports');
});

test('rules 3-4: no JE.internals access outside its owner host and no raw window.JellyfinEnhanced outside the allowlist (strict)', () => {
  strict(bridgeViolations(owners), ['internals', 'internals-foreign', 'raw-global'], 'internals/raw-global');
});

test('no runtime import cycle inside a feature', () => {
  assert.deepEqual(cycles(imports.edges), []);
});

test('internals-owners.json names only real features', () => {
  const features = new Set(readdirSync(join(repoRoot, 'client/src/features'), { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== 'admin-tags').map(d => d.name));
  const unknown = Object.entries(owners).flatMap(([slot, list]) => list.filter(f => !features.has(f)).map(f => `${slot} → ${f}`));
  assert.deepEqual(unknown, []);
});
