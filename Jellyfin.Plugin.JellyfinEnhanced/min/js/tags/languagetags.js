(() => {
"use strict";(()=>{function A(l){let x=window.JellyfinEnhanced?.core?.sharedModules?.[l];if(!x)throw new Error(`${l} is not in JE.core.sharedModules: load its provider first (client/shared-modules.json)`);return x}function C(l,x){return l[x]}var X=A("features/media-tags/host");var E=C(X,"tagRuntimeHost");var v=A("features/media-tags/pipeline/dto");var P=C(v,"isRecord"),_=C(v,"memberRecord"),G=C(v,"memberText"),b=C(v,"members");var N=C(v,"record");function Z(l){return l.tagName==="IMG"}function q(l){let x="🪼 Jellyfin Enhanced: Language Tags:",y="language-overlay-container",w="language-flag",S="language-flag-partial",V=new Intl.DisplayNames(["en"],{type:"language"}),I=new Map;function j(e){let a=I.get(e);if(a===void 0){try{a=V.of(e)||e.toUpperCase()}catch{a=e.toUpperCase()}I.set(e,a)}return a}function B(e,a="Audio"){if(!e)return[];let s=new Set,t=function(n){b(n).map(_).filter(function(o){return o.Type===a&&!(a==="Audio"?l.core.mediaLanguage.isSecondaryAudio(o):o.IsForced===!0)}).forEach(function(o){let i=o.Language;typeof i=="string"&&i&&!l.core.mediaLanguage.isLanguageless(i)&&s.add(JSON.stringify({name:j(i),code:i,sdh:a==="Subtitle"&&(o.IsHearingImpaired===!0||/\b(SDH|CC)\b/i.test(`${String(o.Title||"")} ${String(o.DisplayTitle||"")}`))}))})};return b(e.MediaSources).forEach(function(n){t(_(n).MediaStreams)}),t(e.MediaStreams),D(Array.from(s,n=>JSON.parse(n)))}function Y(e,a){let s=B(e,"Subtitle"),t=e.SubtitleLanguages||a.SubtitleLanguages;if(!t)return s;let n=b(e.SdhSubtitleLanguages||a.SdhSubtitleLanguages||s.filter(o=>o.sdh).map(o=>o.code));return b(t).map(o=>({code:o,sdh:n.some(i=>l.core.mediaLanguage.matchesLanguage(o,i,{requireRegion:!0}))}))}function D(e){if(!Array.isArray(e))return[];let a=[],s=new Set;for(let t of e){let n=null;if(!t)continue;if(typeof t=="string"){let i=t.toLowerCase();n={name:j(i),code:i}}else if(P(t)){let i=String(t.code||t.Code||""),c=String(t.name||t.Name||"")||null;i&&(n={name:c||j(i),code:i},t.partial&&(n.partial=!0),t.sdh&&(n.sdh=!0))}if(!n)continue;let o=`${n.code.toLowerCase()}|${(n.name||"").toLowerCase()}`;if(!s.has(o))s.add(o),a.push(n);else if(n.sdh){let i=a.find(c=>`${c.code.toLowerCase()}|${(c.name||"").toLowerCase()}`===o);i&&(i.sdh=!0)}}return a}function H(e){let a=e.code&&l.core.mediaLanguage?.localName?.(e.code)||e.name;return e.partial?`${a} (${l.t("language_tags_partial_tooltip")})`:a}function Q(e){let a=l.core.mediaLanguage.priorityPolicy(),s=a.terms;if(!s.length)return e;let t=l.core.mediaLanguage.matchesLanguage,n=o=>{let i=(o.code||"").toLowerCase(),c=a.personal?o.allCodes.map(g=>T(g)):[i,i.split("-")[0],...o.allLanguages.map(g=>g.toLowerCase())],d=a.personal?[]:o.allCodes,p=-1;for(let g=0;g<s.length&&!(p!==-1&&g>=p);g++){let m=s[g];(c.includes(m)||d.some(O=>t(O,m)))&&(p=g)}return p};return e.map((o,i)=>({flag:o,i,rank:n(o)})).filter(o=>!a.strict||o.rank!==-1).sort((o,i)=>{let c=o.rank===-1?s.length:o.rank,d=i.rank===-1?s.length:i.rank;return c-d||o.i-i.i}).map(o=>o.flag)}function z(){let e=(t,n)=>l.currentSettings?.[t]??l.pluginConfig?.[t.charAt(0).toUpperCase()+t.slice(1)]??n,a=String(e("languageTagsStyle","flags")).trim().toLowerCase(),s=String(e("languageTagsCountBadge","off")).trim().toLowerCase();return{audio:e("languageTagsShowAudio",!0)!==!1,subtitles:e("languageTagsShowSubtitles",!1)===!0,style:a==="codes"?"codes":"flags",badge:["only","both"].includes(s)?s:"off"}}function T(e){return l.core.mediaLanguage.canonicalBase(l.core.mediaLanguage.parseLanguageTag(e)?.base??"")}function W(e){let a=l.core.mediaLanguage.resolveFlag(e);if(a!=null)return a;let s=[e.name,e.code].find(t=>t in Object.prototype);return s===void 0?a:{unrenderable:s}}function $(e,a){let s=new Map;for(let t of D(e)){let n=W(t),o=l.core.mediaLanguage.displayCode(t.code),i=l.core.mediaLanguage.parseLanguageTag(t.code),c=a==="codes"||n==null,d=c?"code:"+l.core.mediaLanguage.canonicalBase(i?.base??"")+(l.pluginConfig?.LanguageTagsMergeRegions?"":":"+(i?.region||i?.script||"")):typeof n=="object"&&n?`unrenderable:${n.unrenderable}`:n;if(!d||c&&!o)continue;let p=t.name||t.code.toUpperCase(),g=s.get(d);if(!g)s.set(d,{countryCode:n,asCode:c,code:t.code,text:o,partial:!!t.partial,sdh:!!t.sdh,allCodes:[t.code],allLanguages:[p],labels:[H({name:p,code:t.code,partial:t.partial})]});else{g.partial=g.partial&&!!t.partial,g.sdh||(g.sdh=!!t.sdh),g.allCodes.includes(t.code)||g.allCodes.push(t.code),g.allLanguages.includes(p)||g.allLanguages.push(p);let m=H({name:p,code:t.code,partial:t.partial});g.labels.includes(m)||g.labels.push(m)}}return Q(Array.from(s.values()).sort((t,n)=>Number(t.partial)-Number(n.partial)))}function U(e,a=3,s=l.core.mediaLanguage.flagSrc){let t=Array.isArray(e)?{audio:e}:N(e),n=z(),o=l.core.tagHidden,i=r=>{let h=typeof r=="string"?r:P(r)?r.code??r.Code:null;return h&&T(String(h))||null},c=r=>Array.isArray(r)&&o?.any("language")?r.filter(h=>!o.hides("language",i(h))):r,d=n.audio?$(c(t.audio),n.style):[],p=n.subtitles?$(c(t.subtitles),n.style):[],g=n.audio&&n.badge!=="off"?$(t.audio,"codes").filter(r=>T(r.code)!=="zxx"):[],m=new Set(g.map(r=>T(r.code))).size,O=n.badge!=="off"&&m>=2,L=[];O&&L.push({badge:m===2?"dual":"multi"}),(!O||n.badge!=="only")&&L.push(...d),L.push(...p.map(r=>({...r,subtitle:!0})));let R=document.createElement("div");if(R.className=y,(a>0?L.slice(0,a):L).some(r=>!r.badge&&!r.asCode&&typeof r.countryCode!="string"))return R;for(let r of L){if(!r.badge&&!r.asCode&&typeof r.countryCode!="string")continue;let h=!r.badge&&r.asCode,u=document.createElement(r.badge||r.subtitle||h?"span":"img");if(u.className=r.badge?"language-count-badge language-chip":h?"language-code language-chip":r.subtitle?"language-subtitle language-chip":w,r.partial&&(u.classList.add(S),u.dataset.partial="true"),u.dataset.jeLanguage=r.badge?"countBadge":r.subtitle?"subtitles":"flag",u.tagName!=="IMG"&&(u.dataset.jeLanguageLabel=r.badge||r.text.toLowerCase()),r.badge)u.textContent=l.t(l.core.tagLayout?.VOCABULARY_KEYS.language[`${r.badge}`]??""),u.title=`${l.t("language_tags_count_tooltip",{count:m})}: ${g.flatMap(F=>F.labels).join(", ")}`;else{let F=r.labels.join(", ");u.title=`${l.t(r.subtitle?r.sdh?"language_tags_subtitles_sdh":"jellyseerr_report_issue_type_subtitles":"jellyseerr_report_issue_type_audio")}: ${F}`,u.dataset.langName=r.allLanguages.join(", ");let K=typeof r.countryCode=="string"?r.countryCode:"";if(u.dataset.lang=h?r.text.toLowerCase():K.toLowerCase(),r.subtitle){let f=document.createElement("span");f.className="language-cc",f.textContent=r.sdh?"SDH":"CC",r.sdh&&(u.dataset.jeSdh="true"),f.setAttribute("aria-hidden","true"),u.appendChild(f)}if(h)u.appendChild(document.createTextNode(r.text));else{let f=Z(u)?u:document.createElement("img");f.src=s(K),f.className=r.subtitle?w:u.className,f.alt=u.title,f.loading="lazy",f.onerror=()=>u.remove(),r.subtitle&&u.appendChild(f)}}u.tagName!=="IMG"&&u.setAttribute("role","img"),u.setAttribute("aria-label",u.title),R.appendChild(u)}return R}function k(e,a,s){if(!a||e.isTagged(a))return;e.removeExistingOverlay(a),a.style.position!=="relative"&&(a.style.position="relative");let t=l.core.tagLayout?l.core.tagLayout.resolveLayout(a).caps.language:3;e.commitOverlay(a,U(s,t))}l.core.languageTags={readSettings:z,buildGroup:U};let M={logPrefix:x,settingKey:"languageTagsEnabled",containerClass:y,taggedAttr:"jeLanguageTagged",styleId:"language-tags-styles",position:{userKey:"languageTagsPosition",pluginKey:"LanguageTagsPosition",fallback:"bottom-left"},cache:{key:"JellyfinEnhanced-languageTagsCache-v4",legacyPrefix:["JellyfinEnhanced-languageTagsCache-v3","JellyfinEnhanced-languageTagsCache-v2","JellyfinEnhanced-languageTagsCache","languageTagsCache"],hotBucket:"language"},buildCss(){return l.core.tagRenderer.chipBaseCss(".language-chip")+l.core.tagRenderer.chipBaseCss('.language-code:not([data-je-language="subtitles"])',!0)+`
                .${y} {
                    display: flex;
                    flex-direction: column;
                    gap: calc(3px * var(--je-tag-scale, 1) * var(--je-tag-gap, 1));
                    z-index: 101;
                    pointer-events: none;
                    max-height: 90%;
                    overflow: hidden;
                }
                .${w} {
                    width: calc(clamp(24px, 6vw, 32px) * var(--je-tag-scale, 1));
                    height: auto;
                    border-radius: 2px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.4);
                    flex-shrink: 0;
                    object-fit: cover;
                }
                /* The host is otherwise below Jellyfin's full-card image link.
                   Its empty space remains pointer-transparent; only language
                   chips receive hover through native anchors supplied by the layout. */
                .je-tag-host:has(.${y}) { z-index: 2; }
                .${y} > * { pointer-events: auto; }
                .language-link { display: inline-flex; color: inherit; text-decoration: none; }
                .je-tag-pill[href] { pointer-events: auto; text-decoration: none; }
                .language-chip {
                    display: inline-flex; align-items: center; gap: calc(3px * var(--je-tag-scale, 1));
                    align-self: flex-start; flex-shrink: 0; width: max-content;
                    background: rgba(15,15,15,0.72); color: #fff;
                    font-family: inherit;
                }
                .language-cc { font-size: inherit; }
                .language-subtitle .language-flag { box-shadow: none; }
                /* Dub that doesn't cover every episode: dimmed, washed out and
                   dash-outlined so it reads as "incomplete" next to a full flag.
                   The dark ring keeps the white dashes (and a white flag's edge)
                   visible on light posters. */
                .${S} { opacity: 0.55; }
                img.${S} {
                    opacity: 0.55;
                    filter: saturate(0.5);
                    outline: 1px dashed rgba(255, 255, 255, 0.95);
                    outline-offset: -1px;
                    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6);
                }
                /* A dimmed flag or chip paints late (its opacity makes it a layer).
                   The chips beside one stay positioned so they still paint after
                   it, its dark ring under their edge, as when every chip had a
                   transform; without one in the group no chip needs a layer. */
                .${y}:has(.${S}) .language-chip { position: relative; }
                .layout-mobile .${w} {
                    width: calc(clamp(20px, 5vw, 26px) * var(--je-tag-scale, 1));
                }
                .layout-mobile .${y} { gap: calc(2px * var(--je-tag-scale, 1) * var(--je-tag-gap, 1)); }
                @media (max-width: 768px) {
                    .${w} {
                        width: calc(clamp(20px, 5vw, 26px) * var(--je-tag-scale, 1));
                        gap: calc(2px * var(--je-tag-scale, 1) * var(--je-tag-gap, 1));
                    }
                }
                @media (max-width: 480px) {
                    .${w} {
                        width: calc(clamp(16px, 4vw, 20px) * var(--je-tag-scale, 1));
                    }
                    .${y} {
                        gap: calc(2px * var(--je-tag-scale, 1) * var(--je-tag-gap, 1));
                    }
                }
            `},pipeline:{needsFirstEpisode:!0,needsParentSeries:!1,render(e,a,s,t){if(e.shouldIgnore(a)||e.isTagged(a)||a.closest(".je-hidden"))return;let n=String(s.Id),o=N(e.hot?.get(n));if(typeof o.timestamp=="number"&&Date.now()-o.timestamp<e.cacheTtl){o.value&&k(e,a,o.value);return}let i=s;if(s.Type==="Series"||s.Type==="Season")if(t.firstEpisode)i=t.firstEpisode;else return;let c={audio:B(i),subtitles:Y(i,s)};e.setPersistent(n,c),e.hot?.set(n,{value:c,timestamp:Date.now()}),k(e,a,c)},renderFromCache(e,a,s){if(e.isTagged(a)||e.shouldIgnore(a)||a.closest(".je-hidden"))return!0;let n=e.hot?.get(s)||e.getPersistent(s);if(n){let o=N(n),i=Array.isArray(n)?n:o.value||o.languages||n;if(i&&!Array.isArray(i))return k(e,a,i),!0}return!1},renderFromServerCache(e,a,s){if(e.isTagged(a)||e.shouldIgnore(a))return;let t=b(s.AudioLanguages),n=new Set(b(s.PartialAudioLanguages)),o=t.map(function(c){let d=G(c);return{name:j(d),code:d,partial:n.has(d)}}),i=b(s.SdhSubtitleLanguages);k(e,a,{audio:o,subtitles:b(s.SubtitleLanguages).map(c=>({code:c,sdh:i.some(d=>l.core.mediaLanguage.matchesLanguage(c,d,{requireRegion:!0}))}))})}}};l.initializeLanguageTags=function(){l.core.tagRenderer.register("language",M)},l.reinitializeLanguageTags=function(){l.core.tagRenderer.reinitialize("language",M)},l.core.tagRenderer.registerStyles(M)}q(E());})();
})();
