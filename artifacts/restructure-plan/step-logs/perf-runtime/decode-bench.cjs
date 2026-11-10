// Cold cost of one page load's translation decode: a fresh process per sample, both locales decoded once.
const fs = require('fs');
const variant = process.argv[2];
const dir = process.argv[3];
const srcs = ['en-GB.json', 'en.json'].map(f => fs.readFileSync(dir + '/' + f, 'utf8'));
const fns = {
  old(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('x'); const result = {}; for (const [key, text] of Object.entries(value)) { if (typeof text !== 'string') throw new Error(key); Object.defineProperty(result, key, { value: text, enumerable: true, writable: true, configurable: true }); } return result; },
  assign(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('x'); const result = {}; for (const [key, text] of Object.entries(value)) { if (typeof text !== 'string') throw new Error(key); if (key in result) Object.defineProperty(result, key, { value: text, enumerable: true, writable: true, configurable: true }); else result[key] = text; } return result; },
  inplace(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('x'); for (const key of Object.keys(value)) { if (typeof value[key] !== 'string') throw new Error(key); } return value; },
};
const objs = srcs.map(s => JSON.parse(s));
const t = process.hrtime.bigint();
for (const o of objs) fns[variant](o);
console.log((Number(process.hrtime.bigint() - t) / 1e6).toFixed(3));
