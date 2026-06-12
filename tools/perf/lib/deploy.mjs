// Builds the plugin and deploys it into the jellyfin-dev container's plugin
// directory, then restarts the container and waits for the server to be
// healthy. The target directory is resolved by glob ("Jellyfin Enhanced_*",
// must already contain the plugin DLL) — never hardcoded, since Jellyfin
// versions the folder name.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function resolvePluginDir(bench) {
    const entries = fs.readdirSync(bench.pluginsDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name.startsWith(bench.pluginDirPrefix))
        .map(d => path.join(bench.pluginsDir, d.name))
        .filter(p => fs.existsSync(path.join(p, 'Jellyfin.Plugin.JellyfinEnhanced.dll')))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (!entries.length) throw new Error(`No '${bench.pluginDirPrefix}*' dir with the plugin DLL under ${bench.pluginsDir}`);
    return entries[0];
}

export function buildPlugin(bench) {
    const csproj = path.resolve(HERE, bench.csproj);
    execFileSync('dotnet', ['build', '-c', 'Release', csproj], { stdio: 'inherit' });
    const dll = path.resolve(HERE, bench.dllRelease);
    if (!fs.existsSync(dll)) throw new Error(`Build produced no DLL at ${dll}`);
    return dll;
}

export function restartServer(bench) {
    if (bench.container !== 'jellyfin-dev') {
        throw new Error(`Safety stop: refusing to restart container '${bench.container}' (only jellyfin-dev allowed).`);
    }
    execFileSync('docker', ['restart', bench.container], { stdio: 'inherit' });
}

export async function waitHealthy(bench, timeoutMs = 120000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
        try {
            const res = await fetch(bench.baseUrl + '/System/Info/Public', { signal: AbortSignal.timeout(4000) });
            if (res.ok) return await res.json();
        } catch { /* not up yet */ }
        await new Promise(r => setTimeout(r, 1500));
    }
    throw new Error('Server did not become healthy within timeout');
}

export async function buildAndDeploy(bench) {
    const dll = buildPlugin(bench);
    const dir = resolvePluginDir(bench);
    fs.copyFileSync(dll, path.join(dir, 'Jellyfin.Plugin.JellyfinEnhanced.dll'));
    console.log(`Deployed ${path.basename(dll)} -> ${dir}`);
    restartServer(bench);
    const info = await waitHealthy(bench);
    console.log(`Server healthy: ${info.ServerName} ${info.Version}`);
}
