// Port 30: puts back what p30-activity-versions.setup.mjs changed in the lab: the favorites (which also removes
// their Favorited entries), the four pairs of versions and the two users' "hidden" flag. The Watched entries stay
// in activity.json. Run as real-admin: je12 browse '#/home' --script …/p30-activity-versions.teardown.mjs
import { PAIRS, BY_NAME, AUTHORS } from './p30-activity-versions.setup.mjs';

export default async ({ page }) => page.evaluate(async ({ PAIRS, BY_NAME, AUTHORS }) => {
  const api = window.ApiClient;
  const uid = api.getCurrentUserId();
  const out = [];
  // A user query returns only the title of each pair.
  const shown = await api.getJSON(api.getUrl('Items', { userId: uid, ids: Object.values(PAIRS).flat().join(',') }));
  const titles = shown.Items.map(i => i.Id);
  for (const id of Object.values(PAIRS).flat()) {
    out.push(`unfavorite ${id.slice(0, 8)}: ` + await api.updateFavoriteStatus(uid, id, false).then(d => d.IsFavorite, e => `ERR ${e && e.status}`));
  }
  for (const [route, name] of BY_NAME) {
    const found = await api.getJSON(api.getUrl(route, { userId: uid, SearchTerm: name, Limit: 20 }));
    const item = found.Items.find(i => i.Name === name);
    if (item) out.push(`unfavorite ${name}: ` + await api.updateFavoriteStatus(uid, item.Id, false).then(d => d.IsFavorite, e => `ERR ${e && e.status}`));
  }
  for (const title of titles) {
    const status = await api.ajax({ type: 'DELETE', url: api.getUrl(`Videos/${title}/AlternateSources`) }).then(r => (r && r.status) || 'ok', e => `ERR ${e && e.status}`);
    out.push(`split versions of ${title}: ${status}`);
  }
  for (const user of (await api.getJSON(api.getUrl('Users'))).filter(u => AUTHORS.includes(u.Name))) {
    const status = await api.ajax({
      type: 'POST', url: api.getUrl(`Users/${user.Id}/Policy`), contentType: 'application/json',
      data: JSON.stringify({ ...user.Policy, IsHidden: true }),
    }).then(r => (r && r.status) || 'ok', e => `ERR ${e && e.status}`);
    out.push(`hide ${user.Name} again: ${status}`);
  }
  return out;
}, { PAIRS, BY_NAME, AUTHORS });
