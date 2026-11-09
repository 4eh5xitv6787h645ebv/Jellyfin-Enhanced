(() => {
"use strict";(()=>{function $(){let n=window,h=n.JellyfinEnhanced??(n.JellyfinEnhanced={});return h.core??(h.core={}),h}var q=Object.freeze({});function j(n){return typeof n=="object"&&n!==null&&!Array.isArray(n)}function w(n){return j(n)?n:q}function y(n){if(!n)return[];if(!Array.isArray(n))throw new TypeError("Expected a list");return n}function P(n){if(n==null)throw new TypeError("Read a missing list member");return w(n)}function U(n){if(typeof n!="string")throw new TypeError("Read a list member that is not text");return n}function V(n){return n.tagName==="IMG"}function H(n){let h="🪼 Jellyfin Enhanced: Language Tags:",b="language-overlay-container",C="language-flag",v="language-flag-partial",_=new Intl.DisplayNames(["en"],{type:"language"}),O=new Map;function T(e){let t=O.get(e);if(t===void 0){try{t=_.of(e)||e.toUpperCase()}catch{t=e.toUpperCase()}O.set(e,t)}return t}function I(e,t="Audio"){if(!e)return[];let o=new Set,a=function(r){y(r).map(P).filter(function(i){return i.Type===t&&!(t==="Audio"?n.core.mediaLanguage.isSecondaryAudio(i):i.IsForced===!0)}).forEach(function(i){let s=i.Language;typeof s=="string"&&s&&!n.core.mediaLanguage.isLanguageless(s)&&o.add(JSON.stringify({name:T(s),code:s,sdh:t==="Subtitle"&&(i.IsHearingImpaired===!0||/\b(SDH|CC)\b/i.test(`${String(i.Title||"")} ${String(i.DisplayTitle||"")}`))}))})};return y(e.MediaSources).forEach(function(r){a(P(r).MediaStreams)}),a(e.MediaStreams),M(Array.from(o,r=>JSON.parse(r)))}function E(e,t){let o=I(e,"Subtitle"),a=e.SubtitleLanguages||t.SubtitleLanguages;if(!a)return o;let r=y(e.SdhSubtitleLanguages||t.SdhSubtitleLanguages||o.filter(i=>i.sdh).map(i=>i.code));return y(a).map(i=>({code:i,sdh:r.some(s=>n.core.mediaLanguage.matchesLanguage(i,s,{requireRegion:!0}))}))}function M(e){if(!Array.isArray(e))return[];let t=[],o=new Set;for(let a of e){let r=null;if(!a)continue;if(typeof a=="string"){let s=a.toLowerCase();r={name:T(s),code:s}}else if(j(a)){let s=String(a.code||a.Code||""),d=String(a.name||a.Name||"")||null;s&&(r={name:d||T(s),code:s},a.partial&&(r.partial=!0),a.sdh&&(r.sdh=!0))}if(!r)continue;let i=`${r.code.toLowerCase()}|${(r.name||"").toLowerCase()}`;if(!o.has(i))o.add(i),t.push(r);else if(r.sdh){let s=t.find(d=>`${d.code.toLowerCase()}|${(d.name||"").toLowerCase()}`===i);s&&(s.sdh=!0)}}return t}function N(e){let t=e.code&&n.core.mediaLanguage?.localName?.(e.code)||e.name;return e.partial?`${t} (${n.t("language_tags_partial_tooltip")})`:t}function G(e){let t=n.core.mediaLanguage.priorityPolicy(),o=t.terms;if(!o.length)return e;let a=n.core.mediaLanguage.matchesLanguage,r=i=>{let s=(i.code||"").toLowerCase(),d=t.personal?i.allCodes.map(l=>k(l)):[s,s.split("-")[0],...i.allLanguages.map(l=>l.toLowerCase())],c=t.personal?[]:i.allCodes,p=-1;for(let l=0;l<o.length&&!(p!==-1&&l>=p);l++){let f=o[l];(d.includes(f)||c.some(B=>a(B,f)))&&(p=l)}return p};return e.map((i,s)=>({flag:i,i:s,rank:r(i)})).filter(i=>!t.strict||i.rank!==-1).sort((i,s)=>{let d=i.rank===-1?o.length:i.rank,c=s.rank===-1?o.length:s.rank;return d-c||i.i-s.i}).map(i=>i.flag)}function F(){let e=(a,r)=>n.currentSettings?.[a]??n.pluginConfig?.[a.charAt(0).toUpperCase()+a.slice(1)]??r,t=String(e("languageTagsStyle","flags")).trim().toLowerCase(),o=String(e("languageTagsCountBadge","off")).trim().toLowerCase();return{audio:e("languageTagsShowAudio",!0)!==!1,subtitles:e("languageTagsShowSubtitles",!1)===!0,style:t==="codes"?"codes":"flags",badge:["only","both"].includes(o)?o:"off"}}function k(e){return n.core.mediaLanguage.canonicalBase(n.core.mediaLanguage.parseLanguageTag(e)?.base??"")}function K(e){let t=n.core.mediaLanguage.resolveFlag(e);if(t!=null)return t;let o=[e.name,e.code].find(a=>a in Object.prototype);return o===void 0?t:{unrenderable:o}}function S(e,t){let o=new Map;for(let a of M(e)){let r=K(a),i=n.core.mediaLanguage.displayCode(a.code),s=n.core.mediaLanguage.parseLanguageTag(a.code),d=t==="codes"||r==null,c=d?"code:"+n.core.mediaLanguage.canonicalBase(s?.base??"")+(n.pluginConfig?.LanguageTagsMergeRegions?"":":"+(s?.region||s?.script||"")):typeof r=="object"&&r?`unrenderable:${r.unrenderable}`:r;if(!c||d&&!i)continue;let p=a.name||a.code.toUpperCase(),l=o.get(c);if(!l)o.set(c,{countryCode:r,asCode:d,code:a.code,text:i,partial:!!a.partial,sdh:!!a.sdh,allCodes:[a.code],allLanguages:[p],labels:[N({name:p,code:a.code,partial:a.partial})]});else{l.partial=l.partial&&!!a.partial,l.sdh||(l.sdh=!!a.sdh),l.allCodes.includes(a.code)||l.allCodes.push(a.code),l.allLanguages.includes(p)||l.allLanguages.push(p);let f=N({name:p,code:a.code,partial:a.partial});l.labels.includes(f)||l.labels.push(f)}}return G(Array.from(o.values()).sort((a,r)=>Number(a.partial)-Number(r.partial)))}function z(e,t=3,o=n.core.mediaLanguage.flagSrc){let a=Array.isArray(e)?{audio:e}:w(e),r=F(),i=r.audio?S(a.audio,r.style):[],s=r.subtitles?S(a.subtitles,r.style):[],d=r.audio&&r.badge!=="off"?S(a.audio,"codes").filter(g=>k(g.code)!=="zxx"):[],c=new Set(d.map(g=>k(g.code))).size,p=r.badge!=="off"&&c>=2,l=[];p&&l.push({badge:c===2?"dual":"multi"}),(!p||r.badge!=="only")&&l.push(...i),l.push(...s.map(g=>({...g,subtitle:!0})));let f=document.createElement("div");if(f.className=b,(t>0?l.slice(0,t):l).some(g=>!g.badge&&!g.asCode&&typeof g.countryCode!="string"))return f;for(let g of l){if(!g.badge&&!g.asCode&&typeof g.countryCode!="string")continue;let L=!g.badge&&g.asCode,u=document.createElement(g.badge||g.subtitle||L?"span":"img");if(u.className=g.badge?"language-count-badge language-chip":L?"language-code language-chip":g.subtitle?"language-subtitle language-chip":C,g.partial&&(u.classList.add(v),u.dataset.partial="true"),u.dataset.jeLanguage=g.badge?"countBadge":g.subtitle?"subtitles":"flag",u.tagName!=="IMG"&&(u.dataset.jeLanguageLabel=g.badge||g.text.toLowerCase()),g.badge)u.textContent=n.t(n.core.tagLayout?.VOCABULARY_KEYS.language[`${g.badge}`]??""),u.title=`${n.t("language_tags_count_tooltip",{count:c})}: ${d.flatMap(A=>A.labels).join(", ")}`;else{let A=g.labels.join(", ");u.title=`${n.t(g.subtitle?g.sdh?"language_tags_subtitles_sdh":"jellyseerr_report_issue_type_subtitles":"jellyseerr_report_issue_type_audio")}: ${A}`,u.dataset.langName=g.allLanguages.join(", ");let D=typeof g.countryCode=="string"?g.countryCode:"";if(u.dataset.lang=L?g.text.toLowerCase():D.toLowerCase(),g.subtitle){let m=document.createElement("span");m.className="language-cc",m.textContent=g.sdh?"SDH":"CC",g.sdh&&(u.dataset.jeSdh="true"),m.setAttribute("aria-hidden","true"),u.appendChild(m)}if(L)u.appendChild(document.createTextNode(g.text));else{let m=V(u)?u:document.createElement("img");m.src=o(D),m.className=g.subtitle?C:u.className,m.alt=u.title,m.loading="lazy",m.onerror=()=>u.remove(),g.subtitle&&u.appendChild(m)}}u.tagName!=="IMG"&&u.setAttribute("role","img"),u.setAttribute("aria-label",u.title),f.appendChild(u)}return f}function x(e,t,o){if(!t||e.isTagged(t))return;e.removeExistingOverlay(t),t.style.position!=="relative"&&(t.style.position="relative");let a=n.core.tagLayout?n.core.tagLayout.resolveLayout(t).caps.language:3;e.commitOverlay(t,z(o,a))}n.core.languageTags={readSettings:F,buildGroup:z};let R={logPrefix:h,settingKey:"languageTagsEnabled",containerClass:b,taggedAttr:"jeLanguageTagged",styleId:"language-tags-styles",position:{userKey:"languageTagsPosition",pluginKey:"LanguageTagsPosition",fallback:"bottom-left"},cache:{key:"JellyfinEnhanced-languageTagsCache-v4",legacyPrefix:["JellyfinEnhanced-languageTagsCache-v3","JellyfinEnhanced-languageTagsCache-v2","JellyfinEnhanced-languageTagsCache","languageTagsCache"],hotBucket:"language"},buildCss(){return n.core.tagRenderer.chipBaseCss(".language-chip")+n.core.tagRenderer.chipBaseCss('.language-code:not([data-je-language="subtitles"])',!0)+`
                .${b} {
                    display: flex;
                    flex-direction: column;
                    gap: calc(3px * var(--je-tag-scale, 1) * var(--je-tag-gap, 1));
                    z-index: 101;
                    pointer-events: none;
                    max-height: 90%;
                    overflow: hidden;
                }
                .${C} {
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
                .je-tag-host:has(.${b}) { z-index: 2; }
                .${b} > * { pointer-events: auto; }
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
                .${v} { opacity: 0.55; }
                img.${v} {
                    opacity: 0.55;
                    filter: saturate(0.5);
                    outline: 1px dashed rgba(255, 255, 255, 0.95);
                    outline-offset: -1px;
                    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6);
                }
                .layout-mobile .${C} {
                    width: calc(clamp(20px, 5vw, 26px) * var(--je-tag-scale, 1));
                }
                .layout-mobile .${b} { gap: calc(2px * var(--je-tag-scale, 1) * var(--je-tag-gap, 1)); }
                @media (max-width: 768px) {
                    .${C} {
                        width: calc(clamp(20px, 5vw, 26px) * var(--je-tag-scale, 1));
                        gap: calc(2px * var(--je-tag-scale, 1) * var(--je-tag-gap, 1));
                    }
                }
                @media (max-width: 480px) {
                    .${C} {
                        width: calc(clamp(16px, 4vw, 20px) * var(--je-tag-scale, 1));
                    }
                    .${b} {
                        gap: calc(2px * var(--je-tag-scale, 1) * var(--je-tag-gap, 1));
                    }
                }
            `},pipeline:{needsFirstEpisode:!0,needsParentSeries:!1,render(e,t,o,a){if(e.shouldIgnore(t)||e.isTagged(t)||t.closest(".je-hidden"))return;let r=String(o.Id),i=w(e.hot?.get(r));if(typeof i.timestamp=="number"&&Date.now()-i.timestamp<e.cacheTtl){i.value&&x(e,t,i.value);return}let s=o;if(o.Type==="Series"||o.Type==="Season")if(a.firstEpisode)s=a.firstEpisode;else return;let d={audio:I(s),subtitles:E(s,o)};e.setPersistent(r,d),e.hot?.set(r,{value:d,timestamp:Date.now()}),x(e,t,d)},renderFromCache(e,t,o){if(e.isTagged(t)||e.shouldIgnore(t)||t.closest(".je-hidden"))return!0;let r=e.hot?.get(o)||e.getPersistent(o);if(r){let i=w(r),s=Array.isArray(r)?r:i.value||i.languages||r;if(s&&!Array.isArray(s))return x(e,t,s),!0}return!1},renderFromServerCache(e,t,o){if(e.isTagged(t)||e.shouldIgnore(t))return;let a=y(o.AudioLanguages),r=new Set(y(o.PartialAudioLanguages)),i=a.map(function(d){let c=U(d);return{name:T(c),code:c,partial:r.has(c)}}),s=y(o.SdhSubtitleLanguages);x(e,t,{audio:i,subtitles:y(o.SubtitleLanguages).map(d=>({code:d,sdh:s.some(c=>n.core.mediaLanguage.matchesLanguage(d,c,{requireRegion:!0}))}))})}}};n.initializeLanguageTags=function(){n.core.tagRenderer.register("language",R)},n.reinitializeLanguageTags=function(){n.core.tagRenderer.reinitialize("language",R)},n.core.tagRenderer.registerStyles(R)}H($());})();
})();
