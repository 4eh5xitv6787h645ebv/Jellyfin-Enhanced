import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { discoverTests, orderFirst, repositoryRoot, testArguments, testEnvironment } from './helpers/discovery.mjs';

// JE_TESTS_FIRST names a file listing test files (repository-relative) to start before the others, e.g. the ones a
// change can reach (scripts/restructure-gates.sh takes them from the affected map). Only the order changes.
const files = process.env.JE_TESTS_FIRST
  ? orderFirst(discoverTests(), readFileSync(process.env.JE_TESTS_FIRST, 'utf8').split('\n').filter(Boolean))
  : discoverTests();

// JE_EARLY_FAILURES names a file that each failing test is appended to the moment it fails (tests/runner/early-failures.mjs).
const early = process.env.JE_EARLY_FAILURES ? [`--import=${join(repositoryRoot, 'tests/runner/early-failures.mjs')}`] : [];
const result = spawnSync(process.execPath,
  [...early, '--test', ...testArguments, ...process.argv.slice(2), ...files],
  { cwd: repositoryRoot, stdio: 'inherit', env: testEnvironment() });
process.exitCode = result.error || result.signal || result.status === null ? 1 : result.status;
