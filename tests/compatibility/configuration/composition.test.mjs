import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir, mkdtemp, cp, writeFile, rm, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Script } from 'node:vm';
import { composeConfiguration, buildConfiguration, sourceDirectory } from '../../../tools/build/build-configuration.mjs';

const baseline = JSON.parse(await readFile(new URL('./baseline-contract.json', import.meta.url)));

async function withSources(run) {
    const temporary = await mkdtemp(join(tmpdir(), 'je-config-composition-'));
    try {
        const sources = join(temporary, 'src');
        await mkdir(join(sources, 'features'), { recursive: true });
        await cp(join(sourceDirectory, 'host/dashboard'), join(sources, 'host/dashboard'), { recursive: true });
        for (const feature of await readdir(join(sourceDirectory, 'features'), { withFileTypes: true })) {
            if (!feature.isDirectory()) continue;
            await cp(join(sourceDirectory, 'features', feature.name, 'settings'), join(sources, 'features', feature.name, 'settings'), { recursive: true })
                .catch(error => { if (error.code !== 'ENOENT') throw error; });
        }
        await run(sources, join(temporary, 'generated'));
    } finally {
        await rm(temporary, { recursive: true, force: true });
    }
}

test('checked-in Jellyfin resources match their authoritative sources', async () => {
    await buildConfiguration({ check: true });
});

test('page retains existing controls, tab order, stylesheet and two valid inline scripts', async () => {
    const { 'configPage.html': html, 'configPage.css': css } = await composeConfiguration();
    assert.deepEqual([...html.matchAll(/<div id="([^"]+)" class="jellyfin-tab-content[^"]*"/g)].map(match => match[1]), baseline.tabs);
    const controls = [...new Set([...html.matchAll(/<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"/g)].map(match => match[1]))].sort();
    assert.deepEqual(controls, baseline.controls);
    assert.equal(createHash('sha256').update(css).digest('hex'), baseline.sha256['configPage.css']);
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 2, 'preserve asset initialization and the single dashboard script');
    scripts.forEach((match, index) => new Script(match[1], { filename: `configPage-inline-${index}.js` }));
    assert.doesNotMatch(html, /\{\{(?:scripts|include:)/);
});

test('each dashboard module declares its factory independently without executing page effects', async () => {
    const paths = JSON.parse(await readFile(join(sourceDirectory, 'host/dashboard/scripts.json'), 'utf8'));
    assert.ok(paths.length > 0);
    for (const path of paths) {
        const source = await readFile(join(sourceDirectory, path), 'utf8');
        assert.doesNotMatch(source, /\{\{include:/, `${path} cannot depend on lexical includes`);
        const script = new Script(source, { filename: path });
        if (path === 'host/dashboard/initialize.js') continue; // The explicit host entry executes composition.
        const scope = Object.create(null);
        script.runInNewContext(scope, { timeout: 1000 });
        const names = Object.keys(scope);
        assert.equal(names.length, 1, `${path} exposes one factory, not shared page state`);
        assert.match(names[0], /^create[A-Z]/);
        assert.equal(typeof scope[names[0]], 'function');
    }
});

test('composition rejects missing, duplicate and unregistered scripts and stale output', async () => {
    await withSources(async (sources, output) => {
        await assert.rejects(buildConfiguration({ check: true, directory: output, sourceDirectory: sources }), /is stale/);
        await buildConfiguration({ directory: output, sourceDirectory: sources });
        await buildConfiguration({ check: true, directory: output, sourceDirectory: sources });
        const manifestPath = join(sources, 'host/dashboard/scripts.json');
        const paths = JSON.parse(await readFile(manifestPath, 'utf8'));
        await writeFile(manifestPath, JSON.stringify(paths.slice(1)));
        await assert.rejects(composeConfiguration(sources), /Unregistered configuration source/);
        await writeFile(manifestPath, JSON.stringify([...paths, paths[0]]));
        await assert.rejects(composeConfiguration(sources), /more than once/);
        await writeFile(manifestPath, JSON.stringify([...paths, 'host/dashboard/missing.js']));
        await assert.rejects(composeConfiguration(sources), /ENOENT/);
        await writeFile(manifestPath, JSON.stringify([...paths, '../outside.js']));
        await assert.rejects(composeConfiguration(sources), /escapes src/);
    });
});

test('composition rejects lexical fragments and invalid standalone script syntax', async () => {
    await withSources(async sources => {
        const modulePath = join(sources, 'features/spoiler-guard/settings/settings.js');
        for (const [source, expected] of [
            ['{{include:host/dashboard/lifecycle.js}}', /JavaScript composition fragments/],
            ['const broken = ;', /settings\.js:/],
            ['return { load() {} };', /settings\.js:/],
        ]) {
            await writeFile(modulePath, source);
            await assert.rejects(composeConfiguration(sources), expected);
        }
    });
});

test('composition requires one script insertion point and keeps HTML includes bounded', async () => {
    await withSources(async sources => {
        const path = join(sources, 'host/dashboard/template.html');
        const template = await readFile(path, 'utf8');
        await writeFile(path, template.replace('{{scripts}}', ''));
        await assert.rejects(composeConfiguration(sources), /exactly one/);
        await writeFile(path, template + '{{scripts}}');
        await assert.rejects(composeConfiguration(sources), /exactly one/);
        await writeFile(path, template + '{{include:host/dashboard/tabs/overview.html}}');
        await assert.rejects(composeConfiguration(sources), /more than once/);
        await writeFile(path, template + '{{include:../outside.html}}');
        await assert.rejects(composeConfiguration(sources), /escapes src/);
    });
});
