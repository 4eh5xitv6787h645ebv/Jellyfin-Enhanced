#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { root, readLayout } = require('./layout.cjs');
const { assets, manifest } = readLayout();
const escapeXml = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const items = assets.map(asset => `    <EmbeddedResource Include="$(MSBuildThisFileDirectory)../../${escapeXml(asset.source)}" LogicalName="${escapeXml(asset.resource)}" />`).join('\n');
// Released plugins load the colored-ratings stylesheet from jsDelivr at
// @main/css/ratings.css (CdnAssetCatalog "je-css"). That public path is a delivery
// contract independent of the feature-owned source, so the copy is generated here.
const ratingsSource = 'src/features/ratings/client/ratings.css';
const ratingsCopy = `/* GENERATED from ${ratingsSource}; served to released plugins as @main/css/ratings.css. Edit the source and run npm run generate. */\n`
    + fs.readFileSync(path.join(root, ratingsSource), 'utf8');
const outputs = {
    'artifacts/generated/ResourceMap.props': `<!-- GENERATED: edit feature.json asset declarations; run npm run generate. -->\n<Project>\n  <ItemGroup>\n${items}\n  </ItemGroup>\n</Project>\n`,
    'artifacts/generated/resource-map.json': JSON.stringify(assets, null, 2) + '\n',
    'artifacts/generated/module-manifest.json': JSON.stringify(manifest, null, 2) + '\n',
    'css/ratings.css': ratingsCopy
};
if (process.argv.slice(2).some(argument => argument !== '--check')) throw new Error('Usage: node tools/build/build-assets.mjs [--check]');
for (const [name, output] of Object.entries(outputs)) {
    const destination = path.join(root, name);
    if (process.argv.includes('--check')) {
        if (!fs.existsSync(destination) || fs.readFileSync(destination, 'utf8') !== output) throw new Error(`Generated ${name} is stale. Run npm run generate.`);
    } else {
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, output);
    }
}
console.log(`Verified ${assets.length} resource mappings, ${manifest.components.length} feature-owned modules and the css/ratings.css delivery copy.`);
