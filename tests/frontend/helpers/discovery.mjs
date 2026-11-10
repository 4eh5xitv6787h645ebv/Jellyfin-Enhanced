import { readdirSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
export const frontendRoot = fileURLToPath(new URL('../', import.meta.url));

/** Discover every nested behavioral spec; an empty suite is an error. */
export function discoverTests(directory = frontendRoot) {
  function walk(folder) {
    return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
      const path = join(folder, entry.name);
      return entry.isDirectory() ? walk(path) : entry.name.endsWith('.test.mjs') ? [path] : [];
    });
  }
  const files = walk(directory).sort();
  if (!files.length) throw new Error(`No frontend tests discovered under ${directory}`);
  return files;
}

/**
 * The same files with the listed ones (repository-relative, e.g. the files a change can reach) moved to the front, in
 * discovery order. Only the order changes: every file stays exactly once, and a listed file not in `files` is ignored.
 */
export function orderFirst(files, listed) {
  const first = new Set(listed.map(file => resolve(repositoryRoot, file)));
  const result = [...files.filter(file => first.has(file)), ...files.filter(file => !first.has(file))];
  if (result.length !== files.length || new Set(result).size !== new Set(files).size) throw new Error('orderFirst changed the set of test files');
  return result;
}

/**
 * Test files run at once: JE_TEST_CONCURRENCY when it is a positive integer, otherwise one
 * less than the machine's cores and never below 4 (the four-core CI runner keeps 4).
 */
const requestedConcurrency = Number(process.env.JE_TEST_CONCURRENCY);
export const testConcurrency = Number.isInteger(requestedConcurrency) && requestedConcurrency > 0
  ? requestedConcurrency
  : Math.max(4, availableParallelism() - 1);

/**
 * A hung test fails on its own instead of stalling the whole run. Node 22 (CI)
 * applies --test-timeout to each test file as a whole, newer Node to each test,
 * so the limit leaves room for the heaviest file on a slow runner.
 */
export const testArguments = ['--test-timeout=300000', `--test-concurrency=${testConcurrency}`];

/** Dates and locale-formatted text must not depend on the machine running the tests. */
export function testEnvironment(extra = {}) {
  // Each of the ~180 test processes loads jsdom, the harness and esbuild's JS API afresh. NODE_COMPILE_CACHE lets
  // Node reuse V8's compiled code for those modules between processes and runs (keyed by each file's content and the
  // V8 version, so an edited module is compiled again). JE_NODE_COMPILE_CACHE=0 turns it off.
  const cache = process.env.JE_NODE_COMPILE_CACHE === '0' ? {} : { NODE_COMPILE_CACHE: process.env.NODE_COMPILE_CACHE || join(repositoryRoot, 'node_modules/.cache/node-compile-cache') };
  return { ...process.env, ...cache, TZ: 'UTC', LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8', ...extra };
}
