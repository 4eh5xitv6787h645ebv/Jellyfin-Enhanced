// p38 (upstream 0dba36b6, #1054): what Scheduled Tasks shows after a *arr tag sync run that could not read Radarr.
// Setup (je12 mock): Radarr's GET /api/v3/tag answers 503; Sonarr's tag and series lists answer [] (read, no tags).
// The script turns Tags Sync on (Clear old tags before sync on), starts "Sync Tags from *arr to Jellyfin" and waits
// for it to finish, then reads the task's last result as the Scheduled Tasks page does. Run on the rewrite before
// the port, on upstream's build and on the port.
export default async ({ page, until }) => {
  await until(() => page.evaluate(() => !!window.ApiClient?.getCurrentUserId?.()), 20000);
  return page.evaluate(async () => {
    const api = window.ApiClient;
    const plugin = (await api.getInstalledPlugins()).find(p => /Jellyfin Enhanced/i.test(p.Name));
    const config = await api.getPluginConfiguration(plugin.Id);
    config.ArrTagsSyncEnabled = true;
    config.ArrTagsClearOldTags = true;
    await api.updatePluginConfiguration(plugin.Id, config);
    const enabled = list => JSON.parse(list || '[]').filter(i => i.Enabled !== false).length;
    const find = async () => (await api.getScheduledTasks({ isHidden: false })).find(t => t.Key === 'JellyfinEnhancedArrTagsSync');
    const before = await find();
    const started = Date.now();
    await api.startScheduledTask(before.Id);
    let task;
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 500));
      task = await api.getScheduledTask(before.Id);
      const end = task.LastExecutionResult && Date.parse(task.LastExecutionResult.EndTimeUtc);
      if (task.State === 'Idle' && end && end >= started - 1000) break;
    }
    const r = task.LastExecutionResult || {};
    return {
      task: task.Name,
      instances: { radarr: enabled(config.RadarrInstances), sonarr: enabled(config.SonarrInstances) },
      state: task.State,
      status: r.Status,
      error: r.ErrorMessage ?? null
    };
  });
};
