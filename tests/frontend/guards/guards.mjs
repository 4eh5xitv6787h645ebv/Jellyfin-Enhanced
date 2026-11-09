// The bug-class guards: name (test file and `<name>-baseline.json`), rules, and scanner.
import { scanCss } from './css.mjs';
import { scanErrorEmpty } from './error-empty.mjs';
import { scanEscape } from './escape.mjs';

export const GUARDS = [
  { name: 'escape-guard', rules: ['X1'], scan: scanEscape },
  { name: 'css-injection-guard', rules: ['X2'], scan: scanCss },
  { name: 'error-as-empty-guard', rules: ['R9-fail-empty', 'R9-fail-cached', 'R9-fail-renders-empty'], scan: scanErrorEmpty },
];

export const guard = name => {
  const found = GUARDS.find(g => g.name === name);
  if (!found) throw new Error(`unknown guard ${name}`);
  return found;
};
