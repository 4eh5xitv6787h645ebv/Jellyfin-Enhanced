// Upstream 8bff0750 on both builds: the quality chips' stylesheet is written with the chip box once instead of once
// per quality colour. Read on the home page, once quality chips are drawn: the stylesheet's size, how many times the
// chip box is written, how many colour rules it has, and every drawn chip's computed look (one line per distinct look).
export default async ({ page, until, sleep }) => {
    await until(() => page.evaluate(() => document.querySelectorAll('.quality-overlay-label').length >= 5), 30000);
    await sleep(1500);
    return page.evaluate(() => {
        const css = document.getElementById('quality-tag-enhanced-style')?.textContent || '';
        const looks = new Map();
        for (const chip of document.querySelectorAll('.quality-overlay-label')) {
            const s = getComputedStyle(chip);
            const look = [s.backgroundColor, s.color, s.padding, s.fontSize, s.fontWeight, s.borderRadius, s.borderTopWidth, s.borderTopColor, s.boxShadow, s.fontVariantCaps, s.lineHeight, s.whiteSpace].join(' | ');
            looks.set(`${chip.dataset.quality || chip.textContent}: ${look}`, true);
        }
        return {
            sheetChars: css.length,
            chipBoxes: css.split('font-variant-caps: small-caps').length - 1,
            colourRules: (css.match(/\[data-quality="/g) || []).length,
            chips: document.querySelectorAll('.quality-overlay-label').length,
            looks: [...looks.keys()].sort(),
        };
    });
};
