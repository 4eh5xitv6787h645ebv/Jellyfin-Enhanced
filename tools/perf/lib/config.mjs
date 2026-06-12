// Whitelisted writer for the JE plugin configuration on the dev server.
// Hard rule: MaintenanceModeEnabled must remain false after every write
// (its action on this server is disable_accounts).

import { jf } from './api.mjs';

const WRITABLE_KEYS = new Set([
    'DevMode',
    'ShowReviews',
    'ShowUserReviews',
    'QualityTagsEnabled',
    'GenreTagsEnabled',
    'RatingTagsEnabled',
    'LanguageTagsEnabled',
    'PeopleTagsEnabled',
    'ShowUserRatingOnPosters',
    'MetadataIconsEnabled',
    'ActiveStreamsEnabled',
    'EnableCustomSplashScreen',
    'EnableLoginImage',
    'AutoPipEnabled',
    'AutoResumeEnabled',
    'AutoSkipOutro',
    'LongPress2xEnabled',
    'SonarrInstances',
    'RadarrInstances'
]);

export async function getPluginConfig(bench) {
    return jf(bench, `/Plugins/${bench.pluginId}/Configuration`);
}

export async function setPluginConfig(bench, changes) {
    for (const key of Object.keys(changes)) {
        if (!WRITABLE_KEYS.has(key)) throw new Error(`Refusing to write non-whitelisted config key: ${key}`);
    }
    const cfg = await getPluginConfig(bench);
    Object.assign(cfg, changes);
    if (cfg.MaintenanceModeEnabled !== false) {
        throw new Error('Safety stop: MaintenanceModeEnabled is not false; refusing to write config.');
    }
    await jf(bench, `/Plugins/${bench.pluginId}/Configuration`, { method: 'POST', body: cfg });
    const after = await getPluginConfig(bench);
    if (after.MaintenanceModeEnabled !== false) {
        throw new Error('Post-write assertion failed: MaintenanceModeEnabled changed. Investigate immediately.');
    }
    return after;
}
