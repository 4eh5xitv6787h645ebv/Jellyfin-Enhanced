#!/usr/bin/env node
/** One local/CI entry point. Uses Node and the .NET SDK; no npm install. */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Script } from 'node:vm';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const mode = process.argv[2] || '--all';
if (!['--all', '--static', '--backend', '--tests'].includes(mode) || process.argv.length > 3) {
    console.error('Usage: node tools/checks/check.mjs [--static|--backend|--tests]');
    process.exit(2);
}

function files(directory) {
    return readdirSync(join(root, directory), { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name))
        .flatMap(entry => {
            if (['bin', 'obj', 'node_modules', '.venv', 'results'].includes(entry.name)) return [];
            const path = join(directory, entry.name);
            return entry.isDirectory() ? files(path) : [path];
        });
}

function run(command, args) {
    console.log(`\n> ${command} ${args.join(' ')}`);
    const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
}

if (mode === '--all' || mode === '--static') {
    run(process.execPath, ['tools/build/build-configuration.mjs', '--check']);
    run(process.execPath, ['tools/build/build-assets.mjs', '--check']);
    run(process.execPath, ['tools/build/build-bootstrap.js', '--check']);
    run(process.execPath, ['tools/checks/check-layout.mjs']);
    const clientFiles = JSON.parse(readFileSync(join(root, 'artifacts/generated/resource-map.json'), 'utf8')).map(asset => asset.source);
    for (const path of clientFiles) {
        if (path.endsWith('.js')) new Script(readFileSync(join(root, path), 'utf8'), { filename: path });
        if (path.endsWith('.json')) JSON.parse(readFileSync(join(root, path), 'utf8'));
    }
    console.log('Client JavaScript syntax and JSON parsing passed.');
    run(process.execPath, ['tools/checks/validate-translations.js', 'validate']);
}

if (mode === '--all' || mode === '--static' || mode === '--tests') {
    const tests = [...files('tests'), ...files('src'), ...files('tools/testing')].filter(path => /\.test\.[cm]?js$/.test(path));
    if (!tests.length) throw new Error('No JavaScript regression tests found.');
    run(process.execPath, ['--test', ...tests]);
}

if (mode === '--all' || mode === '--backend') {
    const project = 'src/JellyfinEnhanced.csproj';
    for (const target of ['jf12', 'jf10']) {
        run('dotnet', ['build', project, '--configuration', 'Release', `-p:JellyfinTarget=${target}`, '--nologo']);
        const framework = target === 'jf12' ? 'net10.0' : 'net9.0';
        const assembly = `artifacts/bin/Release/${framework}/Jellyfin.Plugin.JellyfinEnhanced.dll`;
        run('dotnet', ['run', '--project', 'tests/compatibility/resources/ArtifactContracts.csproj', '--', assembly]);
    }
    for (const testProject of [...files('tests'), ...files('src')].filter(path => path.endsWith('.csproj') && path !== project && !path.startsWith('tests/compatibility/resources/'))) {
        run('dotnet', ['run', '--project', testProject]);
    }
}
console.log(`\nJE checks passed (${mode.slice(2)}).`);
