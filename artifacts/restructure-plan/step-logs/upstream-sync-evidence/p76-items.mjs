// GET /JellyfinEnhanced/leaving-soon/items (upstream 6c922d10), as the signed-in user, with the Maintainerr of
// p76-maintainerr.setup.py: the answer's status, TotalRecordCount and items (name and type, in order), then with limit=1.
export default async ({ page }) => page.evaluate(async () => {
  const read = async query => {
    const res = await fetch(ApiClient.getUrl('JellyfinEnhanced/leaving-soon/items' + query), { headers: { Authorization: 'MediaBrowser Token="' + ApiClient.accessToken() + '"' } });
    if (!res.ok) return `${query || '(no limit)'}: HTTP ${res.status}`;
    const body = await res.json();
    return `${query || '(no limit)'}: HTTP ${res.status}, TotalRecordCount ${body.TotalRecordCount}, Items ${(body.Items || []).map(i => `${i.Name} (${i.Type})`).join(', ')}`;
  };
  return [await read(''), await read('?limit=1')].join('\n');
});
