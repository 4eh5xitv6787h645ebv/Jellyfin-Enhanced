// Port 7 (upstream ee1c92dc, #1029): a collection's language flags follow its members.
// On a lab with box sets (`je12 env content --collections`): adds to one box set a movie that brings an audio
// language the set does not have yet, reads the set's entry in the server tag cache, deletes that movie from the
// library, and reads the entry again for up to 60 s.
// (The lab's media are synthetic; the languages come from the library's stored stream metadata.)
export default async ({ page }) => page.evaluate(async () => {
  const uid = ApiClient.getCurrentUserId();
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const audio = m => [...new Set((m.MediaSources?.[0]?.MediaStreams || []).filter(s => s.Type === 'Audio' && s.Language).map(s => s.Language))].sort();
  const sets = (await ApiClient.getItems(uid, { IncludeItemTypes: 'BoxSet', Recursive: true, SortBy: 'SortName', Limit: 1 })).Items;
  if (!sets.length) return { error: 'no box set in this lab (je12 env content --collections)' };
  const set = sets[0], key = set.Id.replace(/-/g, '').toLowerCase();
  const members = (await ApiClient.getItems(uid, { ParentId: set.Id, Fields: 'MediaSources' })).Items;
  const union = [...new Set(members.flatMap(audio))].sort();
  const candidates = (await ApiClient.getItems(uid, { IncludeItemTypes: 'Movie', Recursive: true, SortBy: 'SortName', SortOrder: 'Descending', Limit: 200, Fields: 'MediaSources' })).Items;
  const extra = candidates.find(m => !members.some(x => x.Id === m.Id) && audio(m).some(l => !union.includes(l)));
  if (!extra) return { error: 'no movie brings a new audio language to ' + set.Name };
  const entry = async () => { const cache = await ApiClient.getJSON(ApiClient.getUrl(`JellyfinEnhanced/tag-cache/${uid}`)); const e = (cache.items || {})[key]; return e ? [...(e.AudioLanguages || [])].sort() : null; };
  const until = async (want, seconds) => { let now = await entry(); for (let t = 0; t < seconds && JSON.stringify(now) !== JSON.stringify(want); t += 3) { await wait(3000); now = await entry(); } return now; };
  const withExtra = [...new Set([...union, ...audio(extra)])].sort();
  await ApiClient.ajax({ type: 'POST', url: ApiClient.getUrl(`Collections/${set.Id}/Items`, { ids: extra.Id }) });
  const out = { collection: set.Name, members: members.map(m => `${m.Name} [${audio(m)}]`), added: `${extra.Name} [${audio(extra)}]` };
  out.collectionLanguagesWithTheAddedMember = await until(withExtra, 60);
  await ApiClient.deleteItem(extra.Id);
  out.collectionLanguagesAfterDeletingThatMember = await until(union, 60);
  out.followedTheDeletion = JSON.stringify(out.collectionLanguagesAfterDeletingThatMember) === JSON.stringify(union);
  return out;
});
