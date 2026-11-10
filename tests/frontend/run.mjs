import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { discoverTests, repositoryRoot, testArguments, testEnvironment } from './helpers/discovery.mjs';

// JE_EARLY_FAILURES names a file that each failing test is appended to the moment it fails (tests/runner/early-failures.mjs).
const early = process.env.JE_EARLY_FAILURES ? [`--import=${join(repositoryRoot, 'tests/runner/early-failures.mjs')}`] : [];
const result = spawnSync(process.execPath,
  [...early, '--test', ...testArguments, ...process.argv.slice(2), ...discoverTests()],
  { cwd: repositoryRoot, stdio: 'inherit', env: testEnvironment() });
process.exitCode = result.error || result.signal || result.status === null ? 1 : result.status;
