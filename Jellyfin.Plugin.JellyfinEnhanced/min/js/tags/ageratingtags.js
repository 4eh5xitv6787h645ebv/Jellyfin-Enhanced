(() => {
"use strict";(()=>{function C(r,i,g){let l=i.core?.featureContext;if(typeof l!="function")throw new Error(`${r}: JE.core.featureContext is missing; core/ui-kit.js must load before feature scripts`);return l(r,i,g)}function O(){let r=window,i=r.JellyfinEnhanced??(r.JellyfinEnhanced={});return i.core??(i.core={}),i}function b(r=O()){return C("media-tags",r,{internalSlots:["peopleTags"],internalsObject:()=>r.internals=r.internals||{}})}var F=Object.freeze({});function h(r){return typeof r=="object"&&r!==null&&!Array.isArray(r)}function p(r){return typeof r=="string"&&r?r:null}function R(r){let i=r.core,g="🪼 Jellyfin Enhanced: Age Rating Tags:",l="age-rating-overlay-container",s="age-rating-tag",x="jellyfin-enhanced-age-rating-colours-css",c=null;function f(e){if(e==null)return null;let t=String(e).replace(/\s+/g," ").trim();if(!t)return null;let n=i.normalizeOfficialRating;return p(typeof n=="function"?n(t):t)}function v(e){let t=e.replace(/\/\*[\s\S]*?\*\//g,""),n=[],o=/([^{}]+)\{([^{}]*)\}/g,a;for(;(a=o.exec(t))!==null;){let[,d="",j=""]=a,w=d.split(",").map(u=>u.trim()).filter(u=>u.startsWith(".mediaInfoOfficialRating[rating=")).map(u=>u.replace(".mediaInfoOfficialRating",`.${s}`));if(w.length===0)continue;let A=j.replace(/\s*!important/g,"").trim();n.push(`${w.join(`,
`)} { ${A} }`)}return n.join(`
`)}function T(){return c||(document.getElementById(x)?c=Promise.resolve():(c=(async()=>{try{let e=await fetch(i.cdn.url("je-css","ratings.css"));if(!e.ok)throw new Error(`HTTP ${e.status}`);let t=v(await e.text());if(!t)throw new Error("no [rating=] rules found");i.core.ui.injectCss(x,t)}catch(e){console.warn(`${g} Could not load rating colours, badges will use the default colour.`,e),c=null}})(),c))}function k(e){if(!e)return!1;try{let t=i.pluginConfig;if(!t||t.SpoilerBlurEnabled!==!0||t.SpoilerStripRatings===!1)return!1;let n=r.peer("spoilerBlur");return!n||typeof n.isEnabledFor!="function"||(typeof n.getUserPrefs=="function"&&n.getUserPrefs()||{}).HideRatings===!1?!1:typeof n.isLoadOk=="function"&&n.isLoadOk()!==!0?!0:n.isEnabledFor(e)===!0}catch{return!0}}function S(e,t){let n=e.getPersistent(t)??e.hot?.get(t);return h(n)?{rating:p(n.rating),seriesId:p(n.s)}:null}function P(e,t,n,o){let a=o?{rating:n,s:o}:{rating:n};e.setPersistent(t,a),e.hot?.set(t,a)}function m(e,t,n){if(!n)return;e.removeExistingOverlay(t);let o=document.createElement("div");o.className=l;let a=document.createElement("div");a.className=s,a.setAttribute("rating",n),a.textContent=n,o.appendChild(a),e.commitOverlay(t,o)}let y={logPrefix:g,settingKey:"ageRatingTagsEnabled",containerClass:l,taggedAttr:"jeAgeRatingTagged",styleId:"jellyfin-enhanced-age-rating-tags-css",position:{userKey:"ageRatingTagsPosition",pluginKey:"AgeRatingTagsPosition",fallback:"bottom-right"},cache:{key:"JellyfinEnhanced-ageRatingTagsCache",legacyPrefix:"ageRatingTagsCache",hotBucket:"ageRating",saveOnUnload:!1},buildCss(){return`
                .${l} {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-end;
                    z-index: 10;
                    pointer-events: none;
                    max-width: calc(100% - 12px);
                }

                .${s} {
                    display: inline-flex;
                    align-items: center;
                    padding: calc(4px * var(--je-tag-scale, 1)) calc(8px * var(--je-tag-scale, 1));
                    /* Neutral fallback, same as the Colored Ratings default, until a
                       [rating=...] rule matches (or if the colour sheet fails to load). */
                    background-color: #607D8B;
                    color: #ffffff;
                    border: 1px solid rgba(255, 255, 255, 0.25);
                    border-radius: 4px;
                    font-size: calc(13px * var(--je-tag-scale, 1));
                    font-weight: 700;
                    line-height: 1;
                    letter-spacing: 0.02em;
                    text-transform: uppercase;
                    text-shadow: 0 0 2px rgba(0, 0, 0, 0.6);
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
                    white-space: nowrap;
                    pointer-events: none;
                }

                /* Card-width sizing, matching the rating tag rules in tag-pipeline.js */
                @supports (container-type: inline-size) {
                    html:not(.layout-mobile) .je-tag-host .${s} {
                        font-size: calc(clamp(9px, 6.8cqw, 13px) * var(--je-tag-scale, 1));
                        padding: calc(clamp(2px, 2cqw, 4px) * var(--je-tag-scale, 1)) calc(clamp(4px, 4.5cqw, 8px) * var(--je-tag-scale, 1));
                    }
                }

                .layout-mobile .${s} {
                    padding: calc(2px * var(--je-tag-scale, 1)) calc(6px * var(--je-tag-scale, 1));
                    font-size: calc(11px * var(--je-tag-scale, 1));
                    border-radius: 3px;
                }

                @media (max-width: 768px) {
                    .${s} { padding: calc(3px * var(--je-tag-scale, 1)) calc(6px * var(--je-tag-scale, 1)); font-size: calc(12px * var(--je-tag-scale, 1)); }
                }

                @media (max-width: 480px) {
                    .${s} { padding: calc(2px * var(--je-tag-scale, 1)) calc(4px * var(--je-tag-scale, 1)); font-size: calc(clamp(10px, 2vw, 11px) * var(--je-tag-scale, 1)); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4); }
                }
            `},pipeline:{needsFirstEpisode:!1,needsParentSeries:!1,render(e,t,n,o){if(e.shouldIgnore(t)||e.isTagged(t)||t.closest(".je-hidden"))return;let a=f(n.OfficialRating)??f(o?.parentSeries?.OfficialRating),d=n.Type==="Episode"||n.Type==="Season";(!d||n.SeriesId)&&P(e,String(n.Id),a,d?String(n.SeriesId):null),m(e,t,a)},renderFromCache(e,t,n){if(e.isTagged(t)||e.shouldIgnore(t)||t.closest(".je-hidden"))return!0;let o=S(e,n);return!o||k(o.seriesId)?!1:(m(e,t,o.rating),!0)},renderFromServerCache(e,t,n){e.isTagged(t)||e.shouldIgnore(t)||m(e,t,f(n.OfficialRating))}}};i.initializeAgeRatingTags=function(){console.log(`${g} Starting...`),i.core.tagRenderer.register("agerating",y).injectCss(),T(),console.log(`${g} Initialized successfully.`)},i.reinitializeAgeRatingTags=function(){i.core.tagRenderer.reinitialize("agerating",y),T()},i.core.tagRenderer.registerStyles(y)}R(b());})();
})();
