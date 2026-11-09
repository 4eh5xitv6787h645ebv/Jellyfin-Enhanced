/**
 * media-tags' public API (frontend.md §2.3): types only, no runtime code. Another feature imports these with
 * `import type … from '…/media-tags/public-api'` (feature-boundaries rule 1).
 */
// The Media Tags settings panels' registry members (settings-panel/registry.ts `EnhancedUi`).
export type { TagGroupEditorApi, TagGroupEditorData } from './settings/ui-panel-tag-editor';
export type { TagLooksPanel } from './settings/ui-panel-tag-looks';
export type { TagPortableReopen, TagPortableTools, WireTagPortable } from './settings/ui-panel-tag-portable';
export type { PreviewInteraction, PreviewInteractionOptions, TagPreview, TagPreviewData, TagPreviewOptions } from './settings/ui-panel-tag-preview';
// Types code outside this folder imports today (host/tag-runtime-host.ts, host/tag-rules-host.ts,
// host/settings-panel-host.ts; added in S2). C1 moves the first two into this feature; the settings-panel host
// moves to settings-panel/ and then needs these through this file.
export type { LanguageConfig, LanguageSettings, MediaLanguage } from './types/language/media-language';
export type { PosterColours } from './layout/poster-colours';
export type { RatingConfig, RatingSettings, RatingSources } from './types/ratings/rating-sources';
export type { statusVocabulary } from './types/status/status-vocabulary';
export type { TagLayout } from './layout/tag-layout';
export type { TagLook } from './layout/tag-look';
export type { PipelineApi, RendererApi } from './pipeline/contract';
export type { JsonRecord } from './pipeline/dto';
export type { TagScopes, TagSettingsMatrix } from './pipeline/scopes';
export type { TagCacheStore } from './pipeline/tag-cache-store';
export type { DirectPlay } from './types/direct-play/tag-direct-play';
export type { ItemEditor } from './editor/tag-item-editor';
