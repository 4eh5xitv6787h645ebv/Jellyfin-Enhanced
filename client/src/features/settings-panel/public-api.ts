/**
 * settings-panel's public API (frontend.md §2.3): types only, no runtime code. Another feature imports these
 * with `import type … from '…/settings-panel/public-api'` (feature-boundaries rule 1); everything else in this
 * folder is private to the panel shell.
 */
export type { PanelContext, SearchHit } from './context';
export type { EnhancedUi, MediaTagsHubApi } from './registry';
// Until step A2 moves the tag panels to media-tags/settings/, media-tags/public-api.ts re-exports their registry
// types from here. A2 points media-tags/public-api.ts at the moved panels and removes these lines.
export type { TagGroupEditorApi, TagGroupEditorData } from './ui-panel-tag-editor';
export type { TagLooksPanel } from './ui-panel-tag-looks';
export type { TagPortableReopen, TagPortableTools, WireTagPortable } from './ui-panel-tag-portable';
export type { PreviewInteraction, PreviewInteractionOptions, TagPreview, TagPreviewData, TagPreviewOptions } from './ui-panel-tag-preview';
