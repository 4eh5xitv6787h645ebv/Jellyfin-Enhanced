// The Leaving Soon page as a user sees it: mounted the way its tab mounts it, then each card's name, chip and actions.
export default async ({ page, until, sleep }) => {
  await until(() => page.evaluate(() => !!window.JellyfinEnhanced?.leavingSoonPage), 15000);
  return page.evaluate(async () => {
    const JE = window.JellyfinEnhanced;
    const host = document.createElement('div');
    document.body.appendChild(host);
    JE.leavingSoonPage.injectStyles();
    JE.leavingSoonPage.renderForCustomTab(host);
    for (let i = 0; i < 50 && !host.querySelector('.je-ls'); i++) await new Promise(r => setTimeout(r, 100));
    const cards = [...host.querySelectorAll('.je-ls-card')].map(c => [c.querySelector('.je-ls-name')?.textContent, c.querySelector('.je-ls-chip')?.textContent, [...c.querySelectorAll('.je-ls-icon-btn')].map(b => b.title).join('+') || 'no actions'].join(' | '));
    const cfg = JE.pluginConfig || {};
    return [`title: ${host.querySelector('.je-ls-heading')?.firstChild?.textContent} (${host.querySelector('.je-ls-count')?.textContent})`,
      `filters: ${[...host.querySelectorAll('.je-ls-pill')].map(p => p.textContent).join(', ')}`,
      ...cards,
      `config: provider=${cfg.LeavingSoonProvider} actions=${cfg.MaintainerrActionsAvailable} requests=${cfg.RemovalRequestsAvailable} page=${cfg.LeavingSoonPageEnabled} nativeTab=${cfg.LeavingSoonPageUseNativeTab}`,
      `menu: removalMenu=${typeof JE.removalMenu?.act} same=${JE.removalMenu === JE.maintainerrMenu}`].join('\n');
  });
};
