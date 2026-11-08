import { catchupHost } from '../../host/catchup-host';
/**
 * @file Catch Up entry point. Exposes JE.catchUpPage = { injectStyles, renderPage }, used by
 * PluginPages/CatchUpPage.html and the tab.
 */
(function () {
  'use strict';
  const { JE: candidate } = catchupHost();
  if (!candidate) return;
  const JE = candidate;


  if (!JE?.pluginConfig?.CatchUpEnabled) return;
  const runtime = JE.internals.catchUp;
  if (!runtime) return;
  const S = runtime;

  const injectStyles=S.injectStyles, deckModule=S.deck, activityModule=S.activity;
  if(!injectStyles || !deckModule || !activityModule)throw Error('Catch Up loader order violated');
  /**
   * Renders the page into `container` (default #je-catchup-container).
   * Calling it again rebuilds the page.
   * @param {HTMLElement} [container]
   */
  function renderPage(container?: HTMLElement) {
    const host = container || document.getElementById('je-catchup-container');
    if (!host) return;
    injectStyles!();
    host.replaceChildren();

    const root = S.h('div', 'je-catchup');
    const main = S.h('div', 'je-catchup-main');
    root.append(main);
    host.append(root);

    const deck = deckModule!.mount(root, main);
    deck.start();
    activityModule!.mount(root, deck.headActions).catch((e) => console.warn(`${S.LOG} activity panel unavailable:`, e));
  }

  JE.catchUpPage = { injectStyles, renderPage };
})();
