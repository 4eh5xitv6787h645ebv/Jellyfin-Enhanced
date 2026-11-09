(() => {
"use strict";(()=>{function U(u,t,s){let d=t.core?.featureContext;if(typeof d!="function")throw new Error(`${u}: JE.core.featureContext is missing; core/ui-kit.js must load before feature scripts`);return d(u,t,s)}function B(){var f;let u=window,t=u.JellyfinEnhanced;if(!t)throw new Error("Downloads loaded before Jellyfin Enhanced");let s=U("downloads",t,{facades:["downloadsPage","initializeDownloadsPage"],internalSlots:["requestsPage"],internalsObject:()=>t.internals||(t.internals={})}),d=(f=s.own).requestsPage||(f.requestsPage={});return{JE:t,P:d,host:u,ctx:s,getApi:()=>{if(!u.ApiClient)throw new Error("API client unavailable");return u.ApiClient}}}function V(u){if(u.P.runtime)return u.P.runtime;let{JE:t,P:s,host:d}=u,f=0,k=!1,q=new Map,e=[],D=()=>{let a=d.ApiClient,v=t.session?.getEpoch(),h=()=>typeof a?.serverId=="function"?a.serverId():a?.serverId,P=a?.getCurrentUserId(),j=a?.serverAddress?.(),x=a?.getUrl("/"),A=a?.accessToken?.(),I=h();return{current:()=>!k&&d.ApiClient===a&&(v===void 0||t.session?.isCurrent(v)===!0)&&a?.getCurrentUserId()===P&&a?.serverAddress?.()===j&&a?.getUrl("/")===x&&a?.accessToken?.()===A&&h()===I}},b={cleanup(a){e.push(a)},installed:new Set,mutations:new Map,captureIdentity:D,capture(a){let v=f,h=D(),P=d.location.pathname+d.location.hash,j=s.state?._customTabContainer||document.getElementById("je-downloads-container"),x=a?(q.get(a)||0)+1:0;return a&&q.set(a,x),{current:()=>!k&&f===v&&(!a||q.get(a)===x)&&h.current()&&d.location.pathname+d.location.hash===P&&(!j||j.isConnected&&!j.closest(".hide, [hidden]")&&(!j.closest(".tabContent")||j.closest(".tabContent")?.classList.contains("is-active")===!0))}},invalidate(){f++,s.state&&(s.state.isLoading=!1,s.state.searchDebounceTimer!==null&&(clearTimeout(s.state.searchDebounceTimer),s.state.searchDebounceTimer=null))},listen(a,v,h,P=!1){a.addEventListener(v,h,P),e.push(()=>a.removeEventListener(v,h,P))},dispose(){k=!0,b.invalidate(),e.splice(0).forEach(a=>a()),s.state?.pollTimer&&(clearInterval(s.state.pollTimer),s.state.pollTimer=null)}};return s.runtime=b,b.listen(d,"hashchange",()=>b.invalidate()),b.listen(d,"popstate",()=>b.invalidate()),b.listen(d,"je:navigate",()=>b.invalidate()),b.listen(document,"viewhide",a=>{a.target instanceof Element&&(a.target.id==="je-downloads-page"||a.target.contains(s.state?._customTabContainer||document.getElementById("je-downloads-container")))&&b.invalidate()}),t.core?.lifecycle?.register("arr-requests-page").track(()=>b.dispose()),b}function G(u){let{JE:t,P:s,host:d,ctx:f,getApi:k}=u,q=V(u);if(q.installed.has("render"))return;q.installed.add("render");let e=s.state,D=s.translateStatus,b=s.getDownloadStatuses,a=s.getFilteredDownloads,v=s.groupDownloads,h=s.renderDownloadCard,P=s.renderRequestCard,j=s.renderIssueCard,x=s.renderHistoryCard,A=s.renderSeasonPackCard,I=s.clearAvatarObjectUrlCache,$=s.hydrateAvatarImages,R=s.hydrateExternalLinks,z=s.loadAllData,H=s.handleRequestAction;function L(){let n="";if(t.pluginConfig?.JellyseerrEnabled){n+='<div class="je-downloads-section je-requests-section">';let r=t.t&&t.t("requests_requests")||"Requests";n+=`<h2><span class="je-msym-rounded je-section-icon" aria-hidden="true">playlist_add_check</span>${r}</h2>`;let o=t.t&&t.t("jellyseerr_discover_all")||"All",E=t.t&&t.t("jellyseerr_btn_pending")||"Pending Approval",g=t.t&&t.t("jellyseerr_btn_processing")||"Processing",M=t.t&&t.t("jellyseerr_btn_available")||"Available",_=t.t&&t.t("requests_coming_soon")||"Coming Soon";if(n+=`
            <div class="je-requests-tabs">
              <button is="emby-button" type="button" class="je-requests-tab emby-button ${e.requestsFilter==="all"?"active":""}" onclick="window.JellyfinEnhanced.downloadsPage.filterRequests('all')">${o}</button>
              <button is="emby-button" type="button" class="je-requests-tab emby-button ${e.requestsFilter==="pending"?"active":""}" onclick="window.JellyfinEnhanced.downloadsPage.filterRequests('pending')">${E}</button>
              <button is="emby-button" type="button" class="je-requests-tab emby-button ${e.requestsFilter==="processing"?"active":""}" onclick="window.JellyfinEnhanced.downloadsPage.filterRequests('processing')">${g}</button>
              <button is="emby-button" type="button" class="je-requests-tab emby-button ${e.requestsFilter==="comingsoon"?"active":""}" onclick="window.JellyfinEnhanced.downloadsPage.filterRequests('comingsoon')">${_}</button>
              <button is="emby-button" type="button" class="je-requests-tab emby-button ${e.requestsFilter==="available"?"active":""}" onclick="window.JellyfinEnhanced.downloadsPage.filterRequests('available')">${M}</button>
            </div>
          `,e.isLoading&&e.requests.length===0)n+=t.core.ui.skeletonGridHtml(6);else if(e.requestsError)n+='<div class="je-empty-state">Unable to load requests</div>';else if(e.requests.length===0)n+=`
                    <div class="je-empty-state">
                        <div>${t.t?.("requests_no_requests_found")||"No requests found"}</div>
                    </div>
                `;else{let w=e.requests,i=f.peer("hiddenContent");i&&(w=i.filterRequestItems(w)),e.requestsFilter==="processing"&&(w=w.filter(l=>l.mediaStatus!=="Partially Available")),w.length===0?n+=`
                    <div class="je-empty-state">
                        <div>${t.t?.("requests_no_requests_found")||"No requests found"}</div>
                    </div>
                `:(n+='<div class="je-downloads-grid je-requests-grid">',w.forEach(l=>{n+=P(l)}),n+="</div>",e.requestsTotalPages>1&&(n+=`
                        <div class="je-pagination">
                            <button is="emby-button" type="button" class="emby-button" onclick="window.JellyfinEnhanced.downloadsPage.prevPage()" ${e.requestsPage<=1?"disabled":""}><span class="material-icons">chevron_left</span></button>
                            <span>${e.requestsPage} / ${e.requestsTotalPages}</span>
                            <button is="emby-button" type="button" class="emby-button" onclick="window.JellyfinEnhanced.downloadsPage.nextPage()" ${e.requestsPage>=e.requestsTotalPages?"disabled":""}><span class="material-icons">chevron_right</span></button>
                        </div>
                    `))}n+="</div>"}return n}function O(){let n="";if(t.pluginConfig?.JellyseerrEnabled&&t.pluginConfig?.DownloadsPageShowIssues){n+='<div class="je-downloads-section je-issues-section">';let r=t.t&&t.t("jellyseerr_existing_issues")||"Issues";n+=`<h2><span class="je-msym-rounded je-section-icon" aria-hidden="true">warning</span>${r}</h2>`;let o=t.t&&t.t("jellyseerr_issue_open")||"Open",E=t.t&&t.t("jellyseerr_issue_resolved")||"Resolved";n+=`
        <div class="je-issues-tabs">
          <button is="emby-button" type="button" class="je-issues-tab emby-button ${e.issuesFilter==="open"?"active":""}" onclick="window.JellyfinEnhanced.downloadsPage.filterIssues('open')">${o}</button>
          <button is="emby-button" type="button" class="je-issues-tab emby-button ${e.issuesFilter==="resolved"?"active":""}" onclick="window.JellyfinEnhanced.downloadsPage.filterIssues('resolved')">${E}</button>
        </div>
      `,e.isLoading&&e.issues.length===0?n+=t.core.ui.skeletonGridHtml(6):e.issuesError?n+=`
          <div class="je-empty-state">
            <div>${t.t?.("jellyseerr_load_issues_error")||"Unable to load issues"}</div>
          </div>
        `:e.issues.length===0?n+=`
          <div class="je-empty-state">
            <div>${t.t?.("jellyseerr_no_issues_yet")||"No issues found"}</div>
          </div>
        `:(n+='<div class="je-downloads-grid je-issues-grid">',e.issues.forEach(g=>{n+=j(g)}),n+="</div>",e.issuesTotalPages>1&&(n+=`
            <div class="je-pagination">
              <button is="emby-button" type="button" class="emby-button" onclick="window.JellyfinEnhanced.downloadsPage.prevIssuesPage()" ${e.issuesPage<=1?"disabled":""}><span class="material-icons">chevron_left</span></button>
              <span>${e.issuesPage} / ${e.issuesTotalPages}</span>
              <button is="emby-button" type="button" class="emby-button" onclick="window.JellyfinEnhanced.downloadsPage.nextIssuesPage()" ${e.issuesPage>=e.issuesTotalPages?"disabled":""}><span class="material-icons">chevron_right</span></button>
            </div>
          `)),n+="</div>"}return n}function J(){let n="";if(t.pluginConfig?.ShowDownloadsInRequests!==!1&&t.pluginConfig?.DownloadsShowHistory!==!1&&e.historyVisible!==!1){n+='<div class="je-downloads-section je-history-section">';let r=t.t&&t.t("requests_history")||"History";if(n+=`<h2><span class="je-msym-rounded je-section-icon" aria-hidden="true">history</span>${r}</h2>`,e.isLoading&&e.history.length===0)n+=t.core.ui.skeletonGridHtml(6);else if(e.historyError)n+='<div class="je-empty-state">Unable to load history</div>';else if(e.history.length===0){let o=t.t&&t.t("requests_no_history_found")||"No history found";n+=`
          <div class="je-empty-state">
            <div>${o}</div>
          </div>
        `}else n+='<div class="je-downloads-grid je-history-grid">',e.history.forEach(o=>{n+=x(o)}),n+="</div>",e.historyTotalPages>1&&(n+=`
            <div class="je-pagination">
              <button is="emby-button" type="button" class="emby-button" onclick="window.JellyfinEnhanced.downloadsPage.prevHistoryPage()" ${e.historyPage<=1?"disabled":""}><span class="material-icons">chevron_left</span></button>
              <span>${e.historyPage} / ${e.historyTotalPages}</span>
              <button is="emby-button" type="button" class="emby-button" onclick="window.JellyfinEnhanced.downloadsPage.nextHistoryPage()" ${e.historyPage>=e.historyTotalPages?"disabled":""}><span class="material-icons">chevron_right</span></button>
            </div>
          `);n+="</div>"}return n}function T(n){let r;if(n)e._customTabContainer=n,r=n;else if(e._customTabContainer&&document.contains(e._customTabContainer)&&window.location.hash.indexOf("userpluginsettings")===-1)r=e._customTabContainer;else if(e._customTabContainer=null,r=document.getElementById("je-downloads-container"),!r)return;let o="";if(t.pluginConfig?.ShowDownloadsInRequests!==!1){o+='<div class="je-downloads-section je-active-downloads-section" style="margin-top: 2em;">';let i=t.t&&t.t("requests_downloads")||"Downloads";if(o+=`
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1em;">
        <h2 style="margin: 0.5em 0 0 0;"><span class="je-msym-rounded je-section-icon" aria-hidden="true">download</span>${i}</h2>
        <button class="je-refresh-btn emby-button" style="background: transparent; border: 1px solid rgba(255,255,255,0.3); color: inherit; padding: 0.5em; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 0.5em; opacity: 0.8; transition: all 0.2s;">
          <span class="material-icons" style="font-size: 18px;">refresh</span>
        </button>
      </div>
    `,e.isLoading&&e.downloads.length===0)o+=t.core.ui.skeletonGridHtml(6);else if(e.downloadsError)o+='<div class="je-empty-state">Unable to load downloads</div>';else if(e.downloads.length===0){let l=t.t&&t.t("requests_no_active_downloads")||"No active downloads";o+=`
        <div class="je-empty-state">
          <div>${l}</div>
        </div>
      `}else{let l=b(),y=e.downloads.length>0;if(l.length>1||y){if(o+='<div class="je-downloads-controls">',l.length>0){let p=l.reduce((c,[m,S])=>c+S,0);o+='<div class="je-downloads-tabs">',o+=`<button is="emby-button" type="button" class="je-downloads-tab emby-button ${e.downloadsActiveTab==="all"?"active":""}" data-tab="all">
            <span>${D("All")}</span>
            <span class="je-downloads-tab-count">${p}</span>
          </button>`;for(let[c,m]of l)o+=`<button is="emby-button" type="button" class="je-downloads-tab emby-button ${e.downloadsActiveTab===c?"active":""}" data-tab="${t.escapeHtml(c)}">
              <span>${t.escapeHtml(D(c))}</span>
              <span class="je-downloads-tab-count">${m}</span>
            </button>`;y&&(o+=`<button class="je-downloads-search-toggle ${e.downloadsSearchVisible?"active":""}">
              <span class="material-icons">search</span>
            </button>`),o+="</div>"}y&&e.downloadsSearchVisible&&(o+=`<div class="je-downloads-search-container">
            <span class="material-icons je-downloads-search-icon">search</span>
            <input type="text" class="je-downloads-search-input" value="${t.escapeHtml(e.downloadsSearchQuery)}" autofocus>
          </div>`),o+="</div>"}let C=a();if(C.length===0){let p=t.t&&t.t("requests_no_downloads_found")||"No downloads found";o+=`
          <div class="je-empty-state">
            <div>${p}</div>
          </div>
        `}else{let p=v(C);o+='<div class="je-downloads-grid">';for(let c of p)c.type==="seasonPack"?o+=A(c):o+=h(c.item);o+="</div>"}}o+="</div>"}o+=L(),o+=O(),o+=J(),I(),r.innerHTML=o,$(r),R(r);let g=r.querySelector(".je-refresh-btn");g&&g.addEventListener("click",i=>{i.preventDefault();let l=g.querySelector(".material-icons");l&&(l.style.animation="spin 1s linear",setTimeout(()=>{l.style.animation=""},1e3)),z()}),r.querySelectorAll(".je-downloads-tab").forEach(i=>{i.addEventListener("click",l=>{l.preventDefault();let y=i.getAttribute("data-tab");e.downloadsActiveTab=y||"all",T()})});let _=r.querySelector(".je-downloads-search-toggle");_&&_.addEventListener("click",i=>{i.preventDefault(),e.downloadsSearchVisible=!e.downloadsSearchVisible,e.downloadsSearchVisible||(e.downloadsSearchQuery=""),T()});let w=r.querySelector(".je-downloads-search-input");w&&w.addEventListener("input",i=>{let l=q.capture(),y=w.value;e.downloadsSearchQuery=y,e.searchDebounceTimer&&clearTimeout(e.searchDebounceTimer),e.searchDebounceTimer=setTimeout(()=>{if(!l.current())return;let C=document.querySelector(".je-downloads-search-input"),p=C?C.selectionStart:0;T();let c=document.querySelector(".je-downloads-search-input");c&&(c.focus(),c.setSelectionRange(p,p))},300)}),r.dataset.jeRequestsActionsBound||(r.dataset.jeRequestsActionsBound="true",r.addEventListener("click",i=>{if(!(i.target instanceof Element))return;let l=i.target.closest(".je-request-watch-btn");if(l){i.preventDefault(),i.stopPropagation();let m=l.getAttribute("data-media-id");m&&d.Emby?.Page?.showItem&&d.Emby.Page.showItem(m);return}let y=i.target.closest(".je-request-approve-btn");if(y){i.preventDefault(),i.stopPropagation(),H(y,"approve");return}let C=i.target.closest(".je-request-decline-btn");if(C){i.preventDefault(),i.stopPropagation(),H(C,"decline");return}let p=i.target.closest(".je-issue-view-btn");if(p&&!p.classList.contains("is-disabled")){i.preventDefault(),i.stopPropagation();let m=p.getAttribute("data-issue-tmdb-id"),S=p.getAttribute("data-issue-media-type"),Q=p.getAttribute("data-issue-title")||"",N=f.peer("jellyseerrIssueReporter");m&&S&&N?.showReportModal&&N.showReportModal(m,Q,S,null,null);return}let c=i.target.closest(".je-download-card, .je-request-card, .je-issue-card");if(c){let m=c.getAttribute("data-media-id");m&&d.Emby?.Page?.showItem&&d.Emby.Page.showItem(m)}}))}function W(){let n=document.getElementById("je-downloads-page");if(!n){n=document.createElement("div"),n.id="je-downloads-page",n.className="page type-interior mainAnimatedPage hide",n.setAttribute("data-title",t.t?.("requests_requests")||"Requests"),n.setAttribute("data-backbutton","true"),n.setAttribute("data-url","#/downloads"),n.setAttribute("data-type","custom"),n.innerHTML=`
        <div data-role="content">
          <div class="content-primary je-downloads-page">
            <div id="je-downloads-container" style="padding-top: 5em;"></div>
          </div>
        </div>
      `;let r=document.querySelector(".mainAnimatedPages");r?r.appendChild(n):document.body.appendChild(n)}return n}let F={requests:{selector:".je-requests-section",build:L},issues:{selector:".je-issues-section",build:O},history:{selector:".je-history-section",build:J}};function K(n){let o=(e._customTabContainer&&document.contains(e._customTabContainer)&&window.location.hash.indexOf("userpluginsettings")===-1?e._customTabContainer:document.getElementById("je-downloads-container"))?.querySelector(F[n].selector);if(!o){T();return}let E=document.createElement("template");E.innerHTML=F[n].build();let g=E.content.firstElementChild;if(!g){o.remove();return}o.replaceWith(g),$(g),R(g)}s.renderPage=T,s.renderSection=K,s.createPageContainer=W}G(B());})();
})();
