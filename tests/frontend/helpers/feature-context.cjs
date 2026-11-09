// canopy K1: the shared featureContext (client/src/host/context.ts publishFeatureContext), compiled from source once
// per process. In production core/ui-kit.js publishes it on JE.core before any feature script runs. Tests that load
// feature scripts without that provider (the jsdom harness, Playwright specs with their own JE fixture) evaluate this
// script after setting window.JellyfinEnhanced: it publishes the same function on JE.core (creating JE.core if absent).
// CommonJS so both the ESM jsdom helpers and the CommonJS Playwright specs can use it.
const { buildSync } = require('esbuild');
const { resolve } = require('node:path');

const root = resolve(__dirname, '../../..');
let source;

/** The installer script's source text. */
function featureContextInstaller() {
  source ??= buildSync({
    absWorkingDir: root, bundle: true, write: false, format: 'iife', target: 'es2020', logLevel: 'silent',
    stdin: {
      resolveDir: root, sourcefile: 'je-test-feature-context.ts', loader: 'ts',
      contents: "import { publishFeatureContext } from './client/src/host/context';\n"
        + "const je = (window as { JellyfinEnhanced?: { core?: object } }).JellyfinEnhanced;\n"
        + "if (je) publishFeatureContext(je.core ??= {});\n",
    },
  }).outputFiles[0].text;
  return source;
}

/** Playwright: publish it in `page` (after the spec has set window.JellyfinEnhanced, before its feature scripts). */
async function provideFeatureContext(page) {
  await page.addScriptTag({ content: featureContextInstaller() });
}

module.exports = { featureContextInstaller, provideFeatureContext };
