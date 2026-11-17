// The language Seerr search asks for (upstream d33904bc), as real-admin: the browser language is set in the page, a
// search runs through the plugin's own Seerr client, and the language parameter of the request it sent is read back.
export default async ({ page, until }) => {
  await until(() => page.evaluate(() => !!window.JellyfinEnhanced?.jellyseerrAPI?.search), 20000).catch(() => null);
  return page.evaluate(async () => {
    const api = window.JellyfinEnhanced?.jellyseerrAPI;
    if (!api?.search) return 'no Seerr client';
    const out = [];
    for (const language of ['pt-BR', 'zh-TW', 'de', 'undefined']) {
      Object.defineProperty(navigator, 'language', { value: language, configurable: true });
      performance.clearResourceTimings();
      await api.search('Bastardos ' + language, 1, { skipCache: true });
      const sent = performance.getEntriesByType('resource').map(e => e.name).find(name => name.includes('/jellyseerr/search'));
      out.push(`navigator.language ${language} -> language=${sent ? new URL(sent).searchParams.get('language') : '(no request)'}`);
    }
    return out.join('\n');
  });
};
