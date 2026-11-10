// Port 28: every icon name the activity map uses, drawn by the web client's own icon font at the avatar's size.
// `ink` is the number of pixels painted; "plus" (the old name) is listed for comparison.
export default async ({ page }) => page.evaluate(async () => {
  const names = ['block', 'check_circle', 'delete', 'download', 'error', 'inventory_2', 'key', 'login', 'logout',
    'person_add', 'person_remove', 'play_arrow', 'security_update_warning', 'update', 'warning', 'plus'];
  const font = '18px "Material Icons"';
  const ink = {};
  for (const name of names) {
    await document.fonts.load(font, name);
    const canvas = document.createElement('canvas');
    canvas.width = 400; canvas.height = 40;
    const context = canvas.getContext('2d');
    context.font = font;
    context.textBaseline = 'top';
    context.fillText(name, 2, 2);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) count++;
    ink[name] = count;
  }
  return { fontLoaded: document.fonts.check(font), ink };
});
