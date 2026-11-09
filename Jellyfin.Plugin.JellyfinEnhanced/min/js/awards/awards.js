(() => {
"use strict";(()=>{function E(){return window}function M(e){let t=window.JellyfinEnhanced;if(!t)throw new Error(`${e} loaded before Jellyfin Enhanced`);return t}function C(){let e=E().ApiClient;if(!e)throw new Error("Jellyfin ApiClient unavailable");return e}function O(){return E().ApiClient!==void 0}function w(){let e=E().ApiClient?.getCurrentUserId();return typeof e=="string"&&e?e:null}function x(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function b(e,n){return x(e)?e[n]:void 0}function u(e){return typeof e=="string"?e:void 0}function h(e){return typeof e=="number"&&Number.isFinite(e)?e:void 0}function Z(e){return typeof e=="boolean"?e:void 0}function L(e){return Array.isArray(e)?e:[]}function P(e){return L(e).filter(n=>typeof n=="string")}function k(e){if(typeof e=="string")return e||void 0;if(typeof e=="number"&&Number.isFinite(e)&&e!==0)return String(e)}function N(e){let n={};if(!x(e))return n;let t=k(e.Tmdb),r=k(e.Imdb),a=k(e.Tvdb),p=k(e.AniList),g=k(e.Anilist);return t!==void 0&&(n.Tmdb=t),r!==void 0&&(n.Imdb=r),a!==void 0&&(n.Tvdb=a),p!==void 0&&(n.AniList=p),g!==void 0&&(n.Anilist=g),n}function B(e){if(Array.isArray(e))return e.filter(x).map(n=>{let t={},r=u(n.Type),a=u(n.Language);return r!==void 0&&(t.Type=r),a!==void 0&&(t.Language=a),t})}function X(e){if(Array.isArray(e))return e.map(n=>{let t={},r=u(b(n,"Id")),a=B(b(n,"MediaStreams"));return r!==void 0&&(t.Id=r),a!==void 0&&(t.MediaStreams=a),t})}function c(e,n,t){t!==void 0&&(e[n]=t)}function F(e){if(!x(e))return null;let n={ProviderIds:N(e.ProviderIds),SeriesProviderIds:N(e.SeriesProviderIds)};c(n,"Id",u(e.Id)),c(n,"Type",u(e.Type)),c(n,"Name",u(e.Name)),c(n,"SeriesId",u(e.SeriesId)),c(n,"SeriesName",u(e.SeriesName)),c(n,"IndexNumber",h(e.IndexNumber)),c(n,"ParentIndexNumber",h(e.ParentIndexNumber)),c(n,"PremiereDate",u(e.PremiereDate)),c(n,"DisplayOrder",u(e.DisplayOrder)),c(n,"MediaSources",X(e.MediaSources)),c(n,"MediaStreams",B(e.MediaStreams)),c(n,"FirstEpisodeId",u(b(e.FirstEpisode,"Id"))),Array.isArray(e.Tags)&&(n.Tags=P(e.Tags));let t=e.UserData;return c(n,"Played",Z(b(t,"Played"))),c(n,"UnplayedItemCount",h(b(t,"UnplayedItemCount"))),n}function j(e=window.location.hash){try{return new URLSearchParams(e.split("?")[1]??"").get("id")}catch{return null}}function T(){return document.querySelector("#itemDetailPage:not(.hide)")}function ee(e,n,t,r=w()){return e?.getItemCached?t?e.getItemCached(n,{userId:r}):e.getItemCached(n):C().getItem(r,n)}async function R(e,n,t,r=w()){return F(await ee(e,n,t,r))}function U(e,n,t){let r=ne(e);return{itemId:n,page:t,current:()=>r()&&j()===n&&t.isConnected&&T()===t}}function ne(e){let n=e?.getEpoch(),t=w(),r=C(),a=r.getUrl("/"),p=r.accessToken();return()=>O()&&C()===r&&r.getUrl("/")===a&&r.accessToken()===p&&(!e||n===void 0||e.isCurrent(n))&&w()===t}function te(e,n){let t=window.location.hash.includes("id=")||typeof n=="string"&&n.includes("id="),r=!!e&&(e.id==="itemDetailPage"||e.classList.contains("itemDetailPage"));return t||r}function $(e,n,t,r){return async(a,p,g)=>{if(!e()){n();return}if(!te(p,g))return;await new Promise(S=>setTimeout(S,150));let y=T();y?t(y):r&&setTimeout(()=>{let S=T();S&&t(S)},500)}}function V(e,n){let r=(e||T()||document).querySelector(n);r?.parentNode?.removeChild(r)}function z(e){return encodeURIComponent(e)}async function _(e,n,t){let r=e?.Type;if(!e)return{target:null,unsupported:!0};if(r==="Movie")return{target:H(e.ProviderIds.Tmdb,"movie"),unsupported:!1};if(r==="Person"&&n)return{target:H(e.ProviderIds.Tmdb,"person"),unsupported:!1};if(r==="Series"||r==="Season"||r==="Episode"){let a;if(r==="Series")a=e.ProviderIds.Tmdb;else if(e.SeriesId)try{a=(await t(e.SeriesId))?.ProviderIds.Tmdb}catch{}return{target:H(a,"tv"),unsupported:!1}}return{target:null,unsupported:!0}}function H(e,n){return e?{tmdbId:e,mediaType:n}:null}function W(e){return b(e,"Confirmed")===!1}function q(e){return x(e)?{found:!!e.Found,wins:h(e.Wins)||0,nominations:h(e.Nominations)||0,awards:L(e.Awards).filter(x).map(n=>({name:u(n.Name)??"",result:u(n.Result)??"",year:h(n.Year),recipients:P(n.Recipients),works:P(n.Works)}))}:null}function G(e){return[...e].sort((n,t)=>{let r=(t.year||0)-(n.year||0);return r!==0?r:(n.result==="Won"?0:1)-(t.result==="Won"?0:1)})}var re=[["Academy Award","oscar"],["Golden Globe Award","golden-globe"],["BAFTA Award","bafta"],["Primetime Emmy Award","emmy"],["Daytime Emmy Award","emmy"],["Screen Actors Guild Award","sag"],["Critics' Choice","critics-choice"],["National Board of Review","national-board-of-review"],["Saturn Award","saturn",!0],["Kids' Choice Award","kids-choice"],["Toronto Film Critics Association Award","toronto-critics",!0],["Palme d'Or","cannes"],["Cannes Film Festival Award","cannes"]];function J(e){let n=re.find(([t])=>e.startsWith(t));return n?{file:n[1],invert:!!n[2]}:null}function K(){let e=(r,a,p,g,y="")=>`<svg class="${y}" viewBox="0 0 24 24" width="${p}" height="${p}" style="left:${r}%; top:${a}%; opacity:${g};">
                    <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z"/>
                </svg>`,n=e(38,18,8,.4)+e(50,68,12,.3)+e(28,65,7,.35),t=e(70,20,10,.5,"je-spark-wide")+e(80,60,16,.35,"je-spark-wide")+e(90,25,22,.9,"je-spark-wide");return n+t}var l=M("Awards");l.initializeAwardsScript=function(){if(!l.pluginConfig?.ShowAwards){console.log("🪼 Jellyfin Enhanced: Awards feature disabled.");return}let n="🪼 Jellyfin Enhanced: Awards:",t=i=>typeof l.escapeHtml=="function"?l.escapeHtml(i):String(i);function r(){let i="je-awards-styles";if(document.getElementById(i))return;let o=document.createElement("style");o.id=i,o.textContent=ie,document.head.appendChild(o)}function a(i){try{V(i,".je-awards-section")}catch(o){console.warn(`${n} removeAwardsSection failed:`,o)}}async function p(i,o){try{let s=`awards:/${o}/${i}`,d=await l.core.api.plugin(`/awards/${o}/${z(i)}`,{cacheKey:s});return W(d)&&l.core.api.manager.clearCacheMatching(s),q(d)}catch(s){return console.warn(`${n} Failed to fetch awards.`,s),null}}function g(i){let o=document.createElement("div");o.className="je-awards-list";for(let s of G(i.awards)){let d=document.createElement("div");d.className="je-awards-row";let m=s.result==="Won",I=m?"je-awards-badge-won":"je-awards-badge-nominated",D=m?l.t("awards_won"):l.t("awards_nominated"),v="";s.recipients.length?v=`<div class="je-awards-recipients">${t(s.recipients.join(", "))}</div>`:s.works.length&&(v=`<div class="je-awards-recipients">${t(l.t("awards_for_work",{work:s.works.join(", ")}))}</div>`);let A=J(s.name);if(d.innerHTML=`
                    <div class="je-awards-row-main">
                        <span class="je-awards-badge ${I}">${t(D)}</span>
                        <div>
                            <div class="je-awards-row-name">${t(s.name)}</div>
                            ${v}
                        </div>
                    </div>
                    <div class="je-awards-row-side">
                        ${s.year?`<span class="je-awards-row-year">${t(String(s.year))}</span>`:""}
                    </div>
                `,A){let f=document.createElement("img");f.className=`je-awards-body-icon${A.invert?" je-awards-body-icon-invert":""}`,f.src=l.cdn.url("award-logos",A.file),f.alt="",f.loading="lazy",f.onerror=()=>f.remove(),d.querySelector(".je-awards-row-side")?.prepend(f)}o.appendChild(d)}return o}function y(i){let o=document.createElement("details");o.className="detailSection je-awards-section";let s=[];i.wins>0&&s.push(l.t("awards_wins_count",{count:i.wins})),i.nominations>0&&s.push(l.t("awards_nominations_count",{count:i.nominations}));let d=document.createElement("summary");return d.className="je-awards-summary",d.innerHTML=`
                <div class="je-awards-sparkles" aria-hidden="true">${K()}</div>
                <div class="je-awards-label">
                    <span class="je-msym-rounded je-awards-star" aria-hidden="true">auto_awesome</span>
                    <span class="je-awards-wordmark">${t(l.t("awards_label"))}</span>
                </div>
                <div class="je-awards-divider"></div>
                <div class="je-awards-stats">${s.map(t).join(" &nbsp;|&nbsp; ")}</div>
                <i class="material-icons expand-icon" aria-hidden="true">expand_more</i>
            `,o.appendChild(d),o.appendChild(g(i)),o}function S(i,o){if(a(i),!o||!o.found||o.wins===0&&o.nominations===0)return;let s=y(o),d=i.querySelector(".tmdb-reviews-section")||i.querySelector(".streaming-lookup-container")||i.querySelector(".itemExternalLinks")||i.querySelector(".tagline");if(d?.parentNode){d.parentNode.insertBefore(s,d.nextSibling);return}let m=i.querySelector("#similarCollapsible");if(m?.parentNode){m.parentNode.insertBefore(s,m);return}console.error(`${n} Could not find a suitable anchor to insert the awards banner. contextPage:`,i)}async function Y(i){if(!l.pluginConfig?.ShowAwards){a(i);return}try{let o=j(),s=w();if(!o||!s)return;let d=U(l.session,o,i),m=await R(l.helpers,o,!0,s),{target:I}=await _(m,!0,v=>R(l.helpers,v,!0,s));if(!d.current())return;if(!I){d.current()&&a(i);return}let D=await p(I.tmdbId,I.mediaType);d.current()&&S(i,D)}catch(o){console.error(`${n} Error processing page:`,o)}}r();let Q=l.helpers.onViewPage($(()=>!!l.pluginConfig?.ShowAwards,()=>Q?.(),i=>{Y(i)},!0),{pages:null,fetchItem:!1,immediate:!0})};var ie=`
                .je-awards-label .je-msym-rounded {
                    font-family: 'JE Material Symbols Rounded';
                    font-weight: normal;
                    font-style: normal;
                    line-height: 1;
                    letter-spacing: normal;
                    text-transform: none;
                    display: inline-block;
                    white-space: nowrap;
                    word-wrap: normal;
                    direction: ltr;
                    -webkit-font-feature-settings: 'liga';
                    font-feature-settings: 'liga';
                }
                .je-awards-section {
                    /* Some themes (e.g. ElegantFin) style .detailSection as a
                       grid, which blows this <details> out to a huge width —
                       force flex like reviews.js's .tmdb-reviews-section. */
                    display: flex !important;
                    flex-direction: column;
                    width: 100%;
                    min-width: 0;
                    row-gap: 0px !important;
                    position: relative;
                    overflow: hidden;
                    margin: 1em 0;
                    border-radius: 10px;
                    color: #fff;
                    background: linear-gradient(115deg, #0d2b3a 0%, #113a4d 45%, #0f4a63 100%);
                    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
                }
                .je-awards-summary {
                    position: relative;
                    display: flex;
                    align-items: center;
                    gap: 14px;
                    padding: 14px 20px;
                    cursor: pointer;
                    list-style: none;
                }
                .je-awards-summary::-webkit-details-marker {
                    display: none;
                }
                .je-awards-summary .je-awards-sparkles {
                    position: absolute;
                    inset: 0;
                    pointer-events: none;
                    opacity: 0.55;
                }
                .je-awards-summary .je-awards-sparkles svg {
                    position: absolute;
                    fill: #fff;
                }
                @media (max-width: 480px) {
                    .je-awards-summary .je-awards-sparkles .je-spark-wide {
                        display: none;
                    }
                }
                .je-awards-label {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    z-index: 1;
                    white-space: nowrap;
                    line-height: 1;
                }
                .je-awards-label .je-awards-star {
                    font-size: 20px;
                    color: #ffd76b;
                }
                .je-awards-wordmark {
                    font-family: Georgia, 'Times New Roman', serif;
                    letter-spacing: 0.12em;
                    font-size: 18px;
                    font-weight: 600;
                    text-transform: uppercase;
                    line-height: 1;
                }
                .je-awards-divider {
                    z-index: 1;
                    width: 1px;
                    align-self: stretch;
                    background: rgba(255,255,255,0.25);
                }
                .je-awards-stats {
                    z-index: 1;
                    font-size: 13px;
                    font-weight: 500;
                    color: rgba(255,255,255,0.92);
                    white-space: nowrap;
                    line-height: 1;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .je-awards-summary .expand-icon {
                    z-index: 1;
                    margin-left: auto;
                    opacity: 0.75;
                    transition: transform 0.2s ease-in-out;
                }
                .je-awards-section[open] .je-awards-summary .expand-icon {
                    transform: rotate(180deg);
                }

                .je-awards-list {
                    padding: 4px 12px 14px;
                }
                .je-awards-row {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 12px;
                    padding: 10px 8px;
                    border-top: 1px solid rgba(255,255,255,0.08);
                }
                .je-awards-row-main {
                    display: flex;
                    align-items: flex-start;
                    gap: 10px;
                    min-width: 0;
                }
                .je-awards-row-side {
                    flex: none;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .je-awards-body-icon {
                    flex: none;
                    width: 25px;
                    height: 25px;
                    object-fit: contain;
                }
                .je-awards-body-icon-invert {
                    /* Flat black silhouette on transparent, e.g. Saturn Award —
                       force white so it reads against the dark banner instead
                       of nearly disappearing. */
                    filter: brightness(0) invert(1);
                }
                .je-awards-badge {
                    flex: none;
                    margin-top: 1px;
                    padding: 2px 8px;
                    border-radius: 20px;
                    font-size: 11px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.03em;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    min-width: 88px;
                    text-align: center;
                }
                @media (max-width: 480px) {
                    .je-awards-badge {
                        min-width: 58px;
                        padding: 2px 6px;
                        font-size: 9px;
                    }
                }
                .je-awards-badge-won {
                    background: rgba(255,215,107,0.18);
                    color: #ffd76b;
                }
                .je-awards-badge-nominated {
                    background: rgba(255,255,255,0.1);
                    color: rgba(255,255,255,0.75);
                }
                .je-awards-row-name {
                    font-size: 13.5px;
                    font-weight: 500;
                    line-height: 1.35;
                    color: #fff;
                }
                .je-awards-recipients {
                    margin-top: 2px;
                    font-size: 12px;
                    color: rgba(255,255,255,0.6);
                    line-height: 1.35;
                }
                .je-awards-row-year {
                    flex: none;
                    font-size: 12px;
                    color: rgba(255,255,255,0.5);
                }
            `;})();
})();
