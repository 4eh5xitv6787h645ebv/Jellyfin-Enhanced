// Port 28 (upstream 20291fc4): the avatar of a "User … has been created" entry in the dashboard's activity list.
// Creates a user so that the entry is the newest one, reads the entry's avatar on the dashboard, and removes the
// user again. `ink` is how many pixels the icon's text paints when the page's own icon font draws it at the
// avatar's size: a name the font has no glyph for paints none.
export default async ({ page, go, until }) => {
  const name = 'sync-p28-' + Date.now().toString(36);
  const enabled = await page.evaluate(() => window.JellyfinEnhanced?.pluginConfig?.ColoredActivityIconsEnabled === true);
  const id = await page.evaluate(async userName => {
    const response = await fetch(ApiClient.getUrl('Users/New'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `MediaBrowser Token="${ApiClient.accessToken()}"` },
      body: JSON.stringify({ Name: userName }),
    });
    return (await response.json()).Id;
  }, name);
  try {
    await go('#/dashboard');
    const entry = await until(() => page.evaluate(async userName => {
      const link = [...document.querySelectorAll('a[href^="#/dashboard/activity"]')]
        .find(a => (a.querySelector('.MuiTypography-body1')?.textContent || '').includes(userName));
      const avatar = link?.querySelector('.MuiAvatar-root');
      const icon = avatar?.querySelector('.material-icons');
      if (!icon) return null;
      const style = getComputedStyle(icon);
      await document.fonts.load(`${style.fontSize} ${style.fontFamily}`, icon.textContent);
      const canvas = document.createElement('canvas');
      canvas.width = 200; canvas.height = 40;
      const context = canvas.getContext('2d');
      context.font = `${style.fontSize} ${style.fontFamily}`;
      context.textBaseline = 'top';
      context.fillText(icon.textContent, 2, 2);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let ink = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) ink++;
      return {
        text: link.querySelector('.MuiTypography-body1').textContent.replace(userName, '<name>'),
        icon: icon.textContent,
        font: style.fontFamily,
        ink,
        background: getComputedStyle(avatar).backgroundColor,
        nativeIconHidden: [...avatar.querySelectorAll('svg')].every(svg => getComputedStyle(svg).display === 'none'),
      };
    }, name), 20000);
    return { enabled, entry: entry || 'the entry or its icon did not appear' };
  } finally {
    await page.evaluate(userId => fetch(ApiClient.getUrl('Users/' + userId), {
      method: 'DELETE', headers: { Authorization: `MediaBrowser Token="${ApiClient.accessToken()}"` },
    }), id);
  }
};
