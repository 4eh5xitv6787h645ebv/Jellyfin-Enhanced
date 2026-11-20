import type { PageModules } from './modules';
import { asHtml } from './dom';

/** Dependencies this module calls; members are resolved lazily, after every module exists. */
export type AffordancesDeps = Pick<PageModules, 'context'>;

/** Every secret the page holds: API keys, tokens and passwords, on their own tab and on Services. */
const SECRET_SELECTOR = [
    'input[id$="ApiKey"]', 'input[id$="API_KEY"]', 'input[id$="ApiKey--mirror"]', 'input[id$="API_KEY--mirror"]',
    'input[id^="ReclaimerrPassword"]', 'input.je-api-input', 'input.arr-instance-apikey', 'input[type="password"]',
].map(selector => '#JellyfinEnhancedForm ' + selector).join(', ');

/**
 * Small page-wide controls the markup does not carry itself: a Show button on every secret field (keys stay masked until
 * the administrator asks; nothing is revealed by hovering), and Re-test in the Service Status header.
 */
export function createAffordances(m: AffordancesDeps) {
    const { form, lifecycle } = m.context;

    function secretName(input: HTMLInputElement): string {
        const label = input.id ? asHtml(document.querySelector('label[for="' + input.id + '"]')) : null;
        const text = (label?.querySelector('.jea-label-text')?.textContent ?? label?.textContent ?? '').trim();
        return text || input.getAttribute('aria-label') || input.placeholder || 'API key';
    }

    /** Wraps each secret field once and gives it a Show / Hide button; the value, its id and how it saves are untouched. */
    function addSecretToggles(): void {
        form.querySelectorAll<HTMLInputElement>(SECRET_SELECTOR).forEach(input => {
            if (input.closest('.je-secret') || input.type === 'checkbox') return;
            const wrap = document.createElement('span');
            wrap.className = 'je-secret';
            input.before(wrap);
            wrap.appendChild(input);
            input.classList.add('je-secret-input');
            const password = input.type === 'password';
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'je-secret-toggle';
            const icon = document.createElement('i');
            icon.className = 'material-icons';
            icon.setAttribute('aria-hidden', 'true');
            button.appendChild(icon);
            const show = (shown: boolean): void => {
                if (password) input.type = shown ? 'text' : 'password';
                input.classList.toggle('je-secret-shown', shown);
                icon.textContent = shown ? 'visibility_off' : 'visibility';
                button.setAttribute('aria-pressed', String(shown));
                button.setAttribute('aria-label', (shown ? 'Hide ' : 'Show ') + secretName(input));
                button.title = shown ? 'Hide' : 'Show';
            };
            show(false);
            button.addEventListener('click', () => show(!input.classList.contains('je-secret-shown')));
            wrap.appendChild(button);
        });
    }

    /** Re-test sits in the Service Status header, where the "not yet verified" states are; it runs the Quick Action. */
    function addStatusRetest(): void {
        const legend = asHtml(document.querySelector('#overview > fieldset > legend.sectionTitle'));
        const source = document.getElementById('retestAllConnectionsBtn');
        if (!legend || !(source instanceof HTMLButtonElement) || legend.querySelector('.je-status-retest')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'jea-btn je-status-retest';
        button.setAttribute('aria-label', 'Re-test all service connections');
        button.innerHTML = '<i class="material-icons" aria-hidden="true">sync</i><span>Re-test</span>';
        button.addEventListener('click', () => source.click());
        const sync = (): void => { button.disabled = source.disabled; };
        lifecycle.track(new MutationObserver(sync)).observe(source, { attributes: true, attributeFilter: ['disabled'] });
        sync();
        legend.appendChild(button);
    }

    function wire(): void {
        addStatusRetest();
        addSecretToggles();
        // Sonarr/Radarr instances and other script-built fields arrive later.
        let queued = false;
        lifecycle.track(new MutationObserver(() => {
            if (queued) return;
            queued = true;
            lifecycle.frame(() => { queued = false; addSecretToggles(); });
        })).observe(form, { childList: true, subtree: true });
    }

    return { wire, addSecretToggles };
}
