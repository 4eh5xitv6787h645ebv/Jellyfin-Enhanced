(() => {
"use strict";(()=>{function K(i,s,a){let l=s.core?.featureContext;if(typeof l!="function")throw new Error(`${i}: JE.core.featureContext is missing; core/ui-kit.js must load before feature scripts`);return l(i,s,a)}function V(){var h;let i=window,s=i.JellyfinEnhanced;if(!s)throw new Error("Downloads loaded before Jellyfin Enhanced");let a=K("downloads",s,{facades:["downloadsPage","initializeDownloadsPage"],internalSlots:["requestsPage"],internalsObject:()=>s.internals||(s.internals={})}),l=(h=a.own).requestsPage||(h.requestsPage={});return{JE:s,P:l,host:i,ctx:a,getApi:()=>{if(!i.ApiClient)throw new Error("API client unavailable");return i.ApiClient}}}function ye(i){return typeof i=="object"&&i!==null&&!Array.isArray(i)}function M(i){if(!ye(i))throw new Error("Invalid downloads response");return i}function z(i){if(i!=null){if(typeof i!="string")throw new Error("Invalid text");return i}}function W(i){let s=M(i),a={};for(let l of["movies","series"]){if(s[l]==null)continue;let h=M(s[l]),q={};for(let[A,P]of Object.entries(h)){let T=M(P);q[A]={matches:Array.isArray(T.matches)?T.matches.map(f=>{let o=M(f);return{urlMappings:z(o.urlMappings)||"",instanceUrl:z(o.instanceUrl)||"",titleSlug:z(o.titleSlug)||""}}):[]}}a[l]=q}return a}function O(i,s){if(!i)return"";try{let a=new URL(i,s);return a.protocol==="http:"||a.protocol==="https:"?a.href:""}catch{return""}}function N(i,s,a){let l=O(i,a);if(!l)return"";let h=new URL(l);return h.pathname=h.pathname.replace(/\/+$/,"")+"/"+s,h.href}function G(i){if(i.P.runtime)return i.P.runtime;let{JE:s,P:a,host:l}=i,h=0,q=!1,A=new Map,P=[],T=()=>{let o=l.ApiClient,S=s.session?.getEpoch(),C=()=>typeof o?.serverId=="function"?o.serverId():o?.serverId,U=o?.getCurrentUserId(),x=o?.serverAddress?.(),_=o?.getUrl("/"),D=o?.accessToken?.(),n=C();return{current:()=>!q&&l.ApiClient===o&&(S===void 0||s.session?.isCurrent(S)===!0)&&o?.getCurrentUserId()===U&&o?.serverAddress?.()===x&&o?.getUrl("/")===_&&o?.accessToken?.()===D&&C()===n}},f={cleanup(o){P.push(o)},installed:new Set,mutations:new Map,captureIdentity:T,capture(o){let S=h,C=T(),U=l.location.pathname+l.location.hash,x=a.state?._customTabContainer||document.getElementById("je-downloads-container"),_=o?(A.get(o)||0)+1:0;return o&&A.set(o,_),{current:()=>!q&&h===S&&(!o||A.get(o)===_)&&C.current()&&l.location.pathname+l.location.hash===U&&(!x||x.isConnected&&!x.closest(".hide, [hidden]")&&(!x.closest(".tabContent")||x.closest(".tabContent")?.classList.contains("is-active")===!0))}},invalidate(){h++,a.state&&(a.state.isLoading=!1,a.state.searchDebounceTimer!==null&&(clearTimeout(a.state.searchDebounceTimer),a.state.searchDebounceTimer=null))},listen(o,S,C,U=!1){o.addEventListener(S,C,U),P.push(()=>o.removeEventListener(S,C,U))},dispose(){q=!0,f.invalidate(),P.splice(0).forEach(o=>o()),a.state?.pollTimer&&(clearInterval(a.state.pollTimer),a.state.pollTimer=null)}};return a.runtime=f,f.listen(l,"hashchange",()=>f.invalidate()),f.listen(l,"popstate",()=>f.invalidate()),f.listen(l,"je:navigate",()=>f.invalidate()),f.listen(document,"viewhide",o=>{o.target instanceof Element&&(o.target.id==="je-downloads-page"||o.target.contains(a.state?._customTabContainer||document.getElementById("je-downloads-container")))&&f.invalidate()}),s.core?.lifecycle?.register("arr-requests-page").track(()=>f.dispose()),f}function X(i){let{JE:s,P:a,host:l,ctx:h,getApi:q}=i,A=G(i);if(A.installed.has("render-cards"))return;A.installed.add("render-cards");let P=a.state,T=a.getStatusColors,f=a.formatTimeRemaining,o=a.formatRelativeDate,S=a.getReleaseDateLabel,C=a.formatDownloadStats,U=a.resolveRequestStatus,x=a.getIssueMediaType,_=a.getIssueTmdbId,D=a.translateStatus,n=s.escapeHtml,L=s.cdn.selfhst("svg/sonarr.svg"),H=s.cdn.selfhst("svg/radarr-light-hybrid-light.svg"),Y=s.cdn.selfhst("svg/seerr.svg");function Q(e){let t=T(),r=t[(e.status||"unknown").toLowerCase()]||t.unknown,d=e.source==="Sonarr"?L:H,c=n(e.instanceName||e.source),u=e.posterUrl?`<img class="je-download-poster" src="${n(e.posterUrl)}" alt="" loading="lazy" onerror="this.style.display='none'">`:'<div class="je-download-poster placeholder"></div>',b=`
      <div class="je-download-progress-container">
        <div class="je-download-progress">
          <div class="je-download-progress-bar" style="width: ${Math.max(0,Math.min(100,e.progress||0))}%; background: ${r}"></div>
        </div>
        <div class="je-download-stats">
          <span>${Math.max(0,Math.min(100,e.progress||0))}%</span>
          ${e.timeRemaining?`<span>ETA: ${n(f(e.timeRemaining))}</span>`:""}
          ${e.totalSize?`<span>${C(e.totalSize,e.sizeRemaining)}</span>`:""}
        </div>
      </div>
    `;return`
      <div class="je-download-card" ${e.jellyfinMediaId?`data-media-id="${n(e.jellyfinMediaId)}"`:""}>
        <div class="je-download-card-content">
          ${u}
          <div class="je-download-info">
            <div class="je-download-title" title="${n(e.title||"")}">${n(e.title||s.t?.("requests_unknown")||"Unknown")}</div>
            ${e.subtitle?`<div class="je-download-subtitle" title="${n(e.subtitle)}">${n(e.subtitle)}</div>`:""}
            <div class="je-download-meta">
                <span class="je-download-badge je-arr-badge" title="${c}"><img src="${d}" alt="${c}" loading="lazy"></span>
              <span class="je-download-badge" style="background: ${r}">${n(D(e.status))}</span>
            </div>
          </div>
        </div>
        ${b}
      </div>
    `}function Z(e){let t=U(e.mediaStatus,e),r=S(e),d="";e.posterUrl?d=`<img class="je-request-poster" src="${n(e.posterUrl)}" alt="" loading="lazy">`:d='<div class="je-request-poster placeholder"></div>';let c="";e.requestedByAvatar&&(c=`<img class="je-request-avatar" data-avatar-src="${n(e.requestedByAvatar)}" alt="" loading="lazy" style="display:none" onerror="this.style.display='none'">`);let u="";if(e.jellyfinMediaId&&(e.mediaStatus==="Available"||e.mediaStatus==="Partially Available")){let g=s.t?.("jellyseerr_btn_available")||"Available";u=`<button class="je-request-watch-btn" title="${n(g)}" aria-label="${n(g)}" data-media-id="${n(e.jellyfinMediaId)}"><span class="material-icons">play_arrow</span></button>`}let b="";P.canApproveRequests&&e.requestStatus===1&&e.id&&(b=`
        <button class="je-request-approve-btn" data-request-id="${n(String(e.id))}" title="Approve"><span class="material-icons">check</span></button>
        <button class="je-request-decline-btn" data-request-id="${n(String(e.id))}" title="Decline"><span class="material-icons">close</span></button>
      `);let j="";if(r){let g=typeof r=="object"?r.label:r;j=`<span class="je-release-date-chip">${typeof r=="object"&&r.icon?`<span class="material-icons je-release-date-icon">${n(r.icon)}</span>`:""}${typeof g=="object"?g.text||"":n(g)}</span>`}let k="",I=s.pluginConfig?.JellyseerrEnabled!==!1&&s.pluginConfig?.JellyseerrShowDetailPageLink!==!1,R=O(h.peer("jellyseerrAPI")?.resolveJellyseerrBaseUrl?.()||"",l.location.href);if(e.tmdbId&&I&&R){let g=e.type==="tv"?"tv":"movie",m=s.t?.("jellyseerr_card_view_on_jellyseerr")||"View on Seerr";k=`<a is="emby-linkbutton" class="je-request-external-link" href="${n(N(R,`${g}/${e.tmdbId}`,l.location.href))}" target="_blank" rel="noopener noreferrer" title="${n(m)}" aria-label="${n(m)}"><img src="${Y}" alt="Seerr"></a>`}let $="";e.tmdbId&&($=`<div class="je-request-external-links" data-tmdb-id="${n(String(e.tmdbId))}" data-tvdb-id="${n(String(e.tvdbId||""))}" data-media-type="${n(e.type||"")}">${k}</div>`);let p=e.jellyfinMediaId?` data-media-id="${n(e.jellyfinMediaId)}"`:"",v=e.jellyfinMediaId?"je-request-title je-request-title-link":"je-request-title";return`
            <div class="je-request-card${e.isOrphaned?" je-request-card-orphaned":""}">
                <div class="je-request-poster-col">
                    ${d}
                    ${$}
                </div>
                <div class="je-request-info">
                    <div class="je-request-header">
                      <div>
                        <div class="je-request-title-row">
                          <div class="${v}"${p}>${n(e.title||"Unknown")}</div>
                          ${e.year?`<span class="je-request-year">(${n(e.year)})</span>`:""}
                        </div>
                        <span class="je-requests-status-chip ${n(t.className)}">${n(t.label)}</span>${j}
                      </div>
                    </div>
                    <div class="je-request-meta">
                      <div class="je-request-meta-left">
                        ${c}
                        <span>${n(e.requestedBy||"Unknown")}</span>
                        ${e.createdAt?`<span>&#8226;</span><span>${n(o(e.createdAt))}</span>`:""}
                      </div>
                    </div>
                    ${u||b?`<div class="je-request-actions">${u}${b}</div>`:""}
                </div>
            </div>
        `}function ee(e){return{1:s.t?.("jellyseerr_report_issue_type_video")||"Video",2:s.t?.("jellyseerr_report_issue_type_audio")||"Audio",3:s.t?.("jellyseerr_report_issue_type_subtitles")||"Subtitles",4:s.t?.("jellyseerr_report_issue_type_other")||"Other"}[e||4]||"Other"}function te(e){let t=String(e||"").toLowerCase(),r=s.t?.("jellyseerr_issue_resolved")||"Resolved",d=s.t?.("jellyseerr_issue_open")||"Open";return t==="2"||t==="resolved"?{label:r,className:"je-issue-status-resolved"}:{label:d,className:"je-issue-status-open"}}function ne(e){let t=e?.media||{};return t.title||t.name||t.originalTitle||t.originalName||"Unknown"}function se(e){let t=e?.media||{},r=t.releaseDate||t.firstAirDate||"";return!r||r.length<4?"":r.substring(0,4)}function re(e){let t=e?.media||{};return t.mediaInfo?.posterPath?`https://image.tmdb.org/t/p/w300${t.mediaInfo.posterPath}`:t.mediaInfo?.poster_path?`https://image.tmdb.org/t/p/w300${t.mediaInfo.poster_path}`:t.posterUrl?t.posterUrl:t.posterPath?`https://image.tmdb.org/t/p/w300${t.posterPath}`:""}function ae(e){let t=e?.media||{};return t.jellyfinMediaId||t.mediaInfo?.jellyfinMediaId||t.mediaInfo?.jellyfinMediaId4k||t.mediaInfo?.jellyfinMediaId4K||null}function oe(e){let t=e?.createdBy||{};return t.jellyfinUsername||t.displayName||t.username||t.email||"Unknown"}function ie(e){let t=e?.createdBy?.avatar;return t?t.startsWith("/")?q().getUrl("/JellyfinEnhanced/proxy/avatar",{path:t}):t:""}function le(e){return e?.message?e.message:(Array.isArray(e?.comments)?e.comments[0]:null)?.message||""}function de(e){let t=re(e),r=ne(e),d=se(e),c=ee(e?.issueType||e?.problemType),u=te(e?.status),b=oe(e),j=ie(e),k=le(e),I=x(e),R=_(e),$=!!(R&&I),p=ae(e),v=t?`<img class="je-request-poster" src="${n(t)}" alt="" loading="lazy" onerror="this.style.display='none'">`:'<div class="je-request-poster placeholder"></div>',g=j?`<img class="je-request-avatar" data-avatar-src="${n(j)}" alt="" loading="lazy" style="display:none" onerror="this.style.display='none'">`:"";return`
      <div class="je-issue-card" ${p?`data-media-id="${n(p)}"`:""}>
        ${v}
        <div class="je-issue-info">
          <div class="je-issue-title-row">
            <div class="je-issue-title">${n(r)}${d?` <span class="je-request-year">(${n(d)})</span>`:""}</div>
            <span class="je-issue-status-chip ${u.className}">${n(u.label)}</span>
            <span class="je-issue-type-chip">${n(c)}</span>
          </div>
          ${k?`<div class="je-issue-message">${n(k)}</div>`:""}
          <div class="je-issue-summary">
            ${g}
            <span>${n(b)}</span>
            ${e?.createdAt?`<span>&#8226;</span><span>${n(o(e.createdAt))}</span>`:""}
            <button class="je-issue-view-btn ${$?"":"is-disabled"}" type="button" aria-label="View issue" ${$?`data-issue-tmdb-id="${n(R)}" data-issue-media-type="${n(I)}" data-issue-title="${n(r)}"`:"disabled"}>
              <span class="material-icons">visibility</span>
            </button>
          </div>
        </div>
      </div>
    `}function ce(e){let t=e.source==="Sonarr"?L:H,r=n(e.instanceName||e.source),d=e.eventType==="partial",c=e.eventType==="imported",u=d?s.t?.("downloads_history_partial")||"Partially Imported":c?s.t?.("downloads_history_imported")||"Imported":s.t?.("downloads_history_failed")||"Import Failed",b=d?"je-chip-partial":c?"je-chip-available":"je-chip-declined",j=e.episodeCount?(s.t?.("downloads_history_partial_summary")||"{imported}/{total} episodes imported").replace("{imported}",String(e.importedCount??0)).replace("{total}",String(e.episodeCount)):null;return`
      <div class="je-request-card">
        ${e.posterUrl?`<img class="je-request-poster" src="${n(e.posterUrl)}" alt="" loading="lazy" onerror="this.style.display='none'">`:'<div class="je-request-poster placeholder"></div>'}
        <div class="je-request-info">
          <div class="je-request-header">
            <div>
              <div class="je-request-title-row">
                <div class="je-request-title">${n(e.title||s.t?.("requests_unknown")||"Unknown")}</div>
                ${e.subtitle?`<span class="je-request-year">${n(e.subtitle)}</span>`:""}
              </div>
              <span class="je-requests-status-chip ${b}">${n(u)}</span>
              ${j?`<span class="je-download-subtitle">${n(j)}</span>`:""}
            </div>
          </div>
          <div class="je-request-meta">
            <div class="je-request-meta-left">
              <span class="je-download-badge je-arr-badge" title="${r}"><img src="${t}" alt="${r}" loading="lazy"></span>
              <span>${n(r)}</span>
              ${e.date?`<span>&#8226;</span><span>${n(o(e.date))}</span>`:""}
            </div>
          </div>
        </div>
      </div>
    `}function ue(e){let t=T(),r=e.item,d=t[(r.status||"unknown").toLowerCase()]||t.unknown,c=r.posterUrl?`<img class="je-download-poster" src="${n(r.posterUrl)}" alt="" loading="lazy" onerror="this.style.display='none'">`:'<div class="je-download-poster placeholder"></div>',u=e.episodes[0]?.totalSize||0,b=e.episodes[0]?.sizeRemaining||0,j=e.episodes.every($=>$.totalSize===u&&$.sizeRemaining===b),k=j?u:e.episodes.reduce(($,p)=>$+(p.totalSize||0),0),I=j?b:e.episodes.reduce(($,p)=>$+(p.sizeRemaining||0),0),R=`
      <div class="je-download-progress-container">
        <div class="je-download-progress">
          <div class="je-download-progress-bar" style="width: ${Math.max(0,Math.min(100,r.progress||0))}%; background: ${d}"></div>
        </div>
        <div class="je-download-stats">
          <span>${Math.max(0,Math.min(100,r.progress||0))}%</span>
          ${r.timeRemaining?`<span>ETA: ${n(f(r.timeRemaining))}</span>`:""}
          ${k?`<span>${C(k,I)}</span>`:""}
        </div>
      </div>
    `;return`
      <div class="je-download-card je-season-pack" ${r.jellyfinMediaId?`data-media-id="${n(r.jellyfinMediaId)}"`:""}>
        <div class="je-download-card-content">
          ${c}
          <div class="je-download-info">
            <div class="je-download-title" title="${n(r.title||"")}">${n(r.title||s.t?.("requests_unknown")||"Unknown")}</div>
            <div class="je-download-subtitle">${s.t?.("requests_season")||"Season"} ${r.seasonNumber} (${e.episodeCount} ${s.t?.("requests_episodes")||"episodes"})</div>
            <div class="je-download-meta">
              <span class="je-download-badge je-arr-badge" title="Sonarr"><img src="${L}" alt="Sonarr" loading="lazy"></span>
              <span class="je-download-badge" style="background: ${d}">${n(D(r.status))}</span>
              <span class="je-download-badge" style="background: rgba(128,128,128,0.4)">${e.episodeRange}</span>
            </div>
          </div>
        </div>
        ${R}
      </div>
    `}function pe(e){let t=[];return e&&e.split(`
`).forEach(r=>{let d=r.trim();if(!d)return;let c=d.split("|").map(u=>u.trim());c.length===2&&c[0]&&c[1]&&t.push({jellyfinUrl:c[0],arrUrl:c[1]})}),t}function me(e,t){if(!t)return null;if(!e||e.length===0)return t;let d=(l.ApiClient?.serverAddress?.()||window.location.origin).replace(/\/+$/,"").toLowerCase();for(let c of e){let u=c.jellyfinUrl.replace(/\/+$/,"").toLowerCase();if(d===u)return c.arrUrl.replace(/\/$/,"")}return t.replace(/\/$/,"")}let B=100,F=6,E=null;function ge(e,t,r){let d=(r?.matches||[])[0],c=d?me(pe(d.urlMappings||""),d.instanceUrl):null,u=O(c||"",l.location.href);return e==="movie"?u?`<a is="emby-linkbutton" class="je-request-external-link" href="${n(N(u,`movie/${encodeURIComponent(t)}`,l.location.href))}" target="_blank" rel="noopener noreferrer" title="Open in Radarr" aria-label="Open in Radarr"><img src="${H}" alt="Radarr"></a>`:null:!u||!d?.titleSlug?null:`<a is="emby-linkbutton" class="je-request-external-link" href="${n(N(u,`series/${encodeURIComponent(d.titleSlug)}`,l.location.href))}" target="_blank" rel="noopener noreferrer" title="Open in Sonarr" aria-label="Open in Sonarr"><img src="${L}" alt="Sonarr"></a>`}async function fe(e){let t=A.capture();if(!t.current()||!(s.pluginConfig?.ArrLinksEnabled===!0)||!s.helpers.isAdmin())return;let d=e.querySelectorAll(".je-request-external-links[data-tmdb-id]");if(!d.length)return;let c=[];if(d.forEach(p=>{let v=p.getAttribute("data-tmdb-id"),g=p.getAttribute("data-tvdb-id"),m=p.getAttribute("data-media-type")==="tv"?"tv":"movie";if(!v)return;let w=(m==="movie"?v:g||"").trim();!/^\d+$/.test(w)||!(Number(w)>0)||Number(w)>2147483647||c.push({slot:p,mediaType:m,tmdbId:v,id:String(Number(w))})}),!c.length)return;let u=[],b=[];for(let[p,v,g]of[["movie","tmdbIds","movies"],["tv","tvdbIds","series"]]){let m=[...new Set(c.filter(y=>y.mediaType===p).map(y=>y.id))],w=y=>({param:v,field:g,query:`${v}=${y.join(",")}`});if(m.length){u.push(w(m.slice(0,F)));for(let y=F;y<m.length;y+=B)b.push(w(m.slice(y,y+B)))}}let j=[...u,...b],k=JSON.stringify([s.session?.getEpoch(),l.ApiClient?.getCurrentUserId(),l.ApiClient?.serverAddress?.(),j.map(p=>p.query)]),I=E;if(!I||I.key!==k||I.controller.signal.aborted){I&&I.controller.abort();let p=new AbortController,v=s.core.lifecycle?.register("arr-requests-page");v?.track(p);let g=j.map(w=>({field:w.field,promise:s.core.api.plugin(`/arr/links?${w.query}`,{signal:p.signal,priority:"low"}).then(W).catch(()=>null)})),m={key:k,controller:p,chunks:g};Promise.all(g.map(w=>w.promise)).then(()=>{v?.untrack(p),E===m&&(E=null)}),I=m,E=m}let{controller:R,chunks:$}=I;await Promise.all($.map(async({field:p,promise:v})=>{let m=(await v)?.[p];if(!t.current()||!s.helpers.isAdmin()||s.pluginConfig?.ArrLinksEnabled!==!0||R.signal.aborted||!m||typeof m!="object")return;let w=p==="movies"?"movie":"tv";for(let y of c){if(y.mediaType!==w||!y.slot.isConnected||!Object.prototype.hasOwnProperty.call(m,y.id))continue;let J=ge(w,y.tmdbId,m[y.id]);J&&y.slot.insertAdjacentHTML("beforeend",J)}}))}a.renderDownloadCard=Q,a.renderRequestCard=Z,a.hydrateExternalLinks=fe,a.renderIssueCard=de,a.renderHistoryCard=ce,a.renderSeasonPackCard=ue}X(V());})();
})();
