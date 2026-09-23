#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { root, readLayout } = require('./layout.cjs');
const { assets, manifest } = readLayout();
const escapeXml = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const items = assets.map(asset => `    <EmbeddedResource Include="$(MSBuildThisFileDirectory)../../${escapeXml(asset.source)}" LogicalName="${escapeXml(asset.resource)}" />`).join('\n');
const outputs = {
    'ResourceMap.props': `<!-- GENERATED: edit feature.json asset declarations; run npm run generate. -->\n<Project>\n  <ItemGroup>\n${items}\n  </ItemGroup>\n</Project>\n`,
    'resource-map.json': JSON.stringify(assets, null, 2) + '\n',
    'module-manifest.json': JSON.stringify(manifest, null, 2) + '\n'
};
if (process.argv.slice(2).some(argument => argument !== '--check')) throw new Error('Usage: node tools/build/build-assets.mjs [--check]');
for (const [name, output] of Object.entries(outputs)) {
    const destination = path.join(root, 'artifacts/generated', name);
    if (process.argv.includes('--check')) {
        if (!fs.existsSync(destination) || fs.readFileSync(destination, 'utf8') !== output) throw new Error(`Generated ${name} is stale. Run npm run generate.`);
    } else {
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, output);
    }
}
console.log(`Verified ${assets.length} resource mappings and ${manifest.components.length} feature-owned modules.`);
