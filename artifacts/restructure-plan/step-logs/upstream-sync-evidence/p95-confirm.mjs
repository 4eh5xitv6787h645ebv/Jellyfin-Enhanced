// Port 95 (upstream 84954dc5): the Media Tags tab's confirmations. Opens the configuration page, shows the Media Tags
// tab, presses Rebuild cache and Cancel in whichever dialog asks, then reads what the administrator is left with: which
// dialog asked, how many configuration pages the router now holds, and whether the one shown still has its sidebar
// and a drawn Media Tags tab. Nothing is rebuilt or applied (Cancel).
export default async ({ page, go, until, sleep }) => {
  await go('#/configurationpage?name=Jellyfin%20Enhanced');
  await until(() => page.evaluate(() => !!document.querySelector('.jellyfin-tab-button[data-tab="media-tags"]')), 20000);
  await page.evaluate(() => document.querySelector('.jellyfin-tab-button[data-tab="media-tags"]').click());
  await until(() => page.evaluate(() => !!document.querySelector('#jeTaApplyAll')), 20000);
  await sleep(500);
  const historyBefore = await page.evaluate(() => history.length);
  await page.evaluate(() => document.querySelector('[data-ov="rebuild"]').click());
  const asked = await until(() => page.evaluate(() => {
    const own = document.querySelector('.jea-dialog');
    if (own) return `the configuration page's dialog: "${own.querySelector('.jea-dialog-title')?.textContent}"`;
    const jf = document.querySelector('.dialogContainer .dialog');
    if (jf) return `Jellyfin's dialog: "${(jf.querySelector('.formDialogHeaderTitle, h2, .dialogContentTitle')?.textContent || '').trim()}"`;
    return '';
  }), 10000);
  const historyOpen = await page.evaluate(() => history.length);
  await page.evaluate(() => {
    const own = document.querySelector('.jea-dialog [data-r="0"]');
    if (own) { own.click(); return; }
    const jf = document.querySelector('.dialogContainer .dialog [data-id="cancel"], .dialogContainer .dialog .btnCancel');
    if (jf) jf.click();
  });
  await sleep(2500);
  const after = await page.evaluate(() => {
    const pages = [...document.querySelectorAll('#JellyfinEnhancedPage')];
    const shown = pages.find((p) => !p.classList.contains('hide') && p.offsetParent !== null) || null;
    const wait = shown ? shown.querySelector('.je-ta-wait') : null;
    return {
      pages: pages.length,
      shownHasSidebar: shown ? !!shown.querySelector('[data-je-mt-tree]') : null,
      shownMediaTagsDrawn: shown ? !!shown.querySelector('#jeTaApplyAll') : null,
      shownStillLoading: !!(wait && wait.offsetParent !== null),
      dialogsLeft: document.querySelectorAll('.jea-dialog, .dialogContainer .dialog').length,
    };
  });
  return [
    `asked with: ${asked}`,
    `history entries added while the dialog was open: ${historyOpen - historyBefore}`,
    `after Cancel: configuration pages in the DOM: ${after.pages}; the shown page has the sidebar: ${after.shownHasSidebar}; its Media Tags tab is drawn: ${after.shownMediaTagsDrawn}; "Loading Media Tags settings" shown: ${after.shownStillLoading}; dialogs left open: ${after.dialogsLeft}`,
  ].join('\n');
};
