// Port 43 (upstream e0c8763d): native poster tags on an item's own Thumb image.
//   je12 browse '#/home' --script <this file>
// As the signed-in administrator, with native poster tags switched on in the plugin's configuration, asks for a
// movie's item answer the way a native client does (Client "Jellyfin for Android TV", the session's own token and
// device id), then fetches its Primary and Thumb images under the tags that answer gave and under the plain tags.
// Prints, per image type: whether the tag carries a "-jet" variant token, whether the image under that tag differs
// from the plain one (a drawn composite), both images' sizes, and the answer's Cache-Control. Nothing leaves the lab.
const MOVIE = '0ff8461bed0a2658ec63487586efdbd3';
export default async ({ page, sleep }) => {
  await sleep(1500);
  return await page.evaluate(async (movie) => {
    const api = window.ApiClient;
    const plugin = 'f69e946a4b3c4e9a8f0a8d7c1b2c4d9b';
    const config = await api.getPluginConfiguration(plugin);
    if (!config.NativePosterTagsEnabled) { config.NativePosterTagsEnabled = true; await api.updatePluginConfiguration(plugin, config); }
    const auth = `MediaBrowser Client="Jellyfin for Android TV", Device="lab", DeviceId="${api.deviceId()}", Version="1", Token="${api.accessToken()}"`;
    const headers = { Authorization: auth };
    const user = api.getCurrentUserId();
    const answer = await (await fetch(`/Users/${user}/Items/${movie}`, { headers })).json();
    const plain = (tag) => String(tag).replace(/-jet[0-9a-f]{23}/, '').replace(/-jeu[0-9a-f]+$/, '');
    // FNV-1a over the bytes (the lab page is not a secure context, so crypto.subtle is absent).
    const digest = async (bytes) => { let h = 0x811c9dc5; for (const b of new Uint8Array(bytes)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16) + ':' + bytes.byteLength; };
    const image = async (type, tag) => {
      const r = await fetch(`/Items/${movie}/Images/${type}?tag=${encodeURIComponent(tag)}&quality=90`, { headers, cache: 'no-store' });
      const bytes = await r.arrayBuffer();
      let size = null;
      try { const bitmap = await createImageBitmap(new Blob([bytes])); size = `${bitmap.width}x${bitmap.height}`; } catch { size = 'undecodable'; }
      return { status: r.status, size, sha: await digest(bytes), cacheControl: r.headers.get('cache-control') };
    };
    const out = { name: answer.Name };
    for (const type of ['Primary', 'Thumb']) {
      const tag = answer.ImageTags?.[type];
      if (!tag) { out[type] = 'no image'; continue; }
      const stamped = /-jet[0-9a-f]{23}/.test(tag);
      const served = await image(type, tag);
      const original = await image(type, plain(tag));
      out[type] = { stamped, blurhashUnderTag: !!answer.ImageBlurHashes?.[type]?.[tag], composite: served.sha !== original.sha, served: `${served.status} ${served.size} cache-control: ${served.cacheControl}`, original: `${original.status} ${original.size}` };
    }
    return out;
  }, MOVIE);
};
