/**
 * settings-panel's public API (frontend.md §2.3): types only, no runtime code. Another feature imports these
 * with `import type … from '…/settings-panel/public-api'` (feature-boundaries rule 1); everything else in this
 * folder is private to the panel shell.
 */
export type { PanelContext, SearchHit } from './context';
export type { EnhancedUi, MediaTagsHubApi } from './registry';
