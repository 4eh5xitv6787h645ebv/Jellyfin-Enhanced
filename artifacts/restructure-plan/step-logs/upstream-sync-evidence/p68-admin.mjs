// The *arr tab's removal-tool cards on the plugin's configuration page: titles, and which of their settings show.
export default async ({ page, until }) => {
  await until(() => page.evaluate(() => !!document.querySelector('#ReclaimerrEnabled') || document.querySelectorAll('#arr fieldset').length > 3), 20000);
  return page.evaluate(() => {
    const title = c => [...c.querySelector('legend').childNodes].filter(n => !n.classList?.contains('material-icons')).map(n => n.textContent).join('').trim();
    const cards = [...document.querySelectorAll('#arr fieldset')].map(title).filter(t => /Maintainerr|Reclaimerr|Leaving/i.test(t));
    const shown = id => { const el = document.getElementById(id); return !el ? 'absent' : el.closest('.jea-dep-hidden') ? 'hidden' : 'shown'; };
    const ids = ['LeavingSoonMaintainerrEnabled', 'LeavingSoonMaintainerrUrl', 'ReclaimerrEnabled', 'ReclaimerrUrl', 'ReclaimerrApiKey', 'reclaimerrCreateAccountBtn', 'LeavingSoonMaintainerrActions', 'LeavingSoonHomeRow', 'leavingSoonPageEnabled', 'leavingSoonPageUseNativeTab'];
    return [`cards: ${cards.join(', ')}`, ...ids.map(id => `${id}: ${shown(id)}${document.getElementById(id)?.type === 'checkbox' ? (document.getElementById(id).checked ? ' on' : ' off') : ''}`)].join('\n');
  });
};
