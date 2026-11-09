/**
 * media-tags' public API (frontend.md §2.3): types only, no runtime code. Another feature imports these with
 * `import type … from '…/media-tags/public-api'` (feature-boundaries rule 1).
 */
// The Media Tags settings panels' registry members (settings-panel/registry.ts `EnhancedUi`).
export type { TagGroupEditorApi, TagGroupEditorData } from './settings/ui-panel-tag-editor';
export type { TagLooksPanel } from './settings/ui-panel-tag-looks';
export type { TagPortableReopen, TagPortableTools, WireTagPortable } from './settings/ui-panel-tag-portable';
export type { PreviewInteraction, PreviewInteractionOptions, TagPreview, TagPreviewData, TagPreviewOptions } from './settings/ui-panel-tag-preview';
