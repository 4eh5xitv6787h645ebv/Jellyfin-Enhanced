(() => {
"use strict";(()=>{function G(){return window}function ae(e){let r=window.JellyfinEnhanced;if(!r)throw new Error(`${e} loaded before Jellyfin Enhanced`);return r}function M(){let e=G().ApiClient;if(!e)throw new Error("Jellyfin ApiClient unavailable");return e}function Q(){return G().ApiClient!==void 0}function X(){let e=G().ApiClient?.getCurrentUserId();return typeof e=="string"&&e?e:null}function E(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function I(e,n){return E(e)?e[n]:void 0}function u(e){return typeof e=="string"?e:void 0}function T(e){return typeof e=="number"&&Number.isFinite(e)?e:void 0}function Z(e){return typeof e=="number"&&Number.isInteger(e)?e:void 0}function Te(e){return typeof e=="boolean"?e:void 0}function B(e){return Array.isArray(e)?e:[]}function Re(e){return B(e).filter(n=>typeof n=="string")}function H(e){if(typeof e=="string")return e||void 0;if(typeof e=="number"&&Number.isFinite(e)&&e!==0)return String(e)}function le(e){let n={};if(!E(e))return n;let r=H(e.Tmdb),o=H(e.Imdb),s=H(e.Tvdb),m=H(e.AniList),S=H(e.Anilist);return r!==void 0&&(n.Tmdb=r),o!==void 0&&(n.Imdb=o),s!==void 0&&(n.Tvdb=s),m!==void 0&&(n.AniList=m),S!==void 0&&(n.Anilist=S),n}function de(e){if(Array.isArray(e))return e.filter(E).map(n=>{let r={},o=u(n.Type),s=u(n.Language);return o!==void 0&&(r.Type=o),s!==void 0&&(r.Language=s),r})}function Me(e){if(Array.isArray(e))return e.map(n=>{let r={},o=u(I(n,"Id")),s=de(I(n,"MediaStreams"));return o!==void 0&&(r.Id=o),s!==void 0&&(r.MediaStreams=s),r})}function b(e,n,r){r!==void 0&&(e[n]=r)}function ce(e){if(!E(e))return null;let n={ProviderIds:le(e.ProviderIds),SeriesProviderIds:le(e.SeriesProviderIds)};b(n,"Id",u(e.Id)),b(n,"Type",u(e.Type)),b(n,"Name",u(e.Name)),b(n,"SeriesId",u(e.SeriesId)),b(n,"SeriesName",u(e.SeriesName)),b(n,"IndexNumber",T(e.IndexNumber)),b(n,"ParentIndexNumber",T(e.ParentIndexNumber)),b(n,"PremiereDate",u(e.PremiereDate)),b(n,"DisplayOrder",u(e.DisplayOrder)),b(n,"MediaSources",Me(e.MediaSources)),b(n,"MediaStreams",de(e.MediaStreams)),b(n,"FirstEpisodeId",u(I(e.FirstEpisode,"Id"))),Array.isArray(e.Tags)&&(n.Tags=Re(e.Tags));let r=e.UserData;return b(n,"Played",Te(I(r,"Played"))),b(n,"UnplayedItemCount",T(I(r,"UnplayedItemCount"))),n}function ue(e=window.location.hash){try{return new URLSearchParams(e.split("?")[1]??"").get("id")}catch{return null}}function pe(){return document.querySelector("#itemDetailPage:not(.hide)")}function He(e,n,r,o=X()){return e?.getItemCached?r?e.getItemCached(n,{userId:o}):e.getItemCached(n):M().getItem(o,n)}async function ge(e,n,r,o=X()){return ce(await He(e,n,r,o))}function fe(e,n){try{let r=new URL(e,n);return["http:","https:","mailto:","tel:","ftp:","blob:"].includes(r.protocol)?e:"#"}catch{return"#"}}function Oe(e){return fe(e,window.location.href)}function Y(e,n,r={}){let o=e?.createExternalLink;if(o)return o(n,r);let s=document.createElement("a");return s.setAttribute("is","emby-linkbutton"),s.href=Oe(n),s.target="_blank",s.rel="noopener noreferrer",r.title&&(s.title=r.title),r.className&&(s.className=r.className),r.text&&(s.textContent=r.text),r.resetStyle&&(s.style.cssText="padding:0;background:none;border-radius:0;min-width:0;"),typeof r.setup=="function"&&r.setup(s),s}function L(e){let n=[];if(!e)return n;for(let r of e.split(`
`)){let o=r.trim();if(!o)continue;let s=o.split("|").map(O=>O.trim()),[m,S]=s;s.length===2&&m&&S&&n.push({jellyfinUrl:m,arrUrl:S})}return n}function A(e,n,r){if(!n)return null;if(e.length===0)return n;let o=r.replace(/\/+$/,"").toLowerCase();for(let s of e)if(o===s.jellyfinUrl.replace(/\/+$/,"").toLowerCase())return s.arrUrl.replace(/\/$/,"");return n}function ee(e,n,r){return(e||[]).filter(o=>!!o&&o.Enabled!==!1).map(o=>({name:o.Name||n,url:A(L(o.UrlMappings||""),o.Url,r)})).filter(o=>!!o.url)}function $(e){return!e||e<=0?"":e<1073741824?(e/1048576).toFixed(0)+" MB":(e/1073741824).toFixed(1)+" GB"}function me(e,n){return e===0?"missing":e>=n?"complete":"partial"}function ne(e){let n=I(e,"errors");if(Array.isArray(n))return n.map(r=>({instanceName:u(I(r,"instanceName")),reason:u(I(r,"reason"))}))}function be(e,n){return B(I(e,"matches")).filter(E).map(r=>({instanceName:u(r.instanceName),instanceUrl:A(L(u(r.urlMappings)||""),u(r.instanceUrl),n),titleSlug:u(r.titleSlug)??"",episodeFileCount:Z(r.episodeFileCount)||0,episodeCount:Z(r.episodeCount)||0,sizeOnDisk:T(r.sizeOnDisk)||0,rootFolderPath:u(r.rootFolderPath)||""}))}function he(e,n){return B(I(e,"matches")).filter(E).map(r=>({name:u(r.instanceName),url:A(L(u(r.urlMappings)||""),u(r.instanceUrl),n),hasFile:r.hasFile===!0,sizeOnDisk:T(r.sizeOnDisk)||0,rootFolderPath:u(r.rootFolderPath)||""}))}var xe=e=>e.replace(/\/$/,"");function we(e){return`${xe(e.instanceUrl)}/series/${e.titleSlug}`}function ye(e,n){return`${xe(e.url)}/movie/${n}`}function Se(e,n){let r=e.episodeFileCount>=0,o=$(e.sizeOnDisk),s=[e.instanceName??""];return r&&s.push(`${e.episodeFileCount}/${e.episodeCount} episodes`),o&&s.push(o),e.rootFolderPath&&s.push(e.rootFolderPath),{url:we(e),status:n&&r?me(e.episodeFileCount,e.episodeCount):null,badge:n&&r?`${e.episodeFileCount}/${e.episodeCount}`:"",tip:s.join(`
`)}}function ke(e){return e.map(n=>{let r=n.episodeFileCount<0?null:me(n.episodeFileCount,n.episodeCount),o=n.episodeFileCount<0?"":`${n.episodeFileCount}/${n.episodeCount}`,s=$(n.sizeOnDisk),m=[o?`${o} episodes`:null,s,n.rootFolderPath].filter(Boolean).join(" • ");return{name:n.instanceName??"",url:we(n),status:r,badge:o,size:s,tip:m}})}function Ce(e,n,r){let o=e.hasFile?"complete":"missing",s=e.hasFile?"Downloaded":"Missing";return{url:ye(e,n),status:r?o:null,badge:r?s:"",tip:[e.name,s,$(e.sizeOnDisk),e.rootFolderPath].filter(Boolean).join(`
`)}}function Ie(e,n){return e.map(r=>{let o=r.hasFile?"complete":"missing",s=r.hasFile?"Downloaded":"Missing",m=$(r.sizeOnDisk);return{name:r.name??"",url:ye(r,n),status:o,badge:s,size:m,tip:[s,m,r.rootFolderPath].filter(Boolean).join(" • ")}})}function ve(e){let n={tmdb:null,hasTmdbLink:!1};for(let r of e)r.includes("themoviedb.org/movie/")?(n.tmdb=r.match(/\/movie\/(\d+)/)?.[1]??null,n.hasTmdbLink=!0):r.includes("themoviedb.org/tv/")&&(n.tmdb=r.match(/\/tv\/(\d+)/)?.[1]??null,n.hasTmdbLink=!0);return n}var a=ae("Arr links"),k="🪼 Jellyfin Enhanced: Arr Links:",re=()=>Q()&&typeof M().serverAddress=="function"?M().serverAddress?.()??window.location.origin:window.location.origin;a.initializeArrLinksScript=async function(){if(!a.pluginConfig.ArrLinksEnabled){console.log(`${k} Integration disabled in plugin settings.`);return}let n=a.session?a.session.getEpoch():0,r=()=>!a.session||a.session.isCurrent(n),o=a.helpers.isAdmin();if(console.log(`${k} Admin status: ${o}`),!o){console.log(`${k} User is not an administrator. Links will not be shown.`);return}console.log(`${k} Initializing...`),a.pluginConfig.SonarrInstancesCorrupt&&typeof a.toast=="function"&&(a.toast("⚠ Sonarr instance configuration is corrupt. Open the Jellyfin Enhanced config page to reset it."),console.error(`${k} SonarrInstances stored JSON is corrupt.`)),a.pluginConfig.RadarrInstancesCorrupt&&typeof a.toast=="function"&&(a.toast("⚠ Radarr instance configuration is corrupt. Open the Jellyfin Enhanced config page to reset it."),console.error(`${k} RadarrInstances stored JSON is corrupt.`));let s=!1,m=null,S=null,O=new Map,te=new Map;try{let _=function(t,l){if(!l||l.length===0){for(let i of[...D])i.startsWith(t+"|")&&D.delete(i);return}let d=new Set;for(let i of l){let p=`${t}|${i.instanceName}|${i.reason}`;d.add(p),!D.has(p)&&(D.add(p),typeof a.toast=="function"&&a.toast("⚠ "+N(t)+' instance "'+N(i.instanceName||"unknown")+'" failed: '+N(i.reason)),console.warn(`${k} ${t} instance "${i.instanceName}" error: ${i.reason}`))}for(let i of[...D])i.startsWith(t+"|")&&!d.has(i)&&D.delete(i)},J=function(t,l){let d=t==="Sonarr"?"sonarr":"radarr";U[d]||(U[d]=!0,typeof a.toast=="function"&&a.toast("⚠ "+N(t)+" lookup failed; links unavailable. See console for details."),console.warn(`${k} ${t} lookup backend failed:`,l))},K=function(t,l){let d=Object.prototype.hasOwnProperty.call(se,t)?se[t]:void 0;if(!d)return null;let i=document.createElement("img");i.src=d,i.alt=l,i.className="arr-link-img";let p=a.helpers.getExternalLinkIconSize();return i.style.width=`${p}px`,i.style.height=`${p}px`,i},F=function(t,l,d,i=null,p="",g=""){let f=i?` arr-link--${i}`:"",C=Y(a.helpers,l,{title:g||t,className:`button-link emby-button arr-link${f}`});if(q()){if(C.textContent=t,p){let c=document.createElement("span");c.className=`arr-badge arr-badge--${i||"missing"}`,c.textContent=p,C.appendChild(c)}}else{let c=K(d,t);c&&C.appendChild(c)}return C},W=function(t,l,d){let i=document.createElement("span");i.className="arr-dropdown";let p=a.themer?.getThemeVariables?.()||{};i.style.setProperty("--arr-menu-bg",p.secondaryBg||"rgba(20,20,28,0.98)"),i.style.setProperty("--arr-menu-text",p.textColor||"#fff"),i.style.setProperty("--arr-menu-border","rgba(255,255,255,0.2)"),i.style.setProperty("--arr-menu-hover","rgba(255,255,255,0.1)"),i.style.setProperty("--arr-menu-muted","rgba(255,255,255,0.55)");let g=document.createElement("a");if(g.setAttribute("is","emby-linkbutton"),g.className="button-link emby-button arr-link",g.href="#",g.title=`${t} (${d.length} instances)`,q())g.textContent=t;else{let c=K(l,t);c&&g.appendChild(c)}let f=document.createElement("span");f.textContent="▾",f.style.cssText="font-size:0.8em; opacity:0.8; margin-left:2px; line-height:1; vertical-align:middle; color: white;",g.appendChild(f),g.addEventListener("click",c=>{c.preventDefault(),c.stopPropagation(),document.querySelectorAll(".arr-dropdown.open").forEach(h=>{h!==i&&h.classList.remove("open")}),i.classList.toggle("open")});let C=document.createElement("div");C.className="arr-dropdown-menu";for(let c of d){let h=Y(a.helpers,c.url,{title:c.tip||c.name,className:"arr-dropdown-item"}),P=document.createElement("span");P.className=`arr-dropdown-dot arr-dropdown-dot--${c.status||"missing"}`,h.appendChild(P);let x=document.createElement("span");if(x.className="arr-dropdown-item-name",x.textContent=c.name,h.appendChild(x),c.badge){let w=document.createElement("span");w.className=`arr-badge arr-badge--${c.status||"missing"}`,w.textContent=c.badge,h.appendChild(w)}if(c.size){let w=document.createElement("span");w.className="arr-dropdown-item-stats",w.textContent=c.size,h.appendChild(w)}C.appendChild(h)}return i.append(g,C),i};var Ne=_,Fe=J,Be=K,$e=F,ze=W;let z=a.cdn.selfhst("svg/sonarr.svg"),Pe=a.cdn.selfhst("svg/radarr-light-hybrid-light.svg"),Ee=a.cdn.selfhst("svg/bazarr.svg"),R=re(),v=a.pluginConfig,j=ee(v.SonarrInstances,"Sonarr",R),V=ee(v.RadarrInstances,"Radarr",R);if(j.length===0&&v.SonarrUrl){let t=A(L(v.SonarrUrlMappings||""),v.SonarrUrl,R);t&&j.push({name:"Sonarr",url:t})}if(V.length===0&&v.RadarrUrl){let t=A(L(v.RadarrUrlMappings||""),v.RadarrUrl,R);t&&V.push({name:"Radarr",url:t})}let ie=A(L(v.BazarrUrlMappings||""),v.BazarrUrl,R),oe="arr-links-styles";if(!document.getElementById(oe)){let t=document.createElement("style");t.id=oe,t.textContent=Ue,document.head.appendChild(t)}let U={sonarr:!1,radarr:!1},D=new Set,N=t=>{let l=a.helpers.escHtml;return l?l(t):String(t??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")};async function Le(t){if(!t)return[];let l=O.get(t);if(l)return l;try{let d=await a.core.api.plugin(`/arr/series-slugs?tvdbId=${encodeURIComponent(t)}`);U.sonarr=!1,_("Sonarr",ne(d));let i=be(d,re());return O.set(t,i),i}catch(d){return J("Sonarr",d),[]}}async function Ae(t){if(!t)return[];let l=te.get(t);if(l)return l;try{let d=await a.core.api.plugin(`/arr/movie-instances?tmdbId=${encodeURIComponent(t)}`);U.radarr=!1,_("Radarr",ne(d));let i=he(d,re());return te.set(t,i),i}catch(d){return J("Radarr",d),[]}}let se={"arr-link-sonarr":z,"arr-link-radarr":Pe,"arr-link-bazarr":Ee},q=()=>!!a.pluginConfig.ShowArrLinksAsText;async function De(){if(s)return;let t=pe();if(!t)return;let l=t.querySelector(".itemExternalLinks");if(document.querySelectorAll("#itemDetailPage.hide .arr-link").forEach(g=>{g.previousSibling?.nodeType===Node.TEXT_NODE&&g.previousSibling.remove(),g.remove()}),!l||l.querySelector(".arr-link"))return;let d=window.location.hash,i=()=>document.contains(l)&&!l.closest("#itemDetailPage.hide")&&window.location.hash===d&&r(),p=()=>l.appendChild(document.createTextNode(q()?", ":" "));s=!0;try{let g=ue();if(!g)return;let f=await ge(a.helpers,g,!1);if(!i()||f?.Type!=="Movie"&&f?.Type!=="Series")return;let C=ve([...t.querySelectorAll(".itemExternalLinks a, .externalIdLinks a")].map(P=>P.href));if(!C.hasTmdbLink)return;let c=a.pluginConfig.ArrLinksShowStatusSingle===!0;if(f.Type==="Series"&&f.Name&&j.length>0){let P=await Le(f.ProviderIds.Tvdb||"");if(!i())return;let x=P.filter(y=>!!y.instanceUrl),[w]=x;if(x.length===1&&w){let y=Se(w,c);p(),l.appendChild(F("Sonarr",y.url,"arr-link-sonarr",y.status,y.badge,y.tip))}else x.length>1&&(p(),l.appendChild(W("Sonarr","arr-link-sonarr",ke(x))))}let h=C.tmdb;if(f.Type==="Movie"&&h&&V.length>0){let P=await Ae(h);if(!i())return;let x=P.filter(y=>!!y.url),[w]=x;if(x.length===1&&w){let y=Ce(w,h,c);p(),l.appendChild(F("Radarr",y.url,"arr-link-radarr",y.status,y.badge,y.tip))}else x.length>1&&(p(),l.appendChild(W("Radarr","arr-link-radarr",Ie(x,h))))}ie&&(f.Type==="Series"||f.Type==="Movie")&&(p(),l.appendChild(F("Bazarr",`${ie}/${f.Type==="Series"?"series":"movies"}/`,"arr-link-bazarr")))}finally{s=!1}}if(a._arrDropdownCloserInstalled||(a._arrDropdownCloserInstalled=!0,document.addEventListener("click",t=>{let l=t.target;(!(l instanceof Element)||!l.closest(".arr-dropdown"))&&document.querySelectorAll(".arr-dropdown.open").forEach(d=>d.classList.remove("open"))})),!r())return;S=a.helpers.createObserver("arr-links",()=>{if(a.session&&!a.session.isCurrent(n)){S&&(S.disconnect(),console.log(`${k} Observer disconnected — user changed`));return}if(!a.pluginConfig.ArrLinksEnabled){S&&(S.disconnect(),console.log(`${k} Observer disconnected — feature disabled`));return}m&&clearTimeout(m),m=setTimeout(()=>{De()},100)},document.body,{childList:!0,subtree:!0})||null,a._arrLinksObserver=S,console.log(`${k} Initialized successfully`)}catch(z){console.error(`${k} Failed to initialize`,z)}};document.addEventListener("je:user-data-loaded",()=>{if(a.pluginConfig.ArrLinksEnabled){try{a._arrLinksObserver?.disconnect()}catch{}a.initializeArrLinksScript?.()}});var Ue=`
                    /* Status colors on the link button border */
                    .arr-link--complete { border-left: 3px solid #52b54b !important; }
                    .arr-link--partial  { border-left: 3px solid #e5a00d !important; }
                    .arr-link--missing  { border-left: 3px solid #666 !important; opacity: 0.7; }

                    /* Icon image inside the button */
                    .arr-link-img {
                        width: 25px;
                        height: 25px;
                        display: block;
                        object-fit: contain;
                    }

                    /* Status badge (text-mode only) */
                    .arr-badge {
                        font-size: 0.75em;
                        padding: 1px 5px;
                        border-radius: 3px;
                        margin-left: 6px;
                        vertical-align: middle;
                        font-weight: 600;
                    }
                    .arr-badge--complete { background: rgba(82,181,75,0.2); color: #52b54b; }
                    .arr-badge--partial  { background: rgba(229,160,13,0.2); color: #e5a00d; }
                    .arr-badge--missing  { background: rgba(102,102,102,0.2); color: #999; }

                    /* Dropdown wrapper — sits inline with sibling link buttons */
                    .arr-dropdown {
                        position: relative;
                        display: inline-block;
                    }

                    /* Dropdown menu — colours injected as CSS vars at render time */
                    .arr-dropdown-menu {
                        display: none;
                        position: absolute;
                        top: calc(100% + 6px);
                        left: 0;
                        z-index: 9999;
                        min-width: 240px;
                        background: var(--arr-menu-bg, rgba(20,20,28,0.98));
                        color: var(--arr-menu-text, #fff);
                        border: 1px solid var(--arr-menu-border, rgba(255,255,255,0.2));
                        border-radius: 8px;
                        box-shadow: 0 12px 32px rgba(0,0,0,0.6);
                        padding: 4px 0;
                        backdrop-filter: blur(12px);
                        -webkit-backdrop-filter: blur(12px);
                    }
                    .arr-dropdown.open .arr-dropdown-menu { display: block; }

                    .arr-dropdown-item {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 9px 14px;
                        color: var(--arr-menu-text, #fff);
                        text-decoration: none;
                        font-size: 0.9em;
                        white-space: nowrap;
                        transition: background 0.12s;
                    }
                    .arr-dropdown-item:hover {
                        background: var(--arr-menu-hover, rgba(255,255,255,0.1));
                        color: var(--arr-menu-text, #fff);
                    }
                    .arr-dropdown-item-name { flex: 1; font-weight: 500; }
                    .arr-dropdown-item-stats {
                        color: var(--arr-menu-muted, rgba(255,255,255,0.55));
                        font-size: 0.85em;
                    }
                    .arr-dropdown-dot {
                        width: 8px;
                        height: 8px;
                        border-radius: 50%;
                        flex-shrink: 0;
                    }
                    .arr-dropdown-dot--complete { background: #52b54b; }
                    .arr-dropdown-dot--partial  { background: #e5a00d; }
                    .arr-dropdown-dot--missing  { background: #888; }

                    /* Progress bar */
                    .arr-progress {
                        display: block;
                        height: 2px;
                        margin-top: 2px;
                        border-radius: 1px;
                        background: rgba(255,255,255,0.1);
                        overflow: hidden;
                    }
                    .arr-progress-fill { height: 100%; border-radius: 1px; transition: width 0.3s; }
                    .arr-progress-fill--complete { background: #52b54b; }
                    .arr-progress-fill--partial  { background: #e5a00d; }
                    .arr-progress-fill--missing  { background: #666; }
                `;})();
})();
