import type { PanelContext } from './context';
import type {
    PreviewInteraction, PreviewInteractionOptions, TagGroupEditorApi, TagGroupEditorData, TagLooksPanel, TagPortableReopen,
    TagPortableTools, TagPreview, TagPreviewData, TagPreviewOptions, WireTagPortable,
} from '../media-tags/public-api';

/**
 * `JE.internals.enhancedUi`: the registry the split panel modules share
 * (and that admin pages and the item editor read). Every member is optional:
 * each module fills its own part when it loads, in manifest order.
 */
export interface EnhancedUi {
    GITHUB_REPO?: string;
    showReleaseNotesNotification?: () => Promise<void>;
    buildPanelHtml?: (ctx: PanelContext) => string;
    buildPanelSizeControlsHtml?: () => string;
    buildPanelResizeHandlesHtml?: () => string;
    wirePanelResize?: (ctx: PanelContext) => void;
    wireShortcutEditor?: (ctx: PanelContext) => void;
    wireSettingsListeners?: (ctx: PanelContext) => void;
    wireMiscSettingsControls?: (ctx: PanelContext) => void;
    removeTagGroup?: (group: string, containerClass: string) => void;
    syncSubtitlePreviewTextShadow?: (bgColor: string) => void;
    wireHiddenContentListeners?: (ctx: PanelContext) => void;
    wireLanguageControls?: (ctx: PanelContext) => void;
    buildMediaTagsHubHtml?: (ctx: PanelContext) => string;
    wireMediaTagsHub?: (ctx: PanelContext) => void;
    wireTagLooks?: (ctx: PanelContext) => void;
    tagLooksPanel?: TagLooksPanel;
    tagPortable?: TagPortableTools;
    buildTagPortableHtml?: () => string;
    wireTagPortable?: WireTagPortable;
    tagPortableReopen?: TagPortableReopen | null;
    wireTagGroupEditor?: (ctx: PanelContext) => void;
    buildTagGroupEditorHtml?: (ctx: PanelContext) => string;
    tagGroupEditor?: TagGroupEditorApi | null;
    tagGroupEditorData?: TagGroupEditorData;
    mediaTagsHub?: MediaTagsHubApi | null;
    bindTagPreviewInteraction?: (cards: readonly HTMLElement[], view: HTMLElement, options?: PreviewInteractionOptions) => PreviewInteraction;
    createTagPreview?: (mount: HTMLElement | null, options?: TagPreviewOptions) => TagPreview | null;
    tagPreviewData?: TagPreviewData;
}

/** The open hub's controls other sections and tests drive (ui-panel-media-tags.ts). */
export interface MediaTagsHubApi {
    openTab(tab: string, options?: { focus?: boolean; focusTab?: boolean }): boolean;
    announce(message: string): void;
    refreshPreview(): void;
    hasPreview(): boolean;
    searchIndex(): Array<{ label: string; path: string; el: HTMLElement }>;
    reveal(el: HTMLElement): void;
    dispose(): void;
}
