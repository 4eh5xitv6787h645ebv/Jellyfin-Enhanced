// Port 6 (upstream c22870b2): the audio languages JE shows on a movie's details page (Fixes #1034).
export default async ({ page, go, until, sleep }) => {
  const prep = await page.evaluate(async () => {
    const JE = window.JellyfinEnhanced, uid = ApiClient.getCurrentUserId();
    let changed = false;
    if (!JE.currentSettings.showAudioLanguages) { JE.currentSettings.showAudioLanguages = true; await JE.saveUserSettings('settings.json', JE.currentSettings); changed = true; }
    const movie = (await ApiClient.getItems(uid, { IncludeItemTypes: 'Movie', Recursive: true, SortBy: 'SortName', Limit: 1, SearchTerm: '101 Dalmatians II', Fields: 'MediaSources' })).Items[0];
    return { id: movie.Id, name: movie.Name, versions: (movie.MediaSources || []).length, enabledNow: changed,
      nativeAudio: (movie.MediaSources?.[0]?.MediaStreams || []).filter(s => s.Type === 'Audio').map(s => s.Language) };
  });
  if (prep.enabledNow) { await page.reload(); await sleep(3000); }
  await go(`#/details?id=${prep.id}`);
  const read = () => page.evaluate(() => {
    const view = document.querySelector('.itemDetailPage:not(.hide)') || document;
    const select = view.querySelector('select.selectSource');
    return { selectedVersion: select && select.value ? 'set' : 'none',
      audioLanguages: [...view.querySelectorAll('.audio-language-item')].map(el => el.dataset.lang),
      container: view.querySelector('.audio-languages-container, [class*="audio-language"]')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 80) ?? null };
  });
  await until(async () => { const r = await read(); return r.audioLanguages.length || r.container ? r : null; }, 20000);
  await sleep(1500);
  return { movie: prep.name, versions: prep.versions, jellyfinAudioStreams: prep.nativeAudio, shown: await read() };
};
