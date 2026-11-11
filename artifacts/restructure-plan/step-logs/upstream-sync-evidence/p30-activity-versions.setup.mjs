// Port 30 (upstream c693f0ed): lab state for the Activity Feed check, made through the web client's own
// ApiClient. Run once as real-admin (je12 browse '#/home' --script …setup.mjs), then once as real-viewer
// (--user viewer), before the first read; p30-activity-versions.mjs reads the result as each user.
// As real-admin it first shows real-admin and real-viewer on the login screen (lab users are hidden users, and
// the lab's "hide reviews from hidden users" setting drops a hidden author's rows for everyone but that author
// and administrators), then makes four pairs of alternate versions (Videos/MergeVersions: Jellyfin keeps one of the two
// as the title, the wider picture or else the lower id, and hides the other, the version, from every user query),
// reports plays of the versions the way a client does (Sessions/Playing, then Sessions/Playing/Stopped with the
// version's id) and favorites a version, three people, three genres, two studios and a music artist that is a
// folder of the music library. As any other user it only reports one partial play of the first pair's version.
// It can be run again: every step repeats in the same order. p30-activity-versions.teardown.mjs puts the
// favorites, the versions and the two users back.
export const PAIRS = {
  tail: ['4687b7582220916a84e375e46613c772', 'cd3ee86bed68c71d9a18391228a0e189'],  // An American Tail (G), the title / Fievel Goes West (G)
  antz: ['043bb31b39e0a6d3ea6db3bcd4cecad6', '74932826ed07cd665ea9e98dd11c861b'],  // Antz (PG), the title / Apex (R): the version is above lab-kid's limit
  godfather: ['236869fee75613f8d0d3c3bcb3822841', 'c701a8ab461b868f7bd724467f63b50a'], // The Godfather (R), the title / Alice in Wonderland (G): the title is above lab-kid's limit
  oswald: ['0eae913f640ebe80a56bdc7c33a7430a', 'f5decca6f9c758f544b7ba33ac20615c'], // two episodes of Oswald (TV-Y), the first the title: lab-guest has the Movies library only
};
export const AUTHORS = ['real-admin', 'real-viewer'];
export const BY_NAME = [
  ['Persons', 'Phillip Glasser'], ['Persons', 'Fred Savage'], ['Persons', 'Marlon Brando'], // Brando: only behind R titles
  ['Genres', 'Adventure'], ['Genres', 'Children'], ['Genres', 'Thriller'],                  // Thriller: nothing within lab-kid's limit
  ['Studios', 'Amblin Entertainment'], ['Studios', 'Nick Jr.'],
  ['Artists', 'DJ Fixture'],
];

export default async ({ page, sleep }) => {
  const result = await page.evaluate(async ({ PAIRS, BY_NAME, AUTHORS }) => {
    const api = window.ApiClient;
    const me = await api.getCurrentUser();
    const uid = me.Id;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const out = { user: me.Name, steps: [] };
    const step = (name, value) => out.steps.push(`${name}: ${value}`);
    const post = (path, query, body) => api.ajax({
      type: 'POST', url: api.getUrl(path, query || {}),
      data: body ? JSON.stringify(body) : undefined, contentType: body ? 'application/json' : undefined,
    }).then(r => (r && r.status) || 'ok', e => `ERR ${e && e.status}`);
    const play = async (id, fraction) => {
      const item = await api.getJSON(api.getUrl(`Items/${id}`, { userId: uid }));
      const session = `p30-${id.slice(0, 8)}-${Date.now()}`;
      const info = { ItemId: id, MediaSourceId: id, PlaySessionId: session, PlayMethod: 'DirectPlay', CanSeek: true };
      const start = await post('Sessions/Playing', null, { ...info, PositionTicks: 0 });
      const stop = await post('Sessions/Playing/Stopped', null, { ...info, PositionTicks: Math.round(item.RunTimeTicks * fraction) });
      await wait(1200); // one stored second apart, so the feed's order is the order of these steps
      return `${item.Name} at ${Math.round(fraction * 100)}%: start ${start}, stop ${stop}`;
    };

    // The id of a pair that a user query does not return is its hidden version.
    const versionOf = async pair => {
      const seen = await api.getJSON(api.getUrl('Items', { userId: uid, ids: pair.join(',') }));
      const shown = seen.Items.map(i => i.Id);
      const hidden = pair.filter(id => !shown.includes(id));
      return { title: shown[0], version: hidden[0], text: `title ${JSON.stringify(seen.Items.map(i => i.Name))}, ${hidden.length} hidden` };
    };

    if (!me.Policy.IsAdministrator) {
      step('play of a version', await play((await versionOf(PAIRS.tail)).version, 0.3));
      return out;
    }

    for (const user of (await api.getJSON(api.getUrl('Users'))).filter(u => AUTHORS.includes(u.Name))) {
      const policy = await post(`Users/${user.Id}/Policy`, null, { ...user.Policy, IsHidden: false });
      step(`show ${user.Name} on the login screen`, `was hidden ${user.Policy.IsHidden}, policy ${policy}`);
    }
    const made = {};
    for (const [name, pair] of Object.entries(PAIRS)) {
      const merged = await post('Videos/MergeVersions', { ids: pair.join(',') });
      made[name] = await versionOf(pair);
      step(`versions ${name}`, `merge ${merged}; ${made[name].text}`);
    }
    step('play of a title', await play(made.tail.title, 1));
    step('play of its version', await play(made.tail.version, 0.4));
    step('play of a version above the kid limit', await play(made.antz.version, 0.5));
    step('play of a version of a title above the kid limit', await play(made.godfather.version, 0.55));
    step('play of an episode version', await play(made.oswald.version, 0.6));

    const favorite = async (label, id) => {
      const answer = await api.updateFavoriteStatus(uid, id, true).then(d => `IsFavorite ${d && d.IsFavorite}`, e => `ERR ${e && e.status}`);
      step(`favorite ${label}`, answer);
      await wait(1200);
    };
    await favorite('a version (Fievel Goes West)', made.tail.version);
    for (const [route, name] of BY_NAME) {
      const found = await api.getJSON(api.getUrl(route, { userId: uid, SearchTerm: name, Limit: 20 }));
      const item = found.Items.find(i => i.Name === name);
      if (!item) { step(`favorite ${name}`, 'NOT FOUND'); continue; }
      await favorite(`${item.Type} ${name}`, item.Id);
    }
    return out;
  }, { PAIRS, BY_NAME, AUTHORS });
  await sleep(500);
  return result;
};
