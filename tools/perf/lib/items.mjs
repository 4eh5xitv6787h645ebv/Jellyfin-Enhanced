// Picks stable test items (one movie + one series with TMDB ids, and a movie
// library view) and caches the choice so every benchmark run navigates to the
// same pages.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jf } from './api.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, '..', '.state', 'items.json');

export async function pickItems(bench) {
    if (fs.existsSync(CACHE)) {
        const cached = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
        if (cached.serverId && cached.movieId && cached.movie2Id && cached.seriesId) return cached;
    }

    const me = (await jf(bench, '/Users')).find(u => u.Name === bench.username);
    if (!me) throw new Error(`User ${bench.username} not found`);
    const userId = me.Id;
    const serverId = (await jf(bench, '/System/Info/Public')).Id;

    const views = (await jf(bench, `/Users/${userId}/Views`)).Items;
    const movieLib = views.find(v => v.CollectionType === 'movies');
    const showLib = views.find(v => v.CollectionType === 'tvshows');

    async function withTmdb(type, count) {
        const q = `/Items?userId=${userId}&IncludeItemTypes=${type}&Recursive=true&Limit=50` +
            `&Fields=ProviderIds&SortBy=CommunityRating&SortOrder=Descending`;
        const items = (await jf(bench, q)).Items ?? [];
        const hits = items.filter(i => i.ProviderIds && (i.ProviderIds.Tmdb || i.ProviderIds.tmdb)).slice(0, count);
        if (hits.length < count) throw new Error(`Fewer than ${count} ${type} items with TMDB ids on the dev server`);
        return hits;
    }

    const [movie, movie2] = await withTmdb('Movie', 2);
    const [series] = await withTmdb('Series', 1);

    const picked = {
        serverId,
        userId,
        movieId: movie.Id,
        movieName: movie.Name,
        movie2Id: movie2.Id,
        movie2Name: movie2.Name,
        seriesId: series.Id,
        seriesName: series.Name,
        movieLibraryId: movieLib?.Id ?? null,
        showLibraryId: showLib?.Id ?? null
    };
    fs.mkdirSync(path.dirname(CACHE), { recursive: true });
    fs.writeFileSync(CACHE, JSON.stringify(picked, null, 2));
    return picked;
}
