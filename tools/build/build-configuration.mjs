#!/usr/bin/env node
/** Compose the admin page without changing Jellyfin's inline-script lifecycle. */
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { Script } from 'node:vm';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const sourceDirectory = resolve(repositoryRoot, 'src');
export const configurationDirectory = resolve(repositoryRoot, 'artifacts/generated');

function createReader(directory) {
    const sourceRoot = resolve(directory);
    const used = new Set();
    async function readSource(name) {
        const path = resolve(sourceRoot, name);
        if (!path.startsWith(sourceRoot + sep)) throw new Error(`Configuration source escapes src/: ${name}`);
        if (used.has(path)) throw new Error(`Configuration source included more than once: ${name}`);
        used.add(path);
        return readFile(path, 'utf8');
    }
    async function expand(name) {
        const template = await readSource(name);
        const parts = [];
        let position = 0;
        // Includes are src-relative and recursive. Consume only the directive's
        // layout newline: source fragments retain all delivered whitespace.
        for (const match of template.matchAll(/\{\{include:([^}]+)\}\}\r?\n?/g)) {
            parts.push(template.slice(position, match.index), await expand(match[1]));
            position = match.index + match[0].length;
        }
        parts.push(template.slice(position));
        const content = parts.join('');
        if (content.includes('{{include:')) throw new Error(`Unresolved configuration include in ${name}`);
        return content;
    }
    return { used, readSource, expand };
}

/** Expand one composed source for targeted regression tests and developer tools. */
export async function expandConfigurationSource(name, directory = sourceDirectory) {
    return createReader(directory).expand(name);
}

export async function composeConfiguration(directory = sourceDirectory) {
    const sourceRoot = resolve(directory);
    const { used, readSource, expand } = createReader(sourceRoot);
    let html = await expand('host/dashboard/template.html');
    const scriptPaths = JSON.parse(await readSource('host/dashboard/scripts.json'));
    if (!Array.isArray(scriptPaths) || !scriptPaths.every(path => typeof path === 'string' && path.endsWith('.js'))) {
        throw new Error('host/dashboard/scripts.json must be an ordered array of complete JavaScript source paths.');
    }
    const scripts = [];
    for (const path of scriptPaths) {
        const source = await readSource(path);
        if (source.includes('{{include:')) throw new Error('JavaScript composition fragments are not supported: ' + path);
        // Each input is a complete classic script. A syntax failure must identify
        // the authored file, before the generated page reaches Jellyfin.
        try { new Script(source, { filename: path }); } catch (error) { throw new Error(path + ': ' + error.message); }
        scripts.push('// ' + path + '\n' + source);
    }
    if ((html.match(/\{\{scripts\}\}/g) || []).length !== 1) throw new Error('Dashboard template must include exactly one {{scripts}} marker.');
    html = html.replace('{{scripts}}', scripts.join('\n'));
    const stylePaths = JSON.parse(await readSource('host/dashboard/styles.json'));
    if (!Array.isArray(stylePaths) || !stylePaths.every(path => typeof path === 'string' && path.endsWith('.css'))) {
        throw new Error('host/dashboard/styles.json must be an ordered array of CSS source paths.');
    }
    const styles = [];
    for (const path of stylePaths) styles.push(await expand(path));
    async function checkRegistration(folder) {
        for (const entry of await readdir(folder, { withFileTypes: true })) {
            const path = resolve(folder, entry.name);
            if (entry.isDirectory()) await checkRegistration(path);
            else if (/\.(?:html|css|js|js\.inc)$/.test(entry.name) && !used.has(path)) {
                throw new Error(`Unregistered configuration source: ${relative(sourceRoot, path)}`);
            }
        }
    }
    await checkRegistration(resolve(sourceRoot, 'host/dashboard'));
    for (const feature of await readdir(resolve(sourceRoot, 'features'), { withFileTypes: true })) {
        if (!feature.isDirectory()) continue;
        const directory = resolve(sourceRoot, 'features', feature.name, 'settings');
        await checkRegistration(directory).catch(error => {
            if (error.code !== 'ENOENT') throw error;
        });
    }
    return { 'configPage.html': html, 'configPage.css': styles.join('') };
}

export async function buildConfiguration({ check = false, directory = configurationDirectory, sourceDirectory: sources = sourceDirectory } = {}) {
    const outputs = await composeConfiguration(sources);
    if (!check) await mkdir(directory, { recursive: true });
    for (const [name, content] of Object.entries(outputs)) {
        const path = resolve(directory, name);
        const existing = await readFile(path, 'utf8').catch(error => {
            if (error.code === 'ENOENT') return null;
            throw error;
        });
        if (existing === content) continue;
        if (check) throw new Error(`${relative(process.cwd(), path)} is stale. Run node tools/build/build-configuration.mjs.`);
        await writeFile(path, content);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== '--check')) {
        console.error('Usage: node tools/build/build-configuration.mjs [--check]');
        process.exitCode = 1;
    } else {
        await buildConfiguration({ check: args.includes('--check') }).catch(error => {
            console.error(error.message);
            process.exitCode = 1;
        });
    }
}
