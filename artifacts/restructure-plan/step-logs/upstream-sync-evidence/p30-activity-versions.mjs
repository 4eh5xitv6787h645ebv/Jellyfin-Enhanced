// Port 30 (upstream c693f0ed): what a user gets from the Activity Feed after p30-activity-versions.setup.mjs.
// Run as each lab user: je12 browse '#/home' --user <name> --script …/p30-activity-versions.mjs
// It reports, for the signed-in user:
//  - feed: the Watched and Favorited rows of GET /JellyfinEnhanced/activity (the request the Activity tab makes),
//    newest first, as "type | author | card type | card name | completed | progress"; reviewed: the review rows;
//  - tab: the same rows as the Activity tab draws them (its text lines other than reviews);
//  - jellyfin: which of the favorited people, genres and studios Jellyfin's own item query returns to this user
//    when their kinds are named (the rule the feed must follow), and which of the eight paired items its library
//    search returns (a title the user can open; never a version).
import { PAIRS, BY_NAME } from './p30-activity-versions.setup.mjs';

const SEARCH = ['An American Tail', 'Antz', 'Apex', 'The Godfather', 'Alice in Wonderland', 'Polka Dot Umbrella', 'Chasing the Ice Cream Truck'];

export default async ({ page, go, until }) => {
  const api = await page.evaluate(async ({ PAIRS, BY_NAME, SEARCH }) => {
    const api = window.ApiClient;
    const me = await api.getCurrentUser();
    const data = await api.getJSON(api.getUrl('JellyfinEnhanced/activity', { limit: 50 }));
    const rows = data.items || [];
    const feed = rows.filter(r => r.ActivityType !== 'Reviewed').map(r => [
      r.ActivityType, r.UserName, r.Item && r.Item.Type,
      r.Item && (r.Item.SeriesName ? `${r.Item.SeriesName}: ${r.Item.Name}` : r.Item.Name),
      r.Completed, Math.round((r.Progress || 0) * 100) / 100,
    ].join(' | '));
    const kinds = { Persons: 'Person', Genres: 'Genre', Studios: 'Studio' };
    const byName = [];
    for (const [route, name] of BY_NAME) {
      if (!kinds[route]) continue;
      const found = await api.getJSON(api.getUrl('Items', { userId: me.Id, Recursive: true, IncludeItemTypes: kinds[route], SearchTerm: name, Limit: 50 }))
        .then(r => r.Items, () => []);
      if (found.some(i => i.Name === name)) byName.push(name);
    }
    // Not a query by ids: Jellyfin skips the library scope for those.
    const paired = Object.values(PAIRS).flat();
    const titles = new Set();
    for (const term of SEARCH) {
      const found = await api.getJSON(api.getUrl('Items', { userId: me.Id, Recursive: true, IncludeItemTypes: 'Movie,Episode', SearchTerm: term, Limit: 50 }))
        .then(r => r.Items, () => []);
      for (const item of found) if (paired.includes(item.Id)) titles.add(item.Name);
    }
    return { user: me.Name, feed, reviewed: rows.length - feed.length, jellyfin: { byName, titles: [...titles].sort() } };
  }, { PAIRS, BY_NAME, SEARCH });

  await go('#/home?tab=3&jeTab=activity');
  await until(() => page.evaluate(() => document.querySelectorAll('.je-activity-feed .je-activity-row').length > 0), 30000);
  const tab = await page.evaluate(() => [...document.querySelectorAll('.je-activity-feed .je-activity-line')]
    .map(line => line.textContent.replace(/\s+/g, ' ').trim())
    .filter(text => !/\breviewed\b|\brated\b/i.test(text)));
  return { ...api, tab };
};
