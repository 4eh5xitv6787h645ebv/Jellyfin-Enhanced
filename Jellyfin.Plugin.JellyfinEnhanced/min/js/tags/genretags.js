(() => {
"use strict";(()=>{function T(){let t=window,s=t.JellyfinEnhanced??(t.JellyfinEnhanced={});return s.core??(s.core={}),s}var P=Object.freeze({});function S(t){return typeof t=="object"&&t!==null&&!Array.isArray(t)}function k(t){return S(t)?t:P}function u(t){if(!t)return[];if(!Array.isArray(t))throw new TypeError("Expected a list");return t}function _(t){if(typeof t!="string")throw new TypeError("Read a list member that is not text");return t}var v={genreIconMap:{default:"theaters",action:"sports_martial_arts",adventure:"explore",animation:"animation",comedy:"mood",crime:"local_police",documentary:"article",drama:"theater_comedy",family:"family_restroom",fantasy:"auto_awesome",history:"history_edu",horror:"skull",music:"music_note",mystery:"psychology_alt",romance:"favorite","science fiction":"science","sci-fi":"science","tv movie":"tv",thriller:"psychology",war:"military_tech",western:"landscape",superhero:"domino_mask",musical:"music_video",biography:"menu_book",sport:"sports_soccer","game-show":"quiz","reality-tv":"live_tv",aventure:"explore",comédie:"mood",drame:"theater_comedy",fantastique:"auto_awesome",histoire:"history_edu",horreur:"skull",musique:"music_note",mystère:"psychology_alt","science-fiction":"science",téléfilm:"tv",guerre:"military_tech","comédie musicale":"music_video",biographie:"menu_book",familial:"family_restroom",historique:"history_edu","jeu-concours":"quiz","télé-réalité":"live_tv",acción:"sports_martial_arts",aventura:"explore",animación:"animation",comedia:"mood",crimen:"local_police",documental:"article",familiar:"family_restroom",fantasía:"auto_awesome",historia:"history_edu",terror:"skull",música:"music_note",misterio:"psychology_alt","ciencia ficción":"science","película de tv":"tv",suspense:"psychology",bélica:"military_tech",superhéroes:"domino_mask",biografía:"menu_book",deporte:"sports_soccer",concurso:"quiz",telerrealidad:"live_tv",abenteuer:"explore",komödie:"mood",krimi:"local_police",dokumentarfilm:"article",familienfilm:"family_restroom",geschichte:"history_edu",kriegsfilm:"military_tech",musikfilm:"music_video",liebesfilm:"favorite",fernsehfilm:"tv",spielshow:"quiz",azione:"sports_martial_arts",avventura:"explore",animazione:"animation",commedia:"mood",crimine:"local_police",documentario:"article",drammatico:"theater_comedy",famiglia:"family_restroom",fantastico:"auto_awesome",storico:"history_edu",orrore:"skull",musica:"music_note",mistero:"psychology_alt",romantico:"favorite",fantascienza:"science","film per la tv":"tv",guerra:"military_tech",biografico:"menu_book",sportivo:"sports_soccer","game show":"quiz","reality tv":"live_tv",eventyr:"explore",komedie:"mood",dokumentar:"article",familie:"family_restroom",historie:"history_edu",gyser:"skull",musik:"music_note",mysterie:"psychology_alt",romantik:"favorite",krig:"military_tech","tv-film":"tv",spilshow:"quiz",äventyr:"explore",komedi:"mood",brott:"local_police",dokumentär:"article",familj:"family_restroom",skräck:"skull",mysterium:"psychology_alt",krigs:"military_tech",spelshow:"quiz",akció:"sports_martial_arts",kaland:"explore",animációs:"animation",vígjáték:"mood",bűnügyi:"local_police",dokumentum:"article",dráma:"theater_comedy",családi:"family_restroom",történelmi:"history_edu",zenei:"music_note",misztikus:"psychology_alt",romantikus:"favorite","tv film":"tv",háborús:"military_tech",életrajzi:"menu_book",játékshow:"quiz","valóság-tv":"live_tv",боевик:"sports_martial_arts",приключения:"explore",мультфильм:"animation",комедия:"mood",криминал:"local_police",документальный:"article",драма:"theater_comedy",семейный:"family_restroom",фэнтези:"auto_awesome",история:"history_edu",ужасы:"skull",музыка:"music_note",детектив:"psychology_alt",мелодрама:"favorite",фантастика:"science","НФ и Фэнтези":"science","телевизионный фильм":"tv",триллер:"psychology",военный:"military_tech",вестерн:"landscape","реалити-шоу":"live_tv"},genreLabelOfIcon:{sports_martial_arts:"action",explore:"adventure",animation:"animation",mood:"comedy",local_police:"crime",article:"documentary",theater_comedy:"drama",family_restroom:"family",auto_awesome:"fantasy",history_edu:"history",skull:"horror",music_note:"music",psychology_alt:"mystery",favorite:"romance",science:"science fiction",tv:"tv movie",psychology:"thriller",military_tech:"war",landscape:"western",domino_mask:"superhero",music_video:"musical",menu_book:"biography",sports_soccer:"sport",quiz:"game-show",live_tv:"reality-tv"},genreOtherLabel:"other"},w=v.genreIconMap,x=v.genreLabelOfIcon,C=v.genreOtherLabel;var O=(t,s)=>Object.prototype.hasOwnProperty.call(t,s);function R(t){let s="🪼 Jellyfin Enhanced: Genre Tags:",m="genre-overlay-container",i="genre-tag";function p(e){return w[e.toLowerCase()]||w.default||"theaters"}function b(e){return(typeof e=="string"&&O(x,e)?x[e]:void 0)??C}function j(){let e=t.core.tagLayout?.resolveLayout(null).caps.genre;return e===void 0||e>0&&e<=3}function y(e,n,o){if(!n)return;e.removeExistingOverlay(n),n.style.position!=="relative"&&(n.style.position="relative");let r=document.createElement("div");r.className=m,o.forEach(function(g){let l=_(g),c=p(l),a=document.createElement("div");a.className=i,a.title=l,a.dataset.jeGenre=b(c);let d=document.createElement("span");d.className="je-msym-outlined",d.textContent=c,a.appendChild(d);let h=document.createElement("span");h.className="genre-text",h.textContent=l,a.appendChild(h),r.appendChild(a)}),e.commitOverlay(n,r)}let f={logPrefix:s,settingKey:"genreTagsEnabled",containerClass:m,taggedAttr:"jeGenreTagged",styleId:"genre-tags-styles",position:{userKey:"genreTagsPosition",pluginKey:"GenreTagsPosition",fallback:"top-right"},cache:{key:"JellyfinEnhanced-genreTagsCache",legacyPrefix:"genreTagsCache",hotBucket:"genre"},ignoreSelectors:[".je-hidden","#itemDetailPage .infoWrapper","#itemDetailPage #castCollapsible","#indexPage .verticalSection.MyMedia",".formDialog","#itemDetailPage .chapterCardImageContainer","#pluginsPage, #pluginCatalogPage, #devicesPage, #mediaLibraryPage"],searchPageIgnoreSelector:"#searchPage",shouldIgnore(e,n){return document.querySelector(".videoPlayerContainer")?!0:n(e)},buildCss(){return`
                .je-msym-outlined {
                    font-family: 'JE Material Symbols Outlined';
                    font-weight: normal;
                    font-style: normal;
                    font-size: calc(24px * var(--je-tag-scale, 1));
                    line-height: 1;
                    letter-spacing: normal;
                    text-transform: none;
                    display: inline-block;
                    white-space: nowrap;
                    word-wrap: normal;
                    direction: ltr;
                    -webkit-font-feature-settings: 'liga';
                    -webkit-font-smoothing: antialiased;
                }

                .${m} {
                    display: flex;
                    flex-direction: column;
                    gap: calc(3px * var(--je-tag-scale, 1) * var(--je-tag-gap, 1));
                    align-items: flex-end;
                    z-index: 101;
                    pointer-events: none;
                    max-height: 90%;
                    overflow: visible;
                }
                .${i} {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: calc(clamp(22px, 4.5vw, 30px) * var(--je-tag-scale, 1));
                    width: calc(clamp(22px, 4.5vw, 30px) * var(--je-tag-scale, 1));
                    border-radius: 50%;
                    box-shadow: 0 1px 4px rgba(0,0,0,0.4);
                    overflow: visible;
                    background-color: rgba(10, 10, 10, 0.8);
                    color: #E0E0E0;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    flex-shrink: 0;
                    contain: style;
                    position: relative;
                }
                .${i} .je-msym-outlined {
                    font-size: calc(clamp(1em, 2.8vw, 1.4em) * var(--je-tag-scale, 1));
                    line-height: 1;
                }
                .${i} .genre-text {
                    /* Absolutely positioned label = no layout reflow when shown/hidden.
                       Appears beside the icon on hover via opacity (GPU-composited).
                       Direction depends on the slot (layout stylesheet): icons on the
                       right → label floats left, on the left → floats right. */
                    position: absolute;
                    right: calc(100% + 4px);
                    top: 50%;
                    transform: translateY(-50%);
                    white-space: nowrap;
                    font-size: calc(clamp(9px, 1.7vw, 11px) * var(--je-tag-scale, 1));
                    font-weight: 500;
                    text-transform: capitalize;
                    background: rgba(10, 10, 10, 0.85);
                    color: #E0E0E0;
                    padding: calc(2px * var(--je-tag-scale, 1)) calc(6px * var(--je-tag-scale, 1));
                    border-radius: 4px;
                    box-sizing: border-box;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    opacity: 0;
                    pointer-events: none;
                    transition: opacity 0.12s ease;
                }
                /* Bounded when the card is revealed (core/tag-layout.js fitReveal): no room left beside the icon. */
                .${i} .genre-text[data-je-genre-fit="hidden"] { display: none; }
                .card:hover .${i} .genre-text,
                .je-tag-reveal .${i} .genre-text {
                    opacity: 1;
                }
                .layout-mobile .${m} { gap: calc(2px * var(--je-tag-scale, 1) * var(--je-tag-gap, 1)); }
                .layout-mobile .${i} {
                    height: calc(clamp(20px, 4vw, 26px) * var(--je-tag-scale, 1));
                    min-width: calc(clamp(20px, 4vw, 26px) * var(--je-tag-scale, 1));
                }
                .layout-mobile .${i} .je-msym-outlined {
                    font-size: calc(clamp(0.95em, 2.4vw, 1.25em) * var(--je-tag-scale, 1));
                }
                @media (max-width: 768px) {
                    .${m} { gap: calc(2px * var(--je-tag-scale, 1) * var(--je-tag-gap, 1)); }
                    .${i} {
                        height: calc(clamp(21px, 4vw, 26px) * var(--je-tag-scale, 1));
                        min-width: calc(clamp(21px, 4vw, 26px) * var(--je-tag-scale, 1));
                    }
                }
                @media (max-width: 480px) {
                    .${m} { gap: calc(2px * var(--je-tag-scale, 1) * var(--je-tag-gap, 1)); max-height: 85%; }
                    .${i} {
                        height: calc(clamp(20px, 3.6vw, 24px) * var(--je-tag-scale, 1));
                        min-width: calc(clamp(20px, 3.6vw, 24px) * var(--je-tag-scale, 1));
                        box-shadow: 0 1px 3px rgba(0,0,0,0.4);
                    }
                    .${i} .je-msym-outlined {
                        font-size: calc(clamp(0.85em, 2.2vw, 1.1em) * var(--je-tag-scale, 1));
                    }
                }
            `},pipeline:{needsFirstEpisode:!0,needsParentSeries:!0,render(e,n,o,r){if(e.isTagged(n)||e.shouldIgnore(n))return;let g=u(o.Genres),l=u(r.parentSeries?.Genres),c=u(r.firstEpisode?.Genres),a=g;o.Type==="Season"&&g.length===0&&l.length>0?a=l:o.Type==="Series"&&g.length===0&&c.length>0&&(a=c);let d=o.Id;d&&e.setPersistent(String(d),{genres:a.slice(),full:!0,timestamp:Date.now()}),y(e,n,a)},renderFromCache(e,n,o){if(e.isTagged(n))return!0;let r=e.hot?.get(o)||e.getPersistent(o);if(r){let g=k(r),l=Array.isArray(r)?r:g.genres;if(Array.isArray(l)){let c=l;return c.length>=3&&!g.full&&!j()?!1:(c.length&&y(e,n,c),!0)}}return!1},renderFromServerCache(e,n,o){if(e.isTagged(n)||e.shouldIgnore(n))return;let r=u(o.Genres);r.length>0&&y(e,n,r)}}};t.genreTags={iconFor:p,labelFor:e=>b(p(String(e)))},t.initializeGenreTags=function(){t.core.tagRenderer.register("genre",f),console.log(`${s} Initialized successfully.`)},t.reinitializeGenreTags=function(){t.core.tagRenderer.reinitialize("genre",f)},t.core.tagRenderer.registerStyles(f)}R(T());})();
})();
