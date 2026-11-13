// p36 (upstream 24fbd7b0, #1049, Weblate): what a German user's JE serves and shows for the discovery strings the
// update adds. Run with --profile locale-de on the rewrite before the port, on upstream's build and on the port.
// served: the German locale as the server sends it (its size, how many discovery_* keys, six of their values);
// shown: what JE's translator gives the page for the same six keys; german: a key de.json has long translated, to
// show German is the language in use.
export default async ({ page, until }) => {
  await until(() => page.evaluate(() => typeof window.JellyfinEnhanced?.t === 'function'
    && window.JellyfinEnhanced.t('panel_settings_tab') !== 'panel_settings_tab'), 20000);
  return page.evaluate(async () => {
    const keys = ['discovery_filters', 'discovery_sort_popular', 'discovery_sort_most_votes', 'discovery_role_as',
      'discovery_filters_none', 'discovery_not_in_library'];
    const response = await fetch(window.ApiClient.getUrl('JellyfinEnhanced/locales/de.json'));
    const de = await response.json();
    const t = window.JellyfinEnhanced.t;
    return {
      served: {
        status: response.status,
        keys: Object.keys(de).length,
        discoveryKeys: Object.keys(de).filter(k => k.startsWith('discovery_')).length,
        values: keys.map(k => (k in de ? de[k] : null))
      },
      shown: keys.map(k => t(k, { role: 'King Chicken' })),
      german: t('panel_settings_tab')
    };
  });
};
