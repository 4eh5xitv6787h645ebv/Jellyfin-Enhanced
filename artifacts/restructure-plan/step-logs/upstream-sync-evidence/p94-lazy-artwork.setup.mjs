// je12 browse '#/home' --script <this file>
// Lab setup for p94-lazy-backdrop.mjs: the lab's library lists artwork whose files are missing (404), so no card has
// artwork for the status-tag painter to blur. This uploads a generated poster (a seeded colour pattern, the same
// every run) as the Primary image of every series that shows a status tag on Home. Lab data only.
export default async ({ page, until, sleep }) => {
  await until(() => page.evaluate(() => document.querySelectorAll('.je-tag-host .status-tag').length), 30000);
  await sleep(2000);
  return page.evaluate(async () => {
    const ids = [...new Set([...document.querySelectorAll('.je-tag-host .status-tag')].map(tag => tag.closest('.card')?.dataset.id).filter(Boolean))];
    const out = [];
    for (const [n, id] of ids.entries()) {
      const canvas = document.createElement('canvas');
      canvas.width = 400; canvas.height = 600;
      const g = canvas.getContext('2d');
      let seed = 1234 + n;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
      const grad = g.createLinearGradient(0, 0, 400, 600);
      grad.addColorStop(0, `hsl(${(n * 47) % 360} 70% 55%)`);
      grad.addColorStop(1, `hsl(${(n * 47 + 160) % 360} 60% 25%)`);
      g.fillStyle = grad; g.fillRect(0, 0, 400, 600);
      for (let i = 0; i < 160; i++) {
        g.fillStyle = `hsla(${Math.floor(rnd() * 360)} 80% ${Math.floor(30 + rnd() * 50)}% / 0.8)`;
        g.fillRect(Math.floor(rnd() * 400), Math.floor(rnd() * 600), 8 + Math.floor(rnd() * 60), 8 + Math.floor(rnd() * 60));
      }
      const base64 = canvas.toDataURL('image/png').split(',')[1];
      const response = await fetch(window.ApiClient.getUrl(`Items/${id}/Images/Primary`), {
        method: 'POST', body: base64,
        headers: { 'Content-Type': 'image/png', Authorization: `MediaBrowser Token="${window.ApiClient.accessToken()}"` },
      });
      out.push(`${id}: ${response.status}`);
    }
    return out;
  });
};
