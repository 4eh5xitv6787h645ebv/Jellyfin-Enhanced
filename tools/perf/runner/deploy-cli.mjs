// CLI wrapper: build the plugin, deploy into jellyfin-dev, restart, wait healthy.
// Usage: node runner/deploy-cli.mjs [--devmode on|off]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAndDeploy } from '../lib/deploy.mjs';
import { setPluginConfig } from '../lib/config.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const bench = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'config', 'bench.json'), 'utf8'));

const argv = process.argv.slice(2);
const dmIdx = argv.indexOf('--devmode');

await buildAndDeploy(bench);
if (dmIdx !== -1) {
    const on = argv[dmIdx + 1] === 'on';
    await setPluginConfig(bench, { DevMode: on });
    console.log(`DevMode set to ${on}`);
}
