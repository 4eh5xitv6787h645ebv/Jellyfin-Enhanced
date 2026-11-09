(() => {
"use strict";(()=>{function F(t){if(/^\d{4}-\d{2}-\d{2}$/.test(t)){let[o=0,i=0,e=0]=t.split("-").map(Number),y=new Date(o,i-1,e);return y.getFullYear()!==o||y.getMonth()!==i-1||y.getDate()!==e?new Date(NaN):y}return new Date(t)}function A(t,o,i){let e=o.core?.featureContext;if(typeof e!="function")throw new Error(`${t}: JE.core.featureContext is missing; core/ui-kit.js must load before feature scripts`);return e(t,o,i)}function O(){var b;let t=window,o=t.JellyfinEnhanced;if(!o)throw new Error("Calendar loaded before Jellyfin Enhanced");o.internals||(o.internals={});let e=(b=o.internals).calendarPage||(b.calendarPage={}),y=A("calendar",o,{facades:["initializeCalendarPage"],internalSlots:["calendarLifetime","calendarPage"],internalsObject:()=>o.internals||(o.internals={})});return{JE:o,ctx:y,host:t,P:e}}(function(){"use strict";let{JE:t,ctx:o,P:i}=O(),e=i.state,y=i.STATUS_COLORS,b=i.filterEvents,C=i.groupEventsByDate,_=i.getRangeForView,L=i.getDaysInMonth,R=i.getFirstDayOfMonth,x=i.isTodayDate,H=i.formatRangeLabel,q=i.formatHourLabel,E=i.renderEvent,N=i.renderAgendaEvent,h=i.renderCardItems,$=i.compareEventsWithinDay,k=i.collapseEpisodes;function S(){return window.matchMedia?window.matchMedia("(max-width: 768px)").matches:!1}function M(){let n=document.querySelector(".je-calendar-sidebar"),a=document.querySelector(".je-calendar-sidebar-toggle");!n||!a||(n.classList.toggle("is-collapsed",!!e.sidebarCollapsed),a.setAttribute("aria-expanded",e.sidebarCollapsed?"false":"true"))}function J(n){e.sidebarCollapsed=!!n,M()}function W(){typeof e.sidebarCollapsed!="boolean"&&(e.sidebarCollapsed=S()),J(!e.sidebarCollapsed)}function U(){document.querySelectorAll(".je-calendar-mode-btn").forEach(a=>{let u=a.dataset.mode;a.classList.toggle("active",u===e.settings.displayMode)})}function z(){let n=new Date(e.currentDate);n.setHours(0,0,0,0),n.setDate(1);let a=L(n),u=R(n),g=b(e.events),f=o.peer("hiddenContent");f&&(g=f.filterCalendarEvents(g));let p=C(g);if(g.length===0)return`<div class="je-calendar-empty">${t.t("calendar_no_releases")}</div>`;let d=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],l=d.indexOf(e.settings.firstDayOfWeek),m=[...d.slice(l),...d.slice(0,l)],r='<div class="je-calendar-month">';r+='<div class="je-calendar-weekdays">',m.forEach(s=>{r+=`<div class="je-calendar-weekday">${s.substring(0,3)}</div>`}),r+="</div>",r+='<div class="je-calendar-month-grid">';for(let s=0;s<u;s++)r+='<div class="je-calendar-day je-calendar-day-placeholder" style="opacity: 0.3;"></div>';for(let s=1;s<=a;s++){let v=n.getFullYear(),c=String(n.getMonth()+1).padStart(2,"0"),w=String(s).padStart(2,"0"),P=`${v}-${c}-${w}`,j=p[P]||[];j.sort($),j=k(j);let T=new Date(v,n.getMonth(),s),X=x(T)?" je-calendar-today":"",Z=(d[T.getDay()]||"").substring(0,3);r+=`
        <div class="je-calendar-day${X}">
          <div class="je-calendar-day-header">
            <span class="je-calendar-day-number">${s}</span>
            <span class="je-calendar-month-day-name">${Z}</span>
          </div>
          <div class="${e.settings.displayMode==="cards"?"je-calendar-day-cards":"je-calendar-events-list"}">
            ${e.settings.displayMode==="cards"?h(j):j.map(ee=>E(ee)).join("")}
          </div>
        </div>
      `}return r+="</div></div>",r}function V(){let{start:n}=_(e.currentDate,"week"),a=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],u=b(e.events),g=o.peer("hiddenContent");g&&(u=g.filterCalendarEvents(u));let f=C(u);if(u.length===0)return`<div class="je-calendar-empty">${t.t("calendar_no_releases")}</div>`;let p='<div class="je-calendar-grid">';for(let d=0;d<7;d++){let l=new Date(n);l.setDate(n.getDate()+d);let m=l.getFullYear(),r=String(l.getMonth()+1).padStart(2,"0"),s=String(l.getDate()).padStart(2,"0"),v=`${m}-${r}-${s}`,c=f[v]||[];c.sort($),c=k(c);let w=x(l)?" je-calendar-today":"";p+=`
        <div class="je-calendar-day${w}">
          <div class="je-calendar-day-header">
            <span class="je-calendar-day-number">${l.getDate()}</span>
            <span class="je-calendar-day-name">${(a[l.getDay()]||"").substring(0,3)}</span>
          </div>
          <div class="${e.settings.displayMode==="cards"?"je-calendar-day-cards":"je-calendar-events-list"}">
            ${e.settings.displayMode==="cards"?h(c):c.map(P=>E(P)).join("")}
          </div>
        </div>
      `}return p+="</div>",p}function B(){let n=b(e.events),a=o.peer("hiddenContent");a&&(n=a.filterCalendarEvents(n));let u=C(n),g=Object.keys(u).sort();if(g.length===0)return`<div class="je-calendar-empty">${t.t("calendar_no_releases")}</div>`;let f='<div class="je-calendar-agenda">';return g.forEach(p=>{let[d="0",l="1",m="1"]=p.split("-"),r=new Date(parseInt(d),parseInt(l)-1,parseInt(m)),s=r.toLocaleDateString(void 0,{weekday:"short"}),v=r.toLocaleDateString(void 0,{month:"short",day:"numeric"}),c=u[p]||[];c.sort($),c=k(c),f+=`
        <div class="je-calendar-agenda-row">
          <div class="je-calendar-agenda-date">
            <div>${s}, ${v}</div>
          </div>
          <div class="je-calendar-agenda-events">
            ${c.map(w=>N(w)).join("")}
          </div>
        </div>
      `}),f+="</div>",f}function K(){let n=b(e.events),a=o.peer("hiddenContent");a&&(n=a.filterCalendarEvents(n));let u=C(n),g=new Date(e.currentDate),f=`${g.getFullYear()}-${String(g.getMonth()+1).padStart(2,"0")}-${String(g.getDate()).padStart(2,"0")}`,p=u[f]||[];if(p.sort($),p=k(p),p.length===0)return`<div class="je-calendar-empty">${t.t("calendar_no_releases")}</div>`;if(e.settings.displayMode==="cards")return`
        <div class="je-calendar-dayline je-calendar-day-cards">
          ${h(p)}
        </div>
      `;let d={allDay:[],hours:new Map};p.forEach(r=>{let s=F(r.releaseDate);if(Number.isNaN(s.getTime())){d.allDay.push(r);return}if(!!(s.getHours()===0&&s.getMinutes()===0)){d.allDay.push(r);return}let c=s.getHours();d.hours.has(c)||d.hours.set(c,[]),d.hours.get(c)?.push(r)});let l='<div class="je-calendar-day-hours">';for(let r=0;r<24;r+=1){let s=d.hours.get(r);if(!s||s.length===0)continue;let v=e.settings.displayMode==="cards"?"je-calendar-hour-events je-calendar-day-cards":"je-calendar-hour-events";l+=`
        <div class="je-calendar-hour-row">
          <div class="je-calendar-hour-label">${q(r)}</div>
          <div class="${v}">
            ${e.settings.displayMode==="cards"?h(s):s.map(c=>E(c)).join("")}
          </div>
        </div>
      `}let m=t.t?.("calendar_all_day")||"All day";if(d.allDay.length){let r=d.allDay,s=e.settings.displayMode==="cards"?"je-calendar-hour-events je-calendar-day-cards":"je-calendar-hour-events";l+=`
        <div class="je-calendar-hour-row">
          <div class="je-calendar-hour-label">${m}</div>
          <div class="${s}">
            ${e.settings.displayMode==="cards"?h(r):r.map(v=>E(v)).join("")}
          </div>
        </div>
      `}return l+="</div>",l}function Y(){return e.error&&!e.events.length||e.requestError&&(e.settings.forceOnlyRequested||e.activeFilters.has("Requests"))?`<div class="je-calendar-error" role="alert">${t.escapeHtml(e.error||e.requestError||"")}<button onclick="window.JellyfinEnhanced.calendarPage.refresh()">Retry</button></div>`:e.viewMode==="week"?V():e.viewMode==="agenda"?B():e.viewMode==="day"?K():z()}function G(){let n=e.activeFilters.size>0,a=c=>n?e.activeFilters.has(c)?"active":"inactive":"",u=!!t.pluginConfig?.JellyseerrEnabled&&!e.settings.forceOnlyRequested,g=t.t?.("requests_requests")||"Requests",f=u?`<div class="je-calendar-legend-item ${a("Requests")}" onclick="window.JellyfinEnhanced.calendarPage.toggleFilter('Requests'); event.stopPropagation();">
          <span class="je-msym-rounded" style="color: #6f63f2; font-size: 18px;">download</span>
          <span>${g}</span>
        </div>`:"",p=e.settings.highlightFavorites?`<div class="je-calendar-legend-item ${a("Watchlist")}" onclick="window.JellyfinEnhanced.calendarPage.toggleFilter('Watchlist'); event.stopPropagation();">
          <span class="je-msym-rounded" style="color: #ffd700; font-size: 18px; font-variation-settings: 'FILL' 1;">bookmark</span>
          <span>${t.t("calendar_watchlist")}</span>
        </div>`:"",d=e.settings.highlightWatchedSeries?`<div class="je-calendar-legend-item ${a("Watched")}" onclick="window.JellyfinEnhanced.calendarPage.toggleFilter('Watched'); event.stopPropagation();">
          <span class="je-msym-rounded" style="color: #64b5f6; font-size: 18px;">visibility</span>
          <span>${t.t("calendar_watched")}</span>
        </div>`:"",l=e.activeFilters.size>=2,m=`<div class="je-calendar-legend-item je-calendar-unmonitored-toggle ${e.settings.showUnmonitored?"active":n?"inactive":""}" onclick="window.JellyfinEnhanced.calendarPage.toggleShowUnmonitored(); event.stopPropagation();" style="cursor: pointer;">
        <span class="je-msym-rounded" style="color: #ff9800; font-size: 18px;">${e.settings.showUnmonitored?"visibility":"visibility_off"}</span>
        <span>${t.t?.("calendar_include_unmonitored")||"Unmonitored"}</span>
      </div>`,r=`<div class="je-calendar-legend-item ${e.settings.collapseEpisodes?"active":""}" onclick="window.JellyfinEnhanced.calendarPage.toggleCollapseEpisodes(); event.stopPropagation();" style="cursor: pointer;">
        <span class="je-msym-rounded" style="font-size: 18px;">${e.settings.collapseEpisodes?"unfold_less":"unfold_more"}</span>
        <span>${t.t("calendar_collapse_episodes")}</span>
      </div>`,s=`
      <div class="je-calendar-filter-controls">
        <div class="je-calendar-filter-toggle ${l?"":"is-disabled"}" role="group" aria-label="Filter mode">
          <button type="button" class="je-calendar-filter-btn ${e.filterMatchMode==="any"?"active":""}" data-filter-mode="any" ${l?"":'disabled aria-disabled="true"'}>OR</button>
          <button type="button" class="je-calendar-filter-btn ${e.filterMatchMode==="all"?"active":""}" data-filter-mode="all" ${l?"":'disabled aria-disabled="true"'}>AND</button>
        </div>
        <button type="button" class="je-calendar-filter-invert ${e.filterInvert?"active":""} ${n?"":"is-disabled"}" data-filter-invert="true" ${n?"":'disabled aria-disabled="true"'}>NOT</button>
      </div>`,v=t.pluginConfig?.ShokoConfigured?`<div class="je-calendar-legend-item ${a("Anime")}" onclick="window.JellyfinEnhanced.calendarPage.toggleFilter('Anime'); event.stopPropagation();">
          <span class="je-msym-rounded" style="color: ${y.Anime}; font-size: 18px;">animation</span>
          <span>${t.t("calendar_anime")}</span>
        </div>`:"";return`
      <div class="je-calendar-legend">
        ${s}
        <div class="je-calendar-legend-item ${a("CinemaRelease")}" onclick="window.JellyfinEnhanced.calendarPage.toggleFilter('CinemaRelease'); event.stopPropagation();">
          <span class="je-msym-rounded" style="color: ${y.CinemaRelease}; font-size: 18px;">local_movies</span>
          <span>${t.t("calendar_cinema_release")}</span>
        </div>
        <div class="je-calendar-legend-item ${a("DigitalRelease")}" onclick="window.JellyfinEnhanced.calendarPage.toggleFilter('DigitalRelease'); event.stopPropagation();">
          <span class="je-msym-rounded" style="color: ${y.DigitalRelease}; font-size: 18px;">ondemand_video</span>
          <span>${t.t("calendar_digital_release")}</span>
        </div>
        <div class="je-calendar-legend-item ${a("PhysicalRelease")}" onclick="window.JellyfinEnhanced.calendarPage.toggleFilter('PhysicalRelease'); event.stopPropagation();">
          <span class="je-msym-rounded" style="color: ${y.PhysicalRelease}; font-size: 18px;">album</span>
          <span>${t.t("calendar_physical_release")}</span>
        </div>
        <div class="je-calendar-legend-item ${a("Episode")}" onclick="window.JellyfinEnhanced.calendarPage.toggleFilter('Episode'); event.stopPropagation();">
          <span class="je-msym-rounded" style="color: ${y.Episode}; font-size: 18px;">tv_guide</span>
          <span>${t.t("calendar_episode")}</span>
        </div>
        ${v}
        <div class="je-calendar-legend-item ${a("Available")}" onclick="window.JellyfinEnhanced.calendarPage.toggleFilter('Available'); event.stopPropagation();">
          <span class="je-msym-rounded" style="color: #4caf50; font-size: 18px;">check_circle</span>
          <span>${t.t?.("jellyseerr_btn_available")||"Available"}</span>
        </div>
        ${f}
        ${p}
        ${d}
        ${m}
        ${r}
      </div>
    `}function D(){let n=document.getElementById("je-calendar-page");if(!n){n=document.createElement("div"),n.id="je-calendar-page",n.className="page type-interior mainAnimatedPage hide",n.setAttribute("data-title","Calendar"),n.setAttribute("data-backbutton","true"),n.setAttribute("data-url","#/calendar"),n.setAttribute("data-type","custom"),n.innerHTML=`
        <div data-role="content">
          <div class="content-primary je-calendar-page">
            <div id="je-calendar-container" style="padding-top: 5em; padding-left: 0.5em; padding-right: 0.5em;"></div>
          </div>
        </div>
      `;let a=document.querySelector(".mainAnimatedPages");a?a.appendChild(n):document.body.appendChild(n)}return n}function Q(n){I();let a;if(n)e._customTabContainer=n,a=n;else if(e._customTabContainer&&document.contains(e._customTabContainer)&&window.location.hash.indexOf("userpluginsettings")===-1)a=e._customTabContainer;else{e._customTabContainer=null;let u=D();if(a=document.getElementById("je-calendar-container"),!u||!a)return}typeof e.sidebarCollapsed!="boolean"&&(e.sidebarCollapsed=S()),a.innerHTML=`
      <div class="je-calendar-header">
        <h1 class="je-calendar-title">${H()}</h1>
        <div class="je-calendar-actions je-calendar-actions-center">
          <div class="je-calendar-nav">
            <div class="je-calendar-nav-group">
              <button class="je-calendar-nav-btn" onclick="window.JellyfinEnhanced.calendarPage.shiftPeriod('prev'); event.stopPropagation();" aria-label="${t.t?.("prev")||"Previous"}">‹</button>
              <button class="je-calendar-nav-btn je-calendar-nav-today" onclick="window.JellyfinEnhanced.calendarPage.goToday(); event.stopPropagation();">${t.t("calendar_today")}</button>
              <button class="je-calendar-nav-btn" onclick="window.JellyfinEnhanced.calendarPage.shiftPeriod('next'); event.stopPropagation();" aria-label="${t.t?.("next")||"Next"}">›</button>
            </div>
          </div>
        </div>
        <div class="je-calendar-actions je-calendar-actions-right">
          <div class="je-calendar-nav">
            <button class="je-calendar-view-btn ${e.viewMode==="day"?"active":""}" onclick="window.JellyfinEnhanced.calendarPage.setViewMode('day'); event.stopPropagation();">${t.t?.("calendar_day")||"Day"}</button>
            <button class="je-calendar-view-btn ${e.viewMode==="week"?"active":""}" onclick="window.JellyfinEnhanced.calendarPage.setViewMode('week'); event.stopPropagation();">${t.t("calendar_week")}</button>
            <button class="je-calendar-view-btn ${e.viewMode==="month"?"active":""}" onclick="window.JellyfinEnhanced.calendarPage.setViewMode('month'); event.stopPropagation();">${t.t("calendar_month")}</button>
            <button class="je-calendar-view-btn ${e.viewMode==="agenda"?"active":""}" onclick="window.JellyfinEnhanced.calendarPage.setViewMode('agenda'); event.stopPropagation();">${t.t("calendar_agenda")}</button>
            <div class="je-calendar-mode-toggle ${e.viewMode==="agenda"?"is-disabled":""}" role="group" aria-label="Display mode">
              <button type="button" class="je-calendar-mode-btn ${e.settings.displayMode==="list"?"active":""}" title="List" aria-label="List" data-mode="list" ${e.viewMode==="agenda"?'disabled aria-disabled="true"':""}>
                <span class="material-icons">view_list</span>
              </button>
              <button type="button" class="je-calendar-mode-btn ${e.settings.displayMode==="backdrop"?"active":""}" title="Backdrop" aria-label="Backdrop" data-mode="backdrop" ${e.viewMode==="agenda"?'disabled aria-disabled="true"':""}>
                <span class="material-icons">image</span>
              </button>
              <button type="button" class="je-calendar-mode-btn ${e.settings.displayMode==="cards"?"active":""}" title="Cards" aria-label="Cards" data-mode="cards" ${e.viewMode==="agenda"?'disabled aria-disabled="true"':""}>
                <span class="material-icons">view_module</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      ${e.isLoading?t.core.ui.skeletonGridHtml(7,{minWidth:"9em",height:"6em",label:t.t("calendar_loading")}):""}

        <div class="je-calendar-layout">
          <div class="je-calendar-main">
            ${e.isLoading?"":Y()}
          </div>
          <aside class="je-calendar-sidebar${e.sidebarCollapsed?" is-collapsed":""}">
            <button type="button" class="je-calendar-sidebar-toggle" aria-expanded="${e.sidebarCollapsed?"false":"true"}" aria-controls="je-calendar-sidebar-content">
              <span class="material-icons je-calendar-sidebar-toggle-icon">expand_more</span>
            </button>
            <div class="je-calendar-sidebar-content" id="je-calendar-sidebar-content">
              ${G().replace('je-calendar-legend"','je-calendar-legend je-calendar-legend-vertical"')}
            </div>
          </aside>
        </div>

      
    `,M()}function I(){let n=document.querySelectorAll(".je-calendar-page, .content-primary.je-calendar-page");n.length&&n.forEach(a=>{a.classList.remove("je-view-day","je-view-week","je-view-month","je-view-agenda"),a.classList.remove("je-display-list","je-display-backdrop","je-display-cards"),e.viewMode&&a.classList.add(`je-view-${e.viewMode}`),e.settings.displayMode&&a.classList.add(`je-display-${e.settings.displayMode}`)})}i.updateDisplayModeButtons=U,i.toggleSidebarCollapsed=W,i.renderPage=Q,i.syncPageModeClasses=I,i.createPageContainer=D})();})();
})();
