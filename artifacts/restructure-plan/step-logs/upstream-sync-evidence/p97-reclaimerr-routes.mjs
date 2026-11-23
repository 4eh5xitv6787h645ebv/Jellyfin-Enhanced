// Port of upstream da3d9ee9: the Reclaimerr routes an administrator's page calls, against this lab's server with
// Reclaimerr off in its saved settings (so nothing is sent to any Reclaimerr): the two routes upstream adds
// (GET reclaimerr/user-audit, POST reclaimerr/import-users) and the two it removes (POST reclaimerr/service-account,
// POST reclaimerr/create-users). Prints each answer's status and the server's {error}.
export default async ({ page, until }) => {
  await until(() => page.evaluate(() => !!window.ApiClient && !!window.JellyfinEnhanced?.pluginConfig), 20000);
  return page.evaluate(async () => {
    const call = async (type, path, body) => {
      try {
        await ApiClient.ajax({ type, url: ApiClient.getUrl('JellyfinEnhanced/' + path), data: body ? JSON.stringify(body) : undefined, contentType: 'application/json', dataType: 'json' });
        return `${type} ${path}: 200`;
      } catch (err) {
        let error = '';
        try { error = (await err.json())?.error || ''; } catch { /* no JSON body */ }
        return `${type} ${path}: ${err?.status ?? 'failed'}${error ? ` ${JSON.stringify(error)}` : ''}`;
      }
    };
    return [
      await call('GET', 'reclaimerr/user-audit'),
      await call('POST', 'reclaimerr/import-users', { permissions: ['request'], pages: ['requests'] }),
      await call('POST', 'reclaimerr/service-account', { adminUsername: 'nobody', adminPassword: '' }),
      await call('POST', 'reclaimerr/create-users', { permissions: ['request'], pages: ['requests'] }),
    ].join('\n');
  });
};
