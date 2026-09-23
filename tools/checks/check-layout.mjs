#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { root, walk, readLayout } = require('../build/layout.cjs');
const layout = readLayout();
const registered = new Set(layout.assets.map(asset => asset.source));
const startupSources = new Set(layout.startups.map(startup => startup.source));
const failures = [];
for (const file of walk(path.join(root, 'src'))) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    if (file.endsWith('.js') && (relative.includes('/client/') || relative.startsWith('src/shared/browser/')) && !registered.has(relative) && !startupSources.has(relative)) {
        failures.push(`Unregistered browser source: ${relative}`);
    }
}
for (const legacy of ['Jellyfin.Plugin.JellyfinEnhanced', 'frontend', 'scripts', 'css']) {
    if (walk(path.join(root, legacy)).length) failures.push(`Authoritative source remains in legacy directory: ${legacy}`);
}
for (const entry of fs.readdirSync(path.join(root, 'src/features'), { withFileTypes: true })) {
    if (entry.name === 'README.md') continue;
    if (!entry.isDirectory()) { failures.push(`Unexpected feature-root file: ${entry.name}`); continue; }
    if (!/^[a-z]+(?:-[a-z]+)*$/.test(entry.name)) failures.push(`Feature name must use descriptive kebab-case: ${entry.name}`);
    for (const required of ['feature.json', 'README.md']) {
        if (!fs.existsSync(path.join(root, 'src/features', entry.name, required))) failures.push(`Missing ${entry.name}/${required}`);
    }
}
if (failures.length) throw new Error(failures.join('\n'));
console.log(`Feature ownership, browser registration and ${layout.startupCalls.length} named startup calls verified.`);
