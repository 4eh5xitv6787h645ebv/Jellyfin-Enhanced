(() => {
"use strict";(()=>{function E(t,p,u){let m=p.core?.featureContext;if(typeof m!="function")throw new Error(`${t}: JE.core.featureContext is missing; core/ui-kit.js must load before feature scripts`);return m(t,p,u)}function A(){let t=window,p=t.JellyfinEnhanced;if(!p)throw new Error("Bookmarks loaded before Jellyfin Enhanced");return{ctx:E("bookmarks",p,{facades:["bookmarks","initializeBookmarks","cleanupBookmarks"],internalSlots:["bookmarksLibrary","bookmarkLifetimes"],internalsObject:()=>p.internals??(p.internals={})}),host:t,getApi:()=>{let y=t.ApiClient||t.ConnectionManager?.currentApiClient();if(!y)throw new Error("API client not available");return y}}}function v(t){let p=t.userConfig,u=t.session?.getEpoch();return()=>t.userConfig===p&&(u===void 0||t.session?.isCurrent(u)===!0)}function S(t,p){let u=t.querySelector(p);if(!u)throw new Error("Missing bookmark control: "+p);return u}function I(t,p){let u=t.core,m=t.own;m.bookmarkLifetimes??(m.bookmarkLifetimes={}),m.bookmarkLifetimes[p]?.dispose();let y=new Set,w=new Set,h=!1,k=0,O=new Set,C=e=>{if(typeof e=="function")y.add(()=>e());else if(typeof e=="object"&&e!==null&&"unsubscribe"in e&&typeof e.unsubscribe=="function"){let a=e.unsubscribe.bind(e);y.add(()=>a())}},f=e=>{if(typeof e=="object"&&e!==null&&"teardown"in e&&typeof e.teardown=="function"){let a=e.teardown.bind(e);y.add(()=>a())}else C(e)},s=(e,a,i,l=!1)=>{e.addEventListener(a,i,l),y.add(()=>e.removeEventListener(a,i,l))},c=(e,a)=>{let i=v(u),l=k,b=()=>{window.clearTimeout(T),y.delete(b),O.delete(b)},T=window.setTimeout(()=>{y.delete(b),O.delete(b),!h&&k===l&&i()&&e()},a);return y.add(b),O.add(b),T},n=(e,a)=>{let i=window.setInterval(()=>{h||e()},a);return y.add(()=>window.clearInterval(i)),i},r=e=>{let a=document.activeElement;e.setAttribute("role","dialog"),e.setAttribute("aria-modal","true"),e.tabIndex=-1;let i=()=>{e.remove(),y.delete(i),w.delete(i),document.removeEventListener("viewshow",i),a instanceof HTMLElement&&a.isConnected&&a.focus()};return y.add(i),w.add(i),document.addEventListener("viewshow",i),e.addEventListener("keydown",l=>{if(l.key==="Escape"&&(l.preventDefault(),i()),l.key!=="Tab")return;let b=Array.from(e.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]')),T=b[0],P=b[b.length-1];if(!T||!P){l.preventDefault(),e.focus();return}l.shiftKey&&(document.activeElement===T||document.activeElement===e)?(l.preventDefault(),P.focus()):!l.shiftKey&&document.activeElement===P&&(l.preventDefault(),T.focus())}),c(()=>{e.isConnected&&(e.querySelector("input")||e.querySelector("button")||e).focus()},0),i},o=()=>{k++;for(let e of O)e();for(let e of w)e()},g=()=>{if(!h){h=!0,o();for(let e of y)e();y.clear()}},d={dispose:g,cancelPending:o,keep:f,listen:s,timeout:c,interval:n,modal:r,current:()=>{let e=v(u),a=k;return()=>!h&&k===a&&e()}};return m.bookmarkLifetimes[p]=d,C(u.session?.onUserChange("bookmarks-"+p,()=>{for(let e of w)e();document.querySelectorAll(".je-bm-player-modal-overlay, .je-bm-library-modal-overlay, .je-bookmark-marker").forEach(e=>e.remove()),document.querySelectorAll(".sections.bookmarks").forEach(e=>e.replaceChildren())})),s(window,"pagehide",g),d}var{ctx:R,host:J,getApi:z}=A();function x(t){let p=I(R,"library-modals"),u=p.timeout,m=R.own.bookmarksLibrary=R.own.bookmarksLibrary||{};if(!t?.pluginConfig?.BookmarksEnabled)return;let y=(...f)=>{let s=m.formatTimestamp;if(!s)throw new Error("Missing bookmark module: formatTimestamp");return s(...f)},w=(...f)=>{let s=m.renderBookmarksLibrary;if(!s)throw new Error("Missing bookmark module: renderBookmarksLibrary");return s(...f)},h=t.escapeHtml;function k(f){let s=p.current(),c=f.bookmarks.filter(o=>o.syncedFrom);if(c.length===0){s()&&t.toast(t.t("bookmark_no_synced"),2e3);return}let n=document.createElement("div");n.className="je-bm-library-modal-overlay",n.innerHTML=`
      <div class="je-bm-library-modal-container" style="max-width: 550px;">
        <button class="je-bm-library-modal-close">×</button>
        <div class="je-bm-library-modal-content">
          <div class="je-bookmarks-modal-header">
            <span class="material-icons" aria-hidden="true" style="font-size: 48px; color: #2196f3; flex-shrink: 0;">schedule</span>
            <div style="flex: 1;">
              <h2 class="je-modal-title">${t.t("bookmark_adjust_offset")}</h2>
              <p class="je-modal-subtitle">${t.t("bookmark_synced_count").replace("{count}",String(c.length))} ${t.t("bookmark_for_item").replace("{name}",h(f.details.name))}</p>
            </div>
          </div>

          <div class="je-modal-info-box">
            <div class="je-modal-info-title"><span class="material-icons" style="font-size: 14px; vertical-align: middle;">info</span> ${t.t("bookmark_synced_info_title")}</div>
            <div class="je-modal-info-text">${t.t("bookmark_synced_info_body")}</div>
          </div>

          <div style="margin-bottom: 24px;">
            <label for="offset-adjustment-input" class="je-modal-label"><span class="material-icons" style="font-size: 14px; vertical-align: middle;">schedule</span> ${t.t("bookmark_offset_label")}</label>
            <input type="number" id="offset-adjustment-input" value="0" step="0.1" placeholder="0" class="je-modal-input">
            <div class="je-modal-help-text">${t.t("bookmark_offset_help")}</div>
          </div>

          <div class="je-modal-list-container">
            <div class="je-modal-list-title">${t.t("bookmark_offset_affected")}</div>
            ${c.map(o=>`
              <div class="je-modal-list-item">
                <div class="je-modal-list-item-title">${h(o.label||t.t("bookmark_unlabeled"))}</div>
                <div class="je-modal-list-item-meta">${y(o.timestamp)} • ${t.t("bookmark_from").replace("{source}",h(o.syncedFrom||""))}</div>
              </div>
            `).join("")}
          </div>
        </div>

        <div class="je-bookmark-modal-actions">
          <button class="je-bookmark-btn-cancel">
            <span class="material-icons" aria-hidden="true" style="font-size: 18px;">close</span>
            <span>Cancel</span>
          </button>
          <button class="btnApplyOffset je-modal-btn-primary">
            <span class="material-icons" aria-hidden="true" style="font-size: 18px;">check</span>
            <span>${t.t("bookmark_apply_offset")}</span>
          </button>
        </div>
      </div>
    `,document.body.appendChild(n);let r=p.modal(n);S(n,".je-bm-library-modal-close").addEventListener("click",r),S(n,".je-bookmark-btn-cancel").addEventListener("click",r),n.addEventListener("click",o=>{o.target===n&&r()}),S(n,".btnApplyOffset").addEventListener("click",async()=>{if(!s())return;let o=parseFloat(S(n,"#offset-adjustment-input").value)||0,g=S(n,".btnApplyOffset");g.disabled=!0,S(g,"span:last-child").innerHTML='<span class="material-icons" style="animation: spin 1s linear infinite; font-size: 18px;">refresh</span>';try{let d=await R.own.bookmarks.adjustOffsets(c,o);if(!s())return;if(d>0){let e=o===0?t.t("bookmark_offset_cleared").replace("{count}",String(d)):t.t("bookmark_offset_applied").replace("{count}",String(d)).replace("{offset}",`${o>0?"+":""}${o}s`);s()&&t.toast(e,3e3),r();let a=document.querySelector(".sections.bookmarks");a&&u(()=>w(a),300)}else s()&&t.toast(t.t("bookmark_update_failed"),3e3),g.disabled=!1,S(g,"span:last-child").textContent=t.t("bookmark_apply_offset")}catch(d){console.error("Failed to apply offset:",d),s()&&t.toast(t.t("bookmark_offset_failed"),3e3),g.disabled=!1,S(g,"span:last-child").textContent=t.t("bookmark_apply_offset")}}),u(()=>n.style.opacity="1",10)}function O(f){let s=Object.create(null),c=[];for(let[n,r]of Object.entries(f)){let o=r.episodeNumber!=null?`:s${r.seasonNumber??"x"}e${r.episodeNumber}`:"",g=r.tmdbId?`tmdb:${r.tmdbId}${o}`:null,d=r.tvdbId?`tvdb:${r.tvdbId}${o}`:null;for(let e of[g,d].filter(a=>a!==null)){s[e]||(s[e]={});let a=s[e];if(!a)continue;(a[r.itemId]??(a[r.itemId]=[])).push({...r,id:n})}}for(let[n,r]of Object.entries(s))Object.keys(r).length>1&&c.push({providerKey:n,itemGroups:r,totalBookmarks:Object.values(r).flat().length,name:Object.values(r)[0]?.[0]?.name||"Unknown"});return c}function C(f){let s=p.current(),c=O(f);if(c.length===0){s()&&t.toast(t.t("bookmark_no_duplicates"),3e3);return}let n=document.createElement("div");n.className="je-bm-library-modal-overlay",n.style.cssText="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); z-index: 10000; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s;",n.innerHTML=`
      <div class="je-bm-library-modal-container" style="max-width: 700px; background: #181818; border-radius: 12px; padding: 24px; position: relative; box-shadow: 0 8px 32px rgba(0,0,0,0.8); max-height: 85vh; overflow-y: auto;">
        <button class="je-bm-library-modal-close" style="position: absolute; top: 16px; right: 16px; background: transparent; border: none; color: #fff; font-size: 32px; cursor: pointer; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: background 0.2s;">×</button>
        <div class="je-bm-library-modal-content">
          <div class="je-bookmarks-modal-header" style="display: flex; gap: 16px; align-items: flex-start; margin-bottom: 24px;">
            <span class="material-icons" aria-hidden="true" style="font-size: 48px; color: #ff9800; flex-shrink: 0;">merge</span>
            <div style="flex: 1;">
              <h2 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 700; color: #fff;">${t.t("bookmark_duplicate_title")}</h2>
              <p style="margin: 0; font-size: 13px; color: #aaa;">${t.t("bookmark_duplicate_subtitle").replace("{count}",String(c.length))}</p>
            </div>
          </div>
          <div style="margin-top: 20px;">
            ${c.map((o,g)=>{let d=Object.keys(o.itemGroups);return`
                <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                  <div style="font-weight: 600; margin-bottom: 12px; color: #ff9800;">${h(o.name)}</div>
                  <div style="font-size: 12px; color: #888; margin-bottom: 12px;">
                    ${t.t("bookmark_split_versions").replace("{count}",String(o.totalBookmarks)).replace("{versions}",String(d.length))}
                  </div>
                  ${d.map((e,a)=>{let i=o.itemGroups[e]??[];return`
                      <div style="background: rgba(255,255,255,0.02); border-left: 3px solid ${a===0?"#4caf50":"#ff9800"}; padding: 8px 12px; margin-bottom: 8px; border-radius: 4px;">
                        <div style="font-size: 11px; color: ${a===0?"#4caf50":"#ff9800"}; font-weight: 600; margin-bottom: 4px;">
                          ${a===0?t.t("bookmark_primary_version"):t.t("bookmark_old_version")}
                        </div>
                        <div style="font-size: 12px; color: #ccc; margin-bottom: 6px;">
                          ${t.t("bookmark_item_id")}: <code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 3px; font-size: 11px;">${h(e.substring(0,16))}...</code>
                        </div>
                        <div style="font-size: 12px; color: #aaa; margin-bottom: 8px;">
                          ${t.t("bookmark_bookmark_count").replace("{count}",String(i.length))} ${i.map(l=>y(l.timestamp)).join(", ")}
                        </div>
                        <button class="je-btn" data-sync-from="${a}" data-dup-index="${g}" style="background: rgba(33, 150, 243, 0.15); border-color: #2196f3; color: #2196f3; font-size: 11px;">
                          <span class="material-icons" aria-hidden="true" style="font-size: 14px;">schedule</span>
                          <span>${t.t("bookmark_adjust_offset")}</span>
                        </button>
                      </div>
                    `}).join("")}
                  <button class="je-btn" data-dup-index="${g}" style="margin-top: 8px; background: rgba(255, 152, 0, 0.15); border-color: #ff9800; color: #ff9800;">
                    <span class="material-icons" aria-hidden="true" style="font-size: 16px;">merge</span>
                    <span>${t.t("bookmark_merge_primary")}</span>
                  </button>
                </div>
              `}).join("")}
          </div>
        </div>
        <div class="je-bookmark-modal-actions">
          <button class="je-bookmark-btn-cancel">
            <span class="material-icons" aria-hidden="true" style="font-size: 18px;">close</span>
            <span>Close</span>
          </button>
        </div>
      </div>
    `,document.body.appendChild(n);let r=p.modal(n);S(n,".je-bm-library-modal-close").addEventListener("click",r),S(n,".je-bookmark-btn-cancel").addEventListener("click",r),n.addEventListener("click",o=>{o.target===n&&r()}),n.querySelectorAll("[data-sync-from]").forEach(o=>{o.addEventListener("click",async()=>{if(!s())return;let g=Number(o.dataset.dupIndex),d=Number(o.dataset.syncFrom),e=c[g];if(!e)return;let i=Object.keys(e.itemGroups)[d];if(!i)return;let l=e.itemGroups[i]??[];r();let b={bookmarks:l,details:{name:e.name}};k(b)})}),n.querySelectorAll("button.je-btn:not([data-sync-from])").forEach(o=>{o.dataset.dupIndex&&o.addEventListener("click",async()=>{if(!s())return;let g=Number(o.dataset.dupIndex),d=c[g];if(!d)return;let e=Object.keys(d.itemGroups);if(e.length<2)return;let a=e[0],i=e.slice(1);if(!a)return;let l=d.itemGroups[a]?.[0];if(!l)return;let b=i.flatMap(T=>d.itemGroups[T]??[]);if(confirm(t.t("bookmark_merge_confirm").replace("{count}",String(b.length)))){o.disabled=!0,S(o,"span:last-child").innerHTML='<span class="material-icons" style="animation: spin 1s linear infinite; font-size: 18px;">refresh</span>';try{let T={itemId:a,tmdbId:l.tmdbId,tvdbId:l.tvdbId,mediaType:l.mediaType,name:l.name,seasonNumber:l.seasonNumber??null,episodeNumber:l.episodeNumber??null},P=await R.own.bookmarks.syncBookmarks(b,T,0);if(!s())return;s()&&t.toast(t.t("bookmark_merge_success").replace("{count}",String(P.length)),3e3),r();let L=document.querySelector(".sections.bookmarks");L&&u(()=>w(L),500)}catch(T){console.error("Merge failed:",T),s()&&t.toast(t.t("bookmark_merge_failed"),3e3),o.disabled=!1,S(o,"span:last-child").textContent=t.t("bookmark_merge_primary")}}})}),u(()=>n.style.opacity="1",10)}Object.assign(m,{showOffsetAdjustmentModal:k,showDuplicatesSyncModal:C})}x(R.core);})();
})();
