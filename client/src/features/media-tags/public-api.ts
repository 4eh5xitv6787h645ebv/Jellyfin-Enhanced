/**
 * media-tags' public API (frontend.md §2.3): types only, no runtime code. Another feature imports these with
 * `import type … from '…/media-tags/public-api'` (feature-boundaries rule 1).
 */
// The Media Tags settings panels' registry members (settings-panel/registry.ts `EnhancedUi`). Re-exported from
// settings-panel/public-api.ts until step A2 moves the panels here, then from ./settings/*.
export type {
    PreviewInteraction, PreviewInteractionOptions, TagGroupEditorApi, TagGroupEditorData, TagLooksPanel, TagPortableReopen,
    TagPortableTools, TagPreview, TagPreviewData, TagPreviewOptions, WireTagPortable,
} from '../settings-panel/public-api';
