(() => {
"use strict";(()=>{function a(t,n,i){let r=n.core?.featureContext;if(typeof r!="function")throw new Error(`${t}: JE.core.featureContext is missing; core/ui-kit.js must load before feature scripts`);return r(t,n,i)}function d(){var s;let t=window,n=t.JellyfinEnhanced;if(!n)throw new Error("Spoiler Guard loaded before Jellyfin Enhanced");let i=a("spoiler-guard",n,{facades:["spoilerBlur"],internalSlots:["spoilerGuard"],internalsObject:()=>n.internals??(n.internals={})}),r=(s=i.own).spoilerGuard??(s.spoilerGuard={});function o(e){let l=r[e];if(l==null)throw new Error(`Spoiler Guard loader dependency missing: ${e}`);return l}return{JE:n,internal:{get normalizeId(){return o("normalizeId")},set normalizeId(e){r.normalizeId=e},get pendingKey(){return o("pendingKey")},set pendingKey(e){r.pendingKey=e},get kindOf(){return o("kindOf")},set kindOf(e){r.kindOf=e},get loadState(){return o("loadState")},set loadState(e){r.loadState=e},get whenLoaded(){return o("whenLoaded")},set whenLoaded(e){r.whenLoaded=e},get isStateLoaded(){return o("isStateLoaded")},set isStateLoaded(e){r.isStateLoaded=e},get isLoadOk(){return o("isLoadOk")},set isLoadOk(e){r.isLoadOk=e},get isLoaded(){return o("isLoaded")},set isLoaded(e){r.isLoaded=e},get hasAnyState(){return o("hasAnyState")},set hasAnyState(e){r.hasAnyState=e},get isDisableSnoozed(){return o("isDisableSnoozed")},set isDisableSnoozed(e){r.isDisableSnoozed=e},get isEnabledFor(){return o("isEnabledFor")},set isEnabledFor(e){r.isEnabledFor=e},get isMovieEnabledFor(){return o("isMovieEnabledFor")},set isMovieEnabledFor(e){r.isMovieEnabledFor=e},get isCollectionEnabledFor(){return o("isCollectionEnabledFor")},set isCollectionEnabledFor(e){r.isCollectionEnabledFor=e},get isMovieInScope(){return o("isMovieInScope")},set isMovieInScope(e){r.isMovieInScope=e},get isEnabledForKind(){return o("isEnabledForKind")},set isEnabledForKind(e){r.isEnabledForKind=e},get enableForSeries(){return o("enableForSeries")},set enableForSeries(e){r.enableForSeries=e},get disableForSeries(){return o("disableForSeries")},set disableForSeries(e){r.disableForSeries=e},get enableForMovie(){return o("enableForMovie")},set enableForMovie(e){r.enableForMovie=e},get disableForMovie(){return o("disableForMovie")},set disableForMovie(e){r.disableForMovie=e},get enableForCollection(){return o("enableForCollection")},set enableForCollection(e){r.enableForCollection=e},get disableForCollection(){return o("disableForCollection")},set disableForCollection(e){r.disableForCollection=e},get isTmdbPending(){return o("isTmdbPending")},set isTmdbPending(e){r.isTmdbPending=e},get isTmdbEnabled(){return o("isTmdbEnabled")},set isTmdbEnabled(e){r.isTmdbEnabled=e},get enableForTmdb(){return o("enableForTmdb")},set enableForTmdb(e){r.enableForTmdb=e},get disableForTmdb(){return o("disableForTmdb")},set disableForTmdb(e){r.disableForTmdb=e},get getUserPrefs(){return o("getUserPrefs")},set getUserPrefs(e){r.getUserPrefs=e},get setUserPrefs(){return o("setUserPrefs")},set setUserPrefs(e){r.setUserPrefs=e},get setDisableSnooze(){return o("setDisableSnooze")},set setDisableSnooze(e){r.setDisableSnooze=e},get setIdentityCookie(){return o("setIdentityCookie")},set setIdentityCookie(e){r.setIdentityCookie=e},get primeIdentityCookie(){return o("primeIdentityCookie")},set primeIdentityCookie(e){r.primeIdentityCookie=e},get injectStyles(){return o("injectStyles")},set injectStyles(e){r.injectStyles=e},get installWatchedRefresh(){return o("installWatchedRefresh")},set installWatchedRefresh(e){r.installWatchedRefresh=e},get refreshSpoilerableImages(){return o("refreshSpoilerableImages")},set refreshSpoilerableImages(e){r.refreshSpoilerableImages=e},get scheduleFullReload(){return o("scheduleFullReload")},set scheduleFullReload(e){r.scheduleFullReload=e},get bustSpoilerImageUrl(){return o("bustSpoilerImageUrl")},set bustSpoilerImageUrl(e){r.bustSpoilerImageUrl=e},get confirmDisableSpoiler(){return o("confirmDisableSpoiler")},set confirmDisableSpoiler(e){r.confirmDisableSpoiler=e},get addSpoilerBlurButton(){return o("addSpoilerBlurButton")},set addSpoilerBlurButton(e){r.addSpoilerBlurButton=e},get buildSeerrToggle(){return o("buildSeerrToggle")},set buildSeerrToggle(e){r.buildSeerrToggle=e},get appendSeerrToggle(){return o("appendSeerrToggle")},set appendSeerrToggle(e){r.appendSeerrToggle=e},get buildSettingsHtml(){return o("buildSettingsHtml")},set buildSettingsHtml(e){r.buildSettingsHtml=e},get wireSettings(){return o("wireSettings")},set wireSettings(e){r.wireSettings=e}},ApiClient:{getCurrentUserId:()=>t.ApiClient?.getCurrentUserId()??null},host:t,ctx:i}}var{JE:b,internal:u}=d();u.injectStyles=function(){b.core.ui.injectCss("je-spoiler-guard-styles",`
            .je-spoiler-blur-btn.je-spoiler-blur-on .detailButton-icon {
                color: #d6c8ff;
            }
            .je-more-info-modal .je-more-info-secondary-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 0.5rem;
                margin-top: 0.75rem;
            }
            .je-more-info-modal .je-more-info-secondary-actions:empty {
                display: none;
            }
            .je-spoiler-pending-btn {
                display: inline-flex;
                align-items: center;
                gap: 0.4em;
                padding: 0.45em 0.9em;
                font-size: 0.85em;
                font-weight: 500;
                line-height: 1.2;
                background: rgba(255, 255, 255, 0.06);
                color: rgba(255, 255, 255, 0.85);
                border: 1px solid rgba(255, 255, 255, 0.14);
                border-radius: 999px;
                cursor: pointer;
                transition: background 0.2s, border-color 0.2s, color 0.2s;
            }
            .je-spoiler-pending-btn:hover:not(:disabled) {
                background: rgba(255, 255, 255, 0.1);
                border-color: rgba(255, 255, 255, 0.25);
                color: #fff;
            }
            .je-spoiler-pending-btn:disabled {
                opacity: 0.55;
                cursor: progress;
            }
            .je-spoiler-pending-btn.je-spoiler-pending-on {
                background: rgba(90, 63, 184, 0.22);
                color: #d6c8ff;
                border-color: rgba(90, 63, 184, 0.55);
            }
            .je-spoiler-pending-btn.je-spoiler-pending-on:hover:not(:disabled) {
                background: rgba(90, 63, 184, 0.32);
                border-color: rgba(90, 63, 184, 0.75);
                color: #fff;
            }
            .je-spoiler-pending-btn .material-icons { font-size: 1.1em; }
        `)};})();
})();
