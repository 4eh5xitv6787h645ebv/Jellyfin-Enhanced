// Median + MAD aggregation and accept/reject comparison for scenario metrics.

export function median(values) {
    const v = values.filter(x => x !== null && x !== undefined && !Number.isNaN(x)).sort((a, b) => a - b);
    if (!v.length) return null;
    const mid = Math.floor(v.length / 2);
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function mad(values) {
    const m = median(values);
    if (m === null) return null;
    return median(values.map(x => Math.abs(x - m)));
}

// runs: array of flat {metric: number|null} objects -> {metric: {median, mad, n, values}}
export function aggregate(runs) {
    const out = {};
    const keys = new Set();
    for (const r of runs) Object.keys(r).forEach(k => keys.add(k));
    for (const k of keys) {
        const values = runs.map(r => r[k]).filter(x => typeof x === 'number' && !Number.isNaN(x));
        out[k] = { median: median(values), mad: mad(values), n: values.length, values };
    }
    return out;
}

// Lower-is-better comparison of one metric between candidate and reference.
// Returns 'improved' | 'regressed' | 'flat'.
export function judge(candidate, reference, { improveRelMin, improveAbsMinMs, regressRelMax }) {
    if (!reference || reference.median === null || !candidate || candidate.median === null) return 'flat';
    const ref = reference.median;
    const cand = candidate.median;
    const tol = 2 * Math.max(reference.mad ?? 0, candidate.mad ?? 0);
    const delta = cand - ref;
    if (delta < 0 && Math.abs(delta) >= Math.max(improveAbsMinMs, ref * improveRelMin)) return 'improved';
    if (delta > 0 && delta > Math.max(tol, ref * regressRelMax)) return 'regressed';
    return 'flat';
}

export function fmt(x, digits = 1) {
    if (x === null || x === undefined) return '—';
    return typeof x === 'number' ? x.toFixed(digits) : String(x);
}
