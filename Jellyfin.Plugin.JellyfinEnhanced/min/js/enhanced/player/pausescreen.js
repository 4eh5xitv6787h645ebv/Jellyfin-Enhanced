(() => {
"use strict";(()=>{function x(s,i,c,e,t){let n=s.firstElementChild,r=e>0?Math.max(0,Math.min(100,c/e*100)):0;n instanceof HTMLElement&&(n.style.width=`${r}%`);let a=i.querySelector(".progress-time"),o=i.querySelector(".progress-ends-at"),l=i.querySelector(".progress-percentage");if(a&&(a.textContent=`${k(c)} / ${k(e)}`),l&&(l.textContent=t("pausescreen_watched_percent",{percent:Math.round(r)})),o)if(e>0&&c<e){let d=e-c,m=new Date(Date.now()+d*1e3).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});o.textContent=t("pausescreen_ends_at",{time:m})}else o.textContent=""}function k(s){if(!isFinite(s)||s<=0)return"0:00";let i=Math.floor(s%60).toString().padStart(2,"0"),c=Math.floor(s/60%60).toString().padStart(2,"0"),e=Math.floor(s/3600);return e>0?`${e}:${c}:${i}`:`${Number(c)}:${i}`}function E(s,i){let c=0,e=new AbortController,t=new Set,n=new Set;function r(){c++,e.abort(),e=new AbortController;for(let o of t)o();for(let o of n)clearTimeout(o);n.clear()}s.session?.onUserChange(i+"-lifetime",r),s.core?.navigation?s.core.navigation.onNavigate(r):window.addEventListener("hashchange",r);function a(o){let l=c,d=location.hash,h=s.session?.createLease?.(),m=o?o.currentSrc||o.src:null;return{signal:e.signal,current:()=>l===c&&d===location.hash&&(!h||h.isCurrent())&&(!o||o.isConnected&&(o.currentSrc||o.src)===m)}}return{lease:a,reset:r,onReset(o){return t.add(o),()=>t.delete(o)},timeout(o,l){let d=window.setTimeout(()=>{n.delete(d),o()},l);return n.add(d),d},cancel(o){o!=null&&(clearTimeout(o),n.delete(o))},sleep(o,l){return new Promise(d=>{if(l.aborted){d();return}let h=()=>{clearTimeout(m),l.removeEventListener("abort",h),d()},m=window.setTimeout(h,o);l.addEventListener("abort",h,{once:!0})})}}}var L=`
            :root {
              --pause-screen-overlay-bg: rgba(0,0,0,.78);
              --pause-screen-blur: 50px;
              --pause-screen-logo-max-w: 45vw;
              --pause-screen-logo-max-h: 20vh;
              --pause-screen-logo-top: 20vh;
              --pause-screen-logo-left: 8vw;

              --pause-screen-details-top: 45vh;
              --pause-screen-details-left: 8vw;
              --pause-screen-details-gap: 2rem;
              --pause-screen-text-size: 1.2rem;

              --pause-screen-plot-top: 55vh;
              --pause-screen-plot-left: 8vw;
              --pause-screen-plot-max-w: 50vw;
              --pause-screen-plot-font: 1.25rem;

              --pause-screen-progress-top: 85vh;
              --pause-screen-progress-width: 48vw;
              --pause-screen-progress-height: 6px;
              --pause-screen-progress-radius: 999px;

              --pause-screen-disc-w: 26vw;
              --pause-screen-disc-right: 5vw;
              --pause-screen-disc-rot-sec: 60s;
            }

            #pause-screen-overlay {
              position: fixed; inset: 0;
              display: none;
              z-index: 99;
              color: #fff;
              font-family: inherit;
              background: var(--pause-screen-overlay-bg);
            }
            #pause-screen-overlay[aria-hidden="false"] { display: flex; }

            .pause-screen-active .videoOsdBottom { opacity: 0 !important; pointer-events: none !important; }

            /* To show back button when paused */
            .pause-screen-active .skinHeader.osdHeader {
                z-index: 100 !important;
                opacity: 0.9 !important;
                visibility: visible !important;
                background: transparent !important;
                width: 10vw !important;

            }
            .pause-screen-active .skinHeader.osdHeader .headerRight {
                display: none !important;
            }

            .pause-screen-active .skinHeader.osdHeader {
                visibility: hidden !important;
            }

            .pause-screen-active .headerBackButton,
            .pause-screen-active .skinHeader.osdHeader .videoOsd-appBar > button:first-child {
                visibility: visible !important;
            }

            #pause-screen-content {
              position: relative;
              width: 100%; height: 100%;
              backdrop-filter: blur(var(--pause-screen-blur)) brightness(0.5);
              outline: none;
            }

            /* Backdrop image (under everything) */
            #pause-screen-backdrop {
              position: absolute; inset: 0;
              background-position: center;
              background-size: cover;
              opacity: .28;
              pointer-events: none;
            }

            #pause-screen-logo {
              position: absolute;
              max-width: var(--pause-screen-logo-max-w);
              max-height: var(--pause-screen-logo-max-h);
              width: auto; height: auto;
              top: var(--pause-screen-logo-top);
              left: var(--pause-screen-logo-left);
              display: block;
              object-fit: contain;
            }

            #pause-screen-details {
              position: absolute;
              top: var(--pause-screen-details-top);
              left: var(--pause-screen-details-left);
              display: flex; gap: var(--pause-screen-details-gap); align-items: center;
              font-size: var(--pause-screen-text-size);
            }

            #pause-screen-plot {
              position: absolute;
              top: var(--pause-screen-plot-top);
              left: var(--pause-screen-plot-left);
              max-width: var(--pause-screen-plot-max-w);
              height: 25vh; /* Adjusted height */
              display: block;
              font-size: var(--pause-screen-plot-font);
              line-height: 1.6;
              overflow-y: auto;
              text-align: left;
            }

            #pause-screen-disc {
              position: absolute;
              top: calc(50vh - (var(--pause-screen-disc-w) / 2));
              right: var(--pause-screen-disc-right);
              width: var(--pause-screen-disc-w);
              height: auto;
              display: block;
              animation: pause-screen-spin var(--pause-screen-disc-rot-sec) linear infinite;
              z-index: 1;
              filter: brightness(80%);
            }

            @keyframes pause-screen-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

            /* Progress UI */
            #pause-screen-progress-wrap {
              position: absolute;
              top: var(--pause-screen-progress-top);
              left: var(--pause-screen-details-left);
              width: var(--pause-screen-progress-width);
              user-select: none;
            }
            #pause-screen-progress-bar {
              width: 100%;
              height: var(--pause-screen-progress-height);
              border-radius: var(--pause-screen-progress-radius);
              background: rgba(255,255,255,.18);
              overflow: hidden;
              position: relative;
            }
            #pause-screen-progress-bar > span {
              display: block;
              height: 100%;
              width: 0%;
              background: rgba(255,255,255,.9);
            }
            #pause-screen-progress-meta {
              margin-top: .5rem;
              font-size: 0.9rem;
              opacity: .9;
              display: flex;
            }
            #pause-screen-progress-meta span::before {
              content: '•';
              margin: 1em;
            }
            #pause-screen-progress-meta .progress-ends-at::after {
              content: '•';
              margin: 1em;
            }
            #pause-screen-close-btn {
              position: absolute;
              top: 20px;
              right: 20px;
              background: rgba(0,0,0,0.1);
              border: 1px solid rgba(255,255,255,0.2);
              color: white;
              width: 1.5em;
              height: 1.5em;
              border-radius: 50%;
              font-size: 1.5em;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
              z-index: 2;
              transition: background 0.2s;
            }
            #pause-screen-close-btn:hover,
            #pause-screen-close-btn:focus-visible {
              background: rgba(0,0,0,0.8);
            }
            #pause-screen-close-btn:focus-visible {
              outline: 2px solid #fff;
              outline-offset: 2px;
            }
            /* Accessibility helpers */
            #pause-screen-focus-start, #pause-screen-focus-end {
              position: fixed; width:1px; height:1px; overflow:hidden; clip: rect(0 0 0 0);
            }
            /* Make this selector more specific to override other plugins */
            #pause-screen-progress-meta .progress-percentage {
                font-size: inherit !important;
                font-weight: normal !important;
                color: inherit !important;
                min-width: auto !important;
                text-align: left !important;
            }

            /* Tablet */
            @media (max-width: 1400px) {
              :root {
                --pause-screen-logo-max-w: 40vw;
                --pause-screen-logo-top: 18vh;
                --pause-screen-logo-left: 6vw;
                --pause-screen-details-top: 42vh;
                --pause-screen-details-left: 6vw;
                --pause-screen-plot-top: 50vh;
                --pause-screen-plot-left: 6vw;
                --pause-screen-plot-max-w: 48vw;
                --pause-screen-disc-w: 24vw;
                --pause-screen-disc-right: 4vw;
                --pause-screen-progress-width: 44vw;
              }
            }

            /* Narrow / Portrait Mobile - Hides Disc */
            @media (max-width: 768px) {
              :root {
                --pause-screen-logo-max-w: 70vw;
                --pause-screen-logo-top: 12vh;
                --pause-screen-logo-left: 50%;
                --pause-screen-progress-width: 80vw;
                --pause-screen-progress-top: 88vh;
              }
              #pause-screen-logo { transform: translateX(-50%); }
              #pause-screen-details {
                left: 50%; transform: translateX(-50%);
                top: 32vh; font-size: 14px; justify-content: center;
              }
              #pause-screen-plot {
                top: 40vh; left: 50%; transform: translateX(-50%);
                max-width: 85vw; text-align: center; font-size: 15px; height: 45vh;
              }
              #pause-screen-disc {
                display: none; /* Hide disc on mobile layouts */
              }
            }

            /* Mobile Landscape */
            @media (max-height: 500px) and (orientation: landscape) {
              :root {
                --pause-screen-logo-max-h: 18vh;
                --pause-screen-logo-top: 8vh;
                --pause-screen-details-top: 30vh;
                --pause-screen-plot-top: 40vh;
                --pause-screen-plot-max-w: 45vw;
                --pause-screen-plot-font: 14px;
                --pause-screen-progress-top: 78vh;
                --pause-screen-disc-w: 22vw;
              }
              #pause-screen-plot { height: 35vh; }
              #pause-screen-disc { display: block; } /* Show disc again in landscape */
            }

            /* Reduced motion: stop spin */
            @media (prefers-reduced-motion: reduce) {
              #pause-screen-disc { animation: none !important; }
            }

            /* Hide absent images */
            #pause-screen-logo:not([src]), #pause-screen-disc:not([src]) { display: none; }

          `;function R(s,i,c){let e=i.core?.featureContext;if(typeof e!="function")throw new Error(`${s}: JE.core.featureContext is missing; core/ui-kit.js must load before feature scripts`);return e(s,i,c)}function A(){let s=window,i=s.JellyfinEnhanced;if(!i)throw new Error("Player loaded before Jellyfin Enhanced");let c=R("player",i,{internalSlots:["player","nowPlaying","autoSkip"],internalsObject:()=>i.internals=i.internals||{}}),e=()=>{if(!s.ApiClient)throw new Error("Jellyfin API unavailable");return s.ApiClient};return{JE:i,ApiClient:{getCurrentUserId:()=>s.ApiClient?.getCurrentUserId()??null,deviceId:()=>s.ApiClient?.deviceId?.()??"",serverId:()=>{let n=s.ApiClient?.serverId;return typeof n=="function"?n.call(s.ApiClient):n??""},serverAddress:()=>e().serverAddress(),getUrl:(n,r)=>e().getUrl(n,r),ajax:n=>e().ajax(n),getItem:(n,r)=>e().getItem(n,r)},ctx:c}}function g(s){return typeof s=="object"&&s!==null&&!Array.isArray(s)?Object.fromEntries(Object.entries(s)):{}}var p=s=>typeof s=="string"?s:void 0,f=s=>typeof s=="number"&&Number.isFinite(s)?s:void 0,M=s=>Array.isArray(s)?s.filter(i=>typeof i=="string"):[],w=s=>Array.isArray(s)?s:[];function O(s){let i=g(s),c=e=>typeof e=="string"?e:f(e);return{Type:p(i.Type),Index:f(i.Index),ReferenceFrameRate:c(i.ReferenceFrameRate),RealFrameRate:c(i.RealFrameRate),AverageFrameRate:c(i.AverageFrameRate),DisplayTitle:p(i.DisplayTitle),Title:p(i.Title),Language:p(i.Language),Codec:p(i.Codec)}}function D(s){let i=g(s);return{Id:p(i.Id),Type:p(i.Type),SeriesId:p(i.SeriesId),ParentId:p(i.ParentId),RunTimeTicks:f(i.RunTimeTicks),ProductionYear:f(i.ProductionYear),CommunityRating:f(i.CommunityRating),CriticRating:f(i.CriticRating),OfficialRating:p(i.OfficialRating),Overview:p(i.Overview),Container:p(i.Container),Genres:M(i.Genres),Tags:M(i.Tags),ImageTags:{Logo:p(g(i.ImageTags).Logo)},MediaStreams:w(i.MediaStreams).map(O),MediaSources:w(i.MediaSources).map(c=>{let e=g(c);return{Id:p(e.Id),MediaStreams:w(e.MediaStreams).map(O)}})}}var{JE:u,ApiClient:y,ctx:S}=A(),I=E(u,"pause-screen");u.initializePauseScreen=function(){if(!u.currentSettings.pauseScreenEnabled){u.pauseScreenInstance?.destroy(),console.log("🪼 Jellyfin Enhanced: Custom Pause Screen is disabled.");return}if(u.pauseScreenInstance?.overlay?.isConnected)return;u.pauseScreenInstance?.destroy();let s=()=>S.own.nowPlaying;class i{constructor(){this.generation=0;this.destroyed=!1;this.currentVideo=null;this.currentItemId=null;this.readyItemId=null;this.syncing=0;this.userId=null;this.token=null;this.cleanupListeners=null;this.imgBlobCache=new Map;this.imgProbeCache=new Map;this.itemCache=new Map;this.fetchAbort=null;this.observer=null;this.prevFocused=null;this.pauseScreenDelayMs=(u.currentSettings.pauseScreenDelaySeconds??5)*1e3;this.pauseScreenTimer=null;this.lastUserInteractionAt=Date.now();this.interactionListeners=null;this._dismissedThisPause=!1;this.overlay=document.createElement("div");this.overlayContent=document.createElement("div");this.overlayLogo=document.createElement("img");this.overlayPlot=document.createElement("div");this.overlayDetails=document.createElement("div");this.overlayDisc=document.createElement("img");this.overlayBackdrop=document.createElement("div");this.progressWrap=document.createElement("div");this.progressBar=document.createElement("div");this.progressMeta=document.createElement("div");this.focusStart=document.createElement("div");this.focusEnd=document.createElement("div");this.closeButton=document.createElement("button");this.keyboardListener=null;this.imageRequests=new Set;this.init()}init(){let e=this.getCredentials();if(!e){console.error("🪼 Jellyfin Enhanced: Jellyfin credentials not found");return}this.userId=e.userId,this.token=e.token,this.releaseReset=I.onReset(()=>{this.destroyed||this.clearState()}),this.releaseUser=u.session?.onUserChange("pause-screen",()=>{if(!this.destroyed){this.clearState();for(let t of this.imgBlobCache.values())URL.revokeObjectURL(t);this.imgBlobCache.clear(),this.imgProbeCache.clear(),this.itemCache.clear(),this.userId=null,this.token=null,this.credentialTimer=window.setTimeout(()=>{if(this.destroyed)return;let t=this.getCredentials();this.userId=t?.userId||null,this.token=t?.token||null},0)}}),this.injectStyles(),this.createOverlay(),this.setupKeyboardAccessibility(),this.setupVideoObserver(),this.setupInteractionListeners()}getCredentials(){let e=localStorage.getItem("jellyfin_credentials");if(!e)return null;try{let t=g(JSON.parse(e)),n=Array.isArray(t.Servers)?t.Servers.map(g):[],r=null;try{r=(typeof y.serverId=="function"?y.serverId():y.serverId)||null}catch{r=null}let a=r?n.find(o=>o.Id===r):n[0];return a&&typeof a.AccessToken=="string"&&typeof a.UserId=="string"?{token:a.AccessToken,userId:a.UserId}:null}catch{return null}}injectStyles(){let e=document.createElement("style");e.id="pause-screen-style",e.textContent=L,document.head.appendChild(e)}createOverlay(){this.overlay=document.createElement("div"),this.overlay.id="pause-screen-overlay",this.overlay.setAttribute("role","dialog"),this.overlay.setAttribute("aria-hidden","true"),this.overlay.setAttribute("aria-modal","true"),this.focusStart=document.createElement("div"),this.focusStart.id="pause-screen-focus-start",this.focusStart.tabIndex=0,this.focusEnd=document.createElement("div"),this.focusEnd.id="pause-screen-focus-end",this.focusEnd.tabIndex=0,this.overlayContent=document.createElement("div"),this.overlayContent.id="pause-screen-content",this.overlayContent.tabIndex=-1,this.overlayBackdrop=document.createElement("div"),this.overlayBackdrop.id="pause-screen-backdrop",this.overlayLogo=document.createElement("img"),this.overlayLogo.id="pause-screen-logo",this.overlayDetails=document.createElement("div"),this.overlayDetails.id="pause-screen-details",this.overlayPlot=document.createElement("div"),this.overlayPlot.id="pause-screen-plot",this.progressWrap=document.createElement("div"),this.progressWrap.id="pause-screen-progress-wrap",this.progressBar=document.createElement("div"),this.progressBar.id="pause-screen-progress-bar";let e=document.createElement("span");this.progressBar.appendChild(e),this.progressMeta=document.createElement("div"),this.progressMeta.id="pause-screen-progress-meta",this.progressMeta.innerHTML=`
              <span class="progress-time"></span>
              <span class="progress-percentage"></span>
              <span class="progress-ends-at"></span>
          `,this.progressWrap.appendChild(this.progressBar),this.progressWrap.appendChild(this.progressMeta),this.overlayDisc=document.createElement("img"),this.overlayDisc.id="pause-screen-disc";let t=document.createElement("button");t.id="pause-screen-close-btn",t.innerHTML="&times;",t.onclick=()=>{this.hideOverlay(!0)},this.closeButton=t,this.overlayContent.appendChild(this.overlayBackdrop),this.overlayContent.appendChild(this.overlayLogo),this.overlayContent.appendChild(this.overlayDetails),this.overlayContent.appendChild(this.overlayPlot),this.overlayContent.appendChild(this.progressWrap),this.overlayContent.appendChild(t),this.overlay.appendChild(this.focusStart),this.overlay.appendChild(this.overlayContent),this.overlay.appendChild(this.overlayDisc),this.overlay.appendChild(this.focusEnd),document.body.appendChild(this.overlay);let n=a=>{(a.target===this.overlay||a.target===this.overlayContent)&&(u.state?.pauseScreenClickTimer&&clearTimeout(u.state.pauseScreenClickTimer),u.state.pauseScreenClickTimer=window.setTimeout(()=>{u.state.pauseScreenClickTimer=null,this.hideOverlay(),this.currentVideo?.paused&&this.currentVideo.play().catch(o=>console.warn("Play blocked",o))},500))};this.overlay.addEventListener("click",n),this.overlay.addEventListener("touchstart",n,{passive:!0});let r=a=>{this.overlay.getAttribute("aria-hidden")==="false"&&(a.target===this.focusStart&&this.overlayContent.focus(),a.target===this.focusEnd&&this.overlayContent.focus())};this.focusStart.addEventListener("focus",r),this.focusEnd.addEventListener("focus",r)}handleRemoteKey(e){let t=()=>{e.preventDefault(),e.stopImmediatePropagation()};return e.key==="ArrowUp"||e.key==="ArrowRight"?(t(),this.closeButton.focus(),!0):e.key==="ArrowDown"||e.key==="ArrowLeft"?(t(),this.overlayContent.focus(),!0):e.key==="Escape"||e.key==="BrowserBack"||e.keyCode===10009||e.keyCode===461?(t(),this.hideOverlay(!0),!0):e.key==="Enter"&&document.activeElement===this.closeButton?(t(),this.hideOverlay(!0),!0):!1}setupKeyboardAccessibility(){this.keyboardListener=e=>{if(this.overlay.getAttribute("aria-hidden")==="false"){if(u.core.ui.isTvLayout()&&this.handleRemoteKey(e))return;(e.code==="Space"||e.code==="Enter")&&(e.preventDefault(),e.stopPropagation(),this.hideOverlay(),this.currentVideo&&this.currentVideo.paused&&this.currentVideo.play().catch(t=>console.warn("🪼 Jellyfin Enhanced: Play() blocked:",t))),e.code==="Tab"&&(this.overlay.contains(document.activeElement)||(this.overlayContent.focus(),e.preventDefault()))}},document.addEventListener("keydown",this.keyboardListener,{capture:!0})}setupVideoObserver(){this.observer=u.helpers.onBodyMutation("pausescreen",()=>this.checkForVideoChanges()),this.checkForVideoChanges()}resetPauseScreenTimer(){this.lastUserInteractionAt=Date.now(),this.schedulePauseOverlayDelay()}schedulePauseOverlayDelay(){if(this.pauseScreenTimer&&(clearTimeout(this.pauseScreenTimer),this.pauseScreenTimer=null),!this.currentVideo||!this.currentVideo.paused||this.currentVideo.ended||this._dismissedThisPause)return;let e=()=>{let t=this.currentVideo;if(!t||!t.paused||t.ended){this.pauseScreenTimer=null;return}let n=Date.now()-this.lastUserInteractionAt;if(n>=this.pauseScreenDelayMs){if(this.syncing){this.pauseScreenTimer=setTimeout(e,250);return}this.pauseScreenTimer=null;let a=s().itemIdFromSource(t);if(a&&a!==this.readyItemId){this.syncItem(t).then(()=>this.schedulePauseOverlayDelay());return}this.readyItemId&&this.readyItemId===this.currentItemId&&this.showOverlay();return}let r=Math.max(100,this.pauseScreenDelayMs-n);this.pauseScreenTimer=setTimeout(e,r)};this.pauseScreenTimer=setTimeout(e,this.pauseScreenDelayMs)}setupInteractionListeners(){let e=null,t=null,n=15,r=()=>this.resetPauseScreenTimer(),a=["mousedown","click","touchstart","touchmove","keydown","wheel"];this.interactionListeners=a.map(l=>{let d=r;return document.addEventListener(l,d,{passive:!0}),{event:l,listener:d}});let o=l=>{if(!(l instanceof MouseEvent))return;let d=l.clientX,h=l.clientY;e!==null&&t!==null?Math.sqrt(Math.pow(d-e,2)+Math.pow(h-t,2))>n&&r():(e=d,t=h),e=d,t=h};document.addEventListener("mousemove",o,{passive:!0}),this.interactionListeners.push({event:"mousemove",listener:o})}checkForVideoChanges(){let e=document.querySelector(".videoPlayerContainer video");e&&e!==this.currentVideo?this.handleVideoChange(e):!e&&this.currentVideo&&this.clearState()}async handleVideoChange(e){this.clearState(),this.currentVideo=e,this.cleanupListeners=this.attachVideoListeners(e),this.itemCache.clear(),this.imgProbeCache.clear();let t=s(),n=t.itemIdFromSource(e)||t.itemIdFromRoute();n&&(this.currentItemId=n,await this.fetchItemInfo(n))}invalidateIdentity(){this.generation++;for(let e of this.imageRequests)e.abort();this.imageRequests.clear(),this.overlay.getAttribute("aria-hidden")==="false"&&this.hideOverlay(),this.clearDisplayData(),this.pauseScreenTimer&&(clearTimeout(this.pauseScreenTimer),this.pauseScreenTimer=null),this.fetchAbort&&(this.fetchAbort.abort(),this.fetchAbort=null),this.currentItemId=null,this.readyItemId=null}async syncItem(e){let t=e.currentSrc,n=this.generation;this.syncing++;try{let r=await s().resolveItemId(e);return this.destroyed||n!==this.generation||e!==this.currentVideo||e.currentSrc!==t?null:r?((r!==this.currentItemId||r!==this.readyItemId)&&(this.currentItemId=r,this.readyItemId=null,await this.fetchItemInfo(r)),this.readyItemId===r?r:null):(this.invalidateIdentity(),null)}finally{this.syncing--}}attachVideoListeners(e){let t=()=>{if(e===this.currentVideo&&!e.ended){this.syncItem(e).then(o=>{o&&e===this.currentVideo&&e.paused&&this.schedulePauseOverlayDelay()}),this.updateProgressStatic(),this.pauseScreenTimer&&(clearTimeout(this.pauseScreenTimer),this.pauseScreenTimer=null);let a=S.peer("resumeRatingsPolling");typeof a=="function"&&a(),this._dismissedThisPause=!1,this.lastUserInteractionAt=Date.now(),this.resetPauseScreenTimer()}},n=()=>{if(e===this.currentVideo){this.pauseScreenTimer&&(clearTimeout(this.pauseScreenTimer),this.pauseScreenTimer=null);let a=S.peer("pauseRatingsPolling");typeof a=="function"&&a(),this.hideOverlay()}},r=()=>{e===this.currentVideo&&this.invalidateIdentity()};return e.addEventListener("pause",t),e.addEventListener("play",n),e.addEventListener("loadstart",r),e.addEventListener("emptied",r),()=>{e.removeEventListener("pause",t),e.removeEventListener("play",n),e.removeEventListener("loadstart",r),e.removeEventListener("emptied",r)}}showOverlay(){window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches?this.overlayDisc.style.animation="none":this.overlayDisc.style.animation="",this.prevFocused=document.activeElement,document.documentElement.classList.add("pause-screen-active"),this.overlay.setAttribute("aria-hidden","false"),this.overlayContent.focus()}hideOverlay(e=!1){document.documentElement.classList.remove("pause-screen-active"),this.overlay.setAttribute("aria-hidden","true"),e&&(this._dismissedThisPause=!0),this.prevFocused&&document.contains(this.prevFocused)&&this.prevFocused instanceof HTMLElement&&this.prevFocused.focus()}clearDisplayData(){this.overlayPlot.textContent="",this.overlayDetails.innerHTML="",this.overlayLogo.removeAttribute("src"),this.overlayDisc.removeAttribute("src"),this.overlayBackdrop.style.backgroundImage="",this.setProgress(0,0)}async fetchItemInfo(e){let t=++this.generation;this.clearDisplayData(),this.fetchAbort?.abort(),this.fetchAbort=new AbortController;try{let n=this.itemCache.get(e);if(!n){let r=await this.fetchWithRetry(y.getUrl(`/Items/${e}`),{headers:{Authorization:'MediaBrowser Token="'+this.token+'"',"X-Emby-Token":this.token??"",Accept:"application/json"},signal:this.fetchAbort.signal});if(this.destroyed||t!==this.generation||!r)return;n={item:r,domain:y.serverAddress()},this.itemCache.set(e,n)}await this.displayItemInfo(n.item,n.domain,e),!this.destroyed&&t===this.generation&&(this.readyItemId=e)}catch(n){if(this.destroyed||t!==this.generation)return;n instanceof Error&&n.name==="AbortError"||(console.error("🪼 Jellyfin Enhanced: Error fetching item info:",n),this.overlayPlot.textContent=u.t("pausescreen_fetch_error"))}}async fetchWithRetry(e,t,n=2){for(let r=0;r<=n;r++)try{let a=await fetch(e,t);if(!a.ok)throw new Error(`HTTP ${a.status}`);return D(await a.json())}catch(a){if(r===n||t.signal?.aborted)throw a;let o=t.signal??I.lease().signal;if(await I.sleep(1e3*(r+1),o),o.aborted)throw new DOMException("Cancelled","AbortError")}}async displayItemInfo(e,t,n){let r=this.generation,a=e.ProductionYear||"",o=e.OfficialRating||"",l=this.formatRuntime(e.RunTimeTicks);this.overlayDetails.replaceChildren();for(let[b,B]of[[a,!1],[o,!0],[l,!1]]){if(!b)continue;let v=document.createElement("span");v.textContent=String(b),B&&(v.className="mediaInfoOfficialRating",v.setAttribute("rating",String(b))),this.overlayDetails.appendChild(v)}this.overlayPlot.textContent=e.Overview||u.t("pausescreen_no_description");let d=this.getLogoUrls(e,t,n),h=this.getDiscUrls(e,t,n),m=this.getBackdropUrls(e,t,n),[C,T,P]=await Promise.all([this.firstAvailableBlobURL(d),this.firstAvailableBlobURL(h),this.firstAvailableBlobURL(m)]);this.destroyed||r!==this.generation||(C&&(this.overlayLogo.src=C),T&&(this.overlayDisc.src=T),P&&(this.overlayBackdrop.style.backgroundImage=`url("${P}")`),this.updateProgressStatic())}formatRuntime(e){if(!e)return"";let t=Math.floor(e/6e8),n=Math.floor(t/60),r=t%60;return n>0?`${n}h ${r}m`:`${r}m`}updateProgressStatic(){if(!this.currentVideo)return this.setProgress(0,0);let e=Number.isFinite(this.currentVideo.currentTime)?this.currentVideo.currentTime:0,t=Number.isFinite(this.currentVideo.duration)?this.currentVideo.duration:0;this.setProgress(e,t)}setProgress(e,t){x(this.progressBar,this.progressMeta,e,t,(n,r)=>u.t(n,r))}async firstAvailableBlobURL(e){let t=this.generation;for(let n of e){if(this.destroyed||t!==this.generation)return null;if(!n)continue;let r=await this.probeImage(n);if(this.destroyed||t!==this.generation)return null;if(!r)continue;let a=await this.toBlobURL(n);if(this.destroyed||t!==this.generation)return null;if(a)return a}return null}async probeImage(e,t=2500){let n=this.generation;if(this.destroyed)return!1;if(this.imgProbeCache.has(e))return this.imgProbeCache.get(e);let r=new AbortController;this.imageRequests.add(r);let a=window.setTimeout(()=>r.abort(),t);try{let o=await fetch(e,{method:"HEAD",headers:{Authorization:'MediaBrowser Token="'+this.token+'"',"X-Emby-Token":this.token??""},signal:r.signal});if(clearTimeout(a),this.destroyed||n!==this.generation)return!1;let l=o.ok;return this.imgProbeCache.set(e,l),l}catch{return this.destroyed||n!==this.generation||this.imgProbeCache.set(e,!1),!1}finally{clearTimeout(a),this.imageRequests.delete(r)}}async toBlobURL(e,t=5e3){let n=this.generation;if(this.destroyed)return null;if(this.imgBlobCache.has(e))return this.imgBlobCache.get(e);let r=new AbortController;this.imageRequests.add(r);let a=window.setTimeout(()=>r.abort(),t);try{let o=await fetch(e,{headers:{Authorization:'MediaBrowser Token="'+this.token+'"',"X-Emby-Token":this.token??""},signal:r.signal});if(clearTimeout(a),this.destroyed||n!==this.generation||!o.ok)return null;let l=await o.blob();if(this.destroyed||n!==this.generation)return null;let d=URL.createObjectURL(l);return this.imgBlobCache.set(e,d),d}catch{return null}finally{clearTimeout(a),this.imageRequests.delete(r)}}getLogoUrls(e,t,n){let r=[];return e.ImageTags?.Logo&&r.push(`${t}/Items/${n}/Images/Logo?tag=${e.ImageTags.Logo}`),e.ParentId&&r.push(`${t}/Items/${e.ParentId}/Images/Logo`),e.SeriesId&&r.push(`${t}/Items/${e.SeriesId}/Images/Logo`),r}getDiscUrls(e,t,n){let r=[`${t}/Items/${n}/Images/Disc`];return e.ParentId&&r.push(`${t}/Items/${e.ParentId}/Images/Disc`),e.SeriesId&&r.push(`${t}/Items/${e.SeriesId}/Images/Disc`),r}getBackdropUrls(e,t,n){let r=[`${t}/Items/${n}/Images/Backdrop`];return e.ParentId&&r.push(`${t}/Items/${e.ParentId}/Images/Backdrop`),e.SeriesId&&r.push(`${t}/Items/${e.SeriesId}/Images/Backdrop`),r}clearState(){this.generation++,u.state?.pauseScreenClickTimer&&(clearTimeout(u.state.pauseScreenClickTimer),u.state.pauseScreenClickTimer=null);for(let e of this.imageRequests)e.abort();this.imageRequests.clear(),this.hideOverlay(),this.clearDisplayData(),this.pauseScreenTimer&&(clearTimeout(this.pauseScreenTimer),this.pauseScreenTimer=null),this.cleanupListeners&&(this.cleanupListeners(),this.cleanupListeners=null),this.fetchAbort&&(this.fetchAbort.abort(),this.fetchAbort=null),this.currentItemId=null,this.readyItemId=null,this.currentVideo=null}destroy(){this.destroyed=!0,typeof this.releaseReset=="function"&&this.releaseReset(),typeof this.releaseUser=="function"&&this.releaseUser(),clearTimeout(this.credentialTimer),this.keyboardListener&&(document.removeEventListener("keydown",this.keyboardListener,{capture:!0}),this.keyboardListener=null),this.overlay&&this.clearState(),this.observer&&(this.observer.unsubscribe(),this.observer=null),this.interactionListeners&&(this.interactionListeners.forEach(({event:t,listener:n})=>{document.removeEventListener(t,n)}),this.interactionListeners=null);for(let t of this.imgBlobCache.values())URL.revokeObjectURL(t);this.imgBlobCache.clear(),this.imgProbeCache.clear(),this.itemCache.clear(),this.overlay?.parentNode&&this.overlay.parentNode.removeChild(this.overlay);let e=document.getElementById("pause-screen-style");e&&e.remove()}}u.pauseScreenInstance=new i,console.log("🪼 Jellyfin Enhanced: Custom Pause Screen initialized.")};})();
})();
