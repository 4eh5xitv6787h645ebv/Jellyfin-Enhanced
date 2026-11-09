(() => {
"use strict";(()=>{function Ce(){return window}function ze(e){let s=window.JellyfinEnhanced;if(!s)throw new Error(`${e} loaded before Jellyfin Enhanced`);return s}function M(){let e=Ce().ApiClient;if(!e)throw new Error("Jellyfin ApiClient unavailable");return e}function Ve(){return Ce().ApiClient!==void 0}function ne(){let e=Ce().ApiClient?.getCurrentUserId();return typeof e=="string"&&e?e:null}function J(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function k(e,t){return J(e)?e[t]:void 0}function L(e){return typeof e=="string"?e:void 0}function Ee(e){return typeof e=="string"&&e!==""?e:void 0}function ke(e){return typeof e=="number"&&Number.isFinite(e)?e:void 0}function le(e){return typeof e=="number"&&Number.isInteger(e)?e:void 0}function vn(e){return typeof e=="boolean"?e:void 0}function G(e){return Array.isArray(e)?e:[]}function wn(e){return G(e).filter(t=>typeof t=="string")}function te(e){if(typeof e=="string")return e||void 0;if(typeof e=="number"&&Number.isFinite(e)&&e!==0)return String(e)}function $e(e){let t={};if(!J(e))return t;let s=te(e.Tmdb),a=te(e.Imdb),d=te(e.Tvdb),v=te(e.AniList),R=te(e.Anilist);return s!==void 0&&(t.Tmdb=s),a!==void 0&&(t.Imdb=a),d!==void 0&&(t.Tvdb=d),v!==void 0&&(t.AniList=v),R!==void 0&&(t.Anilist=R),t}function Je(e){if(Array.isArray(e))return e.filter(J).map(t=>{let s={},a=L(t.Type),d=L(t.Language);return a!==void 0&&(s.Type=a),d!==void 0&&(s.Language=d),s})}function Sn(e){if(Array.isArray(e))return e.map(t=>{let s={},a=L(k(t,"Id")),d=Je(k(t,"MediaStreams"));return a!==void 0&&(s.Id=a),d!==void 0&&(s.MediaStreams=d),s})}function A(e,t,s){s!==void 0&&(e[t]=s)}function qe(e){if(!J(e))return null;let t={ProviderIds:$e(e.ProviderIds),SeriesProviderIds:$e(e.SeriesProviderIds)};A(t,"Id",L(e.Id)),A(t,"Type",L(e.Type)),A(t,"Name",L(e.Name)),A(t,"SeriesId",L(e.SeriesId)),A(t,"SeriesName",L(e.SeriesName)),A(t,"IndexNumber",ke(e.IndexNumber)),A(t,"ParentIndexNumber",ke(e.ParentIndexNumber)),A(t,"PremiereDate",L(e.PremiereDate)),A(t,"DisplayOrder",L(e.DisplayOrder)),A(t,"MediaSources",Sn(e.MediaSources)),A(t,"MediaStreams",Je(e.MediaStreams)),A(t,"FirstEpisodeId",L(k(e.FirstEpisode,"Id"))),Array.isArray(e.Tags)&&(t.Tags=wn(e.Tags));let s=e.UserData;return A(t,"Played",vn(k(s,"Played"))),A(t,"UnplayedItemCount",ke(k(s,"UnplayedItemCount"))),t}function de(e=window.location.hash){try{return new URLSearchParams(e.split("?")[1]??"").get("id")}catch{return null}}function Pe(){return document.querySelector("#itemDetailPage:not(.hide)")}function Cn(e,t,s,a=ne()){return e?.getItemCached?s?e.getItemCached(t,{userId:a}):e.getItemCached(t):M().getItem(a,t)}async function Ie(e,t,s,a=ne()){return qe(await Cn(e,t,s,a))}function K(e){let t=e?.getEpoch(),s=ne(),a=M(),d=a.getUrl("/"),v=a.accessToken();return()=>Ve()&&M()===a&&a.getUrl("/")===d&&a.accessToken()===v&&(!e||t===void 0||e.isCurrent(t))&&ne()===s}function We(e,t){try{let s=new URL(e,t);return["http:","https:","mailto:","tel:","ftp:","blob:"].includes(s.protocol)?e:"#"}catch{return"#"}}function ce(e){return We(e,window.location.href)}function Te(e,t,s={}){let a=e?.createExternalLink;if(a)return a(t,s);let d=document.createElement("a");return d.setAttribute("is","emby-linkbutton"),d.href=ce(t),d.target="_blank",d.rel="noopener noreferrer",s.title&&(d.title=s.title),s.className&&(d.className=s.className),s.text&&(d.textContent=s.text),s.resetStyle&&(d.style.cssText="padding:0;background:none;border-radius:0;min-width:0;"),typeof s.setup=="function"&&s.setup(d),d}function ue(e){return encodeURIComponent(e)}function De(e){return e?e.replace(/'/g,"").replace(/\n/g,",").split(",").map(t=>t.trim()).filter(t=>t):[]}function kn(e){if(!J(e))return null;let t={provider_name:L(e.provider_name)??"",logo_path:L(e.logo_path)??""},s=le(e.provider_id);return s!==void 0&&(t.provider_id=s),t}function En(e){let t={},s=Ee(k(e,"link"));s!==void 0&&(t.link=s);let a=k(e,"flatrate");return Array.isArray(a)&&(t.flatrate=a.map(kn).filter(d=>d!==null)),t}function Le(e){let t={},s=k(e,"results");if(J(s))for(let[a,d]of Object.entries(s))t[a]=En(d);return{results:t}}function q(e,t){return e&&Object.prototype.hasOwnProperty.call(e.results,t)?e.results[t]:void 0}function Ge(e,t,s){let a=e||[];if(t.defaults.length>0&&(a=a.filter(d=>t.defaults.includes(d.provider_name))),t.ignore.length>0)try{let d=t.ignore.map(v=>new RegExp(v,"i"));a=a.filter(v=>!d.some(R=>R.test(v.provider_name)))}catch(d){s(d)}return a}function Ke(e){let t=(e||"").toString().trim().toLowerCase();return t===""||t==="aired"||t==="airdate"||t==="default"}async function Ye(e,t,s){let a=new Array(e.length),d=0,v=Array.from({length:Math.min(t,e.length)},async()=>{for(;d<e.length;){let R=d++,B=e[R];B!==void 0&&(a[R]=await s(B))}});return await Promise.all(v),a}function Qe(e){let t=e.filter(d=>d>0),s=[];for(let d=0;d<t.length;){let v=d;for(;v+1<t.length&&t[v+1]===(t[v]??NaN)+1;)v++;s.push(v>d?`${t[d]}–${t[v]}`:String(t[d])),d=v+1}let a=e.includes(0);return{single:s.length===1&&!a&&t.length===1?t[0]??null:null,specialsOnly:s.length===0&&a,ranges:s,hasSpecials:a}}function Xe(e){let t=new Map;for(let a of e){let d=a.services.map(R=>R.provider_id??NaN).sort((R,B)=>R-B).join(","),v=t.get(d);v||t.set(d,v={services:a.services,numbers:[]}),v.numbers.push(a.number)}if(t.size<=1)return null;let s=[...t.values()].filter(a=>a.services.length>0);return s.length>0?s:null}function Ze(e){return e.length===1?e[0]??"":e.length===2?e.join(" and "):`${e.slice(0,-1).join(", ")} and ${e[e.length-1]??""}`}function en(e){let t={};for(let s of e.trim().split(`
`)){if(s.startsWith("#"))continue;let[a,d]=s.split("	");a&&d&&(t[a]=d)}return t}function nn(e){return e.trim().split(`
`).filter(t=>!t.startsWith("#")&&t.trim()!=="")}var tn={US:"United States",GB:"United Kingdom",IN:"India",CA:"Canada",DE:"Germany",FR:"France",JP:"Japan",AU:"Australia",BR:"Brazil",MX:"Mexico",IE:"Ireland",IT:"Italy",ES:"Spain",NL:"Netherlands",SE:"Sweden",NO:"Norway",DK:"Denmark",FI:"Finland"},rn=["Netflix","Amazon Prime Video","Disney Plus","HBO Max","Hulu","Apple TV Plus","Paramount Plus","Peacock","JioCinema","Disney+ Hotstar","ZEE5","SonyLIV"];function on(e){let t=L(k(e,"message"))||"";return e instanceof TypeError&&t==="Failed to fetch"?"TMDB API is unreachable.":e instanceof SyntaxError?"Received an unexpected response from the server. Check your reverse proxy or Jellyfin configuration.":t.includes("401")?"Invalid TMDB API Key.":t.includes("404")?"The requested item could not be found on TMDB.":t.includes("429")?"Too many requests. Please wait a moment and try again.":t.startsWith("HTTP 5")?"The TMDB service is temporarily unavailable. Please try again later.":t||"An unknown error occurred"}function Re(e,t){return{region:Ee(k(e,"Region"))||t,regions:Array.isArray(k(e,"Regions"))?G(k(e,"Regions")).filter(s=>typeof s=="string"):[],services:Array.isArray(k(e,"Services"))?G(k(e,"Services")).filter(s=>typeof s=="string"):[],seasonProviders:k(e,"SeasonProviders")!==!1}}var c=ze("Jellyfin Elsewhere"),pe="🪼 Jellyfin Enhanced: 🎬 Jellyfin Elsewhere:";c.initializeElsewhereScript=function(){let t=c.pluginConfig;if(!t.ElsewhereEnabled){console.log(`${pe} Feature is disabled in plugin settings.`);return}let s=!!t.TmdbEnabled,a=t.DEFAULT_REGION||"US",d={defaults:De(t.DEFAULT_PROVIDERS),ignore:De(t.IGNORE_PROVIDERS)},v=t.ElsewhereCustomBrandingText||"",R=t.ElsewhereCustomBrandingImageUrl||"",B=t.ElsewhereSeasonProviders!==!1;if(!s){console.log(`${pe} TMDB is not configured, skipping initialization`);return}let H=a,W=[],F=[],$={},ge=[],U=!0,j=0,Y=0,fe=n=>Ge(n,d,r=>console.error(`${pe} Invalid regex in IGNORE_PROVIDERS.`,r)),Q=n=>(Object.prototype.hasOwnProperty.call($,n)?$[n]:void 0)||n;console.log("🪼 Jellyfin Enhanced: 🎬 Jellyfin Elsewhere starting...");function sn(){fetch(c.cdn.url("elsewhere-res","regions.txt")).then(n=>n.ok?n.text():Promise.reject(new Error(`HTTP ${n.status}`))).then(n=>{$={...$,...en(n)}}).catch(()=>{$={...tn}}),fetch(c.cdn.url("elsewhere-res","providers.txt")).then(n=>n.ok?n.text():Promise.reject(new Error(`HTTP ${n.status}`))).then(n=>{ge=nn(n)}).catch(()=>{ge=[...rn]})}function X(n,r="18px"){let i=document.createElement("span");return i.className="material-icons",i.textContent=n,i.style.fontSize=r,i.style.lineHeight="1",i}function Ae(n,r,i){let o=document.createElement("div");o.style.cssText="position: relative; margin-bottom: 6px;";let l,u=h=>{let m=h.toLowerCase();if(m.length===0){y.style.display="none";return}I(r.filter(P=>P.toLowerCase().includes(m)&&!i.includes(P)))},f=c.helpers.debounce,b="",x=f?f.call(c.helpers,()=>u(b),300):null,p=document.createElement("input");p.type="text",p.placeholder=n,p.style.cssText=`
                width: 100%;
                padding: 10px;
                border: 1px solid #444;
                border-radius: 6px;
                box-sizing: border-box;
                background: #2a2a2a;
                color: #fff;
                font-size: 14px;
            `;let y=document.createElement("div");y.style.cssText=`
                position: absolute;
                top: 100%;
                left: 0;
                right: 0;
                background: #1a1a1a;
                border: 1px solid #444;
                border-top: none;
                border-radius: 6px;
                max-height: 200px;
                overflow-y: auto;
                display: none;
                z-index: 1000;
            `;let T=document.createElement("div");T.style.cssText=`
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                margin-top: 6px;
            `;let w=-1,S=[];function _(){T.replaceChildren();for(let h of i){let m=document.createElement("span");m.className="selected-tag",m.style.cssText=`
                        background: #0078d4;
                        color: white;
                        padding: 4px 10px;
                        border-radius: 16px;
                        font-size: 12px;
                        display: inline-flex;
                        align-items: center;
                        gap: 6px;
                    `,m.textContent=h,m.dataset.value=h;let P=document.createElement("span");P.textContent="×",P.style.cssText="cursor: pointer; font-weight: bold; font-size: 14px;",P.onclick=()=>{let E=i.indexOf(h);E>-1&&(i.splice(E,1),_())},m.appendChild(P),T.appendChild(m)}}function I(h){y.replaceChildren(),y.style.display="block",S=h,w=-1,h.forEach((m,P)=>{let E=document.createElement("div");E.textContent=m,E.style.cssText=`
                        padding: 10px;
                        cursor: pointer;
                        border-bottom: 1px solid #333;
                        color: #fff;
                        font-size: 14px;
                    `,E.dataset.index=String(P),E.onmouseenter=()=>{O(),E.style.background="#333",w=P},E.onmouseleave=()=>{E.style.background="#1a1a1a"},E.onclick=()=>C(m),y.appendChild(E)})}function O(){y.querySelectorAll("div").forEach(h=>{h.style.background="#1a1a1a"})}function D(){if(O(),w>=0&&w<S.length){let h=y.querySelector(`[data-index="${w}"]`);h&&(h.style.background="#333",h.scrollIntoView({block:"nearest"}))}}function C(h){i.includes(h)||(i.push(h),_()),p.value="",y.style.display="none",w=-1}return p.oninput=()=>{x?(b=p.value,x()):(clearTimeout(l),l=setTimeout(()=>u(p.value),300))},p.onkeydown=h=>{if(y.style.display!=="none")switch(h.key){case"ArrowDown":h.preventDefault(),w=Math.min(w+1,S.length-1),D();break;case"ArrowUp":h.preventDefault(),w=Math.max(w-1,-1),D();break;case"Enter":{h.preventDefault();let m=S[w];w>=0&&m!==void 0&&C(m);break}case"Escape":y.style.display="none",w=-1;break}},p.onblur=()=>{setTimeout(()=>{y.contains(document.activeElement)||(y.style.display="none")},200)},o.append(p,y,T),_(),o}let me="streaming-settings-modal";function He(){let n=document.getElementById(me);n instanceof HTMLElement&&(n.style.display="none",n.replaceChildren())}function _e(){let n=document.getElementById(me);if(n instanceof HTMLDivElement)return n;let r=document.createElement("div");return r.id=me,r.style.cssText=`
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.85);
                display: none;
                z-index: 10000;
                align-items: center;
                justify-content: center;
            `,r.onclick=i=>{i.target===r&&(r.style.display="none")},document.body.appendChild(r),r}function g(n,r,i){let o=document.createElement(n);return o.style.cssText=r,i!==void 0&&(o.textContent=i),o}function an(n,r){let i=K(c.session),o=j,l=()=>i()&&o===j,u=!1,f=g("div",`
                background: #181818;
                padding: 20px;
                border-radius: 8px;
                max-width: 500px;
                width: 90%;
                max-height: 80vh;
                overflow-y: auto;
                color: #fff;
                border: 1px solid #333;
                box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            `);f.appendChild(g("h3","margin-top: 0; margin-bottom: 16px; color: #fff; font-size: 18px; font-weight: bolder;",c.t("elsewhere_settings_title")));let b=g("div","margin-bottom: 16px;"),x=g("div","display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;");x.appendChild(g("label","font-weight: 600; color: #ccc;",c.t("elsewhere_settings_country")));let p=g("button","display: flex; align-items: center; justify-content: center; background: transparent; border: none; color: #999; cursor: pointer; padding: 2px; border-radius: 4px;");p.type="button",p.id="reset-region-btn",p.title="Reset to plugin default",p.appendChild(X("restart_alt","16px")),x.appendChild(p),b.appendChild(x);let y=g("select","width: 100%; padding: 12px; border: 1px solid #444; border-radius: 6px; background: #2a2a2a; color: #fff; font-size: 14px;");y.id="region-select";for(let[m,P]of Object.entries($)){let E=document.createElement("option");E.value=m,E.textContent=P,m===H&&(E.selected=!0),y.appendChild(E)}for(let m of new Set([H,a])){if(Array.from(y.options).some(E=>E.value===m))continue;let P=document.createElement("option");P.value=m,P.textContent=m,y.appendChild(P)}y.value=H,b.appendChild(y),f.appendChild(b);let T=g("div","margin-bottom: 16px;");T.appendChild(g("label","display: block; margin-bottom: 5px; font-weight: 600; color: #ccc;",c.t("elsewhere_settings_other_countries")));let w=document.createElement("div");w.id="regions-autocomplete",T.appendChild(w),f.appendChild(T);let S=g("div","margin-bottom: 16px;");S.appendChild(g("label","display: block; margin-bottom: 6px; font-weight: 600; color: #ccc;",c.t("elsewhere_settings_providers")));let _=document.createElement("div");_.id="services-autocomplete",S.appendChild(_),f.appendChild(S);let I=null;if(B){let m=g("label","display: flex; align-items: center; gap: 8px; margin-bottom: 16px; color: #ccc; cursor: pointer;");I=g("input","width: 16px; height: 16px; cursor: pointer;"),I.type="checkbox",I.id="season-providers-checkbox",I.checked=U,m.append(I,g("span","",c.t("elsewhere_settings_season_providers"))),f.appendChild(m)}let O=g("div","display: flex; gap: 12px; justify-content: flex-end;"),D=g("button","padding: 10px 18px; border: 1px solid #444; background: #2a2a2a; color: #fff; border-radius: 6px; cursor: pointer; font-size: 14px;",c.t("elsewhere_settings_cancel"));D.id="cancel-settings";let C=g("button","padding: 10px 18px; border: none; background: #0078d4; color: white; border-radius: 6px; cursor: pointer; font-size: 14px;",c.t("elsewhere_settings_save"));C.id="save-settings",O.append(D,C),f.appendChild(O),p.onmouseenter=()=>{p.style.color="#fff"},p.onmouseleave=()=>{p.style.color="#999"},p.onclick=()=>{y.value=a};let h=Object.entries($).map(([m,P])=>`${P} (${m})`);w.appendChild(Ae(c.t("elsewhere_settings_add_countries_placeholder"),h,W.map(m=>`${Q(m)} (${m})`))),_.appendChild(Ae(c.t("elsewhere_settings_add_providers_placeholder"),ge,F.slice())),D.onclick=()=>{n.style.display="none"},C.onclick=async()=>{if(u||!l()||!n.isConnected||n.style.display==="none")return;u=!0,C.disabled=!0;let m=y.value,P=[];w.querySelectorAll(".selected-tag").forEach(V=>{let N=(V.dataset.value??"").match(/\(([A-Z]{2})\)$/);N?.[1]&&P.push(N[1])});let E=P,z=[];_.querySelectorAll(".selected-tag").forEach(V=>{z.push((V.dataset.value??"").trim())});let Z=z,we=I?.checked??U,Se={...r,Region:m,Regions:E,Services:Z,SeasonProviders:we};try{if(await c.saveUserSettings("elsewhere.json",Se,{throwOnError:!0,isCurrent:l}),!l())return;c.userConfig.elsewhere=Se,be()}catch{if(l()&&n.isConnected){let N=f.querySelector(".je-elsewhere-save-error");N||(N=document.createElement("p"),N.className="je-elsewhere-save-error",N.setAttribute("role","alert"),O.before(N)),N.textContent=re("elsewhere_settings_save_failed","Could not save your choices. Try again.")}}finally{u=!1,l()&&(C.disabled=!1)}},n.replaceChildren(f)}function ln(n){if(n===null||typeof n!="object"||Array.isArray(n))return!1;let r=k(n,"Region"),i=k(n,"Regions"),o=k(n,"Services"),l=k(n,"SeasonProviders");return(r==null||typeof r=="string")&&(i==null||Array.isArray(i)&&i.every(u=>typeof u=="string"))&&(o==null||Array.isArray(o)&&o.every(u=>typeof u=="string"))&&(l==null||typeof l=="boolean")}function re(n,r){let i=c.t(n);return i&&i!==n?i:r}function Oe(){let n=_e(),r=++Y,i=K(c.session),o=()=>r===Y&&i()&&n.isConnected&&n.style.display!=="none";n.replaceChildren(g("p","color: #fff;",re("elsewhere_settings_loading","Loading your settings…"))),n.style.display="flex";let l=M(),u=l.getCurrentUserId();Promise.resolve().then(()=>{if(!o()||!u)throw new Error("Settings opening cancelled");return l.ajax({type:"GET",url:l.getUrl(`/JellyfinEnhanced/user-settings/${u}/elsewhere.json?_=${Date.now()}`),dataType:"json"})}).then(f=>{if(!o())return;if(!ln(f))throw new Error("Invalid Elsewhere settings document");let b=Re(f,a);H=b.region,W=b.regions,F=b.services,U=b.seasonProviders,he(),an(n,f),ae()}).catch(()=>{if(!o())return;let f=g("div","padding: 24px; background: #181818; color: #fff;",re("elsewhere_settings_load_failed","Your settings could not be loaded. No changes were saved.")),b=g("button","",re("elsewhere_settings_retry","Retry"));b.type="button",b.onclick=Oe;let x=g("button","",c.t("elsewhere_settings_cancel"));x.type="button",x.onclick=()=>{n.style.display="none",Y++},f.append(b,x),n.replaceChildren(f)})}function he(){j++,document.querySelectorAll(".streaming-lookup-container").forEach(n=>n.remove()),ie.clear(),oe.clear(),se.clear()}function be(n=!0){let r=Re(c.userConfig.elsewhere,a);H=r.region,W=r.regions,F=r.services,U=r.seasonProviders,n&&(Y++,He(),he(),n&&ae())}document.addEventListener("je:user-data-loaded",()=>be()),c.session?.onUserChange("elsewhere",()=>{H=a,W=[],F=[],U=!0,Y++,He(),he()});function xe(n){let r=g("div",`
                display: inline-flex;
                align-items: center;
                padding: 6px 10px;
                margin: 3px 5px 3px 0;
                border-radius: 8px;
                font-size: 13px;
                font-weight: 500;
                color: #fff;
                white-space: nowrap;
                transition: all 500ms ease;
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                backdrop-filter: blur(10px);
            `),i=document.createElement("img");i.src=`https://image.tmdb.org/t/p/w92${n.logo_path}`,i.alt=n.provider_name,i.style.cssText=`
                width: 20px;
                height: 20px;
                margin-right: 8px;
                object-fit: contain;
                border-radius: 4px;
            `,i.onerror=()=>{i.style.display="none"},r.appendChild(i);let o=document.createElement("span");return o.textContent=n.provider_name,r.appendChild(o),r.onmouseenter=()=>{r.style.transform="translateY(-2px)",r.style.background="rgba(255, 255, 255, 0.2)",r.style.boxShadow="0 4px 12px rgba(0, 0, 0, 0.3)"},r.onmouseleave=()=>{r.style.transform="translateY(0)",r.style.background="rgba(255, 255, 255, 0.1)",r.style.boxShadow="none"},r}function Ne(n,r,i){let o=K(c.session),l=j,u=()=>o()&&l===j,f=`/${r}/${ue(n)}/watch/providers`,b=M().getUrl(`/JellyfinEnhanced/tmdb${f}`);c.core.api.fetch(b,{cacheKey:`tmdb:${f}`}).then(x=>{u()&&i(null,Le(x))}).catch(x=>{u()&&i(on(x),null)})}let dn=4,ie=new Map,oe=new Map;function cn(n,r){let i=`${n}:${r}`,o=ie.get(i);if(!o){let l=M().getUrl(`/JellyfinEnhanced/tmdb/tv/${ue(n)}/season/${r}/watch/providers`);o=c.core.api.fetch(l).then(Le).catch(()=>(ie.delete(i),null)),ie.set(i,o)}return o}function un(n){let r=oe.get(n);if(!r){let i=M().getUrl(`/JellyfinEnhanced/tmdb/tv/${ue(n)}`);r=c.core.api.fetch(i).then(o=>{let l=k(o,"seasons");return Array.isArray(l)?new Set(l.map(u=>le(k(u,"season_number"))).filter(u=>u!==void 0)):null}).catch(()=>(oe.delete(n),null)),oe.set(n,r)}return r}async function pn(n){let r=M(),i=r.getUrl(`Shows/${n}/Seasons`,{userId:r.getCurrentUserId()??""}),o=await c.core.api.fetch(i);return G(k(o,"Items")).map(l=>k(l,"IndexNumber")).filter(l=>Number.isInteger(l)).sort((l,u)=>l-u)}async function Me(n){if(!B||!U)return null;let r=de();if(!r)return null;let i=await Ie(c.helpers,r,!1);if(!i)return null;let o,l=null;if(i.Type==="Series")o=i;else if(i.Type==="Season"&&i.SeriesId&&Number.isInteger(i.IndexNumber))o=await Ie(c.helpers,i.SeriesId,!1),l=i.IndexNumber??null;else return null;if(!o||!o.Id||!Ke(o.DisplayOrder))return null;let u=o.ProviderIds.Tmdb;return!u||n&&u!==n?null:{kind:l===null?"series":"season",seriesId:o.Id,tmdbId:u,seasonNumber:l}}function gn(n){let r=Qe(n);if(r.single!==null)return c.t("elsewhere_season_label",{number:r.single});if(r.specialsOnly)return c.t("jellyseerr_season_specials");let i=[...r.ranges];return r.hasSpecials&&i.push(c.t("jellyseerr_season_specials")),c.t("elsewhere_seasons_label",{range:i.join(", ")})}async function fn(n,r){let i=fe(q(r,H)?.flatrate),o=await un(n.tmdbId),l=n.kind==="season"&&n.seasonNumber!==null?[n.seasonNumber]:await pn(n.seriesId);if(l.length===0)return null;let f=(await Ye(l,dn,async p=>{let T=!o||o.has(p)?await cn(n.tmdbId,p):null,w=fe(q(T,H)?.flatrate);return w.length>0?{number:p,services:w,link:q(T,H)?.link}:p===0?null:{number:p,services:i,link:void 0}})).filter(p=>!!p),[b]=f;if(!b)return null;if(n.kind==="season")return{servicesOverride:b.services,link:b.link};let x=Xe(f);return x?{groups:x.map(p=>({label:gn(p.numbers),services:p.services}))}:null}function Be(n,r,i){let o=document.createElement("button");return o.className=n,o.appendChild(X(r,"16px")),o.style.cssText=i,o.onmouseenter=()=>{o.style.background="rgba(255, 255, 255, 0.2)"},o.onmouseleave=()=>{o.style.background="rgba(255, 255, 255, 0.1)"},o}function je(n){let r=document.createElement("button");return r.appendChild(X("close","16px")),r.style.cssText=`
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
                border: 1px solid rgba(255, 255, 255, 0.2);
                padding: 6px;
                border-radius: 4px;
                cursor: pointer;
                transition: all 500ms ease;
                width: 28px;
                height: 28px;
            `,r.onmouseenter=()=>{r.style.background="rgba(255, 0, 0, 0.2)",r.style.borderColor="rgba(255, 0, 0, 0.3)"},r.onmouseleave=()=>{r.style.background="rgba(255, 255, 255, 0.1)",r.style.borderColor="rgba(255, 255, 255, 0.2)"},r.onclick=()=>n.remove(),r}function mn(n,r,i,o={}){let l=q(n,H),u=g("div",`
                margin: 10px 0;
                padding: 12px;
                background: rgba(0, 0, 0, 0.2);
                border-radius: 8px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(10px);
                position: relative;
            `),f=g("div",`
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            `),b=!!l?.flatrate&&l.flatrate.length>0,x=b?fe(l?.flatrate):[];o.servicesOverride&&(x=o.servicesOverride);let p=o.groups||null,y=o.link||l?.link||"",T=!!p||x.length>0,w=!T&&!!v,S=Te(c.helpers,T&&y?y:"#",{title:"JustWatch"});if(T)S.textContent=c.t("elsewhere_panel_available_in",{region:Q(H)});else if(v){if(S.textContent=v,S.classList.add("elsewhere-custom-branding"),S.style.cursor="default",R){S.style.display="flex",S.style.alignItems="center",S.style.gap="8px";let C=document.createElement("img");C.src=R,C.alt="Custom Branding",C.className="elsewhere-custom-branding-icon",C.style.cssText=`
                        width: 24px;
                        height: 24px;
                        object-fit: contain;
                        margin-left: 4px;
                    `,C.onerror=()=>{C.style.display="none"},S.appendChild(C)}}else S.textContent=c.t("elsewhere_panel_not_available_in",{region:Q(H)});S.style.cssText=`
                font-weight: 600;
                font-size: 14px;
                text-decoration: none;
                cursor: pointer;
                color: #fff;
                flex: 1;
                text-align: left;
                display: flex;
                align-items: flex-end;
            `,T&&y?(S.classList.add("elsewhere-link-reset"),S.href=ce(y),S.style.padding="0",S.style.margin="0"):w&&(S.style.cursor="default");let _=g("div",`
                display: flex;
                gap: 8px;
                align-items: center;
            `),I=Be("elsewhere-search-button","search",`
                display: flex;
                align-items: center;
                gap: 6px;
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
                border: 1px solid rgba(255, 255, 255, 0.2);
                padding: 6px 12px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 500;
                cursor: pointer;
                transition: all 500ms ease;
                opacity: ${w?"0":"1"};
            `);I.appendChild(document.createTextNode(""));let O=Be("elsewhere-settings-button","settings",`
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
                border: 1px solid rgba(255, 255, 255, 0.2);
                padding: 6px;
                border-radius: 4px;
                cursor: pointer;
                transition: all 500ms ease;
                width: 28px;
                height: 28px;
                opacity: ${w?"0":"1"};
            `);if(O.onclick=()=>Oe(),_.append(I,O),f.append(S,_),u.appendChild(f),w&&(u.onmouseenter=()=>{I.style.opacity="1",O.style.opacity="1"},u.onmouseleave=()=>{I.style.opacity="0",O.style.opacity="0"}),b||T)if(p)for(let C of p){u.appendChild(g("div","font-size: 12px; font-weight: 600; color: #aaa; margin: 4px 0 2px;",C.label));let h=g("div","display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px;");for(let m of C.services)h.appendChild(xe(m));u.appendChild(h)}else if(T){let C=g("div","display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 12px;");for(let h of x)C.appendChild(xe(h));u.appendChild(C)}else d.defaults.length>0&&u.appendChild(g("div","color: #999; font-size: 13px; margin-bottom: 12px;",c.t("elsewhere_panel_no_configured_services")));let D=document.createElement("div");return D.id="streaming-result-container",u.appendChild(D),I.onclick=()=>{I.disabled=!0,I.replaceChildren();let C=X("refresh","16px");if(C.style.animation="spin 1s linear infinite",I.append(C,document.createTextNode(" "+c.t("elsewhere_panel_search_button"))),I.style.opacity="0.7",D.replaceChildren(),!document.querySelector("style[data-jellyfin-elsewhere]")){let h=document.createElement("style");h.textContent=`
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `,h.setAttribute("data-jellyfin-elsewhere","true"),document.head.appendChild(h)}Ne(r,i,(h,m)=>{if(I.disabled=!1,I.replaceChildren(X("search","16px"),document.createTextNode("")),I.style.opacity="1",h||!m){D.replaceChildren(g("div","color: #ff6b6b; font-size: 13px; margin-top: 8px;",c.t("elsewhere_panel_error",{error:h??""})));return}let P=W.length>0?W:[H],E=!1,z=[];P.forEach((Z,we)=>{let V=q(m,Z)?.flatrate??[],N=F.length>0?V.filter(ee=>F.includes(ee.provider_name)):V;if(V.length>0&&N.length>0){E=!0;let ee=bn(m,Z);ee&&((we>0||z.length>0)&&(ee.style.marginTop="6px"),D.appendChild(ee))}else z.push(Z)}),z.length>0&&D.insertBefore(hn(z),D.firstChild),!E&&z.length===0&&D.appendChild(g("div","color: #6c757d; font-size: 13px; margin-top: 8px;",c.t("elsewhere_panel_no_services_in_regions")))})},u}function hn(n){let r=g("div",`
                margin: 0 0 6px 0;
                padding: 12px;
                border-radius: 8px;
                border: 1px solid rgba(139, 19, 19, 0.6);
                background: rgba(139, 19, 19, 0.3);
                backdrop-filter: blur(10px);
                position: relative;
            `),i=g("div",`
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 0;
            `),o=g("div",`
                font-weight: 600;
                font-size: 14px;
                color: rgb(255, 20, 20);
                flex: 1;
            `,c.t("elsewhere_panel_not_available_in_regions",{regions:Ze(n.map(Q))})),l=je(r);return l.title="Close",i.append(o,l),r.appendChild(i),r}function bn(n,r){let i=q(n,r);if(!i?.flatrate)return null;let o=i.flatrate.filter(x=>F.length===0||F.includes(x.provider_name));if(o.length===0)return null;let l=g("div",`
                margin: 10px 0 0 0;
                padding: 12px;
                background: rgba(0, 0, 0, 0.3);
                border-radius: 8px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(10px);
                position: relative;
            `),u=g("div",`
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            `),f=Te(c.helpers,i.link||"#",{title:"JustWatch"});f.textContent=c.t("elsewhere_panel_available_in_region",{region:Q(r)}),f.style.cssText=`
                font-weight: 600;
                font-size: 14px;
                text-decoration: none;
                cursor: pointer;
                color: #fff;
                flex: 1;
                text-align: left;
            `,i.link&&(f.classList.add("elsewhere-link-reset"),f.href=ce(i.link),f.style.padding="0",f.style.margin="0"),u.append(f,je(l)),l.appendChild(u);let b=g("div","display: flex; flex-wrap: wrap; gap: 3px;");for(let x of o)b.appendChild(xe(x));return l.appendChild(b),l}function xn(n,r,i){let o=K(c.session),l=j,u=()=>o()&&l===j&&i.isConnected;Ne(n,r,async(f,b)=>{if(!u())return;if(f||!b){i.appendChild(g("div","font-size: 13px; margin-top: 8px; color: #ff6b6b;",c.t("elsewhere_panel_error",{error:f??""})));return}let x={};if(r==="tv"&&B&&U)try{let p=await Me(n);if(!u())return;p&&(x=await fn(p,b)||{})}catch(p){console.warn(`${pe} Per-season providers unavailable, using series providers.`,p)}u()&&i.appendChild(mn(b,n,r,x))})}function Fe(n,r,i){let o=document.createElement("div");o.className="streaming-lookup-container",o.style.cssText="margin: 16px 0;",xn(r,i,o);let l=n.querySelector(".itemExternalLinks");l?.parentNode?l.parentNode.insertBefore(o,l.nextSibling):n.appendChild(o)}let se=new Set;function yn(n){if(!B||!U)return;let r=n.closest("#itemDetailPage")??document;if(r!==document&&r!==Pe()||r.querySelector(".streaming-lookup-container")||n!==r.querySelector(".detailSectionContent"))return;let i=de();if(!i||se.has(i))return;se.add(i);let o=K(c.session),l=j;Me().then(u=>{!o()||l!==j||!u||u.kind!=="season"||!n.isConnected||de()!==i||r.querySelector(".streaming-lookup-container")||Fe(n,u.tmdbId,"tv")}).catch(()=>{}).finally(()=>se.delete(i))}function ae(){document.querySelectorAll(".detailSectionContent").forEach(n=>{let r=n.closest("#itemDetailPage");if(r&&r!==Pe()||n.querySelector(".streaming-lookup-container"))return;let i=n.querySelector('a[href*="themoviedb.org"]');if(!i){yn(n);return}let o=i.href.match(/themoviedb\.org\/(movie|tv)\/(\d+)/);!o?.[1]||!o[2]||Fe(n,o[2],o[1])})}sn(),be(!1);let ye=(n,r,i)=>{typeof requestIdleCallback<"u"?requestIdleCallback(n,{timeout:r}):setTimeout(n,i)};ye(()=>{_e()},2e3,2e3);let ve=!1,Ue=()=>{ve||(ve=!0,ye(()=>{ae(),ve=!1},500,100))};c.helpers.createObserver("elsewhere",Ue,document.body,{childList:!0,subtree:!0}),c.helpers.onViewPage(Ue),ye(()=>ae(),1e3,1e3),console.log("🪼 Jellyfin Enhanced: 🎬 Jellyfin Elsewhere loaded!")};})();
})();
