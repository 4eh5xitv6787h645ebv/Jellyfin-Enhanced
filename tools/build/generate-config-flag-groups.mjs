#!/usr/bin/env node
/**
 * Derive analytics documentation from the delivered dashboard and inline C#
 * configuration defaults. This is a reader for those known source conventions,
 * not a general HTML/C# parser. No browser, subprocess, or package is required.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const configPage = path.join(repositoryRoot, 'artifacts/generated/configPage.html');
export const outputFile = path.join(repositoryRoot, 'docs/advanced/config-flag-groups.json');

const propertyOverrides = {
    jellyseerrEnable4kRequests: 'JellyseerrEnable4KRequests',
    jellyseerrEnable4kTvRequests: 'JellyseerrEnable4KTvRequests',
    showReleaseDate: 'ShowReleaseDates',
    loginImageEnabled: 'EnableLoginImage',
    autoMovieRequestServer: 'AutoMovieRequestCustomServerId',
    autoMovieRequestProfile: 'AutoMovieRequestCustomProfileId',
    autoMovieRequestRootFolder: 'AutoMovieRequestCustomRootFolder'
};
const propertyName = id => propertyOverrides[id] || id[0].toUpperCase() + id.slice(1);
const normalizedText = parts => parts.join('').replace(/\s+/g, ' ').trim();
const sorted = object => Object.fromEntries(Object.keys(object).sort().map(key => [key, object[key]]));
const textless = new Set(['i', 'script', 'style']);
const inputTags = new Set(['input', 'select', 'textarea']);
const hasClass = (attrs, value) => (attrs.class || '').split(/\s+/).includes(value);

// The page uses basic character references, punctuation and numeric Unicode.
// Unknown named references in captured UI text fail visibly instead of silently
// publishing a wrong label. Literal Unicode text needs no entity table entry.
const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
    ldquo: '\u201c', rdquo: '\u201d', lsquo: '\u2018', rsquo: '\u2019',
    ndash: '\u2013', mdash: '\u2014', hellip: '\u2026', copy: '\u00a9' };
function decodeText(text) {
    return text.replace(/&(#x[\da-f]+|#\d+|[a-z][\da-z]+);/gi, (reference, name) => {
        if (name[0] === '#') {
            const number = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
            return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : '\ufffd';
        }
        if (!Object.hasOwn(entities, name)) throw new Error(`Unsupported character reference in dashboard metadata: ${reference}`);
        return entities[name];
    });
}

function attributes(token) {
    const result = {};
    const body = token.replace(/^<[^\s/>]+/, '').replace(/\/?\s*>$/, '');
    for (const match of body.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
        result[match[1].toLowerCase()] = decodeText(match[2] ?? match[3] ?? match[4] ?? '');
    }
    return result;
}

/** Read only tab/fieldset/label relationships; scripts and styles are opaque. */
export function readPageMetadata(markup) {
    const groups = {}, labels = {}, tabs = {}, tabLabels = {}, tabIcons = {};
    let fieldDepth = 0, fieldIds = [], title = [], inLegend = false, legendSkip = 0, skipField = false;
    const labelStack = [];
    let tabButton = null, tabText = [], tabSkip = 0, iconText = null;
    let tabContent = null, divDepth = 0;

    function start(tag, attrs) {
        if (tag === 'button' && hasClass(attrs, 'jellyfin-tab-button')) {
            tabButton = attrs['data-tab']; tabText = []; tabSkip = 0;
        } else if (tabButton) {
            if (tag === 'img' && attrs['data-je-cdn']) tabIcons[tabButton] = { type: 'img', cdnPath: attrs['data-je-cdn'] };
            if (tag === 'i' && hasClass(attrs, 'material-icons') && tabSkip === 0) iconText = [];
            if (textless.has(tag)) tabSkip++;
        }
        if (tag === 'div') {
            if (tabContent === null && hasClass(attrs, 'jellyfin-tab-content')) {
                tabContent = attrs.id; divDepth = 1;
            } else if (tabContent !== null) divDepth++;
        }
        if (tag === 'label') {
            labelStack.push({ id: attrs.for, input: null, text: [], skip: 0 });
        } else if (labelStack.length) {
            const label = labelStack.at(-1);
            if (inputTags.has(tag) && attrs.id && label.input === null) label.input = attrs.id;
            if (textless.has(tag)) label.skip++;
        }
        if (tag === 'fieldset') {
            if (++fieldDepth === 1) {
                fieldIds = []; title = []; skipField = (attrs.id || '').startsWith('overview-');
            }
            return;
        }
        if (!fieldDepth) return;
        if (tag === 'legend' && fieldDepth === 1) { inLegend = true; return; }
        if (inLegend && ['img', 'br', 'hr'].includes(tag)) return;
        if (inLegend && textless.has(tag)) { legendSkip++; return; }
        if (inputTags.has(tag) && attrs.id) fieldIds.push(attrs.id);
    }
    function end(tag) {
        if (tag === 'button' && tabButton) {
            const label = normalizedText(tabText);
            if (label) tabLabels[tabButton] = label;
            tabButton = null;
        } else {
            if (tag === 'i' && iconText !== null) {
                const value = normalizedText(iconText);
                if (value && tabButton) tabIcons[tabButton] = { type: 'material', value };
                iconText = null;
            }
            if (tabButton && textless.has(tag) && tabSkip > 0) tabSkip--;
        }
        if (tag === 'div' && tabContent !== null && --divDepth === 0) tabContent = null;
        if (tag === 'label' && labelStack.length) {
            const label = labelStack.pop();
            const id = label.id || label.input;
            const text = normalizedText(label.text);
            if (id && text && !Object.hasOwn(labels, propertyName(id))) labels[propertyName(id)] = text;
        } else if (labelStack.length && textless.has(tag) && labelStack.at(-1).skip > 0) {
            labelStack.at(-1).skip--;
        }
        if (tag === 'legend') { inLegend = false; return; }
        if (inLegend && textless.has(tag) && legendSkip > 0) { legendSkip--; return; }
        if (tag === 'fieldset') {
            if (fieldDepth === 1 && !skipField) {
                const text = normalizedText(title);
                const tab = tabLabels[tabContent] || tabContent;
                if (text) for (const id of fieldIds) {
                    groups[propertyName(id)] = text;
                    if (tab) tabs[propertyName(id)] = tab;
                }
            }
            fieldDepth = Math.max(0, fieldDepth - 1);
        }
    }
    function text(value) {
        if (iconText !== null) iconText.push(decodeText(value));
        if (tabButton && tabSkip === 0) tabText.push(decodeText(value));
        if (labelStack.length && labelStack.at(-1).skip === 0) labelStack.at(-1).text.push(decodeText(value));
        if (inLegend && legendSkip === 0) title.push(decodeText(value));
    }
    // Quoted attributes can contain '>'. Skip raw-text bodies and comments as
    // complete tokens so JavaScript string templates never create fake controls.
    const tokens = /<!--[^]*?-->|<(?:script|style)\b(?:[^'">]|"[^"]*"|'[^']*')*>[^]*?<\/(?:script|style)\s*>|<![^>]*>|<\/?[a-z][\w:-]*(?:[^'">]|"[^"]*"|'[^']*')*>/gi;
    let offset = 0;
    for (const match of markup.matchAll(tokens)) {
        text(markup.slice(offset, match.index));
        const token = match[0];
        offset = match.index + token.length;
        if (/^<!|^<(?:script|style)\b/i.test(token)) continue;
        const tag = token.match(/^<\/?([\w:-]+)/)[1].toLowerCase();
        if (token.startsWith('</')) end(tag);
        else start(tag, attributes(token));
    }
    text(markup.slice(offset));
    return { groups, labels, tabs, tabLabels, tabIcons };
}

export function configurationSource(repository = repositoryRoot) {
    const host = path.join(repository, 'src/host/configuration');
    const features = path.join(repository, 'src/features');
    const files = fs.readdirSync(host).filter(name => /^PluginConfiguration.*\.cs$/.test(name)).map(name => path.join(host, name));
    for (const feature of fs.readdirSync(features, { withFileTypes: true })) {
        if (!feature.isDirectory()) continue;
        const settings = path.join(features, feature.name, 'settings');
        if (!fs.existsSync(settings)) continue;
        files.push(...fs.readdirSync(settings).filter(name => /^PluginConfiguration\..*\.cs$/.test(name)).map(name => path.join(settings, name)));
    }
    return files.sort().map(file => fs.readFileSync(file, 'utf8')).join('\n');
}

/** Inline scalar initializers are the single source of configuration defaults. */
export function extractDefaults(source) {
    // Preserve literals while removing comments, including comments containing
    // fake property declarations. The supported defaults need no C# evaluator.
    const code = source.replace(/"(?:\\.|[^"\\])*"|\/\/[^\n]*|\/\*[^]*?\*\//g, token => token.startsWith('/') ? ' ' : token);
    if (!/\bclass\s+PluginConfiguration\b/.test(code)) throw new Error('Could not find the PluginConfiguration class');
    if (/\bpublic\s+PluginConfiguration\s*\(/.test(code)) throw new Error('Configuration defaults must be inline property initializers, not constructor assignments');
    const defaults = {};
    const properties = /public\s+(bool\??|string\??|int|long)\s+(\w+)\s*\{\s*get;\s*set;\s*\}(?:\s*=\s*("(?:\\.|[^"\\])*"|[^;\n]+)\s*;)?/g;
    for (const [, type, name, initializer] of code.matchAll(properties)) {
        if (initializer === undefined) {
            if (type === 'bool') defaults[name] = false;
            continue;
        }
        const raw = initializer.trim();
        if (raw === 'true' || raw === 'false') defaults[name] = raw === 'true';
        else if (raw === 'string.Empty') defaults[name] = '';
        else if (/^"[^]*"$/.test(raw)) defaults[name] = raw.slice(1, -1); // Retain established literal spelling.
        else if (/^-?\d+$/.test(raw)) defaults[name] = Number(raw);
        // Complex collections, nullable nulls, enums and expressions are omitted.
    }
    return defaults;
}

export function generateMetadata(markup, source) {
    const page = readPageMetadata(markup);
    for (const property of ['MaintenanceModeAction', 'MaintenanceModeAffectedUsers']) {
        page.tabs[property] ??= 'Admin';
        page.groups[property] ??= 'Maintenance Mode';
    }
    const icons = {};
    for (const [id, icon] of Object.entries(page.tabIcons)) {
        const label = page.tabLabels[id] || id;
        if (icon.type === 'material') icons[label] = { type: 'material', value: icon.value };
        else if (icon.cdnPath?.startsWith('selfhst/')) icons[label] = { type: 'img', src: `https://cdn.jsdelivr.net/gh/selfhst/icons/${icon.cdnPath.slice(8)}` };
    }
    return { groups: sorted(page.groups), labels: sorted(page.labels), tabs: sorted(page.tabs), tabIcons: sorted(icons), defaults: sorted(extractDefaults(source)) };
}

// Preserve the established ASCII-escaped JSON delivery byte-for-byte.
export const serializeMetadata = value => JSON.stringify(value, null, 2).replace(/[\u007f-\uffff]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`) + '\n';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (process.argv.slice(2).some(arg => arg !== '--check')) throw new Error('Usage: node tools/build/generate-config-flag-groups.mjs [--check]');
    const metadata = generateMetadata(fs.readFileSync(configPage, 'utf8'), configurationSource());
    const output = serializeMetadata(metadata);
    if (process.argv.includes('--check')) {
        if (fs.readFileSync(outputFile, 'utf8') !== output) throw new Error('Configuration metadata is stale. Run npm run generate.');
    } else fs.writeFileSync(outputFile, output);
    console.log(`Verified ${Object.keys(metadata.groups).length} groups, ${Object.keys(metadata.labels).length} labels, ${Object.keys(metadata.tabs).length} tabs, ${Object.keys(metadata.tabIcons).length} icons and ${Object.keys(metadata.defaults).length} defaults.`);
}
