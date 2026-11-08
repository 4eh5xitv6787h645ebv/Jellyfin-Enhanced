(() => {
"use strict";
(() => {
  // client/src/host/catchup-host.ts
  function catchupHost() {
    const host = window;
    return { host, JE: host.JellyfinEnhanced, getApi: () => host.ApiClient, Emby: host.Emby };
  }

  // client/src/features/catchup/catchup-page.ts
  (function() {
    "use strict";
    const { JE: candidate } = catchupHost();
    if (!candidate) return;
    const JE = candidate;
    if (!JE?.pluginConfig?.CatchUpEnabled) return;
    const runtime = JE.internals.catchUp;
    if (!runtime) return;
    const S = runtime;
    const injectStyles = S.injectStyles, deckModule = S.deck, activityModule = S.activity;
    if (!injectStyles || !deckModule || !activityModule) throw Error("Catch Up loader order violated");
    function renderPage(container) {
      const host = container || document.getElementById("je-catchup-container");
      if (!host) return;
      injectStyles();
      host.replaceChildren();
      const root = S.h("div", "je-catchup");
      const main = S.h("div", "je-catchup-main");
      root.append(main);
      host.append(root);
      const deck = deckModule.mount(root, main);
      deck.start();
      activityModule.mount(root, deck.headActions).catch((e) => console.warn(`${S.LOG} activity panel unavailable:`, e));
    }
    JE.catchUpPage = { injectStyles, renderPage };
  })();
})();
})();
//# sourceMappingURL=catchup-page.js.map
