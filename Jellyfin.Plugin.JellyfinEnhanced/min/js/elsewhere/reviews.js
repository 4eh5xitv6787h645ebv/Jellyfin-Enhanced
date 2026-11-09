(() => {
"use strict";(()=>{function K(a){let s=window.JellyfinEnhanced?.core?.sharedModules?.[a];if(!s)throw new Error(`${a} is not in JE.core.sharedModules: load its provider first (client/shared-modules.json)`);return s}function b(a,s){return a[s]}var G=K("features/details-providers/host"),X=b(G,"api"),$e=b(G,"bridge"),fe=b(G,"browserTranslator"),we=b(G,"currentUserId"),ve=b(G,"dashboard"),Re=b(G,"detailsContext");var ie=K("features/details-providers/page");var be=b(ie,"detailsLease");var he=b(ie,"hashItemId");var xe=b(ie,"lookupDetailsItem");var se=b(ie,"visibleDetailPage");var ct=K("features/details-providers/links");var Z=b(ct,"pathSegment");var B=K("features/details-providers/wire"),Ce=b(B,"bool"),Ie=b(B,"decodeDetailsItem");var ee=b(B,"errorShape"),U=b(B,"field");var oe=b(B,"isRecord"),Y=b(B,"list"),ae=b(B,"num");var C=b(B,"str");var Le=b(B,"text");function ye(a){return String(a).replace(/<a\s[^>]*?href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,"[$2]($1)").replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi,"**$2**").replace(/<(em|i)>([\s\S]*?)<\/\1>/gi,"*$2*").replace(/<br\s*\/?>/gi,`
`).replace(/<\/p>\s*<p[^>]*>/gi,`

`).replace(/<\/?[a-z][^>]*>/gi,"")}function Me(a){return ye(a).replace(/\[([^\]]+)\]\(https?:\/\/[^)\s]+\)/g,"$1").replace(/https?:\/\/[^\s<]+/g,"").replace(/(\*\*|__|~~|\*|`)/g,"").replace(/(^|\W)_([^_\n]+)_(?=\W|$)/g,"$1$2").replace(/[ \t]+/g," ").replace(/ ?\n ?/g,`
`).trim()}function _e(a){let s=[];for(let d of ye(a).matchAll(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g))d[1]!==void 0&&d[2]!==void 0&&s.push({label:d[1],url:d[2]});return s}function Pe(a,s,d){if(d.length!==s.length)return a;let l=a,E=[];return s.forEach((h,T)=>{let N=l.toLowerCase(),k=[h.label,d[T]||""].map(P=>P.trim().replace(/[[\]]/g,"")).find(P=>P&&N.includes(P.toLowerCase()));if(!k)return;let I=N.indexOf(k.toLowerCase());E.push(`[${l.substr(I,k.length)}](${h.url})`),l=`${l.slice(0,I)}${E.length-1}${l.slice(I+k.length)}`}),l.replace(/\u0001(\d+)\u0002/g,(h,T)=>E[Number(T)]??"")}function Ae(a,s){if(!a)return"";let d=s(ye(a)),l="\0JE";for(;d.includes(l);)l+="J";let E=[],h=_=>`${l}${E.push(_)-1}\0`,T=_=>_.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/__(.+?)__/g,"<strong>$1</strong>").replace(/\*(.+?)\*/g,"<em>$1</em>").replace(/_(.+?)_/g,"<em>$1</em>").replace(/~~(.+?)~~/g,"<del>$1</del>"),N=(_,x)=>`<a is="emby-linkbutton" href="${x}" target="_blank" rel="noopener noreferrer">${_}</a>`;d=d.replace(/`([^`\n]+)`|\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<]+)/gi,(_,x,O,q,de)=>{if(x!==void 0)return h(`<code>${x}</code>`);if(O!==void 0&&q!==void 0)return h(N(T(O),q));let te=de??"",Q=te.replace(/[.,;!?)]+$/,"");return h(N(Q,Q))+te.slice(Q.length)}),d=T(d);let k=d.split(/\r?\n/),I=[],P=!1,D=[],V=!1,W=[];for(let _ of k){let x=_.trim();if(x.startsWith("&gt; ")){P||(P=!0,D=[]),D.push(x.substring(5));continue}else P&&(I.push("<blockquote>"+D.join("<br>")+"</blockquote>"),P=!1,D=[]);if(/^[-*]\s+/.test(x)){V||(V=!0,W=[]),W.push("<li>"+x.substring(2)+"</li>");continue}else V&&(I.push("<ul>"+W.join("")+"</ul>"),V=!1,W=[]);let O=/^(#{1,6})\s/.exec(x);if(O?.[1]){let q=/^#+/.exec(x)?.[0].length??O[1].length;I.push(`<h${q}>${x.substring(q+1)}</h${q}>`);continue}if(/^([-*]){3,}$/.test(x)){I.push("<hr>");continue}I.push(x?_:"<br>")}return P&&I.push("<blockquote>"+D.join("<br>")+"</blockquote>"),V&&I.push("<ul>"+W.join("")+"</ul>"),E.reduce((_,x,O)=>_.split(`${l}${O}\0`).join(x),I.join(""))}var Te='<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>';function je(a){let s=Math.round(Math.max(0,Math.min(1,a))*100);return`<span class="je-star-icon" aria-hidden="true">
                <svg class="je-star-icon-base" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${Te}</svg>
                <svg class="je-star-icon-fill" style="clip-path: inset(0 ${100-s}% 0 0);" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${Te}</svg>
            </span>`}function Ue(a){return a?`<span class="je-user-star-rating">${Array.from({length:5},(d,l)=>je(Math.max(0,Math.min(1,a-l)))).join("")}</span>`:""}function le(a){return a?new Date(a).toLocaleDateString(void 0,{year:"numeric",month:"short",day:"numeric"}):""}function De(a){return Y(U(a,"results")).filter(oe).map(s=>({author:C(s.author),created_at:C(s.created_at),content:C(s.content),rating:ae(U(s.author_details,"rating"))??null,url:C(s.url)}))}function He(a){return Y(U(a,"Reviews")).filter(oe).map(s=>{let d=C(s.Content),l=C(s.Summary),E=ae(s.Score);return{source:"anilist",author:Le(s.Author)||"Anonymous",created_at:C(s.CreatedAt),content:l?`**${l}**

${d}`:d,rating:E?Number((E/10).toFixed(1)):null,url:C(s.Url)}})}function Ne(a){return Y(U(a,"reviews")).filter(oe).map(s=>({userId:C(s.userId)??"",userName:C(s.userName),content:C(s.content),rating:ae(s.rating)??null,createdAt:C(s.createdAt),updatedAt:C(s.updatedAt)}))}var ce=(a,s)=>a.replace(/-/g,"")===s.replace(/-/g,"");function Oe(a){let s=a.filter(l=>!!l.rating);if(s.length===0)return null;let d=s.reduce((l,E)=>l+E.rating,0)/s.length*2;return{display:Number.isInteger(d)?`${d}`:`${d.toFixed(1)}`,count:s.length}}function Be(a){let[s,d]=a.split("-"),l=(s||"").toLowerCase();if(!l||l==="en")return null;let E=l==="zh"&&/^(tw|hk|mo)$/i.test(d||"");return{server:E?"zt":l,browser:E?"zh-Hant":l}}function qe(a,s){let d=a;if(s)for(let[l,E]of Object.entries(s))d=d.replace(new RegExp(`\\{${l}\\}`,"g"),()=>String(E));return d}var o=$e("Reviews"),Fe=Re(o),Ee=350;o.initializeReviewsScript=function(){let s=o.pluginConfig,d=s.ShowReviews&&s.TmdbEnabled,l=s.ShowUserReviews,E=s.ShowAnilistReviews;if(!d&&!l&&!E){console.log("🪼 Jellyfin Enhanced: Reviews feature disabled.");return}let h="🪼 Jellyfin Enhanced: Reviews:",T=new WeakMap,N=new WeakMap;o.session?.onUserChange("details-reviews",()=>{document.querySelectorAll(".tmdb-reviews-section, .je-avg-user-rating-chip").forEach(e=>e.remove()),T=new WeakMap,N=new WeakMap});let k=e=>o.escapeHtml(e),I=e=>Ae(e,k);async function P(e,t){try{if(t!=="Series"&&t!=="Movie"&&t!=="Season"&&t!=="Episode"||!o.pluginConfig.SpoilerBlurEnabled||o.pluginConfig.SpoilerStripReviews===!1)return!1;let r=Fe.peer("spoilerBlur");if(!r)return!1;if(typeof r.whenLoaded=="function"&&await r.whenLoaded(),typeof r.isLoadOk=="function"&&!r.isLoadOk())return console.warn(`${h} Spoiler Guard state load failed; suppressing reviews fail-closed.`),!0;if(typeof r.getUserPrefs=="function"&&(r.getUserPrefs()||{}).HideReviews===!1)return!1;if(t==="Movie"){let i=r.isMovieInScope;if(typeof i!="function")throw new TypeError("Spoiler Guard movie scope unavailable");return await i.call(r,e?.Id||"")}let n=t==="Series"?e?.Id||"":e?.SeriesId||"";return!!(r.isEnabledFor&&r.isEnabledFor(n))}catch(r){return console.warn(`${h} Spoiler Guard check failed; suppressing reviews:`,r),!0}}function D(e){try{let t=e||se()||document;t.querySelector(".tmdb-reviews-section")?.remove(),t.querySelector(".je-avg-user-rating-chip")?.remove()}catch(t){console.warn(`${h} removeReviewsSection failed:`,t)}}function V(e,t){let r=t==="Series"?"tv":"movie",n=Z(e),i=`/${r}/${n}/reviews?language=en-US&page=1`,c=`${X().getUrl(`/JellyfinEnhanced/tmdb/${r}/${n}/reviews`)}?language=en-US&page=1`;return o.core.api.fetch(c,{cacheKey:`tmdb:${i}`}).then(De).catch(g=>(console.error(`${h} Failed to fetch reviews.`,g),null))}function W(e){let t=e?.ProviderIds,r=parseInt(t?.AniList||t?.Anilist||"",10);if(!r)return Promise.resolve(null);let n=`anilistId=${r}`;return o.core.api.fetch(`${X().getUrl("/JellyfinEnhanced/anilist/reviews")}?${n}`,{cacheKey:`anilist:${n}`}).then(He).catch(i=>(console.error(`${h} Failed to fetch AniList reviews.`,i),null))}async function _(e,t,r){if(r!=="Movie"&&r!=="Series")return null;let[n,i]=await Promise.all([d?V(t.split(":")[0]??"",r):null,E?W(e):null]);return n||i?[...n||[],...i||[]]:null}let x=e=>e.split(":").map(Z).join(":");function O(e,t){return o.core.api.plugin(`/reviews/${t}/${x(e)}`).then(Ne).catch(r=>(console.error(`${h} Failed to fetch user reviews.`,r),[]))}async function q(e,t,r,n){try{return await o.core.api.plugin(`/reviews/${t}/${x(e)}`,{method:"POST",body:{content:r,rating:n||null},skipRetry:!0})}catch(i){let c=ee(i);throw new Error(c.responseMessage||c.message)}}async function de(e,t){await o.core.api.plugin(`/reviews/${t}/${x(e)}`,{method:"DELETE",skipRetry:!0})}async function te(e,t,r){let n=(e||"").replace(/-/g,"");try{await o.core.api.plugin(`/reviews/admin/${Z(n)}/${r}/${x(t)}`,{method:"DELETE",skipRetry:!0})}catch(i){throw ee(i).status===404?new Error("No matching review to delete (it may have already been removed)."):i}}function Q(e,t){return new Promise(r=>{let n=ve();if(n&&typeof n.confirm=="function")try{n.confirm(e,t,r);return}catch(i){console.warn(`${h} Dashboard.confirm threw, falling back:`,i)}r(window.confirm(t?`${t}

${e}`:e))})}function ze(e,t){let r=ve();if(r&&typeof r.alert=="function")try{r.alert({title:t||"",message:e||""});return}catch(n){console.warn(`${h} Dashboard.alert threw, falling back:`,n)}window.alert(t?`${t}

${e}`:e)}let ke=new Set;function H(e,t,r){let n;try{n=o.t(e,r)}catch(i){console.warn(`${h} JE.t('${e}') threw, using fallback:`,i),n=null}return!n||n===e?(ke.has(e)||(ke.add(e),console.warn(`${h} Missing translation key '${e}', using inline fallback.`)),qe(t,r)):n}let ue=e=>`<span class="tmdb-review-toggle">${o.t(e)}</span>`;function me(e,t){let r=e.length>Ee;return I(r&&!t?e.substring(0,Ee):e)+(r?ue(t?"reviews_read_less":"reviews_read_more"):"")}function Je(e){let t=document.createElement("div");t.className="tmdb-review-card";let r=e.source==="anilist";r&&t.classList.add("je-anilist-review-card"),t.dataset.fullContent=e.content||"";let n=e.content||"No content available",i=le(e.created_at),c=e.rating?`<span class="tmdb-review-rating">${o.icon(o.IconName.STAR)} ${e.rating}</span>`:"";t.innerHTML=`
                <div class="tmdb-review-header">
                    <div class="tmdb-review-author-info">
                        <strong class="tmdb-review-author">${k(e.author||"Anonymous")}</strong>
                        <span class="tmdb-review-date">${k(i)}</span>
                    </div>
                    ${c}
                </div>
                <div class="tmdb-review-content-wrapper">
                    <p class="tmdb-review-text"></p>
                </div>
            `;let g=e.url||"",y=r?/^https:\/\/anilist\.co\//.test(g)?g:"":/^https:\/\/www\.themoviedb\.org\//.test(g)?g:"",f=y?o.helpers.createExternalLink(y,{className:"je-review-source",resetStyle:!0}):Object.assign(document.createElement("span"),{className:"je-review-source"}),w=document.createElement("img");w.src=o.cdn.url("mdblist-logos",r?"anilist.png":"tmdb.png"),w.alt="",w.className="je-review-source-logo",w.loading="lazy",f.append(w,r?"AniList":"TMDB");let m=t.querySelector(".tmdb-review-date");i&&m?.append(Object.assign(document.createElement("span"),{textContent:"·"})),m?.append(f);let S=t.querySelector(".tmdb-review-text");return S&&(S.innerHTML=me(n,!1)),Ye(t,e.content||""),t}function Ke(){let e="";try{e=localStorage.getItem(`${we()}-language`)||""}catch{}return Be(e||document.documentElement.lang||"")}let pe=null;function Ve(){return pe??(pe=o.core.api.plugin("/translate/languages",{skipRetry:!0}).then(e=>Y(U(e,"languages")).filter(t=>typeof t=="string")).catch(()=>[])),pe}async function We(e){try{let t=fe();return!window.isSecureContext||!t?!1:await t.availability({sourceLanguage:"en",targetLanguage:e})!=="unavailable"}catch{return!1}}async function Ge(e,t){let r=fe();if(!r)throw new Error("Browser translator unavailable");let n=await r.create({sourceLanguage:"en",targetLanguage:t});try{let i=[];for(let c of e.split(`
`))i.push(c.trim()?await n.translate(c):c);return i.join(`
`)}finally{n.destroy?.()}}function Xe(e){let t=ee(e);if(t.status===429||t.responseCode==="translation_rate_limited"){let r=t.retryAfterSeconds;return r!==void 0&&r>0?o.t("reviews_translate_rate_limited_wait",{seconds:r}):o.t("reviews_translate_rate_limited")}return t.responseCode==="translation_refused"?o.t("reviews_translate_refused"):o.t("reviews_translate_failed")}function Ye(e,t){if(!o.pluginConfig.ReviewTranslationEnabled||!t.trim())return;let r=Ke();r&&Promise.all([We(r.browser),o.pluginConfig.ReviewTranslationServer?Ve().then(n=>n.includes(r.server)):!1]).then(([n,i])=>{if(!n&&!i)return;let c=e.querySelector(".tmdb-review-text"),g=c?.parentElement;if(!c||!g)return;let y=document.createElement("span");y.className="je-review-translate";let f=Object.assign(document.createElement("span"),{className:"je-msym-rounded",textContent:"translate"});f.setAttribute("aria-hidden","true");let w=Object.assign(document.createElement("span"),{className:"je-review-translate-label"});y.append(f,w);let m=p=>{w.textContent=o.t(p)};m("reviews_translate"),g.appendChild(y);let S=async p=>{if(n)try{return await Ge(p,r.browser)}catch(R){if(!i)throw R}let $=await o.core.api.plugin("/translate",{method:"POST",body:{text:p,target:r.server},skipRetry:!0}),u=C(U($,"text"));if(u===void 0)throw new Error("Invalid translation response");return u},A=async()=>{let p=await S(Me(t)),$=_e(t);if(!$.length)return p;let u=await S($.map(R=>R.label.replace(/\s+/g," ")).join(`
`));return Pe(p,$,u.split(`
`))},M=p=>{c.innerHTML=me(p,c.classList.contains("expanded"))},j=!1;y.addEventListener("click",async()=>{if(!j){if(e.dataset.showTranslated==="1"){e.dataset.showTranslated="0",M(t),m("reviews_translate");return}if(e.dataset.translatedContent===void 0){j=!0,m("reviews_translating");try{e.dataset.translatedContent=await A()}catch(p){m("reviews_translate"),o.toast(Xe(p));return}finally{j=!1}}e.dataset.showTranslated="1",M(e.dataset.translatedContent??""),m("reviews_show_original")}})})}function Qe(e,t,r,n){let i=document.createElement("div");i.className="tmdb-review-card je-user-review-card";let c=e.content||"",g=le(e.updatedAt)||le(e.createdAt),y=e.rating?`<span class="tmdb-review-rating je-user-review-rating">${Ue(e.rating)}</span>`:"",f=X().getUrl(`/Users/${Z(e.userId)}/Images/Primary`)+"?width=48&quality=90",w=ce(e.userId,t.id),m=!w&&t.isAdmin,S=H("reviews_edit","Edit"),A=H("reviews_delete","Delete"),M=H("reviews_admin_delete","Delete as admin"),j="";w?j=`
                <div class="je-user-review-actions">
                    <button class="je-review-btn je-review-edit-btn" title="${k(S)}"><span class="material-icons" aria-hidden="true">edit</span></button>
                    <button class="je-review-btn je-review-delete-btn" title="${k(A)}"><span class="material-icons" aria-hidden="true">delete</span></button>
                </div>`:m&&(j=`
                <div class="je-user-review-actions">
                    <button class="je-review-btn je-review-delete-btn je-review-admin-delete-btn" title="${k(M)}"><span class="material-icons" aria-hidden="true">delete</span></button>
                </div>`),i.innerHTML=`
                <div class="tmdb-review-header je-user-review-header">
                    <div class="je-user-review-avatar-wrapper">
                        <img class="je-user-avatar" src="${k(f)}" alt="">
                    </div>
                    <div class="tmdb-review-author-info">
                        <strong class="tmdb-review-author">${k(e.userName||"User")}</strong>
                        <span class="tmdb-review-date">${k(g)}</span>
                    </div>
                    ${y}
                    ${j}
                </div>
                ${c.length>0?`
                <div class="tmdb-review-content-wrapper">
                    <p class="tmdb-review-text"></p>
                </div>`:""}
            `;let p=i.querySelector(".je-user-avatar");p&&(p.onerror=()=>{p.style.display="none"});let $=i.querySelector(".tmdb-review-text");return $&&($.innerHTML=me(c,!1)),i.dataset.fullContent=c,w?(i.querySelector(".je-review-edit-btn")?.addEventListener("click",()=>r(e)),i.querySelector(".je-review-delete-btn")?.addEventListener("click",()=>n(e))):m&&i.querySelector(".je-review-admin-delete-btn")?.addEventListener("click",()=>n(e)),i}function Ze(e,t,r){let n=document.createElement("div");n.className="je-review-form";let i=e?.rating||0;n.innerHTML=`
                ${e?"":`<h4 class="je-review-form-title">${o.t("reviews_add")}</h4>`}
                <div class="je-review-star-picker" role="radiogroup">
                    ${[1,2,3,4,5].map(u=>`<button class="je-star-btn" data-value="${u}" type="button" aria-label="${u} stars">${je(0)}</button>`).join("")}
                    <button class="je-star-clear-btn" type="button"><span class="material-icons" aria-hidden="true">close</span></button>
                    <span class="je-star-label"></span>
                </div>
                <textarea class="je-review-textarea" maxlength="2000">${k(e?.content||"")}</textarea>
                <div class="je-review-char-counter"><span class="je-review-char-count">${e?.content?.length||0}</span>/2000</div>
                <div class="je-review-form-btns">
                    <button class="je-review-btn je-review-submit-btn" type="button"><span class="material-icons" aria-hidden="true">save</span></button>
                    <button class="je-review-btn je-review-cancel-btn" type="button"><span class="material-icons" aria-hidden="true">close</span></button>
                </div>
                <div class="je-review-form-error" aria-live="polite"></div>
            `;let c=n.querySelectorAll(".je-star-btn"),g=u=>{let R=n.querySelector(u);if(!R)throw new Error(`Review form is missing ${u}`);return R},y=g(".je-star-clear-btn"),f=g(".je-star-label"),w=g(".je-review-textarea"),m=g(".je-review-char-count"),S=g(".je-review-submit-btn"),A=g(".je-review-cancel-btn"),M=g(".je-review-form-error"),j=u=>{c.forEach(R=>{let F=parseInt(R.dataset.value??"0",10),v=Math.round(Math.max(0,Math.min(1,u-(F-1)))*100),L=R.querySelector(".je-star-icon-fill");L&&(L.style.clipPath=`inset(0 ${100-v}% 0 0)`)})},p=u=>{i=u,j(u),f.textContent=i>0?`${i}/5`:""},$=(u,R)=>{let F=parseInt(u.dataset.value??"0",10),v=u.getBoundingClientRect();return R-v.left<v.width/2?F-.5:F};return p(i),c.forEach(u=>{u.addEventListener("click",R=>p($(u,R.clientX))),u.addEventListener("mousemove",R=>j($(u,R.clientX))),u.addEventListener("mouseleave",()=>j(i))}),y.addEventListener("click",()=>p(0)),w.addEventListener("input",()=>{m.textContent=String(w.value.length)}),S.addEventListener("click",async()=>{let u=w.value.trim();if(!u&&!i){M.textContent=o.t("reviews_form_error_empty");return}M.textContent="",S.disabled=!0,S.innerHTML='<span class="material-icons" aria-hidden="true">hourglass_empty</span>';try{await t(u,i||null)}catch{M.textContent=o.t("reviews_form_error_save"),S.disabled=!1,S.innerHTML='<span class="material-icons" aria-hidden="true">save</span>'}}),A.addEventListener("click",r),n}function et(e,t){let r=Oe(t);if(e.querySelector(".je-avg-user-rating-chip")?.remove(),!r)return;let n=document.createElement("div");n.className="mediaInfoCriticRating mediaInfoItem je-avg-user-rating-chip",n.title=H("reviews_avg_rating_tooltip","Average rating from {count} user(s)",{count:r.count}),n.innerHTML=`<span class="je-msym-rounded starIcon" aria-hidden="true" style="color:#e91e8c;">person_heart</span>${k(r.display)}`;let i=e.querySelector(".mediaInfoCriticRating")||e.querySelector(".starRatingContainer");i?.parentNode?i.parentNode.insertBefore(n,i.nextSibling):e.querySelector(".mediaInfoItems")?.appendChild(n)}function tt(e,t,r,n,i){D(r),l&&t.length>0&&et(r,t);let{tmdbKey:c,apiMediaType:g}=n,y=t.find(v=>ce(v.userId,i.id)),f=document.createElement("details");f.className="detailSection tmdb-reviews-section";let w=be(o.session,he()||"",r),m=()=>f.isConnected&&w.current();o.currentSettings?.reviewsExpandedByDefault&&f.setAttribute("open","");let S=(e?e.length:0)+t.length,A=document.createElement("summary");A.className="sectionTitle",A.innerHTML=`${o.t("reviews_title",{count:S})} <i class="material-icons expand-icon">expand_more</i>`,f.appendChild(A);let M=document.createElement("div");M.className="je-review-action-bar";let j=null;l&&!y&&(j=document.createElement("button"),j.className="je-review-btn je-review-write-btn",j.textContent=o.t("reviews_add"),M.appendChild(j)),f.appendChild(M);let p=document.createElement("div");p.className="je-review-form-placeholder",f.appendChild(p);let $=document.createElement("div");$.className="tmdb-review-swipe-container";let u=v=>{if(!m())return;p.replaceChildren();let L=Ze(v,async(z,J)=>{m()&&(await q(c,g,z,J),m()&&ge(r))},()=>{p.replaceChildren()});p.appendChild(L),f.setAttribute("open",""),L.querySelector(".je-review-textarea")?.focus()},R=async v=>{if(!m())return;let L=ce(v.userId,i.id),z=v.userName||"user",J=L?H("reviews_delete_title","Delete review"):H("reviews_admin_delete_title","Delete review (admin)"),re=L?H("reviews_delete_confirm","Delete your review for this item?"):H("reviews_admin_delete_confirm","Delete this review by {user}? This cannot be undone.",{user:z});if(!(!await Q(re,J)||!m()))try{L?await de(c,g):await te(v.userId,c,g),m()&&ge(r)}catch(ne){if(!m())return;console.error(`${h} Delete failed`,ne);let at=H("reviews_delete_error_title","Delete failed"),lt=H("reviews_delete_error_body","Could not delete the review: {err}",{err:ee(ne).message||"Unknown error"});ze(lt,at),ge(r)}};for(let v of t)$.appendChild(Qe(v,i,L=>u(L),R));for(let v of(e??[]).slice(0,10))$.appendChild(Je(v));f.appendChild($),j?.addEventListener("click",()=>{p.querySelector(".je-review-form")?p.replaceChildren():u(y||null)}),$.addEventListener("click",v=>{let L=v.target;if(!(L instanceof Element)||!L.classList.contains("tmdb-review-toggle"))return;let z=L.parentElement,J=z?.closest(".tmdb-review-card");if(!z||!J)return;let re=(J.dataset.showTranslated==="1"?J.dataset.translatedContent:J.dataset.fullContent)||"",ne=z.classList.toggle("expanded");z.innerHTML=ne?I(re)+ue("reviews_read_less"):I(re.substring(0,Ee))+ue("reviews_read_more")}),f.addEventListener("toggle",()=>{if(m())try{let v=o.currentSettings=o.currentSettings||o.loadSettings?.()||{};v.reviewsExpandedByDefault!==f.open&&(v.reviewsExpandedByDefault=f.open,typeof o.saveUserSettings=="function"&&o.saveUserSettings("settings.json",v))}catch(v){console.error(`${h} Failed to persist reviews expanded state`,v)}});let F=r.querySelector(".streaming-lookup-container")||r.querySelector(".itemExternalLinks")||r.querySelector(".tagline");F?.parentNode?F.parentNode.insertBefore(f,F.nextSibling):console.error(`${h} Could not find a suitable anchor to insert reviews.`)}async function rt(e,t,r){if(!e)return null;if(t==="Movie"||t==="Series"){let i=e.ProviderIds.Tmdb;return i?{tmdbKey:i,apiMediaType:t==="Movie"?"movie":"tv"}:null}if(t!=="Season"&&t!=="Episode")return null;let n=e.SeriesProviderIds.Tmdb;if(!n&&e.SeriesId)try{n=(await r(e.SeriesId))?.ProviderIds.Tmdb}catch{}return!n||e.IndexNumber==null?null:t==="Season"?{tmdbKey:`${n}:s${e.IndexNumber}`,apiMediaType:"tv"}:e.ParentIndexNumber==null?null:{tmdbKey:`${n}:s${e.ParentIndexNumber}:e${e.IndexNumber}`,apiMediaType:"tv"}}async function nt(){let e=X(),t=null;try{t=e.getCurrentUser?await e.getCurrentUser():null}catch{t=null}return{id:C(U(t,"Id"))||e.getCurrentUserId()||"",isAdmin:Ce(U(U(t,"Policy"),"IsAdministrator"))===!0}}async function Se(e,t,r=!1){let n=he(),i=we();if(!n||!i)return;let c=be(o.session,n,e),g={};N.set(e,g);let y=()=>c.current()&&N.get(e)===g,f=await xe(o.helpers,n,!0,i);if(!y())return;let w=f?.Type;if(!f||!w){D(e),T.delete(e);return}if(await P(f,w)){y()&&(D(e),T.delete(e));return}if(!y()||!r&&T.get(e)?.current()&&e.querySelector(".tmdb-reviews-section"))return;let m=await rt(f,w,p=>t(i,p));if(!m||!w||!y())return;let[S,A,M]=await Promise.all([_(f,m.tmdbKey,w),l?O(m.tmdbKey,m.apiMediaType):Promise.resolve([]),nt()]);if(!y())return;tt(S,A,e,m,M),T.set(e,c);let j=Fe.peer("invalidateUserReviewTagCache");typeof j=="function"&&j(m.tmdbKey)}async function ge(e){try{await Se(se()||e,async(t,r)=>Ie(await X().getItem(t,r)),!0)}catch(t){console.error(`${h} Failed to refresh reviews:`,t)}}async function it(e){if(e){T.get(e)?.current()||(D(e),T.delete(e));try{await Se(e,(t,r)=>xe(o.helpers,r,!0,t))}catch(t){console.error(`${h} Error processing page:`,t)}}}function st(){let e="tmdb-reviews-enhanced-styles";if(document.getElementById(e))return;let t=document.createElement("style");t.id=e,t.textContent=dt,document.head.appendChild(t)}st();let ot=o.helpers.onViewPage(async(e,t,r)=>{if(!o.pluginConfig.ShowReviews&&!o.pluginConfig.ShowUserReviews&&!o.pluginConfig.ShowAnilistReviews){ot?.();return}let n=window.location.hash.includes("id=")||typeof r=="string"&&r.includes("id="),i=!!t&&(t.id==="itemDetailPage"||t.classList.contains("itemDetailPage"));if(!n&&!i)return;await new Promise(g=>setTimeout(g,150));let c=se();c&&it(c)},{pages:null,fetchItem:!1,immediate:!0})};var dt=`
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
