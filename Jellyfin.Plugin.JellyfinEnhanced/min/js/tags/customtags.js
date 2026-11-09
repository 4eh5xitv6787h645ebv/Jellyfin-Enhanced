(() => {
"use strict";(()=>{function b(){let r=window,s=r.JellyfinEnhanced??(r.JellyfinEnhanced={});return s.core??(s.core={}),s}var M=Object.freeze({});function w(r){return typeof r=="object"&&r!==null&&!Array.isArray(r)}function R(r){let s="🪼 Jellyfin Enhanced: Custom Tags:",m="custom-overlay-container",o="custom-tag",T=["theaters","sports_martial_arts","explore","animation","mood","local_police","article","theater_comedy","family_restroom","auto_awesome","history_edu","skull","music_note","psychology_alt","favorite","science","tv","psychology","military_tech","landscape","domino_mask","music_video","menu_book","sports_soccer","quiz","live_tv"];function u(e,t){if(!w(e))return;if(e[t]!==void 0&&e[t]!==null)return e[t];let n=t.charAt(0).toUpperCase()+t.slice(1);return e[n]??void 0}let l=null;function f(){let e=r.pluginConfig?.CustomTagRules,t=r.pluginConfig?.CustomTagRuleSources;if(l&&l.source===e&&l.sources===t)return l;let n=new Map;for(let a of Array.isArray(t)?t:[]){let c=String(u(a,"id")||""),d=String(u(a,"match")||"").toLowerCase(),p=String(u(a,"value")||"").trim();c&&(d==="tag"||d==="collection")&&p&&n.set(c,{match:d,value:p})}let i=new Map;for(let a of Array.isArray(e)?e:[]){let c=String(u(a,"id")||""),d=String(u(a,"label")||"").trim();if(!c||!d||i.has(c))continue;let p=String(u(a,"icon")||"").toLowerCase(),v=n.get(c);i.set(c,{id:c,label:d,icon:T.includes(p)?p:null,match:v?.match??null,value:v?.value??null})}let g=[...i.keys()].sort().join(`
`);return l={source:e,sources:t,rules:i,key:g},l}function C(e){if(!Array.isArray(e)||e.length===0)return[];let t=new Set(e.map(String)),n=[];for(let[i,g]of f().rules)t.has(i)&&n.push(g);return n}function k(e){if(!e.match||!e.value)return e.label;let t=r.t(e.match==="collection"?"custom_tags_source_collection":"custom_tags_source_tag",{name:e.value});return`${e.label}
${t}`}function h(e){let t=document.createElement("div");if(t.className=e.icon?`${o} ${o}--icon`:o,t.dataset.jeCustom=e.label,t.dataset.jeCustomRule=e.id,t.title=k(e),e.icon){let i=document.createElement("span");i.className=`${o}-icon`,i.setAttribute("aria-hidden","true"),i.textContent=e.icon,t.appendChild(i)}let n=document.createElement("span");return n.className=`${o}-text`,n.textContent=e.label,t.appendChild(n),t}function y(e,t,n){let i=C(n);if(i.length===0)return;e.removeExistingOverlay(t);let g=document.createElement("div");g.className=m;for(let a of i)g.appendChild(h(a));e.commitOverlay(t,g)}function S(e,t){let n=e.hot?.get(t)??e.getPersistent(t);return w(n)&&n.r===f().key&&Array.isArray(n.ids)?n.ids.map(String):(n!==void 0&&e.deletePersistent(t),null)}function j(e,t,n){e.setPersistent(t,{ids:Array.isArray(n)?n.map(String):[],r:f().key,timestamp:Date.now()})}let x={logPrefix:s,settingKey:"customTagsEnabled",containerClass:m,taggedAttr:"jeCustomTagged",styleId:"jellyfin-enhanced-custom-tags-css",position:{userKey:"customTagsPosition",pluginKey:"CustomTagsPosition",fallback:"top-left"},cache:{key:"JellyfinEnhanced-customTagsCache",legacyPrefix:"customTagsCache",hotBucket:"custom",pruneOnSave:!0,saveOnUnload:!1},buildCss(){return`
                .${m} {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-start;
                    gap: calc(3px * var(--je-tag-scale, 1) * var(--je-tag-gap, 1));
                    z-index: 10;
                    pointer-events: none;
                    max-width: calc(100% - 12px);
                }
                .je-tag-slot > .${m} { max-width: 100%; }

                .${o} {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.3em;
                    box-sizing: border-box;
                    padding: calc(4px * var(--je-tag-scale, 1)) calc(8px * var(--je-tag-scale, 1));
                    background-color: rgba(38, 50, 56, 0.88);
                    color: #ffffff;
                    border: 1px solid rgba(255, 255, 255, 0.22);
                    border-radius: 4px;
                    font-size: calc(13px * var(--je-tag-scale, 1));
                    font-weight: 600;
                    line-height: 1.15;
                    letter-spacing: 0.01em;
                    text-transform: none;
                    text-shadow: 0 0 2px rgba(0, 0, 0, 0.6);
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    max-width: 100%;
                    pointer-events: none;
                }
                .${o}-text { overflow: hidden; text-overflow: ellipsis; }
                .${o}-icon {
                    font-family: 'JE Material Symbols Outlined';
                    font-weight: normal;
                    font-style: normal;
                    font-size: 1.2em;
                    line-height: 1;
                    letter-spacing: normal;
                    text-transform: none;
                    flex-shrink: 0;
                    white-space: nowrap;
                    word-wrap: normal;
                    direction: ltr;
                    -webkit-font-feature-settings: 'liga';
                    -webkit-font-smoothing: antialiased;
                }

                /* Card-width sizing, matching the age rating and status chips. */
                @supports (container-type: inline-size) {
                    html:not(.layout-mobile) .je-tag-host .${o} {
                        font-size: calc(clamp(9px, 6.8cqw, 13px) * var(--je-tag-scale, 1));
                        padding: calc(clamp(2px, 2cqw, 4px) * var(--je-tag-scale, 1)) calc(clamp(4px, 4.5cqw, 8px) * var(--je-tag-scale, 1));
                    }
                }
                .layout-mobile .${o} { padding: calc(2px * var(--je-tag-scale, 1)) calc(6px * var(--je-tag-scale, 1)); font-size: calc(11px * var(--je-tag-scale, 1)); border-radius: 3px; }
                @media (max-width: 768px) {
                    .${o} { padding: calc(3px * var(--je-tag-scale, 1)) calc(6px * var(--je-tag-scale, 1)); font-size: calc(12px * var(--je-tag-scale, 1)); }
                }
                @media (max-width: 480px) {
                    .${o} { padding: calc(2px * var(--je-tag-scale, 1)) calc(4px * var(--je-tag-scale, 1)); font-size: calc(clamp(10px, 2vw, 11px) * var(--je-tag-scale, 1)); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4); }
                }

                /* Caption strip and the minimal corner: the other chips' smaller size. */
                .je-tag-caption .${o} {
                    font-size: calc(clamp(9px, 6.4cqw, 11.5px) * var(--je-tag-scale, 1));
                    padding: calc(2px * var(--je-tag-scale, 1)) calc(5px * var(--je-tag-scale, 1));
                    border-radius: 3px;
                    box-shadow: none;
                }
                html .je-tag-host > .je-tag-slot[data-je-slot="corner"] .${o} { font-size: calc(11px * var(--je-tag-scale, 1)); padding: calc(2px * var(--je-tag-scale, 1)) calc(5px * var(--je-tag-scale, 1)); }
            `},pipeline:{needsFirstEpisode:!1,needsParentSeries:!1,render(e,t,n){e.shouldIgnore(t)||e.isTagged(t)||t.closest(".je-hidden")||(j(e,String(n.Id),n.CustomTags),y(e,t,n.CustomTags))},renderFromCache(e,t,n){if(e.isTagged(t)||e.shouldIgnore(t)||t.closest(".je-hidden"))return!0;let i=S(e,n);return i?(y(e,t,i),!0):!1},renderFromServerCache(e,t,n){e.isTagged(t)||e.shouldIgnore(t)||y(e,t,n.CustomTags)},onServerCacheRefresh(e,t){if(!t){e.clearPersistent(),e.hot?.clear();return}for(let n of t)e.deletePersistent(String(n)),e.hot?.delete(String(n))}}};r.initializeCustomTags=function(){console.log(`${s} Starting...`),r.core.tagRenderer.register("custom",x).injectCss(),console.log(`${s} Initialized successfully.`)},r.reinitializeCustomTags=function(){l=null,r.core.tagRenderer.reinitialize("custom",x)},r.customTags={ICONS:T,rulesFor:C,currentRules:f,buildChip:h},r.core.tagRenderer.registerStyles(x)}R(b());})();
})();
