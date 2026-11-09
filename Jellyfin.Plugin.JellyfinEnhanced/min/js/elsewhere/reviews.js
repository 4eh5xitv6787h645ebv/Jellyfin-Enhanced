(() => {
"use strict";(()=>{function Ce(t,n,s){let l=n.core?.featureContext;if(typeof l!="function")throw new Error(`${t}: JE.core.featureContext is missing; core/ui-kit.js must load before feature scripts`);return l(t,n,s)}function Z(){return window}function je(t){let s=window.JellyfinEnhanced;if(!s)throw new Error(`${t} loaded before Jellyfin Enhanced`);return s}function B(){let t=Z().ApiClient;if(!t)throw new Error("Jellyfin ApiClient unavailable");return t}function Pe(){return Z().ApiClient!==void 0}function J(){let t=Z().ApiClient?.getCurrentUserId();return typeof t=="string"&&t?t:null}function ae(){return Z().Dashboard}function be(){return Z().Translator}function Te(t){let n=t;return Ce("details-providers",t,{internalSlots:["features"],internalsObject:()=>n.internals??(n.internals={})})}function W(t){return typeof t=="object"&&t!==null&&!Array.isArray(t)}function y(t,n){return W(t)?t[n]:void 0}function m(t){return typeof t=="string"?t:void 0}function Re(t){return typeof t=="string"&&t!==""?t:void 0}function F(t){return typeof t=="number"&&Number.isFinite(t)?t:void 0}function he(t){return typeof t=="boolean"?t:void 0}function X(t){return Array.isArray(t)?t:[]}function ut(t){return X(t).filter(n=>typeof n=="string")}function ee(t){if(typeof t=="string")return t||void 0;if(typeof t=="number"&&Number.isFinite(t)&&t!==0)return String(t)}function Le(t){let n={};if(!W(t))return n;let s=ee(t.Tmdb),l=ee(t.Imdb),c=ee(t.Tvdb),g=ee(t.AniList),E=ee(t.Anilist);return s!==void 0&&(n.Tmdb=s),l!==void 0&&(n.Imdb=l),c!==void 0&&(n.Tvdb=c),g!==void 0&&(n.AniList=g),E!==void 0&&(n.Anilist=E),n}function De(t){if(Array.isArray(t))return t.filter(W).map(n=>{let s={},l=m(n.Type),c=m(n.Language);return l!==void 0&&(s.Type=l),c!==void 0&&(s.Language=c),s})}function gt(t){if(Array.isArray(t))return t.map(n=>{let s={},l=m(y(n,"Id")),c=De(y(n,"MediaStreams"));return l!==void 0&&(s.Id=l),c!==void 0&&(s.MediaStreams=c),s})}function A(t,n,s){s!==void 0&&(t[n]=s)}function le(t){if(!W(t))return null;let n={ProviderIds:Le(t.ProviderIds),SeriesProviderIds:Le(t.SeriesProviderIds)};A(n,"Id",m(t.Id)),A(n,"Type",m(t.Type)),A(n,"Name",m(t.Name)),A(n,"SeriesId",m(t.SeriesId)),A(n,"SeriesName",m(t.SeriesName)),A(n,"IndexNumber",F(t.IndexNumber)),A(n,"ParentIndexNumber",F(t.ParentIndexNumber)),A(n,"PremiereDate",m(t.PremiereDate)),A(n,"DisplayOrder",m(t.DisplayOrder)),A(n,"MediaSources",gt(t.MediaSources)),A(n,"MediaStreams",De(t.MediaStreams)),A(n,"FirstEpisodeId",m(y(t.FirstEpisode,"Id"))),Array.isArray(t.Tags)&&(n.Tags=ut(t.Tags));let s=t.UserData;return A(n,"Played",he(y(s,"Played"))),A(n,"UnplayedItemCount",F(y(s,"UnplayedItemCount"))),n}function te(t){let n={},s=F(y(t,"status")),l=m(y(t,"message")),c=y(t,"responseJSON"),g=m(y(c,"code")),E=m(y(c,"message")),M=F(y(c,"retryAfterSeconds"));return s!==void 0&&(n.status=s),l!==void 0&&(n.message=l),g!==void 0&&(n.responseCode=g),E!==void 0&&(n.responseMessage=E),M!==void 0&&(n.retryAfterSeconds=M),n}function de(t=window.location.hash){try{return new URLSearchParams(t.split("?")[1]??"").get("id")}catch{return null}}function ne(){return document.querySelector("#itemDetailPage:not(.hide)")}function mt(t,n,s,l=J()){return t?.getItemCached?s?t.getItemCached(n,{userId:l}):t.getItemCached(n):B().getItem(l,n)}async function ve(t,n,s,l=J()){return le(await mt(t,n,s,l))}function xe(t,n,s){let l=pt(t);return{itemId:n,page:s,current:()=>l()&&de()===n&&s.isConnected&&ne()===s}}function pt(t){let n=t?.getEpoch(),s=J(),l=B(),c=l.getUrl("/"),g=l.accessToken();return()=>Pe()&&B()===l&&l.getUrl("/")===c&&l.accessToken()===g&&(!t||n===void 0||t.isCurrent(n))&&J()===s}function re(t){return encodeURIComponent(t)}function ye(t){return String(t).replace(/<a\s[^>]*?href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,"[$2]($1)").replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi,"**$2**").replace(/<(em|i)>([\s\S]*?)<\/\1>/gi,"*$2*").replace(/<br\s*\/?>/gi,`
`).replace(/<\/p>\s*<p[^>]*>/gi,`

`).replace(/<\/?[a-z][^>]*>/gi,"")}function He(t){return ye(t).replace(/\[([^\]]+)\]\(https?:\/\/[^)\s]+\)/g,"$1").replace(/https?:\/\/[^\s<]+/g,"").replace(/(\*\*|__|~~|\*|`)/g,"").replace(/(^|\W)_([^_\n]+)_(?=\W|$)/g,"$1$2").replace(/[ \t]+/g," ").replace(/ ?\n ?/g,`
`).trim()}function Me(t){let n=[];for(let s of ye(t).matchAll(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g))s[1]!==void 0&&s[2]!==void 0&&n.push({label:s[1],url:s[2]});return n}function $e(t,n,s){if(s.length!==n.length)return t;let l=t,c=[];return n.forEach((g,E)=>{let M=l.toLowerCase(),C=[g.label,s[E]||""].map($=>$.trim().replace(/[[\]]/g,"")).find($=>$&&M.includes($.toLowerCase()));if(!C)return;let L=M.indexOf(C.toLowerCase());c.push(`[${l.substr(L,C.length)}](${g.url})`),l=`${l.slice(0,L)}${c.length-1}${l.slice(L+C.length)}`}),l.replace(/\u0001(\d+)\u0002/g,(g,E)=>c[Number(E)]??"")}function Ue(t,n){if(!t)return"";let s=n(ye(t)),l="\0JE";for(;s.includes(l);)l+="J";let c=[],g=H=>`${l}${c.push(H)-1}\0`,E=H=>H.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/__(.+?)__/g,"<strong>$1</strong>").replace(/\*(.+?)\*/g,"<em>$1</em>").replace(/_(.+?)_/g,"<em>$1</em>").replace(/~~(.+?)~~/g,"<del>$1</del>"),M=(H,S)=>`<a is="emby-linkbutton" href="${S}" target="_blank" rel="noopener noreferrer">${H}</a>`;s=s.replace(/`([^`\n]+)`|\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<]+)/gi,(H,S,O,z,ge)=>{if(S!==void 0)return g(`<code>${S}</code>`);if(O!==void 0&&z!==void 0)return g(M(E(O),z));let ie=ge??"",Y=ie.replace(/[.,;!?)]+$/,"");return g(M(Y,Y))+ie.slice(Y.length)}),s=E(s);let C=s.split(/\r?\n/),L=[],$=!1,_=[],G=!1,Q=[];for(let H of C){let S=H.trim();if(S.startsWith("&gt; ")){$||($=!0,_=[]),_.push(S.substring(5));continue}else $&&(L.push("<blockquote>"+_.join("<br>")+"</blockquote>"),$=!1,_=[]);if(/^[-*]\s+/.test(S)){G||(G=!0,Q=[]),Q.push("<li>"+S.substring(2)+"</li>");continue}else G&&(L.push("<ul>"+Q.join("")+"</ul>"),G=!1,Q=[]);let O=/^(#{1,6})\s/.exec(S);if(O?.[1]){let z=/^#+/.exec(S)?.[0].length??O[1].length;L.push(`<h${z}>${S.substring(z+1)}</h${z}>`);continue}if(/^([-*]){3,}$/.test(S)){L.push("<hr>");continue}L.push(S?H:"<br>")}return $&&L.push("<blockquote>"+_.join("<br>")+"</blockquote>"),G&&L.push("<ul>"+Q.join("")+"</ul>"),c.reduce((H,S,O)=>H.split(`${l}${O}\0`).join(S),L.join(""))}var Ae='<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>';function Se(t){let n=Math.round(Math.max(0,Math.min(1,t))*100);return`<span class="je-star-icon" aria-hidden="true">
                <svg class="je-star-icon-base" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${Ae}</svg>
                <svg class="je-star-icon-fill" style="clip-path: inset(0 ${100-n}% 0 0);" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${Ae}</svg>
            </span>`}function _e(t){return t?`<span class="je-user-star-rating">${Array.from({length:5},(s,l)=>Se(Math.max(0,Math.min(1,t-l)))).join("")}</span>`:""}function ce(t){return t?new Date(t).toLocaleDateString(void 0,{year:"numeric",month:"short",day:"numeric"}):""}function Ne(t){return X(y(t,"results")).filter(W).map(n=>({author:m(n.author),created_at:m(n.created_at),content:m(n.content),rating:F(y(n.author_details,"rating"))??null,url:m(n.url)}))}function Be(t){return X(y(t,"Reviews")).filter(W).map(n=>{let s=m(n.Content),l=m(n.Summary),c=F(n.Score);return{source:"anilist",author:Re(n.Author)||"Anonymous",created_at:m(n.CreatedAt),content:l?`**${l}**

${s}`:s,rating:c?Number((c/10).toFixed(1)):null,url:m(n.Url)}})}function Oe(t){return X(y(t,"reviews")).filter(W).map(n=>({userId:m(n.userId)??"",userName:m(n.userName),content:m(n.content),rating:F(n.rating)??null,createdAt:m(n.createdAt),updatedAt:m(n.updatedAt)}))}var ue=(t,n)=>t.replace(/-/g,"")===n.replace(/-/g,"");function Fe(t){let n=t.filter(l=>!!l.rating);if(n.length===0)return null;let s=n.reduce((l,c)=>l+c.rating,0)/n.length*2;return{display:Number.isInteger(s)?`${s}`:`${s.toFixed(1)}`,count:n.length}}function ze(t){let[n,s]=t.split("-"),l=(n||"").toLowerCase();if(!l||l==="en")return null;let c=l==="zh"&&/^(tw|hk|mo)$/i.test(s||"");return{server:c?"zt":l,browser:c?"zh-Hant":l}}function qe(t,n){let s=t;if(n)for(let[l,c]of Object.entries(n))s=s.replace(new RegExp(`\\{${l}\\}`,"g"),()=>String(c));return s}var d=je("Reviews"),Ve=Te(d),Ee=350;d.initializeReviewsScript=function(){let n=d.pluginConfig,s=n.ShowReviews&&n.TmdbEnabled,l=n.ShowUserReviews,c=n.ShowAnilistReviews;if(!s&&!l&&!c){console.log("🪼 Jellyfin Enhanced: Reviews feature disabled.");return}let g="🪼 Jellyfin Enhanced: Reviews:",E=new WeakMap,M=new WeakMap;d.session?.onUserChange("details-reviews",()=>{document.querySelectorAll(".tmdb-reviews-section, .je-avg-user-rating-chip").forEach(e=>e.remove()),E=new WeakMap,M=new WeakMap});let C=e=>d.escapeHtml(e),L=e=>Ue(e,C);async function $(e,r){try{if(r!=="Series"&&r!=="Movie"&&r!=="Season"&&r!=="Episode"||!d.pluginConfig.SpoilerBlurEnabled||d.pluginConfig.SpoilerStripReviews===!1)return!1;let i=Ve.peer("spoilerBlur");if(!i)return!1;if(typeof i.whenLoaded=="function"&&await i.whenLoaded(),typeof i.isLoadOk=="function"&&!i.isLoadOk())return console.warn(`${g} Spoiler Guard state load failed; suppressing reviews fail-closed.`),!0;if(typeof i.getUserPrefs=="function"&&(i.getUserPrefs()||{}).HideReviews===!1)return!1;if(r==="Movie"){let a=i.isMovieInScope;if(typeof a!="function")throw new TypeError("Spoiler Guard movie scope unavailable");return await a.call(i,e?.Id||"")}let o=r==="Series"?e?.Id||"":e?.SeriesId||"";return!!(i.isEnabledFor&&i.isEnabledFor(o))}catch(i){return console.warn(`${g} Spoiler Guard check failed; suppressing reviews:`,i),!0}}function _(e){try{let r=e||ne()||document;r.querySelector(".tmdb-reviews-section")?.remove(),r.querySelector(".je-avg-user-rating-chip")?.remove()}catch(r){console.warn(`${g} removeReviewsSection failed:`,r)}}function G(e,r){let i=r==="Series"?"tv":"movie",o=re(e),a=`/${i}/${o}/reviews?language=en-US&page=1`,u=`${B().getUrl(`/JellyfinEnhanced/tmdb/${i}/${o}/reviews`)}?language=en-US&page=1`;return d.core.api.fetch(u,{cacheKey:`tmdb:${a}`}).then(Ne).catch(b=>(console.error(`${g} Failed to fetch reviews.`,b),null))}function Q(e){let r=e?.ProviderIds,i=parseInt(r?.AniList||r?.Anilist||"",10);if(!i)return Promise.resolve(null);let o=`anilistId=${i}`;return d.core.api.fetch(`${B().getUrl("/JellyfinEnhanced/anilist/reviews")}?${o}`,{cacheKey:`anilist:${o}`}).then(Be).catch(a=>(console.error(`${g} Failed to fetch AniList reviews.`,a),null))}async function H(e,r,i){if(i!=="Movie"&&i!=="Series")return null;let[o,a]=await Promise.all([s?G(r.split(":")[0]??"",i):null,c?Q(e):null]);return o||a?[...o||[],...a||[]]:null}let S=e=>e.split(":").map(re).join(":");function O(e,r){return d.core.api.plugin(`/reviews/${r}/${S(e)}`).then(Oe).catch(i=>(console.error(`${g} Failed to fetch user reviews.`,i),[]))}async function z(e,r,i,o){try{return await d.core.api.plugin(`/reviews/${r}/${S(e)}`,{method:"POST",body:{content:i,rating:o||null},skipRetry:!0})}catch(a){let u=te(a);throw new Error(u.responseMessage||u.message)}}async function ge(e,r){await d.core.api.plugin(`/reviews/${r}/${S(e)}`,{method:"DELETE",skipRetry:!0})}async function ie(e,r,i){let o=(e||"").replace(/-/g,"");try{await d.core.api.plugin(`/reviews/admin/${re(o)}/${i}/${S(r)}`,{method:"DELETE",skipRetry:!0})}catch(a){throw te(a).status===404?new Error("No matching review to delete (it may have already been removed)."):a}}function Y(e,r){return new Promise(i=>{let o=ae();if(o&&typeof o.confirm=="function")try{o.confirm(e,r,i);return}catch(a){console.warn(`${g} Dashboard.confirm threw, falling back:`,a)}i(window.confirm(r?`${r}

${e}`:e))})}function Ke(e,r){let i=ae();if(i&&typeof i.alert=="function")try{i.alert({title:r||"",message:e||""});return}catch(o){console.warn(`${g} Dashboard.alert threw, falling back:`,o)}window.alert(r?`${r}

${e}`:e)}let ke=new Set;function N(e,r,i){let o;try{o=d.t(e,i)}catch(a){console.warn(`${g} JE.t('${e}') threw, using fallback:`,a),o=null}return!o||o===e?(ke.has(e)||(ke.add(e),console.warn(`${g} Missing translation key '${e}', using inline fallback.`)),qe(r,i)):o}let me=e=>`<span class="tmdb-review-toggle">${d.t(e)}</span>`;function pe(e,r){let i=e.length>Ee;return L(i&&!r?e.substring(0,Ee):e)+(i?me(r?"reviews_read_less":"reviews_read_more"):"")}function Je(e){let r=document.createElement("div");r.className="tmdb-review-card";let i=e.source==="anilist";i&&r.classList.add("je-anilist-review-card"),r.dataset.fullContent=e.content||"";let o=e.content||"No content available",a=ce(e.created_at),u=e.rating?`<span class="tmdb-review-rating">${d.icon(d.IconName.STAR)} ${e.rating}</span>`:"";r.innerHTML=`
                <div class="tmdb-review-header">
                    <div class="tmdb-review-author-info">
                        <strong class="tmdb-review-author">${C(e.author||"Anonymous")}</strong>
                        <span class="tmdb-review-date">${C(a)}</span>
                    </div>
                    ${u}
                </div>
                <div class="tmdb-review-content-wrapper">
                    <p class="tmdb-review-text"></p>
                </div>
            `;let b=e.url||"",k=i?/^https:\/\/anilist\.co\//.test(b)?b:"":/^https:\/\/www\.themoviedb\.org\//.test(b)?b:"",h=k?d.helpers.createExternalLink(k,{className:"je-review-source",resetStyle:!0}):Object.assign(document.createElement("span"),{className:"je-review-source"}),v=document.createElement("img");v.src=d.cdn.url("mdblist-logos",i?"anilist.png":"tmdb.png"),v.alt="",v.className="je-review-source-logo",v.loading="lazy",h.append(v,i?"AniList":"TMDB");let f=r.querySelector(".tmdb-review-date");a&&f?.append(Object.assign(document.createElement("span"),{textContent:"·"})),f?.append(h);let j=r.querySelector(".tmdb-review-text");return j&&(j.innerHTML=pe(o,!1)),Ze(r,e.content||""),r}function We(){let e="";try{e=localStorage.getItem(`${J()}-language`)||""}catch{}return ze(e||document.documentElement.lang||"")}let fe=null;function Ge(){return fe??(fe=d.core.api.plugin("/translate/languages",{skipRetry:!0}).then(e=>X(y(e,"languages")).filter(r=>typeof r=="string")).catch(()=>[])),fe}async function Qe(e){try{let r=be();return!window.isSecureContext||!r?!1:await r.availability({sourceLanguage:"en",targetLanguage:e})!=="unavailable"}catch{return!1}}async function Xe(e,r){let i=be();if(!i)throw new Error("Browser translator unavailable");let o=await i.create({sourceLanguage:"en",targetLanguage:r});try{let a=[];for(let u of e.split(`
`))a.push(u.trim()?await o.translate(u):u);return a.join(`
`)}finally{o.destroy?.()}}function Ye(e){let r=te(e);if(r.status===429||r.responseCode==="translation_rate_limited"){let i=r.retryAfterSeconds;return i!==void 0&&i>0?d.t("reviews_translate_rate_limited_wait",{seconds:i}):d.t("reviews_translate_rate_limited")}return r.responseCode==="translation_refused"?d.t("reviews_translate_refused"):d.t("reviews_translate_failed")}function Ze(e,r){if(!d.pluginConfig.ReviewTranslationEnabled||!r.trim())return;let i=We();i&&Promise.all([Qe(i.browser),d.pluginConfig.ReviewTranslationServer?Ge().then(o=>o.includes(i.server)):!1]).then(([o,a])=>{if(!o&&!a)return;let u=e.querySelector(".tmdb-review-text"),b=u?.parentElement;if(!u||!b)return;let k=document.createElement("span");k.className="je-review-translate";let h=Object.assign(document.createElement("span"),{className:"je-msym-rounded",textContent:"translate"});h.setAttribute("aria-hidden","true");let v=Object.assign(document.createElement("span"),{className:"je-review-translate-label"});k.append(h,v);let f=w=>{v.textContent=d.t(w)};f("reviews_translate"),b.appendChild(k);let j=async w=>{if(o)try{return await Xe(w,i.browser)}catch(T){if(!a)throw T}let P=await d.core.api.plugin("/translate",{method:"POST",body:{text:w,target:i.server},skipRetry:!0}),p=m(y(P,"text"));if(p===void 0)throw new Error("Invalid translation response");return p},U=async()=>{let w=await j(He(r)),P=Me(r);if(!P.length)return w;let p=await j(P.map(T=>T.label.replace(/\s+/g," ")).join(`
`));return $e(w,P,p.split(`
`))},D=w=>{u.innerHTML=pe(w,u.classList.contains("expanded"))},I=!1;k.addEventListener("click",async()=>{if(!I){if(e.dataset.showTranslated==="1"){e.dataset.showTranslated="0",D(r),f("reviews_translate");return}if(e.dataset.translatedContent===void 0){I=!0,f("reviews_translating");try{e.dataset.translatedContent=await U()}catch(w){f("reviews_translate"),d.toast(Ye(w));return}finally{I=!1}}e.dataset.showTranslated="1",D(e.dataset.translatedContent??""),f("reviews_show_original")}})})}function et(e,r,i,o){let a=document.createElement("div");a.className="tmdb-review-card je-user-review-card";let u=e.content||"",b=ce(e.updatedAt)||ce(e.createdAt),k=e.rating?`<span class="tmdb-review-rating je-user-review-rating">${_e(e.rating)}</span>`:"",h=B().getUrl(`/Users/${re(e.userId)}/Images/Primary`)+"?width=48&quality=90",v=ue(e.userId,r.id),f=!v&&r.isAdmin,j=N("reviews_edit","Edit"),U=N("reviews_delete","Delete"),D=N("reviews_admin_delete","Delete as admin"),I="";v?I=`
                <div class="je-user-review-actions">
                    <button class="je-review-btn je-review-edit-btn" title="${C(j)}"><span class="material-icons" aria-hidden="true">edit</span></button>
                    <button class="je-review-btn je-review-delete-btn" title="${C(U)}"><span class="material-icons" aria-hidden="true">delete</span></button>
                </div>`:f&&(I=`
                <div class="je-user-review-actions">
                    <button class="je-review-btn je-review-delete-btn je-review-admin-delete-btn" title="${C(D)}"><span class="material-icons" aria-hidden="true">delete</span></button>
                </div>`),a.innerHTML=`
                <div class="tmdb-review-header je-user-review-header">
                    <div class="je-user-review-avatar-wrapper">
                        <img class="je-user-avatar" src="${C(h)}" alt="">
                    </div>
                    <div class="tmdb-review-author-info">
                        <strong class="tmdb-review-author">${C(e.userName||"User")}</strong>
                        <span class="tmdb-review-date">${C(b)}</span>
                    </div>
                    ${k}
                    ${I}
                </div>
                ${u.length>0?`
                <div class="tmdb-review-content-wrapper">
                    <p class="tmdb-review-text"></p>
                </div>`:""}
            `;let w=a.querySelector(".je-user-avatar");w&&(w.onerror=()=>{w.style.display="none"});let P=a.querySelector(".tmdb-review-text");return P&&(P.innerHTML=pe(u,!1)),a.dataset.fullContent=u,v?(a.querySelector(".je-review-edit-btn")?.addEventListener("click",()=>i(e)),a.querySelector(".je-review-delete-btn")?.addEventListener("click",()=>o(e))):f&&a.querySelector(".je-review-admin-delete-btn")?.addEventListener("click",()=>o(e)),a}function tt(e,r,i){let o=document.createElement("div");o.className="je-review-form";let a=e?.rating||0;o.innerHTML=`
                ${e?"":`<h4 class="je-review-form-title">${d.t("reviews_add")}</h4>`}
                <div class="je-review-star-picker" role="radiogroup">
                    ${[1,2,3,4,5].map(p=>`<button class="je-star-btn" data-value="${p}" type="button" aria-label="${p} stars">${Se(0)}</button>`).join("")}
                    <button class="je-star-clear-btn" type="button"><span class="material-icons" aria-hidden="true">close</span></button>
                    <span class="je-star-label"></span>
                </div>
                <textarea class="je-review-textarea" maxlength="2000">${C(e?.content||"")}</textarea>
                <div class="je-review-char-counter"><span class="je-review-char-count">${e?.content?.length||0}</span>/2000</div>
                <div class="je-review-form-btns">
                    <button class="je-review-btn je-review-submit-btn" type="button"><span class="material-icons" aria-hidden="true">save</span></button>
                    <button class="je-review-btn je-review-cancel-btn" type="button"><span class="material-icons" aria-hidden="true">close</span></button>
                </div>
                <div class="je-review-form-error" aria-live="polite"></div>
            `;let u=o.querySelectorAll(".je-star-btn"),b=p=>{let T=o.querySelector(p);if(!T)throw new Error(`Review form is missing ${p}`);return T},k=b(".je-star-clear-btn"),h=b(".je-star-label"),v=b(".je-review-textarea"),f=b(".je-review-char-count"),j=b(".je-review-submit-btn"),U=b(".je-review-cancel-btn"),D=b(".je-review-form-error"),I=p=>{u.forEach(T=>{let q=parseInt(T.dataset.value??"0",10),x=Math.round(Math.max(0,Math.min(1,p-(q-1)))*100),R=T.querySelector(".je-star-icon-fill");R&&(R.style.clipPath=`inset(0 ${100-x}% 0 0)`)})},w=p=>{a=p,I(p),h.textContent=a>0?`${a}/5`:""},P=(p,T)=>{let q=parseInt(p.dataset.value??"0",10),x=p.getBoundingClientRect();return T-x.left<x.width/2?q-.5:q};return w(a),u.forEach(p=>{p.addEventListener("click",T=>w(P(p,T.clientX))),p.addEventListener("mousemove",T=>I(P(p,T.clientX))),p.addEventListener("mouseleave",()=>I(a))}),k.addEventListener("click",()=>w(0)),v.addEventListener("input",()=>{f.textContent=String(v.value.length)}),j.addEventListener("click",async()=>{let p=v.value.trim();if(!p&&!a){D.textContent=d.t("reviews_form_error_empty");return}D.textContent="",j.disabled=!0,j.innerHTML='<span class="material-icons" aria-hidden="true">hourglass_empty</span>';try{await r(p,a||null)}catch{D.textContent=d.t("reviews_form_error_save"),j.disabled=!1,j.innerHTML='<span class="material-icons" aria-hidden="true">save</span>'}}),U.addEventListener("click",i),o}function nt(e,r){let i=Fe(r);if(e.querySelector(".je-avg-user-rating-chip")?.remove(),!i)return;let o=document.createElement("div");o.className="mediaInfoCriticRating mediaInfoItem je-avg-user-rating-chip",o.title=N("reviews_avg_rating_tooltip","Average rating from {count} user(s)",{count:i.count}),o.innerHTML=`<span class="je-msym-rounded starIcon" aria-hidden="true" style="color:#e91e8c;">person_heart</span>${C(i.display)}`;let a=e.querySelector(".mediaInfoCriticRating")||e.querySelector(".starRatingContainer");a?.parentNode?a.parentNode.insertBefore(o,a.nextSibling):e.querySelector(".mediaInfoItems")?.appendChild(o)}function rt(e,r,i,o,a){_(i),l&&r.length>0&&nt(i,r);let{tmdbKey:u,apiMediaType:b}=o,k=r.find(x=>ue(x.userId,a.id)),h=document.createElement("details");h.className="detailSection tmdb-reviews-section";let v=xe(d.session,de()||"",i),f=()=>h.isConnected&&v.current();d.currentSettings?.reviewsExpandedByDefault&&h.setAttribute("open","");let j=(e?e.length:0)+r.length,U=document.createElement("summary");U.className="sectionTitle",U.innerHTML=`${d.t("reviews_title",{count:j})} <i class="material-icons expand-icon">expand_more</i>`,h.appendChild(U);let D=document.createElement("div");D.className="je-review-action-bar";let I=null;l&&!k&&(I=document.createElement("button"),I.className="je-review-btn je-review-write-btn",I.textContent=d.t("reviews_add"),D.appendChild(I)),h.appendChild(D);let w=document.createElement("div");w.className="je-review-form-placeholder",h.appendChild(w);let P=document.createElement("div");P.className="tmdb-review-swipe-container";let p=x=>{if(!f())return;w.replaceChildren();let R=tt(x,async(V,K)=>{f()&&(await z(u,b,V,K),f()&&we(i))},()=>{w.replaceChildren()});w.appendChild(R),h.setAttribute("open",""),R.querySelector(".je-review-textarea")?.focus()},T=async x=>{if(!f())return;let R=ue(x.userId,a.id),V=x.userName||"user",K=R?N("reviews_delete_title","Delete review"):N("reviews_admin_delete_title","Delete review (admin)"),se=R?N("reviews_delete_confirm","Delete your review for this item?"):N("reviews_admin_delete_confirm","Delete this review by {user}? This cannot be undone.",{user:V});if(!(!await Y(se,K)||!f()))try{R?await ge(u,b):await ie(x.userId,u,b),f()&&we(i)}catch(oe){if(!f())return;console.error(`${g} Delete failed`,oe);let dt=N("reviews_delete_error_title","Delete failed"),ct=N("reviews_delete_error_body","Could not delete the review: {err}",{err:te(oe).message||"Unknown error"});Ke(ct,dt),we(i)}};for(let x of r)P.appendChild(et(x,a,R=>p(R),T));for(let x of(e??[]).slice(0,10))P.appendChild(Je(x));h.appendChild(P),I?.addEventListener("click",()=>{w.querySelector(".je-review-form")?w.replaceChildren():p(k||null)}),P.addEventListener("click",x=>{let R=x.target;if(!(R instanceof Element)||!R.classList.contains("tmdb-review-toggle"))return;let V=R.parentElement,K=V?.closest(".tmdb-review-card");if(!V||!K)return;let se=(K.dataset.showTranslated==="1"?K.dataset.translatedContent:K.dataset.fullContent)||"",oe=V.classList.toggle("expanded");V.innerHTML=oe?L(se)+me("reviews_read_less"):L(se.substring(0,Ee))+me("reviews_read_more")}),h.addEventListener("toggle",()=>{if(f())try{let x=d.currentSettings=d.currentSettings||d.loadSettings?.()||{};x.reviewsExpandedByDefault!==h.open&&(x.reviewsExpandedByDefault=h.open,typeof d.saveUserSettings=="function"&&d.saveUserSettings("settings.json",x))}catch(x){console.error(`${g} Failed to persist reviews expanded state`,x)}});let q=i.querySelector(".streaming-lookup-container")||i.querySelector(".itemExternalLinks")||i.querySelector(".tagline");q?.parentNode?q.parentNode.insertBefore(h,q.nextSibling):console.error(`${g} Could not find a suitable anchor to insert reviews.`)}async function it(e,r,i){if(!e)return null;if(r==="Movie"||r==="Series"){let a=e.ProviderIds.Tmdb;return a?{tmdbKey:a,apiMediaType:r==="Movie"?"movie":"tv"}:null}if(r!=="Season"&&r!=="Episode")return null;let o=e.SeriesProviderIds.Tmdb;if(!o&&e.SeriesId)try{o=(await i(e.SeriesId))?.ProviderIds.Tmdb}catch{}return!o||e.IndexNumber==null?null:r==="Season"?{tmdbKey:`${o}:s${e.IndexNumber}`,apiMediaType:"tv"}:e.ParentIndexNumber==null?null:{tmdbKey:`${o}:s${e.ParentIndexNumber}:e${e.IndexNumber}`,apiMediaType:"tv"}}async function st(){let e=B(),r=null;try{r=e.getCurrentUser?await e.getCurrentUser():null}catch{r=null}return{id:m(y(r,"Id"))||e.getCurrentUserId()||"",isAdmin:he(y(y(r,"Policy"),"IsAdministrator"))===!0}}async function Ie(e,r,i=!1){let o=de(),a=J();if(!o||!a)return;let u=xe(d.session,o,e),b={};M.set(e,b);let k=()=>u.current()&&M.get(e)===b,h=await ve(d.helpers,o,!0,a);if(!k())return;let v=h?.Type;if(!h||!v){_(e),E.delete(e);return}if(await $(h,v)){k()&&(_(e),E.delete(e));return}if(!k()||!i&&E.get(e)?.current()&&e.querySelector(".tmdb-reviews-section"))return;let f=await it(h,v,w=>r(a,w));if(!f||!v||!k())return;let[j,U,D]=await Promise.all([H(h,f.tmdbKey,v),l?O(f.tmdbKey,f.apiMediaType):Promise.resolve([]),st()]);if(!k())return;rt(j,U,e,f,D),E.set(e,u);let I=Ve.peer("invalidateUserReviewTagCache");typeof I=="function"&&I(f.tmdbKey)}async function we(e){try{await Ie(ne()||e,async(r,i)=>le(await B().getItem(r,i)),!0)}catch(r){console.error(`${g} Failed to refresh reviews:`,r)}}async function ot(e){if(e){E.get(e)?.current()||(_(e),E.delete(e));try{await Ie(e,(r,i)=>ve(d.helpers,i,!0,r))}catch(r){console.error(`${g} Error processing page:`,r)}}}function at(){let e="tmdb-reviews-enhanced-styles";if(document.getElementById(e))return;let r=document.createElement("style");r.id=e,r.textContent=ft,document.head.appendChild(r)}at();let lt=d.helpers.onViewPage(async(e,r,i)=>{if(!d.pluginConfig.ShowReviews&&!d.pluginConfig.ShowUserReviews&&!d.pluginConfig.ShowAnilistReviews){lt?.();return}let o=window.location.hash.includes("id=")||typeof i=="string"&&i.includes("id="),a=!!r&&(r.id==="itemDetailPage"||r.classList.contains("itemDetailPage"));if(!o&&!a)return;await new Promise(b=>setTimeout(b,150));let u=ne();u&&ot(u)},{pages:null,fetchItem:!1,immediate:!0})};var ft=`
                .je-msym-rounded {
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
                    -webkit-font-smoothing: antialiased;
                }
                /* Some themes style .detailSection as a grid, and a flex/grid
                   item's default min-width is auto — so this section's
                   horizontally-scrolling card row can report its full
                   unscrolled width as intrinsic size and blow out past the
                   viewport. width:100%+min-width:0 here and on the swipe
                   container below keep both pinned to the available width. */
                .tmdb-reviews-section { margin: 2em 0 1em 0; display: flex !important; flex-direction: column; width: 100%; min-width: 0;}
                .tmdb-reviews-section summary { cursor: pointer; display: flex; align-items: center; justify-content: space-between; user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; -webkit-tap-highlight-color: transparent;}
                .tmdb-reviews-section summary .expand-icon { color: rgba(255, 255, 255,.8);transition: transform 0.2s ease-in-out;}
                .tmdb-reviews-section[open] summary .expand-icon { transform: rotate(180deg);}
                .tmdb-review-swipe-container {
                    display: flex;
                    overflow-x: auto;
                    gap: 1.2em;
                    padding: 1em 0.5em;
                    scroll-snap-type: x mandatory;
                    width: 100%;
                    min-width: 0;
                }
                .tmdb-review-card {
                    flex: 0 0 85%;
                    max-width: 500px;
                    background: rgba(0, 0, 0, 0.3);
                    border-radius: 8px;
                    border-left: 4px solid rgb(1, 180, 228);
                    padding: 1.5em;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                    scroll-snap-align: start;
                    display: flex;
                    flex-direction: column;
                }
                .je-anilist-review-card { border-left-color: rgb(61, 180, 242); }
                .je-review-source { color: rgb(1, 180, 228); display: inline-flex; align-items: center; gap: 0.3em; }
                .je-anilist-review-card .je-review-source { color: rgb(61, 180, 242); }
                .je-review-source-logo { width: 1.1em; height: 1.1em; border-radius: 3px; }
                .je-user-review-card {
                    border-left-color: rgb(94, 213, 95);
                    background: rgba(10, 26, 10, 0.52);
                }
                @media (min-width: 768px) { .tmdb-review-card { flex-basis: 400px; } }
                .tmdb-review-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1em; }
                .je-user-review-header { align-items: center; gap: 0.75em; }
                .tmdb-review-author-info { display: flex; flex-direction: column; gap: 0.3em; flex: 1; }
                .tmdb-review-author { color: #fff; font-size: 1.1em; font-weight: 600; }
                .tmdb-review-date { color: #aaa; font-size: 0.9em; display: flex; align-items: center; gap: 0.4em; }
                .tmdb-review-rating { display: inline-flex; align-items: center; color: #ffd700; background: rgba(255, 215, 0, 0.1); padding: 0.2em 0.5em; border-radius: 4px; gap: 0.2em;}
                .je-user-review-rating {
                    white-space: nowrap;
                    background: rgba(94, 213, 95, 0.12);
                    color: #ffd700;
                }
                .je-user-star-rating { display: inline-flex; align-items: center; gap: 0.02em; }
                .je-star-icon { position: relative; display: inline-block; width: 1em; height: 1em; color: rgba(255, 255, 255, 0.28); }
                .je-star-icon svg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: block; }
                .je-star-icon-fill { color: #ffd700; }
                .je-user-star-rating .je-star-icon { width: 1.05em; height: 1.05em; vertical-align: middle; }
                .tmdb-review-content-wrapper { flex-grow: 1; line-height: 1.7; overflow-y: auto; color: #ddd; font-size: 0.95em; }
                .tmdb-review-text { word-wrap: break-word; }
                .tmdb-review-text strong { color: #fff; font-weight: 600; }
                .tmdb-review-text em { font-style: italic; color: #e0e0e0; }
                .tmdb-review-text del { text-decoration: line-through; opacity: 0.7; }
                .tmdb-review-text code { background: rgba(255, 255, 255, 0.1); padding: 2px 6px; border-radius: 3px; font-family: monospace; font-size: 0.9em; color: #ffa500; }
                .tmdb-review-text blockquote { border-left: 3px solid rgb(1, 180, 228); padding-left: 1em; margin: 0.8em 0; color: #aaa; font-style: italic; }
                .tmdb-review-text h1, .tmdb-review-text h2, .tmdb-review-text h3, .tmdb-review-text h4, .tmdb-review-text h5, .tmdb-review-text h6 { color: #fff; margin: 0.8em 0 0.4em 0; font-weight: 600; }
                .tmdb-review-text h1 { font-size: 1.5em; }
                .tmdb-review-text h2 { font-size: 1.3em; }
                .tmdb-review-text h3 { font-size: 1.15em; }
                .tmdb-review-text h4, .tmdb-review-text h5, .tmdb-review-text h6 { font-size: 1.05em; }
                .tmdb-review-text ul, .tmdb-review-text ol { margin: 0.5em 0; padding-left: 1.5em; }
                .tmdb-review-text li { margin: 0.3em 0; }
                .tmdb-review-text hr { border: none; border-top: 1px solid rgba(255, 255, 255, 0.2); margin: 1em 0; }
                .tmdb-review-text a { color: rgb(1, 180, 228); text-decoration: underline; }
                .tmdb-review-text a:hover { color: rgb(50, 200, 250); }
                /* emby-linkbutton gives links button padding, margin and weight, which breaks line spacing */
                .tmdb-review-text a[is="emby-linkbutton"] { display: inline !important; padding: 0 !important; margin: 0 !important; min-width: 0 !important; font-weight: inherit !important; vertical-align: baseline !important; }
                .tmdb-review-toggle { color: rgb(1, 180, 228); font-weight: bold; cursor: pointer; text-decoration: underline; margin-left: 0.3em; }
                .je-review-translate { display: inline-flex; align-items: center; gap: 0.3em; margin-top: 0.5em; color: rgb(1, 180, 228); font-size: 0.9em; cursor: pointer; }
                .je-review-translate .je-msym-rounded { font-size: 1.3em; }
                .je-review-translate-label { text-decoration: underline; }

                /* User avatar */
                .je-user-avatar-wrapper { flex-shrink: 0; }
                .je-user-avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 2px solid rgb(94, 213, 95); display: block; }

                /* Action bar */
                .je-review-action-bar { padding: 0.5em 0.5em 0; display: flex; gap: 0.75em; }
                .je-user-review-actions { display: flex; gap: 0.5em; flex-shrink: 0; }

                /* Shared button style */
                .je-review-btn {
                    background: rgba(255,255,255,0.08);
                    border: 1px solid rgba(255,255,255,0.15);
                    border-radius: 6px;
                    color: #fff;
                    cursor: pointer;
                    font-size: 0.85em;
                    padding: 0.35em 0.9em;
                    transition: background 0.15s;
                }
                .je-review-btn:hover { background: rgba(255,255,255,0.15); }
                .je-review-write-btn { border-color: rgb(94, 213, 95); color: rgb(94, 213, 95); }
                .je-review-write-btn:hover { background: rgba(94, 213, 95, 0.15); }
                .je-review-edit-btn, .je-review-delete-btn, .je-review-submit-btn, .je-review-cancel-btn {
                    width: 2.4em;
                    height: 2.4em;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0;
                }
                .je-review-edit-btn .material-icons, .je-review-delete-btn .material-icons, .je-review-submit-btn .material-icons, .je-review-cancel-btn .material-icons, .je-star-clear-btn .material-icons { font-size: 18px; }
                .je-review-edit-btn { border-color: rgb(94, 213, 95); color: rgb(94, 213, 95); }
                .je-review-delete-btn { border-color: rgb(244, 67, 54); color: rgb(244, 67, 54); }
                .je-review-delete-btn:hover { background: rgba(244, 67, 54, 0.15); }

                /* Inline review form */
                .je-review-form-placeholder { padding: 0 0.5em; }
                .je-review-form {
                    background: rgba(0,0,0,0.4);
                    border: 1px solid rgba(94, 213, 95, 0.4);
                    border-radius: 8px;
                    padding: 1.2em;
                    margin: 0.75em 0;
                    display: flex;
                    flex-direction: column;
                    gap: 0.75em;
                }
                .je-review-form-title { margin: 0; font-size: 1em; color: #fff; font-weight: 600; }
                .je-review-star-picker { display: flex; align-items: center; gap: 0.3em; }
                .je-star-btn {
                    display: inline-flex;
                    align-items: center;
                    background: none;
                    border: none;
                    cursor: pointer;
                    padding: 0;
                    line-height: 1;
                    transition: transform 0.1s;
                }
                .je-star-btn .je-star-icon { width: 1.6em; height: 1.6em; pointer-events: none; }
                .je-star-btn:hover { transform: scale(1.2); }
                .je-star-clear-btn {
                    background: rgba(255,255,255,0.08);
                    border: 1px solid rgba(255,255,255,0.15);
                    border-radius: 6px;
                    cursor: pointer;
                    color: rgba(255,255,255,0.7);
                    width: 2.2em;
                    height: 2.2em;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0;
                }
                .je-star-clear-btn:hover { background: rgba(255,255,255,0.15); }
                .je-star-label { color: #ffd700; font-size: 0.9em; margin-left: 0.25em; min-width: 2.5em; }
                .je-review-textarea {
                    width: 100%;
                    min-height: 100px;
                    resize: vertical;
                    background: rgba(255,255,255,0.06);
                    border: 1px solid rgba(255,255,255,0.15);
                    border-radius: 6px;
                    color: #fff;
                    font-size: 0.95em;
                    padding: 0.6em 0.8em;
                    box-sizing: border-box;
                    font-family: inherit;
                    line-height: 1.5;
                }
                .je-review-textarea:focus { outline: none; border-color: rgb(94, 213, 95); }
                .je-review-char-counter { font-size: 0.8em; color: rgba(255,255,255,0.4); text-align: right; }
                .je-review-form-btns { display: flex; gap: 0.75em; }
                .je-review-submit-btn { border-color: rgb(94, 213, 95); color: rgb(94, 213, 95); }
                .je-review-submit-btn:hover { background: rgba(94, 213, 95, 0.15); }
                .je-review-submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
                .je-review-form-error { color: rgb(244, 67, 54); font-size: 0.85em; min-height: 1em; }

                /* Average user rating chip in item details */
                .je-avg-user-rating-chip .starIcon { color: #e91e8c !important; }
                /* Remove the padding coming from using critic rating container */
                .je-avg-user-rating-chip { padding-left: 0 !important; }
                /* Remove the % added by ElegantFin Theme */
                .mediaInfoCriticRating.mediaInfoItem.je-avg-user-rating-chip::after {
                    content: "";
                }
            `;})();
})();
