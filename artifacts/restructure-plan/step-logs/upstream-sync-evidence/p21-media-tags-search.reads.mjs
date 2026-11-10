// Port 21 (upstream 23281542), the one place where the port deliberately asks the server for less than upstream:
// how many times the admin page reads the whole plugin configuration while one word is typed into the settings
// search the way a person types (a letter every 220 ms; the search waits 150 ms after the last key).
export default async ({ page, go, until, sleep }) => {
  await go('#/configurationpage?name=Jellyfin%20Enhanced');
  await until(() => page.evaluate(() => !!document.getElementById('settingsSearchInput')?.offsetParent), 30000);
  await sleep(3000);
  let reads = 0;
  page.on('request', r => { if (r.method() === 'GET' && /\/Plugins\/[0-9a-f-]+\/Configuration/i.test(r.url())) reads++; });
  await page.locator('#settingsSearchInput').click();
  await page.keyboard.type('collections', { delay: 220 });
  await sleep(2500);
  const hits = await page.evaluate(() => document.querySelectorAll('#jeMtSearchResults .je-mt-search-hit').length);
  return { typed: 'collections', configurationReadsWhileTyping: reads, mediaTagsHits: hits };
};
