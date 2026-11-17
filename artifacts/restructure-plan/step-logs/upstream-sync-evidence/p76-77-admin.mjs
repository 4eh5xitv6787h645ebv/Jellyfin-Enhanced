// The Leaving soon card on the plugin page's *arr tab, as real-admin (upstream 6c922d10 and c6437f16): the "Copy
// KefinTweaks section" button and its Services tab copy, what a click copies (captured in the page, nothing leaves the
// browser), and the "Hide watched titles in the home row" switch. Nothing is saved.
export default async ({ page, until, sleep }) => {
  await until(() => page.evaluate(() => !!document.getElementById('LeavingSoonHomeRow')), 20000).catch(() => null);
  await sleep(1000);
  return page.evaluate(async () => {
    const out = [];
    const button = document.getElementById('leavingSoonCopyKefinBtn');
    out.push(`copy button: ${button ? '"' + button.textContent.trim() + '"' : 'absent'}; Services tab copy: ${document.getElementById('leavingSoonCopyKefinBtn--mirror') ? 'present' : 'absent'}`);
    const hide = document.getElementById('LeavingSoonHideWatched');
    const row = hide && hide.closest('.inputContainer, .checkboxContainer, .jea-field, .jea-row');
    out.push(`hide watched switch: ${hide ? (hide.checked ? 'on' : 'off') + ', "' + (row ? row.textContent.trim().replace(/\s+/g, ' ').slice(0, 60) : '') + '"' : 'absent'}`);
    if (button) {
      // The lab's page is not a secure context, so the browser has no clipboard API and the page copies through a
      // hidden text area: that copy is captured as document.execCommand('copy') sees it.
      let copied = null;
      if (navigator.clipboard) Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async text => { copied = text; } });
      const execCommand = document.execCommand.bind(document);
      document.execCommand = (command, ...rest) => {
        const area = document.body.lastElementChild;
        if (command === 'copy' && area && area.tagName === 'TEXTAREA') copied = area.value;
        return execCommand(command, ...rest);
      };
      out.push(`clipboard API: ${navigator.clipboard ? 'present' : 'absent'}`);
      button.click();
      await new Promise(r => setTimeout(r, 400));
      out.push(`after a click: "${button.textContent.trim()}"`);
      try {
        const section = JSON.parse(copied);
        out.push(`copied: id ${section.id}, type ${section.type}, name "${section.name}", query ${section.queries.map(q => q.path + ' ' + JSON.stringify(q.queryOptions)).join(', ')}`);
      } catch { out.push(`copied: ${copied === null ? 'nothing' : 'not JSON'}`); }
    }
    return out.join('\n');
  });
};
