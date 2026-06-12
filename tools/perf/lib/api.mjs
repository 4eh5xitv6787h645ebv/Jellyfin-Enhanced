// Minimal Jellyfin REST helper for the harness (token from env or .state/env.local).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function getToken() {
    if (process.env.JE_PERF_TOKEN) return process.env.JE_PERF_TOKEN;
    const envFile = path.join(HERE, '..', '.state', 'env.local');
    if (fs.existsSync(envFile)) {
        const m = fs.readFileSync(envFile, 'utf8').match(/JE_PERF_TOKEN=([a-f0-9]+)/);
        if (m) return m[1];
    }
    throw new Error('No API token: set JE_PERF_TOKEN or create tools/perf/.state/env.local');
}

export async function jf(bench, route, { method = 'GET', body } = {}) {
    const res = await fetch(bench.baseUrl + route, {
        method,
        headers: {
            'X-Emby-Token': getToken(),
            ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) throw new Error(`${method} ${route} -> ${res.status}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
}
