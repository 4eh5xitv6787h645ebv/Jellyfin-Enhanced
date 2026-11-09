(() => {
"use strict";(()=>{function w(s){if(/^\d{4}-\d{2}-\d{2}$/.test(s)){let[c=0,u=0,l=0]=s.split("-").map(Number),m=new Date(c,u-1,l);return m.getFullYear()!==c||m.getMonth()!==u-1||m.getDate()!==l?new Date(NaN):m}return new Date(s)}function M(s){let c=w(s);return`${c.getFullYear()}-${String(c.getMonth()+1).padStart(2,"0")}-${String(c.getDate()).padStart(2,"0")}`}function N(s,c,u){let l=c.core?.featureContext;if(typeof l!="function")throw new Error(`${s}: JE.core.featureContext is missing; core/ui-kit.js must load before feature scripts`);return l(s,c,u)}function H(){var i;let s=window,c=s.JellyfinEnhanced;if(!c)throw new Error("Calendar loaded before Jellyfin Enhanced");c.internals||(c.internals={});let l=(i=c.internals).calendarPage||(i.calendarPage={}),m=N("calendar",c,{facades:["initializeCalendarPage"],internalSlots:["calendarLifetime","calendarPage"],internalsObject:()=>c.internals||(c.internals={})});return{JE:c,ctx:m,host:s,P:l}}(function(){"use strict";let{JE:s,host:c,P:u}=H(),l=u.state,m=u.STATUS_COLORS,i=s.escapeHtml,E=s.cdn.selfhst("svg/sonarr.svg"),D=s.cdn.selfhst("svg/radarr-light-hybrid-light.svg"),S=s.cdn.selfhst("svg/shoko-server.svg");function W(e,n){let t=new Date(e.getFullYear(),e.getMonth(),e.getDate(),0,0,0,0);if(n==="month"){t.setDate(1);let a=new Date(t.getFullYear(),t.getMonth()+1,0,23,59,59,999);return{start:t,end:a}}if(n==="week"){let o=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].indexOf(l.settings.firstDayOfWeek),g=(t.getDay()-o+7)%7;t.setDate(t.getDate()-g);let p=new Date(t);return p.setDate(t.getDate()+6),p.setHours(23,59,59,999),{start:t,end:p}}if(n==="day"){let a=new Date(t);return a.setHours(23,59,59,999),{start:t,end:a}}let r=new Date(t);return r.setDate(t.getDate()+29),r.setHours(23,59,59,999),{start:t,end:r}}function q(e){return new Date(e.getFullYear(),e.getMonth()+1,0).getDate()}function K(e){let t=new Date(e.getFullYear(),e.getMonth(),1).getDay(),a=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].indexOf(l.settings.firstDayOfWeek);return(t-a+7)%7}function Y(e){let n=new Date;return e.getFullYear()===n.getFullYear()&&e.getMonth()===n.getMonth()&&e.getDate()===n.getDate()}function T(e){let n={CinemaRelease:m.CinemaRelease,DigitalRelease:m.DigitalRelease,PhysicalRelease:m.PhysicalRelease,Episode:m.Episode,Anime:m.Anime},r=(s.themer?.getThemeVariables()||{}).primaryAccent||"#00a4dc";return n[e.releaseType]||r}function I(e){return e.releaseType==="CinemaRelease"?s.t("calendar_cinema_release"):e.releaseType==="DigitalRelease"?s.t("calendar_digital_release"):e.releaseType==="PhysicalRelease"?s.t("calendar_physical_release"):e.releaseType==="Episode"?s.t("calendar_episode"):e.releaseType==="Anime"?s.t("calendar_anime"):"Release"}function v(e){if(!e)return null;let n=w(e);if(Number.isNaN(n.getTime())||n.getHours()===0&&n.getMinutes()===0)return null;let t=l.settings.timeFormat==="5pm/5:30pm";return n.toLocaleTimeString([],{hour:"numeric",minute:"2-digit",hour12:t})}function V(){if(!l.rangeStart||!l.rangeEnd)return new Date(l.currentDate).toLocaleDateString(void 0,{month:"long",year:"numeric"});if(l.viewMode==="month")return new Date(l.currentDate).toLocaleDateString(void 0,{month:"long",year:"numeric"});let e=l.rangeStart.toLocaleDateString(void 0,{month:"short",day:"numeric"}),n=l.rangeEnd.toLocaleDateString(void 0,{month:"short",day:"numeric"});if(l.viewMode==="week")return`${e} - ${n}`;if(l.viewMode==="day"){let t=s.t?.("calendar_day")||"Day",r=z(l.rangeStart);return`${t} • ${r}`}return`${s.t("calendar_agenda")} • ${e} → ${n}`}function z(e){let n=new Date(e),t=new Date,r=new Date(t.getFullYear(),t.getMonth(),t.getDate()),a=new Date(n.getFullYear(),n.getMonth(),n.getDate()),o=Math.round((a.getTime()-r.getTime())/864e5);return o===0?s.t?.("calendar_today"):o===-1?s.t?.("calendar_yesterday"):o===1?s.t?.("calendar_tomorrow"):a.toLocaleDateString(void 0,{month:"short",day:"numeric"})}function J(e){let n=l.settings.timeFormat==="5pm/5:30pm";return new Date(2e3,0,1,e,0,0,0).toLocaleTimeString([],{hour:"numeric",minute:"2-digit",hour12:n})}function B(e){let n=e.title;return e.type==="Series"&&e.subtitle&&(n+=` ${e.subtitle}`),n}function x(e){let n=l.userDataMap?.get(e.id),t=s.t?.("calendar_watchlist")||"Watchlist",r=s.t?.("calendar_watched")||"Watched",a=[];return l.settings.highlightFavorites&&n?.isFavorite&&a.push(`<span class="je-calendar-status-icon je-status-watchlist je-msym-rounded" title="${t}" aria-label="${t}">bookmark</span>`),l.settings.highlightWatchedSeries&&n?.isWatched&&a.push(`<span class="je-calendar-status-icon je-status-watched je-msym-rounded" title="${r}" aria-label="${r}">visibility</span>`),a.length?`<span class="je-calendar-status-icons">${a.join("")}</span>`:""}function F(e){let n=e.instanceName||e.source;return!Array.isArray(e.alsoInInstances)||e.alsoInInstances.length===0?n:[n,...e.alsoInInstances].join(", ")}function G(e){let n=v(e.releaseDate);if(!n)return"";let t=e.releaseDate?w(e.releaseDate):null,r=t&&!Number.isNaN(t.getTime())?t.getTime():null,a=Date.now(),o=r!==null&&r<=a,d=r!==null&&a-r>=1440*60*1e3,g=e.hasFile?"je-calendar-card-time is-available":d?"je-calendar-card-time is-late is-unavailable":o?"je-calendar-card-time is-past is-unavailable":"je-calendar-card-time is-unavailable",p=n?`<span class="je-calendar-card-time-label">${i(n)}</span>`:"";return`<div class="${g}">${p}</div>`}function Q(e){let n=v(e.releaseDate);return n?`<span style="opacity: 0.85; font-size: 1em;">${i(n)}</span>`:""}function _(e){return encodeURI(e).replace(/'/g,"%27")}function X(e){let n=[];return e&&e.split(`
`).forEach(t=>{let r=t.trim();if(!r)return;let a=r.split("|").map(o=>o.trim());a.length===2&&a[0]&&a[1]&&n.push({jellyfinUrl:a[0],arrUrl:a[1]})}),n}function Z(e,n){let t=c.ApiClient;if(!n)return null;if(!e||e.length===0)return n.replace(/\/$/,"");let a=(typeof t<"u"&&t.serverAddress?t.serverAddress():window.location.origin).replace(/\/+$/,"").toLowerCase();for(let o of e){let d=o.jellyfinUrl.replace(/\/+$/,"").toLowerCase();if(a===d)return o.arrUrl.replace(/\/$/,"")}return n.replace(/\/$/,"")}function ee(e){if(e.source!=="Shoko"||!e.shokoSeriesId)return null;let n=Z(X(s.pluginConfig?.ShokoUrlMappings||""),s.pluginConfig?.ShokoUrl);return n?`${n}/webui/collection/series/${e.shokoSeriesId}`:null}function k(e,n,t){let r=`<img src="${n}" alt="${i(e.type)}" class="${t}" />`,a=ee(e);if(!a)return r;let o=s.t?.("calendar_open_in_shoko")||"Open in Shoko";return`<a href="${i(a)}" target="_blank" rel="noopener noreferrer" class="je-calendar-shoko-link" title="${i(o)}" aria-label="${i(o)}" onclick="event.stopPropagation();">${r}</a>`}function P(e){let n=c.ApiClient;if(e.source!=="Shoko"||typeof n>"u")return null;let t=e.itemId||e.itemEpisodeId;return t?n.getImageUrl(t,{type:"Primary",quality:90}):null}function U(e){return e.posterUrl||e.backdropUrl||P(e)}function O(e){return!!v(e.releaseDate)}function ne(e,n){let t=O(e),r=O(n);return t!==r?t?-1:1:w(e.releaseDate).getTime()-w(n.releaseDate).getTime()}function te(e,n){if(l.settings.displayMode!=="backdrop")return`background: ${n}20;`;let t=e.backdropUrl||P(e)||e.posterUrl;if(!t)return`background: ${n}20;`;let r="rgba(0, 0, 0, 0.6)",a=_(t);return`background-image: linear-gradient(${r}, ${r}), url('${a}'); background-size: cover; background-position: center; background-repeat: no-repeat;`}function re(e){if(!l.settings.collapseEpisodes)return e;let n=o=>o.type==="Series"&&o.seasonNumber!=null&&o.episodeNumber!=null?`${o.title}|${o.seasonNumber}|${M(o.releaseDate)}`:null,t=new Map;e.forEach(o=>{let d=n(o);d&&t.set(d,[...t.get(d)||[],o])});let r=[],a=new Set;return e.forEach(o=>{let d=n(o),g=d&&t.get(d);if(!g||g.length<2){r.push(o);return}if(a.has(d))return;a.add(d);let p=[...g].sort((f,y)=>(f.episodeNumber??0)-(y.episodeNumber??0));if(l.expandedGroups.has(d))p.forEach((f,y)=>r.push(y===p.length-1?{...f,groupKey:d,groupExpanded:!0}:f));else{let f=p[0];f&&r.push({...f,groupKey:d,groupMembers:p})}}),r}function ae(e){let n=t=>t.finaleType==="season"||t.finaleType==="series";return n(e)||!!e.groupMembers?.some(n)}function A(e,n){if(!ae(e))return n;let t=s.t("calendar_finale");return n?`${n} • ${t}`:t}function R(e){let n=e.groupMembers;if(!n?.length)return e.subtitle||"";let t=r=>String(r).padStart(2,"0");return`S${t(e.seasonNumber)}E${t(n[0]?.episodeNumber)}-${t(n[n.length-1]?.episodeNumber)}`}function L(e){if(!e.groupKey)return"";let n=!!e.groupExpanded;return`<button class="je-calendar-group-toggle" data-group-key="${i(e.groupKey)}" aria-expanded="${n}"><span class="material-icons">${n?"expand_less":"expand_more"}</span></button>`}function se(e){let n=T(e),t=I(e),r=e.source==="Shoko"?S:e.type==="Series"?E:D,a=F(e),o=i(a),d=e.source==="Sonarr"?"je-calendar-sonarr-icon":e.source==="Shoko"?"je-calendar-shoko-icon":"je-calendar-radarr-icon",g=A(e,e.groupMembers?R(e):e.subtitle),p=g?`<span class="je-calendar-event-subtitle">${i(g)}</span>`:"",f=e.hasFile?" je-has-file":"",y=B(e),h=l.settings.displayMode==="backdrop"&&U(e)?" je-has-backdrop":"",b=x(e),$=b?`<div class="je-calendar-event-status-top">${b}</div>`:"",C=Q(e),j=e.hasFile&&!e.groupMembers?`<button class="je-calendar-play-btn" title="${s.t?.("jellyseerr_btn_available")}" aria-label="${s.t?.("jellyseerr_btn_available")}" data-event-id="${i(e.id)}"><span class="material-icons">play_arrow</span></button>`:"",le=te(e,n);return`
      <div class="je-calendar-event${f}${h}" style="border-left-color: ${n}; ${le}" title="${i(y)}" data-event-id="${i(e.id)}">
        ${$}
        <span class="je-calendar-event-title">${i(e.title)}</span>
        ${p}
        <div class="je-calendar-event-type">
          ${k(e,r,d)}
          <span>${t} • <span class="je-arr-badge" title="${o}">${o}</span></span>
          ${C?` • ${C}`:""}${j}
        </div>
        ${L(e)}
      </div>
    `}function oe(e){let n=T(e),t=I(e),r=e.source==="Shoko"?S:e.type==="Series"?E:D,a=F(e),o=i(a),d=e.source==="Sonarr"?"je-sonarr-icon":e.source==="Shoko"?"je-shoko-icon":"je-radarr-icon",g=A(e,e.groupMembers?R(e):e.subtitle||""),p=v(e.releaseDate),f=e.hasFile?" je-has-file":"",y=[];e.hasFile&&!e.groupMembers&&y.push(`<button class="je-calendar-play-btn" title="${s.t("jellyseerr_btn_available")}" aria-label="${s.t("jellyseerr_btn_available")}" data-event-id="${i(e.id)}"><span class="material-icons">play_arrow</span></button>`);let h=x(e);h&&y.push(h);let b="movie";e.releaseType==="CinemaRelease"?b="local_movies":e.releaseType==="DigitalRelease"?b="ondemand_video":e.releaseType==="PhysicalRelease"?b="album":e.releaseType==="Episode"?b="tv_guide":e.releaseType==="Anime"&&(b="animation");let $=g?`<span class="je-calendar-agenda-subtitle">${i(g)}</span>`:"";return`
      <div class="je-calendar-agenda-event${f}" data-event-id="${i(e.id)}">
        <div class="je-calendar-agenda-indicators">
          ${y.join("")}
        </div>
        <span class="je-msym-rounded" style="font-size: 20px;">${b}</span>
        <div class="je-calendar-agenda-event-marker" style="background: ${n};"></div>
        <div class="je-calendar-agenda-event-content">
          <div class="je-calendar-agenda-event-title">
            <span class="je-calendar-agenda-title-text">${i(e.title)}</span>
            ${$}
          </div>
          <div class="je-calendar-agenda-event-meta">
            ${k(e,r,d)}
            <span>${t}</span>
            <span>•</span>
            <span class="je-arr-badge" title="${o}">${o}</span>
            ${p?`<span>• ${i(p)}</span>`:""}
          </div>
        </div>
        ${L(e)}
      </div>
    `}function ie(e){return e.length?e.map(n=>{let t=U(n),r=I(n),a=n.source==="Shoko"?S:n.type==="Series"?E:D,o=F(n),d=i(o),g=n.source==="Sonarr"?"je-calendar-sonarr-icon":n.source==="Shoko"?"je-calendar-shoko-icon":"je-calendar-radarr-icon",p=x(n),f=G(n),y=n.hasFile&&!n.groupMembers?`<button class="je-calendar-play-btn je-calendar-play-btn-card" title="${s.t?.("jellyseerr_btn_available")}" aria-label="${s.t?.("jellyseerr_btn_available")}" data-event-id="${i(n.id)}"><span class="material-icons">play_arrow</span></button>`:"",h=f||y?`<div class="je-calendar-card-time-row">${f}${y}</div>`:"",b=p?`<div class="je-calendar-card-status-top">${p}</div>`:"",$=T(n),C=A(n,n.groupMembers?R(n):n.subtitle),j=L(n);return t?`
          <div class="je-calendar-card" data-event-id="${i(n.id)}" style="border-bottom-color: ${$};">
            <div class="je-calendar-card-image-wrap">
              <img src="${_(t)}" alt="" class="je-calendar-card-image">
              ${b}
              ${j}
              <div class="je-calendar-card-overlay">
                ${h}
                <div class="je-calendar-card-title">
                  <span class="je-calendar-card-title-text">${i(n.title)}</span>
                </div>
                ${C?`<div class="je-calendar-card-subtitle">${i(C)}</div>`:'<div class="je-calendar-card-subtitle"></div>'}
                <div class="je-calendar-card-meta">
                  ${k(n,a,g)}
                  <span>${r}</span>
                  <span>•</span>
                  <span class="je-arr-badge" title="${d}">${d}</span>
                </div>
              </div>
            </div>
          </div>
        `:`
        <div class="je-calendar-card" data-event-id="${i(n.id)}" style="border-bottom-color: ${$};">
          ${b}
          ${j}
          ${h}
          <div class="je-calendar-card-title">
            <span class="je-calendar-card-title-text">${i(n.title)}</span>
          </div>
          ${C?`<div class="je-calendar-card-subtitle">${i(C)}</div>`:'<div class="je-calendar-card-subtitle"></div>'}
          <div class="je-calendar-card-meta">
            ${k(n,a,g)}
            <span>${r}</span>
            <span>•</span>
            <span class="je-arr-badge" title="${d}">${d}</span>
          </div>
        </div>
      `}).join(""):""}u.getRangeForView=W,u.getDaysInMonth=q,u.getFirstDayOfMonth=K,u.isTodayDate=Y,u.formatRangeLabel=V,u.formatHourLabel=J,u.renderEvent=se,u.renderAgendaEvent=oe,u.renderCardItems=ie,u.collapseEpisodes=re,u.eventHasTime=O,u.compareEventsWithinDay=ne})();})();
})();
