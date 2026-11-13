// p41 (upstream 31969cba, #1057, Weblate): what a German user's JE serves and shows for hidden_content_not_loaded,
// the one key the update adds (the message of a Hidden Content edit refused because the list did not load, #1056).
// Run with --profile locale-de on the rewrite before the port, on upstream's build and on the port.
// served: the German locale as the server sends it (its size, whether it has the key, the value);
// shown: what JE's translator gives the page for the key (the toast's text); german: a key de.json has long
// translated, to show German is the language in use.
export default async ({ page, until }) => {
  await until(() => page.evaluate(() => typeof window.JellyfinEnhanced?.t === 'function'
    && window.JellyfinEnhanced.t('panel_settings_tab') !== 'panel_settings_tab'), 20000);
  return page.evaluate(async () => {
    const key = 'hidden_content_not_loaded';
    const response = await fetch(window.ApiClient.getUrl('JellyfinEnhanced/locales/de.json'));
    const de = await response.json();
    const t = window.JellyfinEnhanced.t;
    return {
      served: { status: response.status, keys: Object.keys(de).length, has: key in de, value: key in de ? de[key] : null },
      shown: t(key),
      german: t('panel_settings_tab')
    };
  });
};
