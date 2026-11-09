(() => {
"use strict";(()=>{function k(){let o=window,a=o.JellyfinEnhanced??(o.JellyfinEnhanced={});return a.core??(a.core={}),a}function R(){let o=window;return o.ApiClient!==void 0&&o.ApiClient!==null}function m(){let o=window;if(!o.ApiClient)throw new Error("Jellyfin ApiClient unavailable");return o.ApiClient}var A=Object.freeze({});function f(o){return typeof o=="object"&&o!==null&&!Array.isArray(o)}function S(o){return f(o)?o:A}function j(o){let a="🪼 Jellyfin Enhanced: Logos Tags:",l="logo-overlay-container",s="je-logo-chip",c="je-logo-img",L=new Set(["provider","network","studio"]),y=/^\/[A-Za-z0-9_-]{1,80}\.(?:png|jpe?g|webp)$/,T=new Set,x=!1;function w(e){let t=String(e||"").trim();if(t.length<=12)return t;let n=t.split(/[\s\-–—/&+]+/).filter(r=>/[\p{L}\p{N}]/u.test(r));return n.length>=2?n.slice(0,4).map(r=>(r.match(/[\p{L}\p{N}]/u)||[""])[0].toUpperCase()).join(""):`${t.slice(0,11)}…`}function b(e){if(typeof e!="string"||!y.test(e))return null;let t=`JellyfinEnhanced/logo/w92${e}`;return R()&&typeof m().getUrl=="function"?m().getUrl(t):`/${t}`}function g(e){if(!Array.isArray(e))return[];let t=[];for(let n of e){let r=S(n),i=String(r.kind??r.Kind??""),v=String(r.name??r.Name??"").trim();if(!L.has(i)||!v)continue;let p=r.logo??r.Logo;if(t.push({kind:i,name:v,logo:typeof p=="string"&&y.test(p)?p:null}),t.length===2)break}return t}function h(e,t){e.textContent=w(t),e.dataset.jeLogoStyle="text",e.classList.add("je-logo-text"),e.removeAttribute("role"),e.removeAttribute("aria-label")}function C(e,t){let n=document.createElement("span");n.className=s,n.dataset.jeLogoKind=e.kind,n.title=e.name;let r=t||b(e.logo);if(!r||T.has(r))return h(n,e.name),n;n.dataset.jeLogoStyle=e.kind==="provider"?"provider":"company";let i=document.createElement("img");return i.className=c,i.alt=e.name,i.decoding="async",i.draggable=!1,i.src=r,n.appendChild(i),n}function P(){x||typeof document.addEventListener!="function"||(x=!0,document.addEventListener("error",e=>{let t=e.target;if(!(t instanceof HTMLImageElement)||!t.classList.contains(c))return;T.add(t.getAttribute("src")||"");let n=t.closest(`.${s}`);n&&h(n,t.alt)},!0))}function d(e,t,n){if(!n.length)return;e.removeExistingOverlay(t);let r=document.createElement("div");r.className=l;for(let i of n)r.appendChild(C(i));e.commitOverlay(t,r)}let u={logPrefix:a,settingKey:"logoTagsEnabled",containerClass:l,taggedAttr:"jeLogoTagged",styleId:"jellyfin-enhanced-logo-tags-css",position:{userKey:"logoTagsPosition",pluginKey:"LogoTagsPosition",fallback:"bottom-left"},cache:{key:"JellyfinEnhanced-logoTagsCache",legacyPrefix:"logoTagsCache",hotBucket:"logos",saveOnUnload:!1},buildCss(){return`
                .${l} {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-start;
                    gap: calc(4px * var(--je-tag-scale, 1) * var(--je-tag-gap, 1));
                    z-index: 10;
                    pointer-events: none;
                    max-width: calc(100% - 12px);
                }

                .${s} {
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

                .${s}[data-je-logo-style="provider"] { padding: calc(2px * var(--je-tag-scale, 1)); }

                .${s}[data-je-logo-style="company"] {
                    background-color: rgba(255, 255, 255, 0.9);
                    color: #111111;
                    border-color: rgba(0, 0, 0, 0.12);
                }

                .${s}[data-je-logo-style="text"] {
                    background-color: rgba(0, 0, 0, 0.75);
                    border-color: rgba(255, 255, 255, 0.25);
                    text-shadow: 0 0 2px rgba(0, 0, 0, 0.6);
                }

                .${c} {
                    display: block;
                    height: 100%;
                    width: auto;
                    max-width: calc(72px * var(--je-tag-scale, 1));
                    object-fit: contain;
                    border-radius: 3px;
                }

                /* Card-width sizing, like the age rating chip */
                @supports (container-type: inline-size) {
                    html:not(.layout-mobile) .je-tag-host .${s} {
                        height: calc(clamp(18px, 13cqw, 28px) * var(--je-tag-scale, 1));
                        font-size: calc(clamp(9px, 6.4cqw, 12px) * var(--je-tag-scale, 1));
                    }
                }

                .layout-mobile .${s} { height: calc(22px * var(--je-tag-scale, 1)); font-size: calc(10px * var(--je-tag-scale, 1)); }
            `},pipeline:{needsFirstEpisode:!1,needsParentSeries:!1,render(e,t,n){if(e.shouldIgnore(t)||e.isTagged(t)||t.closest(".je-hidden"))return;let r=g(n.Logos),i={l:r};e.setPersistent(String(n.Id),i),e.hot?.set(String(n.Id),i),d(e,t,r)},renderFromCache(e,t,n){if(e.isTagged(t)||e.shouldIgnore(t)||t.closest(".je-hidden"))return!0;let r=e.getPersistent(n)??e.hot?.get(n);return!f(r)||!Array.isArray(r.l)?!1:(d(e,t,g(r.l)),!0)},renderFromServerCache(e,t,n){e.isTagged(t)||e.shouldIgnore(t)||d(e,t,g(n?.Logos))}}};o.initializeLogoTags=function(){console.log(`${a} Starting...`),P(),o.core.tagRenderer.register("logos",u).injectCss(),console.log(`${a} Initialized successfully.`)},o.reinitializeLogoTags=function(){o.core.tagRenderer.reinitialize("logos",u)},o.logoTags={buildChip:C,readLogos:g,shortName:w,logoUrl:b},o.core.tagRenderer.registerStyles(u)}j(k());})();
})();
