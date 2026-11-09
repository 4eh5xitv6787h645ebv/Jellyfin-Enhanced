(() => {
"use strict";(()=>{function D(s,l,d){let c=l.core?.featureContext;if(typeof c!="function")throw new Error(`${s}: JE.core.featureContext is missing; core/ui-kit.js must load before feature scripts`);return c(s,l,d)}function N(s,l){return D("chrome",s,{facades:l})}function U(){return window.ApiClient}function A(){return window.JellyfinEnhanced}var m=Object.freeze({Default:"",Aurora:"aurora.css",Banana:"banana.css",Coal:"coal.css",Coral:"coral.css",Forest:"forest.css",Grass:"grass.css",Jellyblue:"jellyblue.css",Jellyflix:"jellyflix.css",Jellypurple:"jellypurple.css",Lavender:"lavender.css","Liquid Glass":"liquidglass.css",Midnight:"midnight.css",Mint:"mint.css",Ocean:"ocean.css",Peach:"peach.css",Watermelon:"watermelon.css"}),i="🪼 Jellyfin Enhanced: Jellyfish Theme Selector:",L="jellyfin-theme-selector-css",g="jellyfin-theme-selector",V=250,Q=1e3,X=100,u=300,C="jellyfin-theme-applied";function R(s,l){return l?`@import url("${s}${l}");`:""}function Z(s,l){for(let[d,c]of Object.entries(m))if(R(s,c)===l)return d;return"Default"}function ee(s){return s.toISOString().split("T")[0]??""}function M(s,l){let d=s.cdn.url("jellyfish","colors/"),c=null,v,w=!1,p=(e,n)=>`${e}-${n}`;function h(e,n,t=null){try{let o=localStorage.getItem(p(e,n));return o===null?t:o}catch(o){return console.error("🪼 Jellyfin Enhanced: Theme selector storage read error",o),t}}function y(e,n,t){try{return localStorage.setItem(p(e,n),t),!0}catch(o){return console.error("🪼 Jellyfin Enhanced: Theme selector storage write error",o),!1}}function H(e,n){try{return localStorage.removeItem(p(e,n)),!0}catch(t){return console.error(`${i} localStorage remove error:`,t),!1}}let b=e=>h(e,"randomThemeEnabled")==="true";function I(){try{let e=l()?.getCurrentUserId?.();if(typeof e=="string"&&e.trim()!=="")return e}catch(e){console.error(`${i} Error extracting user ID:`,e)}return console.error(`${i} Could not extract user ID`),null}function T(e){try{return l()?.getCurrentUserId?.()===e}catch{return!1}}function S(e,n,t="Default"){let o=R(d,n);o?(y(e,"customCss",o),console.log(`${i} Theme set to: ${t}`)):(H(e,"customCss"),console.log(`${i} Theme cleared (default)`))}function E(e){let n=window;try{n.Dashboard?.alert?n.Dashboard.alert(e):n.require?n.require(["toast"],t=>t(e)):console.log(`${i} Notification: ${e}`)}catch(t){console.error(`${i} Failed to show notification:`,t)}}function z(){try{let e=sessionStorage.getItem(C);e&&(sessionStorage.removeItem(C),setTimeout(()=>E(`Theme applied: ${e}`),Q))}catch(e){console.error(`${i} Session storage error:`,e)}}function k(e,n){try{sessionStorage.setItem(C,e)}catch(t){console.error(`${i} ${n}`,t)}}function j(){let e=I();if(!e||!b(e))return;let n=ee(new Date);if(n===h(e,"lastRandomThemeDate")){console.log(`${i} Random theme already applied for today.`);return}console.log(`${i} New day detected! Applying a random theme.`);let t=Object.keys(m).filter(a=>a!=="Default"),o=t[Math.floor(Math.random()*t.length)]??"Default";S(e,m[o]??"",o),y(e,"lastRandomThemeDate",n),k(`Random Daily (${o})`,"Could not set session storage:"),window.location.reload()}function J(){if(document.getElementById(L))return;let e=document.createElement("style");e.id=L,e.textContent=`
            #theme-selector-body {
                display: flex !important;
                align-items: center;
                justify-content: flex-start;
                flex-direction: row;
                flex-wrap: wrap;
                gap: 1em;
                padding: .4em .75em;
            }
            #theme-selector-select {
                max-width: 200px !important;
                min-width: 150px !important;
                transition: opacity ${u}ms ease;
            }
            #theme-selector-select:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            #random-theme-button {
                padding: 0.5em 0.5em !important;
                height: auto !important;
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 0.3em;
                background-color: transparent;
                border-radius: 10px;
                transition: background-color 0.3s ease, opacity ${u}ms ease;
            }
            #random-theme-button:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            #random-theme-button.active {
                background-color: #4CAF50;
                color: white;
            }
            .theme-applying {
                opacity: 0;
                transition: opacity ${u}ms ease;
            }
            .theme-applied {
                opacity: 1;
                transition: opacity ${u}ms ease;
            }
        `,document.head.appendChild(e),console.log(`${i} Custom CSS injected`)}function B(e,n="material-icons"){let t=document.createElement("span");return t.className=n,t.textContent=e,t.setAttribute("aria-hidden","true"),t}function O(e,n){return T(e)?!0:(console.warn(`${i} Signed-in user changed; discarding the previous user's selector.`),n.remove(),f(),!1)}function _(e,n){let t=document.createElement("select");t.setAttribute("is","emby-select"),t.className="emby-select-withcolor emby-select",t.id="theme-selector-select",t.setAttribute("aria-label","Select theme"),t.removeAttribute("label");let o=Z(d,h(e,"customCss","")??"");for(let a of Object.keys(m)){let r=document.createElement("option");r.value=a,r.textContent=a,a===o&&(r.selected=!0),t.appendChild(r)}return t.addEventListener("change",a=>{if(a.preventDefault(),a.stopPropagation(),!O(e,n))return;let r=t.value,F=m[r];if(F===void 0)return;t.disabled=!0;let P=document.getElementById("random-theme-button");P instanceof HTMLButtonElement&&(P.disabled=!0),document.body.classList.add("theme-applying"),S(e,F,r),k(r,"Session storage error:"),setTimeout(()=>{console.log(`${i} Reloading to apply theme: ${r}`),window.location.reload()},u)}),t}function W(e,n){let t=document.createElement("button");t.setAttribute("is","emby-button"),t.className="emby-button",t.id="random-theme-button",t.setAttribute("aria-label","Toggle random daily theme"),t.setAttribute("title","Random daily theme");let o=document.createElement("span");o.style.fontSize="0.85em";let a=()=>{let r=b(e);t.classList.toggle("active",r),o.textContent=r?"Daily":"",t.setAttribute("aria-pressed",r.toString())};return t.appendChild(B("shuffle")),t.appendChild(o),a(),t.addEventListener("click",()=>{if(!O(e,n))return;let r=!b(e);y(e,"randomThemeEnabled",String(r)),E(`Random daily theme turned ${r?"ON":"OFF"}.`),console.log(`${i} Random daily theme set to: ${r}`),a(),r&&j()}),t}function q(e){let n=document.createElement("div");n.className="theme-selector-container listItem-border",n.id=g,n.dataset.jeThemeUser=e;let t=document.createElement("div");t.className="listItem",t.id="theme-selector-item";let o=B("palette","material-icons listItemIcon listItemIcon-transparent");o.id="theme-selector-icon";let a=document.createElement("div");a.className="listItemBody",a.id="theme-selector-body";let r=document.createElement("div");return r.className="listItemBodyText",r.id="theme-selector-label",r.textContent="Theme",a.appendChild(r),a.appendChild(W(e,n)),a.appendChild(_(e,n)),t.appendChild(o),t.appendChild(a),n.appendChild(t),n}function K(){try{let n=document.querySelector(".verticalSection .headerUsername")?.closest(".verticalSection");if(!n)return!1;let t=I();return t?(console.log(`${i} Creating theme selector element...`),n.appendChild(q(t)),console.log(`${i} Successfully injected!`),!0):!1}catch(e){return console.error(`${i} Injection error:`,e),!1}}let Y=()=>!!(document.querySelector(".headerUsername")&&document.querySelector(".lnkUserProfile"));function G(){let e=document.getElementById(g);e&&e instanceof HTMLElement&&e.dataset.jeThemeUser&&!T(e.dataset.jeThemeUser)&&e.remove(),Y()&&!document.getElementById(g)&&(console.log(`${i} Preferences page detected and selector is missing. Injecting...`),K())}function f(){clearTimeout(v),v=setTimeout(G,X)}function $(){let e=l();if(!e||typeof e.getCurrentUserId!="function"){console.log(`${i} Waiting for ApiClient...`),setTimeout($,V);return}if(console.log(`${i} ApiClient is available. Starting persistent element monitoring.`),j(),J(),z(),c&&(c.unsubscribe(),c=null),s.helpers?.onBodyMutation)c=s.helpers.onBodyMutation("theme-selector",f);else{let n=new MutationObserver(f);n.observe(document.body,{childList:!0,subtree:!0}),c={unsubscribe:()=>n.disconnect()}}!w&&s.session&&(w=!0,s.session.onUserChange("theme-selector",()=>{document.getElementById(g)?.remove(),f()}))}return{initialize:$}}var x=A();x&&(N(x,["initializeThemeSelector"]).own.initializeThemeSelector=M(x,()=>U()).initialize);})();
})();
