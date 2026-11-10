import { spawnSync } from 'node:child_process';
import { discoverTests, longestFirst, repositoryRoot, testArguments, testEnvironment } from './helpers/discovery.mjs';

const result = spawnSync(process.execPath,
  ['--test', ...testArguments, ...process.argv.slice(2), ...longestFirst(discoverTests())],
  { cwd: repositoryRoot, stdio: 'inherit', env: testEnvironment() });
process.exitCode = result.error || result.signal || result.status === null ? 1 : result.status;
