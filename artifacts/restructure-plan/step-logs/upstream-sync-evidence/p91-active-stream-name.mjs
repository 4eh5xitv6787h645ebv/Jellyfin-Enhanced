// Upstream 4effcf59: an episode playing right now is named with its season and episode in the Activity page's Active
// Streams section. Reports the web client's own session as playing the first episode of Final Space (season 1,
// episode 1), opens the Activity tab, prints what the Active Streams rows say, then reports the playback stopped.
export default async ({ page, go, until, sleep }) => {
  const itemId = '7aa04c9afb8d025602c7191c29fdc7c5';
  await go('#/home');
  await until(() => page.evaluate(() => !!window.ApiClient && !!window.ApiClient.accessToken()), 15000);
  const report = (path, body) => page.evaluate(([p, b]) => window.ApiClient.ajax({ type: 'POST', url: window.ApiClient.getUrl(p), data: JSON.stringify(b), contentType: 'application/json' }).then(() => 'ok', e => 'failed ' + (e && e.status)), [path, body]);
  const started = await report('Sessions/Playing', { ItemId: itemId, PositionTicks: 0, CanSeek: true, PlayMethod: 'DirectPlay', IsPaused: false });
  await go('#/home?tab=3&jeTab=activity');
  const rows = await until(() => page.evaluate(() => {
    const header = [...document.querySelectorAll('.je-activity-section-header')].find(h => /Active Streams/.test(h.textContent || ''));
    const section = header && header.closest('.je-activity-section');
    const names = section ? [...section.querySelectorAll('.je-activity-line')].map(l => (l.textContent || '').replace(/\s+/g, ' ').trim()) : [];
    return names.length ? names : null;
  }), 20000);
  const stopped = await report('Sessions/Playing/Stopped', { ItemId: itemId, PositionTicks: 0 });
  return { started, activeStreams: rows, stopped };
};
