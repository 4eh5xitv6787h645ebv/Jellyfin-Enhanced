/**
 * settings-panel's public API (frontend.md §2.3): types only, no runtime code. Another feature imports these
 * with `import type … from '…/settings-panel/public-api'` (feature-boundaries rule 1); everything else in this
 * folder is private to the panel shell.
 */
export type { PanelContext, SearchHit } from './context';
export type { EnhancedUi, SettingsSection } from './registry';
// S2: nothing else is imported from outside this folder today (host/settings-panel-host.ts takes `EnhancedUi`
// from registry.ts directly until C1 moves it here).
