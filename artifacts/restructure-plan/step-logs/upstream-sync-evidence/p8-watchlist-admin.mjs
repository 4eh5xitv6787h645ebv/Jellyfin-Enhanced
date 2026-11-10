// Port 8 (upstream 2e1f123d, #1032): the admin page's Seerr > Watchlist section. Reports its groups, the removal
// options, and which of the two "don't re-add" rows (and the days' description) are shown for each removal mode,
// including after another setting on the page is toggled while the mode is "Jellyfin decides".
export default async ({ page, go, until, sleep }) => {
  await go('#/configurationpage?name=Jellyfin%20Enhanced');
  await until(() => page.evaluate(() => !!document.getElementById('watchlistRemovalSync') || !!document.getElementById('preventWatchlistReAddition')), 30000);
  await sleep(2500);
  return page.evaluate(() => {
    const mode = document.getElementById('watchlistRemovalSync'), toggle = document.getElementById('preventWatchlistReAddition'), days = document.getElementById('watchlistMemoryRetentionDays');
    if (!mode) return { removalSetting: 'not on the page', toggleLabel: toggle?.closest('label, .checkboxContainer')?.textContent.trim().slice(0, 60) ?? null };
    // Shown = takes part in layout once its section is open; the section itself may be collapsed, so test the element's own hiding.
    const hidden = el => !el || el.classList.contains('jea-dep-hidden') || el.style.display === 'none';
    const rows = () => ({
      dontReAdd: !hidden(toggle.closest('.checkboxContainer, .inputContainer, .selectContainer') || toggle.closest('label')),
      days: !hidden(days.closest('.inputContainer')),
      daysDescription: !hidden(document.querySelector('.je-setting-description[data-desc-for="watchlistMemoryRetentionDays"]')),
    });
    const set = (el, change) => { change(el); el.dispatchEvent(new Event('change', { bubbles: true })); };
    const section = mode.closest('.je-details-section, details, fieldset, .jea-section');
    const out = {
      groups: [...(section || document).querySelectorAll('.jea-group > summary')].map(s => s.textContent.replace(/\s+/g, ' ').trim()).filter(t => /items$/.test(t) || /^(Adding|Removing)/.test(t)),
      label: document.querySelector('label[for="watchlistRemovalSync"]')?.textContent.trim() ?? null,
      options: [...mode.options].map(o => `${o.value}: ${o.textContent.trim()}`),
      requestedMediaLabel: document.getElementById('addRequestedMediaToWatchlist').closest('label, .checkboxContainer')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 70),
      saved: mode.value, rowsShown: {},
    };
    const original = mode.value;
    for (const value of ['jellyfin', 'seerr', 'both', 'off']) { set(mode, el => { el.value = value; }); out.rowsShown[value] = rows(); }
    set(mode, el => { el.value = 'jellyfin'; });
    const other = document.getElementById('syncJellyseerrWatchlist');
    set(other, el => { el.checked = !el.checked; }); set(other, el => { el.checked = !el.checked; });
    out.rowsShown.jellyfinAfterAnotherToggle = rows();
    set(mode, el => { el.value = original; });
    return out;
  });
};
