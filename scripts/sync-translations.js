#!/usr/bin/env node

/**
 * Translation Synchronization Script
 *
 * Keeps all translation files in sync with the base English file (en.json).
 * Developers only need to edit en.json when adding new keys -- this script
 * propagates missing keys to every other locale using the English value as
 * a placeholder. Existing translations are never overwritten.
 *
 * Usage:
 *   node scripts/sync-translations.js [command] [options]
 *
 * Commands:
 *   sync [--dry-run]     - Sync all locale files with en.json (default)
 *   sort [--dry-run]     - Sort all locale files to match en.json key order
 *   check               - Report which files are out of sync (CI-friendly, exits 1 if any)
 *   context <key>        - Show translator context for a key (from en.context.json)
 *   help                 - Show this help message
 */

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '../Jellyfin.Plugin.JellyfinEnhanced/js/locales');
const CONTEXT_FILE = path.join(LOCALES_DIR, 'en.context.json');
const BASE_LANG = 'en';

const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
    bold: '\x1b[1m'
};

function log(message, color = 'reset') {
    console.log(colors[color] + message + colors.reset);
}

/**
 * Load a JSON file, returning null on failure.
 */
function loadJson(filePath) {
    if (!fs.existsSync(filePath)) return null;
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        log(`\u2717 Failed to parse ${path.basename(filePath)}: ${e.message}`, 'red');
        return null;
    }
}

/**
 * Write a JSON file with consistent formatting (4-space indent, trailing newline).
 */
function writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 4) + '\n', 'utf8');
}

/**
 * Get all locale file names (excluding en.json).
 */
function getTargetLanguages() {
    return fs.readdirSync(LOCALES_DIR)
        .filter(f => f.endsWith('.json') && f !== `${BASE_LANG}.json` && f !== 'en.context.json')
        .map(f => f.replace('.json', ''))
        .sort();
}

/**
 * Sync all locale files against en.json.
 *
 * - Adds missing keys (with English value as placeholder)
 * - Removes keys not present in en.json
 * - Reorders keys to match en.json ordering
 * - Never overwrites existing translations
 */
function syncAll(dryRun = false) {
    const base = loadJson(path.join(LOCALES_DIR, `${BASE_LANG}.json`));
    if (!base) {
        log('\u2717 Base translation file (en.json) not found!', 'red');
        process.exit(1);
    }

    const context = loadJson(CONTEXT_FILE) || {};
    const baseKeys = Object.keys(base);
    const languages = getTargetLanguages();
    let totalAdded = 0;
    let totalRemoved = 0;
    let totalReordered = 0;
    const allAddedKeys = new Set();

    for (const lang of languages) {
        const filePath = path.join(LOCALES_DIR, `${lang}.json`);
        const translation = loadJson(filePath);
        if (!translation) continue;

        const added = [];
        const removed = [];

        // Build new object in en.json key order
        const synced = {};
        for (const key of baseKeys) {
            if (key in translation) {
                synced[key] = translation[key];
            } else {
                // Missing key -- use English value as placeholder
                synced[key] = base[key];
                added.push(key);
            }
        }

        // Detect extra keys not in en.json
        for (const key of Object.keys(translation)) {
            if (!(key in base)) {
                removed.push(key);
            }
        }

        // Detect if key order changed
        const oldOrder = Object.keys(translation).filter(k => k in base);
        const newOrder = baseKeys.filter(k => k in translation);
        const reordered = oldOrder.join(',') !== newOrder.join(',');

        const hasChanges = added.length > 0 || removed.length > 0 || reordered;

        if (hasChanges) {
            if (added.length > 0) {
                log(`  ${lang}.json: +${added.length} key(s) added`, 'green');
                added.forEach(k => log(`    + ${k}`, 'gray'));
                added.forEach(k => allAddedKeys.add(k));
                totalAdded += added.length;
            }
            if (removed.length > 0) {
                log(`  ${lang}.json: -${removed.length} extra key(s) removed`, 'yellow');
                removed.forEach(k => log(`    - ${k}`, 'gray'));
                totalRemoved += removed.length;
            }
            if (reordered && added.length === 0 && removed.length === 0) {
                log(`  ${lang}.json: reordered to match en.json`, 'cyan');
                totalReordered++;
            }

            if (!dryRun) {
                writeJson(filePath, synced);
            }
        }
    }

    console.log();
    if (totalAdded === 0 && totalRemoved === 0 && totalReordered === 0) {
        log('\u2713 All locale files are already in sync!', 'green');
    } else {
        const prefix = dryRun ? '[DRY RUN] Would have' : 'Done:';
        log(`${prefix} added ${totalAdded} key(s), removed ${totalRemoved} extra key(s), reordered ${totalReordered} file(s) across ${languages.length} locales.`, 'bold');
    }

    // Show translator context for newly added keys
    if (allAddedKeys.size > 0) {
        const keysWithContext = [...allAddedKeys].filter(k => context[k]);
        const keysWithoutContext = [...allAddedKeys].filter(k => !context[k]);
        if (keysWithContext.length > 0) {
            console.log();
            log('Translator context for new keys:', 'cyan');
            for (const k of keysWithContext) {
                log(`  ${k}`, 'green');
                log(`    ${context[k]}`, 'gray');
            }
        }
        if (keysWithoutContext.length > 0) {
            console.log();
            log(`${keysWithoutContext.length} new key(s) have no translator context in en.context.json:`, 'yellow');
            keysWithoutContext.forEach(k => log(`  - ${k}`, 'gray'));
        }
    }
}

/**
 * Sort all locale files to match en.json's key order.
 * en.json's existing order is the source of truth and is not modified.
 */
function sortAll(dryRun = false) {
    const basePath = path.join(LOCALES_DIR, `${BASE_LANG}.json`);
    const base = loadJson(basePath);
    if (!base) {
        log('\u2717 Base translation file (en.json) not found!', 'red');
        process.exit(1);
    }

    const baseKeys = Object.keys(base);
    let changed = 0;

    // Sort every locale to match en.json order (extra keys at the end, alphabetically)
    const files = fs.readdirSync(LOCALES_DIR)
        .filter(f => f.endsWith('.json') && f !== 'en.context.json');

    for (const file of files) {
        const filePath = path.join(LOCALES_DIR, file);
        const data = loadJson(filePath);
        if (!data) continue;

        const sorted = {};
        // First: keys in en.json order
        for (const key of baseKeys) {
            if (key in data) sorted[key] = data[key];
        }
        // Then: any extra keys alphabetically (shouldn't exist after sync, but safe)
        for (const key of Object.keys(data).sort()) {
            if (!(key in sorted)) sorted[key] = data[key];
        }

        if (JSON.stringify(data) !== JSON.stringify(sorted)) {
            changed++;
            log(`  ${file}: reordered`, 'cyan');
            if (!dryRun) writeJson(filePath, sorted);
        }
    }

    console.log();
    if (changed === 0) {
        log('\u2713 All locale files are already in correct order!', 'green');
    } else {
        const prefix = dryRun ? '[DRY RUN] Would reorder' : 'Reordered';
        log(`${prefix} ${changed} file(s).`, 'bold');
    }
}

/**
 * Check sync status (CI-friendly). Exits 1 if any file is out of sync.
 */
function check() {
    const base = loadJson(path.join(LOCALES_DIR, `${BASE_LANG}.json`));
    if (!base) {
        log('\u2717 Base translation file (en.json) not found!', 'red');
        process.exit(1);
    }

    const baseKeys = new Set(Object.keys(base));
    const languages = getTargetLanguages();
    let issues = 0;

    for (const lang of languages) {
        const filePath = path.join(LOCALES_DIR, `${lang}.json`);
        const translation = loadJson(filePath);
        if (!translation) continue;

        const translationKeys = new Set(Object.keys(translation));
        const missing = [...baseKeys].filter(k => !translationKeys.has(k));
        const extra = [...translationKeys].filter(k => !baseKeys.has(k));

        if (missing.length > 0 || extra.length > 0) {
            issues++;
            if (missing.length > 0) {
                log(`  ${lang}.json: ${missing.length} missing key(s)`, 'red');
                missing.forEach(k => log(`    - ${k}`, 'gray'));
            }
            if (extra.length > 0) {
                log(`  ${lang}.json: ${extra.length} extra key(s)`, 'yellow');
                extra.forEach(k => log(`    + ${k}`, 'gray'));
            }
        }
    }

    console.log();
    if (issues === 0) {
        log('\u2713 All locale files are in sync with en.json!', 'green');
    } else {
        log(`\u2717 ${issues} file(s) out of sync. Run: node scripts/sync-translations.js sync`, 'red');
        process.exit(1);
    }
}

/**
 * Show translator context for one or all keys.
 */
function showContext(key) {
    const context = loadJson(CONTEXT_FILE);
    if (!context) {
        log('\u2717 Context file (en.context.json) not found!', 'red');
        log('  Create it in js/locales/en.context.json to provide translator hints.', 'gray');
        process.exit(1);
    }

    if (key) {
        if (context[key]) {
            log(`${key}:`, 'bold');
            log(`  ${context[key]}`, 'cyan');
        } else {
            log(`No context found for key: ${key}`, 'yellow');
        }
    } else {
        const keys = Object.keys(context);
        log(`Translator context (${keys.length} entries):`, 'bold');
        console.log();
        for (const k of keys) {
            log(`  ${k}`, 'green');
            log(`    ${context[k]}`, 'gray');
        }
    }
}

function showHelp() {
    console.log(`
${colors.bold}Translation Synchronization Script${colors.reset}

${colors.cyan}Usage:${colors.reset}
  node scripts/sync-translations.js [command] [options]

${colors.cyan}Commands:${colors.reset}
  ${colors.green}sync [--dry-run]${colors.reset}
      Sync all locale files with en.json. Adds missing keys (English as
      placeholder), removes extra keys, reorders to match en.json.
      Use --dry-run to preview changes without writing files.

  ${colors.green}sort [--dry-run]${colors.reset}
      Sort all locale files to match en.json key order.

  ${colors.green}check${colors.reset}
      Report which files are out of sync. Exits 1 if any issues found.
      Suitable for CI pipelines.

  ${colors.green}context [key]${colors.reset}
      Show translator context from en.context.json. Without a key,
      shows all entries.

  ${colors.green}help${colors.reset}
      Show this help message.

${colors.cyan}Typical workflow:${colors.reset}
  1. Add new keys to en.json
  2. Run: node scripts/sync-translations.js sync
  3. Commit all locale files

${colors.cyan}CI usage:${colors.reset}
  node scripts/sync-translations.js check
`);
}

function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'help';
    const dryRun = args.includes('--dry-run');

    switch (command) {
        case 'sync':
            log('Syncing locale files with en.json...', 'bold');
            if (dryRun) log('[DRY RUN] No files will be modified.\n', 'yellow');
            syncAll(dryRun);
            break;
        case 'sort':
            log('Sorting locale files to match en.json key order...', 'bold');
            if (dryRun) log('[DRY RUN] No files will be modified.\n', 'yellow');
            sortAll(dryRun);
            break;
        case 'check':
            log('Checking locale file sync status...', 'bold');
            check();
            break;
        case 'context':
            showContext(args[1]);
            break;
        case 'help':
        default:
            showHelp();
            break;
    }
}

if (require.main === module) {
    main();
}

module.exports = { syncAll, sortAll, check, showContext };
