// Parity check for upstream c8b464cf: Refresh Leaving Soon Tags with a source nobody uses, then with the badge default on.
export default async ({ page, sleep }) => page.evaluate(async () => {
  const api = window.ApiClient;
  const auth = { Authorization: `MediaBrowser Token="${api.accessToken()}"`, 'Content-Type': 'application/json' };
  const call = async (method, path, body) => {
    const r = await fetch(api.getUrl(path), { method, headers: auth, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    let parsed = text; try { parsed = text ? JSON.parse(text) : null; } catch {}
    return { status: r.status, body: parsed };
  };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const je = (await call('GET', 'Plugins')).body.find(p => /Jellyfin Enhanced/i.test(p.Name));
  const logName = async () => (await call('GET', 'System/Logs')).body.map(f => f.Name).filter(n => /^JellyfinEnhanced/i.test(n)).sort().pop();
  const logText = async () => { const n = await logName(); return n ? String((await call('GET', `System/Logs/Log?name=${encodeURIComponent(n)}`)).body) : ''; };
  const task = async () => (await call('GET', 'ScheduledTasks')).body.find(t => t.Key === 'JellyfinEnhancedRefreshLeavingSoonTags');
  const configure = async badge => {
    const cfg = (await call('GET', `Plugins/${je.Id}/Configuration`)).body;
    Object.assign(cfg, { LeavingSoonCollections: 'Leaving Soon', LeavingSoonMaintainerrUrl: '', StatusTagsLeaving: badge, LeavingSoonHomeRow: false, LeavingSoonMaintainerrActions: false });
    return (await call('POST', `Plugins/${je.Id}/Configuration`, cfg)).status;
  };
  const run = async badge => {
    const saved = await configure(badge);
    await wait(1500);
    const before = await task();
    const mark = (await logText()).length;
    const started = await call('POST', `ScheduledTasks/Running/${before.Id}`);
    let after = before;
    for (let i = 0; i < 60; i++) {
      await wait(500);
      after = await task();
      if (after.State === 'Idle' && after.LastExecutionResult && after.LastExecutionResult.EndTimeUtc !== before.LastExecutionResult?.EndTimeUtc) break;
    }
    const lines = (await logText()).slice(mark).split('\n').filter(l => l.includes('[LeavingSoon]')).map(l => l.replace(/^\[[^\]]*\] /, ''));
    return { badgeDefault: badge, configSaved: saved, runStarted: started.status, result: after.LastExecutionResult?.Status, leavingLog: lines };
  };
  const nothingUsesIt = await run(false);
  const badgeDefaultOn = await run(true);
  const t = await task();
  return { task: { name: t.Name, hidden: t.IsHidden, description: t.Description }, nothingUsesIt, badgeDefaultOn };
});
