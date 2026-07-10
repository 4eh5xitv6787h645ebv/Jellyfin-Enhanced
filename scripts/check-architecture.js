#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const pluginRoot = path.join(repoRoot, 'Jellyfin.Plugin.JellyfinEnhanced');
const clientRoot = path.join(pluginRoot, 'js');
const ignoredDirectories = new Set(['.git', 'node_modules', 'bin', 'obj', 'dist', 'site']);

function walk(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            if (ignoredDirectories.has(entry.name)) {
                return [];
            }
            return walk(fullPath);
        }
        return [fullPath];
    });
}

function relative(file) {
    return path.relative(repoRoot, file).replace(/\\/g, '/');
}

const failures = [];
const runtimeFiles = walk(pluginRoot);

// Ambient .d.ts declarations are editor/type-check metadata. Runtime client
// implementation must remain JavaScript, as required by the project contract.
const runtimeTypeScript = runtimeFiles.filter((file) => {
    const name = relative(file);
    return /\.(?:[cm]?ts|tsx)$/.test(name) && !name.endsWith('.d.ts');
});
if (runtimeTypeScript.length > 0) {
    failures.push(`runtime TypeScript files are not allowed:\n  ${runtimeTypeScript.map(relative).join('\n  ')}`);
}

const retiredGodFiles = [
    'Jellyfin.Plugin.JellyfinEnhanced/Controllers/JellyfinEnhancedController.cs',
    'Jellyfin.Plugin.JellyfinEnhanced/js/arr/calendar-page.js',
    'Jellyfin.Plugin.JellyfinEnhanced/js/arr/requests-page.js',
    'Jellyfin.Plugin.JellyfinEnhanced/js/enhanced/bookmarks-library.js',
    'Jellyfin.Plugin.JellyfinEnhanced/js/enhanced/features.js',
    'Jellyfin.Plugin.JellyfinEnhanced/js/enhanced/hidden-content-page.js',
    'Jellyfin.Plugin.JellyfinEnhanced/js/enhanced/hidden-content.js',
    'Jellyfin.Plugin.JellyfinEnhanced/js/enhanced/spoiler-blur.js',
    'Jellyfin.Plugin.JellyfinEnhanced/js/enhanced/ui.js',
    'Jellyfin.Plugin.JellyfinEnhanced/js/jellyseerr/more-info-modal.js',
    'Jellyfin.Plugin.JellyfinEnhanced/js/jellyseerr/ui.js',
];
const restoredGodFiles = retiredGodFiles.filter((file) => fs.existsSync(path.join(repoRoot, file)));
if (restoredGodFiles.length > 0) {
    failures.push(`retired monoliths must stay split:\n  ${restoredGodFiles.join('\n  ')}`);
}

const requiredCoreModules = [
    'api-client.js',
    'dom-observer.js',
    'lifecycle.js',
    'navigation.js',
    'tag-renderer-base.js',
    'ui-kit.js',
];
const missingCoreModules = requiredCoreModules.filter((file) => !fs.existsSync(path.join(clientRoot, 'core', file)));
if (missingCoreModules.length > 0) {
    failures.push(`shared client core modules are missing:\n  ${missingCoreModules.join('\n  ')}`);
}

const spoilerRoot = path.join(clientRoot, 'enhanced', 'spoilerguard');
const requiredSpoilerOrder = [
    'enhanced/spoilerguard/ids.js',
    'enhanced/spoilerguard/state.js',
    'enhanced/spoilerguard/image-refresh.js',
    'enhanced/spoilerguard/snooze.js',
    'enhanced/spoilerguard/dialog.js',
    'enhanced/spoilerguard/identity.js',
    'enhanced/spoilerguard/styles.js',
    'enhanced/spoilerguard/suppression.js',
    'enhanced/spoilerguard/settings-tab.js',
    'enhanced/spoilerguard/seerr-toggle.js',
    'enhanced/spoilerguard/detail-button.js',
    'enhanced/spoilerguard/watched-refresh.js',
    'enhanced/spoilerguard/index.js',
];
const spoilerModules = fs.existsSync(spoilerRoot)
    ? walk(spoilerRoot).filter((file) => file.endsWith('.js')).sort()
    : [];
if (spoilerModules.length < 4) {
    failures.push(`Spoiler Guard must be split into focused JavaScript modules (found ${spoilerModules.length}, expected at least 4)`);
}

const pluginLoaderPath = path.join(clientRoot, 'plugin.js');
const pluginLoaderSource = fs.readFileSync(pluginLoaderPath, 'utf8');
const componentArrayMatch = pluginLoaderSource.match(/const\s+allComponentScripts\s*=\s*\[([\s\S]*?)\];/);
if (!componentArrayMatch) {
    failures.push('plugin.js does not declare the allComponentScripts loader array');
} else {
    const componentScripts = [...componentArrayMatch[1]
        .matchAll(/^\s*(["'])([^"']+\.js)\1\s*,?\s*(?:\/\/.*)?$/gm)]
        .map((match) => match[2]);
    const spoilerScriptPaths = spoilerModules.map((file) => path.relative(clientRoot, file).replace(/\\/g, '/'));
    const missingSpoilerScripts = spoilerScriptPaths.filter((file) => !componentScripts.includes(file));
    const duplicateSpoilerScripts = spoilerScriptPaths.filter(
        (file) => componentScripts.filter((entry) => entry === file).length > 1
    );

    if (missingSpoilerScripts.length > 0) {
        failures.push(`Spoiler Guard modules missing from plugin.js:\n  ${missingSpoilerScripts.join('\n  ')}`);
    }
    if (duplicateSpoilerScripts.length > 0) {
        failures.push(`Spoiler Guard modules must appear exactly once in plugin.js:\n  ${duplicateSpoilerScripts.join('\n  ')}`);
    }

    const missingRequiredSpoilerModules = requiredSpoilerOrder.filter((file) => !spoilerScriptPaths.includes(file));
    if (missingRequiredSpoilerModules.length > 0) {
        failures.push(`required Spoiler Guard boundary modules are missing:\n  ${missingRequiredSpoilerModules.join('\n  ')}`);
    }

    const loadedRequiredSpoilerOrder = requiredSpoilerOrder.filter((file) => componentScripts.includes(file));
    const actualRequiredSpoilerOrder = [...loadedRequiredSpoilerOrder]
        .sort((left, right) => componentScripts.indexOf(left) - componentScripts.indexOf(right));
    if (loadedRequiredSpoilerOrder.join('\0') !== actualRequiredSpoilerOrder.join('\0')) {
        failures.push(
            `Spoiler Guard dependency order is invalid; required order:\n  ${requiredSpoilerOrder.join('\n  ')}`
        );
    }

    const loadedSpoilerScripts = componentScripts.filter((file) => spoilerScriptPaths.includes(file));
    if (loadedSpoilerScripts.length > 0 && loadedSpoilerScripts.at(-1) !== requiredSpoilerOrder.at(-1)) {
        failures.push(`${requiredSpoilerOrder.at(-1)} must load after every Spoiler Guard implementation module`);
    }

    const firstSpoilerIndex = componentScripts.findIndex((file) => spoilerScriptPaths.includes(file));
    const lateCoreModules = requiredCoreModules.filter(
        (file) => componentScripts.indexOf(`core/${file}`) === -1 || componentScripts.indexOf(`core/${file}`) > firstSpoilerIndex
    );
    if (firstSpoilerIndex >= 0 && lateCoreModules.length > 0) {
        failures.push(`shared core modules must load before Spoiler Guard:\n  ${lateCoreModules.join('\n  ')}`);
    }
}

const spoilerIndexPath = path.join(spoilerRoot, 'index.js');
if (fs.existsSync(spoilerIndexPath) && !/^\s*JE\.spoilerBlur\s*=/m.test(fs.readFileSync(spoilerIndexPath, 'utf8'))) {
    failures.push('enhanced/spoilerguard/index.js does not publish the JE.spoilerBlur facade');
}

const requiredWiring = [
    ['enhanced/features-details-page.js', [/JE\.spoilerBlur\.addSpoilerBlurButton/]],
    ['enhanced/ui-panel-template.js', [/spoilerGuard\?\.buildSettingsHtml/]],
    ['enhanced/ui-panel.js', [/spoilerGuard\?\.wireSettings/]],
    ['jellyseerr/more-info-modal-render.js', [/data-mount="je-secondary-actions"/]],
    ['jellyseerr/more-info-modal-actions.js', [/appendSeerrToggle/, /_renderActionsToken/]],
    ['tags/ratingtags.js', [/shouldSuppressRatingTag/, /sgType/, /sgSeriesId/, /sgPlayed/]],
];
for (const [file, patterns] of requiredWiring) {
    const source = fs.readFileSync(path.join(clientRoot, file), 'utf8');
    const missingPatterns = patterns.filter((pattern) => !pattern.test(source));
    if (missingPatterns.length > 0) {
        failures.push(`${file} is missing required Spoiler Guard integration wiring`);
    }
}

const oversizedClientFiles = walk(clientRoot)
    .filter((file) => file.endsWith('.js'))
    .map((file) => ({ file, lines: fs.readFileSync(file, 'utf8').split(/\r?\n/).length }))
    .filter(({ lines }) => lines > 1500);
if (oversizedClientFiles.length > 0) {
    failures.push(`js/ feature modules over the 1500-line architecture ceiling:\n  ${oversizedClientFiles
        .map(({ file, lines }) => `${relative(file)} (${lines} lines)`)
        .join('\n  ')}`);
}

if (failures.length > 0) {
    console.error(`Architecture check FAILED:\n\n${failures.map((failure) => `- ${failure}`).join('\n\n')}`);
    process.exit(1);
}

console.log(
    `Architecture check passed: plain-JavaScript runtime, ${spoilerModules.length} Spoiler Guard modules, ` +
    `${requiredCoreModules.length} shared core modules, and no retired monoliths.`
);
