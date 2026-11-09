(() => {
"use strict";(()=>{function N(a,i,u){let g=i.core?.featureContext;if(typeof g!="function")throw new Error(`${a}: JE.core.featureContext is missing; core/ui-kit.js must load before feature scripts`);return g(a,i,u)}function J(){let a=window,i=a.JellyfinEnhanced??(a.JellyfinEnhanced={});return i.core??(i.core={}),i}function M(a=J()){return N("media-tags",a,{internalSlots:["peopleTags"],internalsObject:()=>a.internals=a.internals||{}})}var H=Object.freeze({});function m(a){return typeof a=="object"&&a!==null&&!Array.isArray(a)}function l(a){return m(a)?a:H}function C(a){return typeof a=="number"&&Number.isFinite(a)?a:null}function y(a,i){return Object.prototype.hasOwnProperty.call(a,i)?a[i]:void 0}var _={ratingTagsOnMovies:"movies",ratingTagsOnSeries:"series",ratingTagsOnSeasons:"seasons",ratingTagsOnEpisodes:"episodes",ratingTagsOnContinueWatching:"continueWatching",ratingTagsOnNextUp:"nextUp"};function U(a){let i=a.core,u="🪼 Jellyfin Enhanced: Rating Tags:",g="rating-overlay-container",d="rating-tag",w=60*1e3;function S(n){if(n==null)return null;let t=Number(n);return Number.isFinite(t)?Math.max(0,Math.min(100,Math.round(t))):null}let z={Movie:{userKey:"ratingTagsOnMovies",pluginKey:"RatingTagsOnMovies"},Series:{userKey:"ratingTagsOnSeries",pluginKey:"RatingTagsOnSeries"},Season:{userKey:"ratingTagsOnSeasons",pluginKey:"RatingTagsOnSeasons"},Episode:{userKey:"ratingTagsOnEpisodes",pluginKey:"RatingTagsOnEpisodes"}},h={continuewatching:{userKey:"ratingTagsOnContinueWatching",pluginKey:"RatingTagsOnContinueWatching"},nextup:{userKey:"ratingTagsOnNextUp",pluginKey:"RatingTagsOnNextUp"}},F=Object.values(h);function T(n){let t=y(_,n.userKey);if(t&&i.core?.tagScopes)return i.core.tagScopes.allows("rating",t);let e=i.currentSettings?.[n.userKey];if(typeof e=="boolean")return e;let r=i.pluginConfig?.[n.pluginKey];return typeof r=="boolean"?r:!0}function p(n,t){let e=n.closest("[data-type]")?.getAttribute("data-type")||(typeof t=="string"?t:null),r=e?y(z,e):null;if(r&&!T(r))return!0;if(typeof i.detectCardRowSurface=="function"&&F.some(o=>!T(o))){let o=y(h,i.detectCardRowSurface(n));if(o&&!T(o))return!0}return!1}i.isRatingTagExcludedByScope=p;function b(){try{let n=a.peer("spoilerBlur");return!n||i.pluginConfig?.SpoilerBlurEnabled!==!0?!1:typeof n.isLoaded=="function"?n.isLoaded()!==!0:typeof n.isLoadOk=="function"&&n.isLoadOk()!==!0}catch{return!1}}function x(n){try{if(!n||!i.pluginConfig||i.pluginConfig.SpoilerBlurEnabled!==!0||i.pluginConfig.SpoilerStripRatings===!1)return!1;let t=a.peer("spoilerBlur");if(!t||typeof t.isEnabledFor!="function"||typeof t.getUserPrefs=="function"&&t.getUserPrefs()?.HideRatings===!1)return!1;let e=typeof t.isLoadOk=="function"?t.isLoadOk()===!0:!0;return n.Type==="Series"?n.Id?e?t.isEnabledFor(n.Id)===!0:!0:!1:n.Type==="Season"?n.SeriesId?e?t.isEnabledFor(n.SeriesId)===!0:!0:!1:n.Type==="Episode"?l(n.UserData).Played===!0||!n.SeriesId?!1:e?t.isEnabledFor(n.SeriesId)===!0:!0:!1}catch{return!!(i.pluginConfig&&i.pluginConfig.SpoilerBlurEnabled===!0)}}function k(n,t){let e=n.getPersistent(t)??n.hot?.get(t);if(!e)return null;let r=m(e)?C(e.refreshAt):null;return r!==null&&Date.now()>=r?null:typeof e=="string"||typeof e=="number"?{tmdb:String(e),critic:null}:m(e)?{...e,tmdb:e.tmdb??null,critic:e.critic??null}:null}function L(n,t,e){n.setPersistent(t,e),n.hot?.set(t,e)}function f(n,t,e){if(!e)return;let r=i.ratingSources.resolve(e.tmdb,e.critic,e.ratings);if(n.removeExistingOverlay(t),!r.length)return;let o=document.createElement("div");o.className=g;for(let s of r)o.appendChild(i.ratingSources.chip(s));n.commitOverlay(t,o)}let R={logPrefix:u,settingKey:"ratingTagsEnabled",containerClass:g,taggedAttr:"jeRatingTagged",styleId:"jellyfin-enhanced-rating-tags-css",position:{userKey:"ratingTagsPosition",pluginKey:"RatingTagsPosition",fallback:"bottom-right"},cache:{key:"JellyfinEnhanced-ratingTagsCache",legacyPrefix:"ratingTagsCache",hotBucket:"rating",saveOnUnload:!1},buildCss(){return`
                .${g} {
                    display: flex;
                    flex-direction: column;
                    gap: calc(4px * var(--je-tag-scale, 1) * var(--je-tag-gap, 1));
                    align-items: flex-end;
                    z-index: 10;
                    pointer-events: none;
                    max-width: calc(100% - 12px);
                }

                .${d} {
                    display: inline-flex;
                    align-items: center;
                    gap: calc(4px * var(--je-tag-scale, 1));
                    padding: calc(4px * var(--je-tag-scale, 1)) calc(8px * var(--je-tag-scale, 1));
                    background: rgba(0, 0, 0, 0.8);
                    color: #ffc107;
                    font-size: calc(13px * var(--je-tag-scale, 1));
                    font-weight: 600;
                    border-radius: 4px;
                    /* backdrop-filter removed — blur causes jank during hover animations */
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
                    white-space: nowrap;
                    line-height: 1;
                    pointer-events: none;
                }

                .${d}.rating-tag-critic { color: #ffffff; }
                .${d}.rating-tag-tmdb { background: rgba(0, 0, 0, 0.85); color: #ffc107; }

                .rating-star-icon { color: #ffc107 !important; font-size: calc(14px * var(--je-tag-scale, 1)); line-height: 1; }
                .rating-tomato-icon { width: calc(14px * var(--je-tag-scale, 1)); height: calc(14px * var(--je-tag-scale, 1)); flex-shrink: 0; background-size: contain; background-repeat: no-repeat; background-position: center; display: inline-block; }
                .rating-tomato-icon.fresh { background-image: url(assets/img/fresh.svg); }
                .rating-tomato-icon.rotten { background-image: url(assets/img/rotten.svg); }
                .rating-text { line-height: 1; }
                .je-rating-source-logo { display: inline-flex; width: calc(14px * var(--je-tag-scale, 1)); height: calc(14px * var(--je-tag-scale, 1)); flex-shrink: 0; }
                .je-rating-source-logo :is(svg, img) { width: 100%; height: 100%; display: block; object-fit: contain; }
                .rating-tag--source { color: #fff; }
                .rating-tag[data-je-rating-compact] > :first-child { display: none; }
                .rating-tag[data-je-rating-compact]::before { content: ''; width: calc(2px * var(--je-tag-scale, 1)); height: calc(2px * var(--je-tag-scale, 1)); border-radius: 50%; background: var(--je-rating-source-color); }


                .layout-mobile .${d} {
                    padding: calc(2px * var(--je-tag-scale, 1)) calc(6px * var(--je-tag-scale, 1));
                    font-size: calc(11px * var(--je-tag-scale, 1));
                    border-radius: 3px;
                }
                .layout-mobile .${g} { gap: calc(3px * var(--je-tag-scale, 1) * var(--je-tag-gap, 1)); }
                .layout-mobile .rating-star-icon { font-size: calc(12px * var(--je-tag-scale, 1)) !important; }
                .layout-mobile .rating-tomato-icon { width: calc(12px * var(--je-tag-scale, 1)); height: calc(12px * var(--je-tag-scale, 1)); }

                @media (max-width: 768px) {
                    .${d} { padding: calc(3px * var(--je-tag-scale, 1)) calc(6px * var(--je-tag-scale, 1)); font-size: calc(12px * var(--je-tag-scale, 1)); }
                    .${g} { gap: calc(3px * var(--je-tag-scale, 1) * var(--je-tag-gap, 1)); }
                }

                @media (max-width: 480px) {
                    .${g} { gap: calc(2px * var(--je-tag-scale, 1) * var(--je-tag-gap, 1)); }
                    .${d} { padding: calc(2px * var(--je-tag-scale, 1)) calc(4px * var(--je-tag-scale, 1)); font-size: calc(clamp(10px, 2vw, 11px) * var(--je-tag-scale, 1)); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4); }
                    .rating-star-icon { font-size: calc(clamp(10px, 2.5vw, 11px) * var(--je-tag-scale, 1)) !important; }
                    .rating-tomato-icon { width: calc(clamp(10px, 2.5vw, 11px) * var(--je-tag-scale, 1)); height: calc(clamp(10px, 2.5vw, 11px) * var(--je-tag-scale, 1)); }
                }
            `},pipeline:{needsFirstEpisode:!1,needsParentSeries:!1,render(n,t,e,r){if(n.shouldIgnore(t)||n.isTagged(t)||t.closest(".je-hidden"))return;if(p(t,e.Type)){n.markTagged(t);return}let o=String(e.Id);if(x(e)){n.markTagged(t),!b()&&typeof i.appendUserRatingToContainer=="function"&&i.appendUserRatingToContainer(t,e,r);return}let s=k(n,o);if(s&&s.tmdb!==void 0){(s.tmdb||s.critic!==null||s.ratings)&&f(n,t,s),typeof i.appendUserRatingToContainer=="function"&&i.appendUserRatingToContainer(t,e,r);return}let c=e;r.ratingParentSeries&&!e.CommunityRating&&!e.CriticRating&&(c=r.ratingParentSeries);let I=c.CommunityRating!=null?parseFloat(String(c.CommunityRating)).toFixed(1):null,P=c.CriticRating!=null?S(c.CriticRating):null,v={tmdb:I,critic:P,ratings:e.Ratings??r.ratingParentSeries?.Ratings},j=l(e.ProviderIds),O=l(r?.parentSeries?.ProviderIds),K=j.Tmdb||j.tmdb||null,B=O.Tmdb||O.tmdb||null,D=e.Type==="Series"?"tv":"movie",E=C(e.RatingsRefreshAt),A=e.RatingsPending===!0?Date.now()+w:E!==null?Math.max(E,Date.now()+w):null;L(n,o,{...v,...A!==null?{refreshAt:A}:{},tmdbId:K,seriesTmdbId:B,tmdbMediaType:D,seasonNumber:e.IndexNumber??null,episodeNumber:e.Type==="Episode"?e.IndexNumber:null,parentSeasonNumber:e.Type==="Episode"?e.ParentIndexNumber:null,sgType:e.Type,sgSeriesId:e.SeriesId||(e.Type==="Series"?e.Id:null),sgPlayed:l(e.UserData).Played===!0}),(I||P!==null||v.ratings)&&f(n,t,v),typeof i.appendUserRatingToContainer=="function"&&i.appendUserRatingToContainer(t,e,r)},renderFromCache(n,t,e){if(n.isTagged(t)||n.shouldIgnore(t)||t.closest(".je-hidden"))return!0;let r=k(n,e);if(p(t,r?.sgType))return n.markTagged(t),!0;if(!r)return!1;if(x({Type:r.sgType,Id:e,SeriesId:r.sgSeriesId,UserData:{Played:r.sgPlayed===!0}}))return n.markTagged(t),b()||typeof i.appendUserRatingToContainer=="function"&&(r.tmdbId||r.seriesTmdbId)&&i.appendUserRatingToContainer(t,{Type:r.sgType,ProviderIds:r.tmdbId?{Tmdb:r.tmdbId}:{},SeriesProviderIds:r.seriesTmdbId?{Tmdb:r.seriesTmdbId}:{}}),!0;if((r.tmdb||r.critic!==null||r.ratings)&&f(n,t,r),typeof i.appendUserRatingToContainer=="function"&&(r.tmdbId||r.seriesTmdbId)){let o={Type:r.tmdbMediaType==="tv"?"Series":"Movie",ProviderIds:r.tmdbId?{Tmdb:r.tmdbId}:{},SeriesProviderIds:r.seriesTmdbId?{Tmdb:r.seriesTmdbId}:{},IndexNumber:r.seasonNumber,ParentIndexNumber:r.parentSeasonNumber};r.seriesTmdbId&&r.episodeNumber!=null?(o.Type="Episode",o.IndexNumber=r.episodeNumber,o.ParentIndexNumber=r.parentSeasonNumber):r.seriesTmdbId&&r.seasonNumber!=null&&(o.Type="Season",o.IndexNumber=r.seasonNumber),i.appendUserRatingToContainer(t,o)}return!0},renderFromServerCache(n,t,e,r){if(n.isTagged(t)||n.shouldIgnore(t))return;if(p(t,e.Type)){n.markTagged(t);return}if((e.Type==="Series"||e.Type==="Season")&&x({Type:e.Type,Id:r,SeriesId:e.SeriesId})){if(n.markTagged(t),b())return}else{let s=e.CommunityRating!=null?parseFloat(String(e.CommunityRating)).toFixed(1):null,c=e.CriticRating!=null?S(e.CriticRating):null;(s||c!==null||e.Ratings)&&f(n,t,{tmdb:s,critic:c,ratings:e.Ratings})}if(typeof i.appendUserRatingToContainer=="function"){let s={Type:e.Type,ProviderIds:e.TmdbId?{Tmdb:e.TmdbId}:{},SeriesProviderIds:e.SeriesTmdbId?{Tmdb:e.SeriesTmdbId}:{},IndexNumber:e.SeasonNumber,ParentIndexNumber:e.SeasonNumber,...e.Type==="Episode"?{ParentIndexNumber:e.SeasonNumber,IndexNumber:e.EpisodeNumber}:{}};(e.TmdbId||e.SeriesTmdbId)&&i.appendUserRatingToContainer(t,s,null)}}}};i.initializeRatingTags=function(){console.log(`${u} Starting...`),i.core.tagRenderer.register("rating",R).injectCss(),console.log(`${u} Initialized successfully.`)},i.reinitializeRatingTags=function(){i.core.tagRenderer.reinitialize("rating",R)},i.core.tagRenderer.registerStyles(R)}U(M());})();
})();
