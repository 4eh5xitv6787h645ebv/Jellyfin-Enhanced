// The bug-class guards: name (test file and `<name>-baseline.json`), rules, and scanner.
import { scanEscape } from './escape.mjs';

export const GUARDS = [
  { name: 'escape-guard', rules: ['X1'], scan: scanEscape },
];

export const guard = name => {
  const found = GUARDS.find(g => g.name === name);
  if (!found) throw new Error(`unknown guard ${name}`);
  return found;
};
