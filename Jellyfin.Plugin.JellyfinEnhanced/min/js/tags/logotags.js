(() => {
"use strict";(()=>{function d(s){let a=window.JellyfinEnhanced?.core?.sharedModules?.[s];if(!a)throw new Error(`${s} is not in JE.core.sharedModules: load its provider first (client/shared-modules.json)`);return a}function c(s,a){return s[a]}var x=d("features/media-tags/host"),h=c(x,"apiClient"),k=c(x,"hasApiClient");var E=c(x,"tagRuntimeHost");var O=d("features/media-tags/pipeline/dto");var S=c(O,"isRecord");var R=c(O,"record");function F(s){let a="🪼 Jellyfin Enhanced: Logos Tags:",g="logo-overlay-container",i="je-logo-chip",u="je-logo-img",M=new Set(["provider","network","studio"]),b=/^\/[A-Za-z0-9_-]{1,80}\.(?:png|jpe?g|webp)$/,y=new Set,w=!1;function j(e){let t=String(e||"").trim();if(t.length<=12)return t;let o=t.split(/[\s\-–—/&+]+/).filter(n=>/[\p{L}\p{N}]/u.test(n));return o.length>=2?o.slice(0,4).map(n=>(n.match(/[\p{L}\p{N}]/u)||[""])[0].toUpperCase()).join(""):`${t.slice(0,11)}…`}function C(e){if(typeof e!="string"||!b.test(e))return null;let t=`JellyfinEnhanced/logo/w92${e}`;return k()&&typeof h().getUrl=="function"?h().getUrl(t):`/${t}`}function l(e){if(!Array.isArray(e))return[];let t=[];for(let o of e){let n=R(o),r=String(n.kind??n.Kind??""),L=String(n.name??n.Name??"").trim();if(!M.has(r)||!L)continue;let m=n.logo??n.Logo;if(t.push({kind:r,name:L,logo:typeof m=="string"&&b.test(m)?m:null}),t.length===2)break}return t}function T(e,t){e.textContent=j(t),e.dataset.jeLogoStyle="text",e.classList.add("je-logo-text"),e.removeAttribute("role"),e.removeAttribute("aria-label")}function v(e,t){let o=document.createElement("span");o.className=i,o.dataset.jeLogoKind=e.kind,o.title=e.name;let n=t||C(e.logo);if(!n||y.has(n))return T(o,e.name),o;o.dataset.jeLogoStyle=e.kind==="provider"?"provider":"company";let r=document.createElement("img");return r.className=u,r.alt=e.name,r.decoding="async",r.draggable=!1,r.src=n,o.appendChild(r),o}function P(){w||typeof document.addEventListener!="function"||(w=!0,document.addEventListener("error",e=>{let t=e.target;if(!(t instanceof HTMLImageElement)||!t.classList.contains(u))return;y.add(t.getAttribute("src")||"");let o=t.closest(`.${i}`);o&&T(o,t.alt)},!0))}function p(e,t,o){if(!o.length)return;e.removeExistingOverlay(t);let n=document.createElement("div");n.className=g;for(let r of o)n.appendChild(v(r));e.commitOverlay(t,n)}let f={logPrefix:a,settingKey:"logoTagsEnabled",containerClass:g,taggedAttr:"jeLogoTagged",styleId:"jellyfin-enhanced-logo-tags-css",position:{userKey:"logoTagsPosition",pluginKey:"LogoTagsPosition",fallback:"bottom-left"},cache:{key:"JellyfinEnhanced-logoTagsCache",legacyPrefix:"logoTagsCache",hotBucket:"logos",saveOnUnload:!1},buildCss(){return`
                .${g} {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-start;
                    gap: calc(4px * var(--je-tag-scale, 1) * var(--je-tag-gap, 1));
                    z-index: 10;
                    pointer-events: none;
                    max-width: calc(100% - 12px);
                }

                .${i} {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    box-sizing: border-box;
                    height: calc(28px * var(--je-tag-scale, 1));
                    max-width: 100%;
                    padding: calc(3px * var(--je-tag-scale, 1)) calc(6px * var(--je-tag-scale, 1));
                    overflow: hidden;
                    background-color: rgba(0, 0, 0, 0.6);
                    color: #ffffff;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 4px;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
                    font-size: calc(12px * var(--je-tag-scale, 1));
                    font-weight: 700;
                    line-height: 1;
                    letter-spacing: 0.02em;
                    white-space: nowrap;
                    pointer-events: none;
                }

                .${i}[data-je-logo-style="provider"] { padding: calc(2px * var(--je-tag-scale, 1)); }

                .${i}[data-je-logo-style="company"] {
                    background-color: rgba(255, 255, 255, 0.9);
                    color: #111111;
                    border-color: rgba(0, 0, 0, 0.12);
                }

                .${i}[data-je-logo-style="text"] {
                    background-color: rgba(0, 0, 0, 0.75);
                    border-color: rgba(255, 255, 255, 0.25);
                    text-shadow: 0 0 2px rgba(0, 0, 0, 0.6);
                }

                .${u} {
                    display: block;
                    height: 100%;
                    width: auto;
                    max-width: calc(72px * var(--je-tag-scale, 1));
                    object-fit: contain;
                    border-radius: 3px;
                }

                /* Card-width sizing, like the age rating chip */
                @supports (container-type: inline-size) {
                    html:not(.layout-mobile) .je-tag-host .${i} {
                        height: calc(clamp(18px, 13cqw, 28px) * var(--je-tag-scale, 1));
                        font-size: calc(clamp(9px, 6.4cqw, 12px) * var(--je-tag-scale, 1));
                    }
                }

                .layout-mobile .${i} { height: calc(22px * var(--je-tag-scale, 1)); font-size: calc(10px * var(--je-tag-scale, 1)); }
            `},pipeline:{needsFirstEpisode:!1,needsParentSeries:!1,render(e,t,o){if(e.shouldIgnore(t)||e.isTagged(t)||t.closest(".je-hidden"))return;let n=l(o.Logos),r={l:n};e.setPersistent(String(o.Id),r),e.hot?.set(String(o.Id),r),p(e,t,n)},renderFromCache(e,t,o){if(e.isTagged(t)||e.shouldIgnore(t)||t.closest(".je-hidden"))return!0;let n=e.getPersistent(o)??e.hot?.get(o);return!S(n)||!Array.isArray(n.l)?!1:(p(e,t,l(n.l)),!0)},renderFromServerCache(e,t,o){e.isTagged(t)||e.shouldIgnore(t)||p(e,t,l(o?.Logos))}}};s.initializeLogoTags=function(){console.log(`${a} Starting...`),P(),s.core.tagRenderer.register("logos",f).injectCss(),console.log(`${a} Initialized successfully.`)},s.reinitializeLogoTags=function(){s.core.tagRenderer.reinitialize("logos",f)},s.logoTags={buildChip:v,readLogos:l,shortName:j,logoUrl:C},s.core.tagRenderer.registerStyles(f)}F(E());})();
})();
