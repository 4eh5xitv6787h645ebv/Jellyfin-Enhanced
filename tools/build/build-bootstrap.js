#!/usr/bin/env node
'use strict';

// A deterministic concatenation of bootstrap and private feature startup sources.
// Keeping the bundle checked in preserves the existing .NET-only build workflow.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { root, readLayout, validatePublicPath } = require('./layout.cjs');
const outputPath = path.join(root, 'artifacts/generated/plugin.js');
const sources = ['namespace', 'script-loader', 'prelogin', 'configuration', 'initialize', 'feature-startup'];

function validateManifest(manifest, availableFiles) {
    const errors = [];
    const seen = new Set();
    for (const entry of manifest.components) {
        if (seen.has(entry.path)) errors.push(`Duplicate component: ${entry.path}`);
        for (const dependency of entry.dependsOn || []) {
            if (!seen.has(dependency)) errors.push(`${entry.path} requires ${dependency} to appear earlier`);
        }
        seen.add(entry.path);
    }
    for (const entry of manifest.standalone) {
        if (!entry.reason) errors.push(`Standalone script needs a loading reason: ${entry.path}`);
        if (seen.has(entry.path)) errors.push(`Duplicate script: ${entry.path}`);
        seen.add(entry.path);
    }
    for (const file of seen) {
        try { validatePublicPath(file, true); } catch (_) { errors.push(`Invalid script path: ${file}`); }
        if (!availableFiles.includes(file)) errors.push(`Missing script: ${file}`);
    }
    for (const file of availableFiles) {
        if (!seen.has(file)) errors.push(`Unregistered script: ${file}`);
    }
    if (errors.length) throw new Error(errors.join('\n'));
}

function renderBootstrap(manifest) {
    const bootstrapDirectory = path.join(root, 'src/host/bootstrap');
    const unlisted = fs.readdirSync(bootstrapDirectory)
        .filter(name => name.endsWith('.js') && !sources.includes(name.replace(/\.js$/, '')));
    if (unlisted.length) throw new Error(`Bootstrap sources are not composed: ${unlisted.join(', ')}. Add them to the ordered sources list in tools/build/build-bootstrap.js.`);
    const body = sources.map(name => {
        const source = fs.readFileSync(path.join(root, 'src/host/bootstrap', `${name}.js`), 'utf8');
        new vm.Script(source, { filename: `${name}.js` });
        return `// ---- src/host/bootstrap/${name}.js ----\n${source}`;
    }).join('\n');
    const { startups } = readLayout();
    const featureStartup = startups.map(startup => `// ---- ${startup.source} ----\n${fs.readFileSync(path.join(root, startup.source), 'utf8')}`).join('\n');
    const result = `// GENERATED FILE — edit src/host/bootstrap and feature-local startup/feature.json sources.\n// Regenerate: npm run generate\n(function() {\n    'use strict';\n\n${body}\n${featureStartup}\n    const JE = window.JellyfinEnhanced = createNamespace();\n    const loader = createScriptLoader(JE);\n    const configuration = createConfiguration(JE);\n    const prelogin = createPrelogin(JE, loader);\n    const components = ${JSON.stringify(manifest.components.map(entry => entry.path), null, 4)};\n    const bootstrap = createBootstrap(JE, loader, configuration, prelogin, components);\n\n    prelogin.loadSplashScreenEarly();\n    prelogin.loadLoginImageEarly();\n    bootstrap.initialize();\n})();\n`;
    new vm.Script(result, { filename: 'plugin.js' });
    return result;
}

function main() {
    const { manifest } = readLayout();
    const available = [...manifest.components, ...manifest.standalone].map(entry => entry.path);
    validateManifest(manifest, available);
    const output = renderBootstrap(manifest);
    if (process.argv.includes('--check')) {
        if (fs.readFileSync(outputPath, 'utf8') !== output) throw new Error('Bootstrap is stale. Run npm run generate');
        console.log(`Bootstrap and ${manifest.components.length} ordered component registrations verified.`);
    } else {
        fs.writeFileSync(outputPath, output);
        console.log(`Generated ${path.relative(root, outputPath)} (${manifest.components.length} components).`);
    }
}

if (require.main === module) {
    try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { validateManifest, renderBootstrap };
