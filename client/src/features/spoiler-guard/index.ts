import { spoilerHost } from './host';
const { JE, internal, ctx } = spoilerHost();
    const logPrefix = '🪼 Jellyfin Enhanced [SpoilerGuard]:';
    let installed = false;

    function init() {
        if (JE.pluginConfig?.SpoilerBlurEnabled !== true) return;
        internal.setIdentityCookie();
        if (!installed) {
            installed = true;
            internal.injectStyles();
        }
        try { internal.installWatchedRefresh(); }
        catch (e) { console.warn(`${logPrefix} watched-state integration failed:`, e); }
        void internal.loadState();
    }

    ctx.own.spoilerBlur = {
        init,
        addSpoilerBlurButton: internal.addSpoilerBlurButton,
        isEnabledFor: internal.isEnabledFor,
        isMovieEnabledFor: internal.isMovieEnabledFor,
        isMovieInScope: internal.isMovieInScope,
        isCollectionEnabledFor: internal.isCollectionEnabledFor,
        enableForSeries: internal.enableForSeries,
        disableForSeries: internal.disableForSeries,
        enableForMovie: internal.enableForMovie,
        disableForMovie: internal.disableForMovie,
        enableForCollection: internal.enableForCollection,
        disableForCollection: internal.disableForCollection,
        isTmdbEnabled: internal.isTmdbEnabled,
        enableForTmdb: internal.enableForTmdb,
        disableForTmdb: internal.disableForTmdb,
        hasAnyState: internal.hasAnyState,
        whenLoaded: internal.whenLoaded,
        isLoadOk: internal.isLoadOk,
        isLoaded: internal.isLoaded,
        confirmDisableSpoiler: internal.confirmDisableSpoiler,
        getUserPrefs: internal.getUserPrefs,
        setUserPrefs: internal.setUserPrefs,
    };

    // pluginConfig is already available when component scripts execute. Starting
    // here makes the state request race alongside later component evaluation;
    // plugin.js calls init again after setup, which is intentionally idempotent.
    init();
