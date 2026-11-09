import { SHAPE_RATIO, preserveLegacySizing, revealSettings, FIT_MAX_ROWS, centreRowLimit, COMPACT_QUALITY, shapeOfSize, compactQualityLabel, chipsThatFit, rowBudget, rowsHeight } from './layout-fitting';
import * as rules from './layout-rules';
import { DEFAULT_ORDER, GROUPS, LAYOUT_SLOTS, LAYOUTS, DEFAULT_PROFILES, SHAPES, RECOMMENDED_SHAPES, EDGE_SPACINGS, DEFAULT_CAPS, MAX_CAP, TAG_SCALES, TAG_GAPS, readScale, readGap, POSITION_SETTINGS, POSITION_TO_SLOT, ENABLED_SETTING, SLOT_TO_POSITION, pick, normalizeGroup, normalizeLayout, readProfile, readOrder, readEdge, readCap, normalizeGroupCaps, readShapeLook, readShapeOverrides, shapesToWire, positionSlot, lookKeyOf, validSlots, withShape } from './layout-rules';
import type { LayoutSettings, ShapeLook, Group, Shape, LayoutDocument } from './layout-rules';
import type { LayoutHost, CardController } from './layout-runtime-types';
interface FitRow {
    slot: HTMLElement;
    chips: HTMLElement[];
    shown: boolean[];
    more: boolean;
    width?: number | undefined;
    firstWidth?: number | undefined;
    fittedRows?: number[];
    fittedMoreRow?: number;
}
interface FitPlan {
    pillFacts: number;
    rows: FitRow[];
    indicator: {
        el: HTMLElement;
        before: number | null;
    }[];
    stacks: {
        chip: HTMLElement;
        width: number;
    }[];
    lift: {
        slot: HTMLElement;
        lift: number;
        hidden: HTMLElement[];
    } | null;
}
type PreviewLook = ShapeLook & {
    shapes?: import('./layout-rules').ShapeOverrides | null;
    locked?: boolean;
};
type CardContext = CardController | HTMLElement | {
    itemId?: string;
    cardType?: string | null;
    shape?: string;
    Type?: string;
    Genres?: unknown;
    OfficialRating?: unknown;
    LibraryId?: unknown;
    SeriesId?: unknown;
} | null | undefined;
function contextElement(context: CardContext): HTMLElement | null { return context instanceof HTMLElement ? context : context && 'host' in context ? context.host : null; }
function childrenOf(element: Element): HTMLElement[] { return Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement); }
function cloneElement(element: HTMLElement): HTMLElement { const clone = element.cloneNode(true); if (!(clone instanceof HTMLElement))
    throw new Error('Expected an HTML tag'); return clone; }
export function createTagLayout(JE: LayoutHost) {
    function requireLook() { const look = JE.core.tagLook; if (!look)
        throw new Error('Tag looks must load before resolving item rules'); return look; }
    const normalizeSettings = (settings?: LayoutDocument | null, plugin?: LayoutDocument | null) => rules.normalizeSettings(settings ?? JE.currentSettings, plugin ?? JE.pluginConfig);
    const isLegacySettings = (settings?: LayoutDocument | null) => rules.isLegacySettings(settings ?? JE.currentSettings);
    const singleChipGroup = (group: Group, config = JE.pluginConfig) => rules.singleChipGroup(group, config);
    const promoteLegacySettings = (settings?: LayoutDocument | null) => {
        const source = settings ?? JE.currentSettings;
        const changed = rules.promoteLegacySettings(source);
        if (changed && source === JE.currentSettings) invalidateSettings();
        return changed;
    };
    const lookSettingsCache = new Map<string, LayoutSettings>();
    const lookSettings = (base: LayoutSettings, look: ShapeLook, locked: boolean) => {
        const settings = rules.lookSettings(base, look, locked, JE.currentSettings, JE.pluginConfig);
        const key = settings.lookKey + '|' + (settings.order ? 'o' : '');
        const cached = lookSettingsCache.get(key);
        if (cached)
            return cached;
        lookSettingsCache.set(key, settings);
        return settings;
    };
    const SLOT_ORDER = [...new Set(Object.values(LAYOUT_SLOTS).flat().filter((slot) => slot !== 'off'))];
    const PORTRAIT_CARD = /^(?:overflow)?(?:portrait|square)card$/i;
    const LANDSCAPE_CARD = /^(?:overflow)?(?:backdrop|smallbackdrop|banner|thumb)card$/i;
    function applySize(element: HTMLElement, conf: LayoutSettings) {
        element.style.setProperty('--je-tag-scale', String((TAG_SCALES[conf.tagScale] ?? 1)));
        element.style.setProperty('--je-tag-gap', String((TAG_GAPS[conf.tagGap] ?? 1)));
    }
    const CONTAINER_CLASS = {
        quality: 'quality-overlay-container',
        genre: 'genre-overlay-container',
        language: 'language-overlay-container',
        rating: 'rating-overlay-container',
        ageRating: 'age-rating-overlay-container',
        status: 'status-overlay-container',
        awards: 'awards-overlay-container',
        logos: 'logo-overlay-container',
        custom: 'custom-overlay-container',
    };
    const SUMMARY_SLOTS = new Set(['pill', 'dots', 'corner']);
    const PILL_MAX_FACTS = 3;
    const FIT_LAYOUTS = new Set(['bands', 'caption', 'summary', 'minimal']);
    const CENTRE_SLOTS = new Set(['tc', 'bc', 'ml', 'mr', 'c']);
    const STACK_SLOTS: Partial<Record<string, string[]>> = { minimal: ['top', 'corner'], caption: ['poster'] };
    const STACK_INSET = 6;
    const STACK_LIFT = '--je-stack-lift';
    const NARROW_CARD_PX = 160;
    const DYNAMIC_RANGE = ['Dolby Vision', 'HDR10+', 'HDR10', 'HLG', 'HDR'];
    const DOT_KIND = [
        ['resolution', 'resolution'],
        ['video-codec', 'range'],
        ['audio-codec', 'audio'],
        ['video-format', 'codec'],
        ['other-quality', 'codec'],
    ];
    let cachedSettings: LayoutSettings | null = null;
    let cachedSource: ReturnType<typeof settingsSource> | null = null;
    function settingsSource() {
        const s = JE.currentSettings;
        return { settings: s, plugin: JE.pluginConfig, enabled: DEFAULT_ORDER.map((g) => (s?.[ENABLED_SETTING[g]] ? '1' : '0')).join('') };
    }
    function currentSettings() {
        const source = settingsSource();
        if (!cachedSettings || !cachedSource || cachedSource.settings !== source.settings
            || cachedSource.plugin !== source.plugin || cachedSource.enabled !== source.enabled) {
            cachedSettings = normalizeSettings();
            cachedSource = source;
        }
        return cachedSettings;
    }
    function invalidateSettings() {
        lookSettingsCache.clear();
        cachedSettings = null;
        cachedLooks = null;
    }
    let cachedLooks: ReturnType<import('./tag-look').TagLook['read']> | null = null;
    function currentLooks() {
        if (!cachedLooks)
            cachedLooks = JE.core.tagLook?.read() || { rules: [], locks: new Map(), overrides: new Map() };
        if (!cachedLooks.overrides)
            cachedLooks.overrides = new Map();
        return cachedLooks;
    }
    // ── Card context ───────────────────────────────────────────────────
    const controllers: WeakMap<HTMLElement, CardController> = new WeakMap();
    let cardData: WeakMap<HTMLElement, {
        entry: unknown;
        itemId: string;
        cardId: string;
    }> = new WeakMap();
    let awaitingData: WeakMap<HTMLElement, {
        cardId: string;
        timer: number;
        token: {
            cardId: string;
            generation: number;
        };
    }> = new WeakMap();
    let waitGeneration = 0;
    // A card waiting for its item data shows its tags after this long even
    // when the data never comes (a failed fetch the pipeline didn't report).
    const AWAIT_CONTEXT_MS = 8000;
    let outletSeq = 0;
    let stylesInjected = false;
    function injectStyles() {
        if (stylesInjected || typeof api.buildStyles !== 'function' || !JE.core.ui?.injectCss)
            return;
        stylesInjected = true;
        JE.core.ui.injectCss('je-tag-layout', api.buildStyles());
        window.addEventListener('resize', refitOnResize, { passive: true });
    }
    let resizeQueued = false;
    function refitOnResize() {
        if (resizeQueued)
            return;
        resizeQueued = true;
        requestAnimationFrame(() => {
            resizeQueued = false;
            for (const host of document.querySelectorAll<HTMLElement>('.je-tag-host')) {
                const ctrl = controllers.get((host));
                if (ctrl)
                    scheduleFit(ctrl);
            }
        });
    }
    function identityOf(el: HTMLElement) {
        const holder = el.closest<HTMLElement>('[data-id]') || el.closest<HTMLElement>('[data-itemid]');
        const raw = holder?.getAttribute('data-id') || holder?.getAttribute('data-itemid') || '';
        return raw.replace(/-/g, '').toLowerCase();
    }
    function shapeOfCard(el: Element | null) {
        if (!el || typeof el.closest !== 'function')
            return null;
        if (el.closest<HTMLElement>('.listItemImage-large'))
            return 'list';
        // The host's marker describes output; only an ancestor may declare
        // an input shape (the preview samples). Never classify from stale output.
        const origin = el.classList.contains('je-tag-host') ? el.parentElement : el;
        const explicit = origin?.closest<HTMLElement>('[data-je-shape]:not(.je-tag-host)')?.getAttribute('data-je-shape');
        if (explicit === 'portrait' || explicit === 'list' || explicit === 'landscape')
            return explicit;
        const card = el.closest<HTMLElement>('.card');
        if (!card)
            return null;
        for (const cls of card.classList) {
            if (PORTRAIT_CARD.test(cls))
                return 'portrait';
            if (LANDSCAPE_CARD.test(cls))
                return 'landscape';
        }
        return null;
    }
    function shapeOf(cardContext: CardContext): string {
        if (cardContext && 'host' in cardContext)
            return cardContext.shape || 'portrait';
        if (cardContext instanceof HTMLElement) {
            const ctrl = controllers.get(findHost(cardContext) || cardContext);
            return ctrl?.shape || shapeOfCard(cardContext) || 'portrait';
        }
        return cardContext?.shape === 'list' || cardContext?.shape === 'landscape' ? cardContext.shape : 'portrait';
    }
    function shapesInUse() {
        const base = currentSettings();
        if (SHAPES.some((shape) => (shape === 'list' || shape === 'landscape' ? base.shapes[shape] : null)))
            return true;
        const looks = currentLooks();
        return looks.rules.some((rule) => !!rule.shapes) || Array.from(looks.locks.values()).some((lock) => !!lock.shapes)
            || Array.from(looks.overrides.values()).some((look) => !!look.shapes);
    }
    function findHost(target: HTMLElement) {
        if (!target)
            return null;
        if (target.classList?.contains('je-tag-host'))
            return target;
        for (const child of childrenOf(target)) {
            if (child.classList.contains('je-tag-host'))
                return (child);
        }
        return null;
    }
    function ensureHost(target: HTMLElement) {
        const existing = findHost(target);
        if (existing || !target)
            return existing;
        const host = document.createElement('div');
        host.className = 'je-tag-host';
        const overlay = target.classList.contains('cardScalable')
            ? childrenOf(target).find((c) => c.classList.contains('cardOverlayContainer')) || null
            : null;
        target.insertBefore(host, overlay);
        return host;
    }
    function captionAnchor(host: HTMLElement) {
        const scalable = host.closest<HTMLElement>('.cardScalable');
        const box = scalable?.parentElement;
        if (!scalable || !box || !box.classList.contains('cardBox'))
            return null;
        for (let next = scalable.nextElementSibling; next; next = next.nextElementSibling) {
            if (next.classList.contains('je-tag-caption'))
                continue;
            if (next.classList.contains('cardText') || next.querySelector<HTMLElement>('.cardText')) {
                return { parent: box, before: (next) };
            }
        }
        return null;
    }
    function isIgnoredContext(host: HTMLElement) {
        const check = JE.core.tagRenderer?.isIgnoredContext;
        return typeof check === 'function' ? check(host) : false;
    }
    function controllerFor(target: HTMLElement, create: boolean) {
        const host = create ? ensureHost(target) : findHost(target);
        if (!host)
            return null;
        let ctrl = controllers.get(host) || null;
        const itemId = identityOf(host);
        if (ctrl && ctrl.itemId !== itemId) {
            forget(ctrl);
            ctrl = null;
        }
        if (!ctrl && create) {
            injectStyles();
            ctrl = { host, itemId, groups: new Map(), nodes: new Map(), outlet: null, pill: null, layout: null, seq: 0, moreTip: null, described: null, lookKey: '', shape: shapeOfCard(host) };
            controllers.set(host, ctrl);
        }
        return ctrl;
    }
    function cardFacts(cardContext: CardContext) {
        const look = requireLook();
        const el = contextElement(cardContext);
        if (!el)
            return look.factsFrom(cardContext, { itemId: cardContext && 'itemId' in cardContext ? cardContext.itemId || '' : '', cardType: cardContext && 'cardType' in cardContext ? cardContext.cardType || null : null });
        const cardId = cardContext && 'host' in cardContext ? cardContext.itemId : identityOf(el);
        const data = contextOf(cardData, el);
        const usable = data && (!data.cardId || data.cardId === cardId);
        const cardType = el.closest<HTMLElement>('[data-type]')?.getAttribute('data-type') || null;
        return look.factsFrom(usable ? data.entry : null, { itemId: usable ? data.itemId : '', cardId, cardType });
    }
    function contextOf<T>(map: WeakMap<HTMLElement, T>, el: HTMLElement) {
        return map.get(el) || (el.parentElement ? map.get(el.parentElement) : undefined);
    }
    function needsCardData(cardType: string | null) {
        const looks = currentLooks();
        const perItem = looks.locks.size + looks.overrides.size;
        if (!looks.rules.length && !perItem)
            return false;
        if (!cardType)
            return true;
        if (looks.rules.some((rule) => rule.enabled && rule.when.some((cond) => cond.field !== 'type')))
            return true;
        // A season or episode inherits its series' lock or item look: the series id comes with the data.
        return perItem > 0 && (cardType === 'Season' || cardType === 'Episode');
    }
    function isAwaiting(host: HTMLElement) {
        const rec = contextOf(awaitingData, host);
        return !!rec && rec.cardId === identityOf(host);
    }
    function resolveLayout(cardContext: CardContext) {
        const base = currentSettings();
        const source = lookSource(cardContext);
        const shape = source.shape;
        if (source.lock)
            return lookSettings(base, withShape(source.lock, (shape === 'list' || shape === 'landscape' ? source.lock.shapes?.[shape] : null)), source.source === 'lock' || ('locked' in source.lock && !!source.lock.locked));
        if (source.rule)
            return lookSettings(base, withShape(source.rule, (shape === 'list' || shape === 'landscape' ? source.rule.shapes?.[shape] : null)), false);
        if (source.source === 'shape') {
            return lookSettings(base, withShape({ layout: base.layout, density: base.density, slots: null, caps: null }, (shape === 'list' || shape === 'landscape' ? base.shapes[shape] : null)), false);
        }
        return base;
    }
    function lookSource(cardContext: CardContext) {
        const looks = currentLooks();
        const shape = shapeOf(cardContext);
        const el = contextElement(cardContext);
        const preview = el ? contextOf(previewLooks, el) : undefined;
        if (preview)
            return { source: 'preview', lock: preview, rule: null, index: -1, shape };
        const shaped = (shape === 'list' || shape === 'landscape') && !!currentSettings().shapes[shape];
        const none = { source: (shaped ? 'shape' : 'default'), lock: null, rule: null, index: -1, shape };
        if (!looks.rules.length && !looks.locks.size && !looks.overrides.size)
            return none;
        const facts = cardFacts(cardContext);
        const lock = requireLook().findLock(looks.locks, facts);
        if (lock)
            return { source: 'lock', lock, rule: null, index: -1, shape };
        const override = requireLook().findLock(looks.overrides, facts);
        if (override)
            return { source: 'override', lock: override, rule: null, index: -1, shape };
        const rule = requireLook().firstMatch(looks.rules, facts);
        return rule ? { source: 'rule', lock: null, rule, index: looks.rules.indexOf(rule), shape } : none;
    }
    const previewLooks: WeakMap<HTMLElement, PreviewLook> = new WeakMap();
    function setPreviewLook(target: HTMLElement, look: PreviewLook | null) {
        if (!target)
            return;
        if (look)
            previewLooks.set(target, look);
        else
            previewLooks.delete(target);
        refreshPresentation(target);
    }
    function cardIdentity(target: HTMLElement) {
        return target ? identityOf(findHost(target) || target) : '';
    }
    function setCardContext(target: HTMLElement, entry: unknown, itemId: string, cardId?: string) {
        if (!target || !entry)
            return false;
        const host = findHost(target) || target;
        const current = identityOf(host);
        if (cardId !== undefined && cardId !== null && cardId !== current)
            return false;
        cardData.set(host, { entry, itemId, cardId: current });
        const waited = endAwait(host);
        const ctrl = controllers.get(host);
        if (!ctrl || !ctrl.host.isConnected || !ctrl.groups.size)
            return true;
        const looks = currentLooks();
        if (waited || ((looks.rules.length || looks.locks.size) && resolveLayout(ctrl).lookKey !== ctrl.lookKey))
            presentAll(ctrl);
        return true;
    }
    function awaitCardContext(target: HTMLElement, cardId: string, cardType: string | null) {
        if (!target || !needsCardData(cardType))
            return false;
        const host = findHost(target) || target;
        endAwait(host);
        const token = { cardId, generation: ++waitGeneration };
        const timer = setTimeout(() => releaseCardContext(target, token), AWAIT_CONTEXT_MS);
        awaitingData.set(host, { cardId, timer, token });
        return token;
    }
    function endAwait(el: HTMLElement) {
        let waited = false;
        for (const key of [el, el.parentElement]) {
            const rec = key ? awaitingData.get(key) : undefined;
            if (!rec)
                continue;
            clearTimeout(rec.timer);
            if (key)
                awaitingData.delete(key);
            waited = true;
        }
        return waited;
    }
    function releaseCardContext(target: HTMLElement, token: {
        cardId: string;
        generation: number;
    }) {
        if (!target)
            return;
        const host = findHost(target) || target;
        const rec = contextOf(awaitingData, host);
        if (!rec || rec.token !== token || token.cardId !== identityOf(host))
            return;
        if (!endAwait(host))
            return;
        const ctrl = controllers.get(host);
        if (!ctrl || !ctrl.groups.size)
            return;
        if (ctrl.host.isConnected)
            presentAll(ctrl);
        else
            ctrl.pendingPresentation = true;
    }
    function resumePresentation(target: HTMLElement) {
        const ctrl = target ? controllerFor(target, false) : null;
        if (ctrl?.pendingPresentation && ctrl.host.isConnected)
            presentAll(ctrl);
    }
    function applyDensityAndCap(group: Group, node: HTMLElement, conf: LayoutSettings) {
        if (conf.density === 'compact') {
            if (group === 'quality') {
                for (const chip of node.querySelectorAll<HTMLElement>('.quality-overlay-label')) {
                    const text = chip.textContent || '';
                    const short = chip.dataset.jeCompact || compactQualityLabel(text);
                    if (short !== text)
                        chip.textContent = short;
                }
            }
            else if (group === 'rating') {
                for (const chip of node.querySelectorAll<HTMLElement>('.rating-tag--source'))
                    chip.dataset.jeRatingCompact = '1';
                // Legacy Community/Critic chips retain their historical compact density.
                if (node.querySelector<HTMLElement>('.rating-tag-tmdb'))
                    node.querySelector<HTMLElement>('.rating-tag-critic')?.remove();
            }
            else if (group === 'status') {
                // Status badges carry their own short label ("Season Premiere" → "Premiere").
                for (const chip of node.querySelectorAll<HTMLElement>('[data-je-compact]')) {
                    chip.textContent = (chip).dataset.jeCompact || chip.textContent;
                }
            }
        }
        const cap = conf.caps[group];
        if (cap > 0) {
            while (node.children.length > cap)
                node.lastElementChild?.remove();
        }
    }
    function buildChips(group: Group, master: HTMLElement, conf: LayoutSettings, host?: HTMLElement) {
        const node = (cloneElement(master));
        node.dataset.jeGroup = group;
        // Event handler properties are not cloned: a flag whose country is
        // missing from the flag set still removes itself.
        for (const img of node.querySelectorAll<HTMLImageElement>('img'))
            img.onerror = () => img.remove();
        applyDensityAndCap(group, node, conf);
        if ((group === 'language' || group === 'awards') && host) {
            const link = cardLinkOf(host);
            if (link?.matches('a[href]') && !link.contains(host)) {
                for (const chip of childrenOf(node)) {
                    const anchor = document.createElement('a');
                    anchor.className = group === 'language' ? 'language-link' : 'awards-link';
                    anchor.href = link.getAttribute('href') || '';
                    anchor.title = chip.getAttribute('title') || '';
                    // Mouse/touch only: keyboard focus stays on the poster's own link.
                    anchor.setAttribute('tabindex', '-1');
                    for (const attr of ['target', 'rel']) {
                        if (link.hasAttribute(attr))
                            anchor.setAttribute(attr, link.getAttribute(attr) || '');
                    }
                    chip.replaceWith(anchor);
                    anchor.appendChild(chip);
                }
            }
        }
        return node;
    }
    function buildDots(master: HTMLElement, conf: LayoutSettings) {
        const copy = buildChips('quality', master, { ...conf, density: 'full' });
        const labels = [];
        const dots = document.createElement('div');
        dots.className = 'je-tag-dots';
        dots.dataset.jeGroup = 'quality';
        for (const chip of childrenOf(copy)) {
            const label = chip.textContent || '';
            const kind = DOT_KIND.find(([cls]) => !!cls && chip.classList.contains(cls))?.[1] || 'codec';
            const dot = document.createElement('span');
            dot.className = 'je-tag-dot';
            dot.dataset.jeDot = kind;
            dot.title = label;
            dot.setAttribute('aria-hidden', 'true');
            dots.appendChild(dot);
            labels.push(label);
        }
        if (labels.length === 0)
            return null;
        dots.setAttribute('role', 'img');
        dots.setAttribute('aria-label', labels.join(', '));
        dots.title = labels.join(' · ');
        return dots;
    }
    function pillFact(group: Group, master: HTMLElement) {
        switch (group) {
            case 'quality': {
                const labels = Array.from(master.querySelectorAll<HTMLElement>('.quality-overlay-label'));
                const resolution = labels.find((l) => l.classList.contains('resolution'))?.textContent || '';
                const range = labels.map((l) => (l).dataset.quality || '').find((q) => DYNAMIC_RANGE.includes(q)) || '';
                const text = [resolution, range ? compactQualityLabel(range) : ''].filter(Boolean).join(' ')
                    || labels[0]?.textContent || '';
                return text ? { text } : null;
            }
            case 'rating': {
                const source = master.querySelector<HTMLElement>('.rating-tag--source');
                if (source)
                    return { text: source.getAttribute('aria-label') || source.textContent };
                const community = master.querySelector<HTMLElement>('.rating-tag-tmdb .rating-text')?.textContent;
                if (community)
                    return { text: community, glyph: '★' };
                const critic = master.querySelector<HTMLElement>('.rating-tag-critic .rating-text')?.textContent;
                if (critic)
                    return { text: critic };
                const review = master.querySelector<HTMLElement>('.je-userreview-tag .rating-text')?.textContent;
                return review ? { text: review, glyph: '♥' } : null;
            }
            case 'awards': {
                const chip = childrenOf(master)[0];
                return chip ? { text: chip.textContent, title: chip.title } : null;
            }
            case 'status':
            case 'ageRating': {
                const text = (master.firstElementChild?.textContent || '').trim();
                return text ? { text } : null;
            }
            case 'language': {
                const first = childrenOf(master)[0];
                if (first?.classList.contains('language-code') || first?.classList.contains('language-count-badge')) {
                    const copy = (cloneElement(first));
                    const marker = copy.querySelector<HTMLElement>('.language-cc');
                    const glyph = marker?.textContent || undefined;
                    marker?.remove();
                    return { text: (copy.textContent || '').trim(), glyph, title: first.getAttribute('title') || undefined };
                }
                const img = first instanceof HTMLImageElement ? first : first?.querySelector<HTMLImageElement>('img');
                if (!img)
                    return null;
                const flag = (cloneElement(img));
                flag.className = 'je-tag-pill-flag';
                (flag).onerror = () => flag.remove();
                return { text: img.getAttribute('alt') || '', title: first?.getAttribute('title') || undefined,
                    glyph: first?.querySelector<HTMLElement>('.language-cc')?.textContent || undefined, flag };
            }
            case 'genre': {
                const text = master.querySelector<HTMLElement>('.genre-tag')?.getAttribute('title') || '';
                return text ? { text } : null;
            }
            case 'logos': {
                const text = master.querySelector<HTMLElement>('.je-logo-chip')?.getAttribute('title') || '';
                return text ? { text } : null;
            }
            case 'custom': {
                // The label alone: the chip's icon is a ligature word, not text.
                const text = childrenOf(master)[0]?.dataset.jeCustom || '';
                return text ? { text } : null;
            }
            default:
                return null;
        }
    }
    function rankOf(ctrl: CardController, conf: LayoutSettings, group: Group) {
        if (conf.order)
            return conf.order.indexOf(group);
        return ctrl.groups.get(group)?.seq ?? Number.MAX_SAFE_INTEGER;
    }
    function slotElement(ctrl: CardController, slot: string) {
        if (slot === 'caption')
            return (ensureOutlet(ctrl));
        for (const child of childrenOf(ctrl.host)) {
            if (child.classList.contains('je-tag-slot') && (child).dataset.jeSlot === slot) {
                return (child);
            }
        }
        const el = document.createElement('div');
        el.className = 'je-tag-slot';
        el.dataset.jeSlot = slot;
        // Slots keep one order in the host (also the reading order), whichever group arrived first:
        // turning a group off and on again leaves the card exactly as it was.
        const rank = SLOT_ORDER.indexOf(slot);
        const children = childrenOf(ctrl.host);
        const isSlot = (child: Element) => child.classList.contains('je-tag-slot');
        let next = children.find((child) => isSlot(child) && SLOT_ORDER.indexOf((child).dataset.jeSlot || '') > rank);
        if (!next) {
            // After the last slot (any other child, such as the "+N" tooltip, stays after the slots).
            let last = -1;
            children.forEach((child, i) => { if (isSlot(child))
                last = i; });
            next = last >= 0 ? children[last + 1] : undefined;
        }
        if (next)
            ctrl.host.insertBefore(el, next);
        else
            ctrl.host.appendChild(el);
        return el;
    }
    function ensureOutlet(ctrl: CardController) {
        if (ctrl.outlet && ctrl.outlet.isConnected)
            return ctrl.outlet;
        const anchor = captionAnchor(ctrl.host);
        if (!anchor)
            return null;
        // An outlet left by a previous host of the same card (Jellyfin rebuilt
        // the image block) is reused rather than stacked.
        let outlet = childrenOf(anchor.parent).find((c) => c.classList.contains('je-tag-caption')) || null;
        if (!outlet) {
            outlet = document.createElement('div');
            outlet.className = 'je-tag-slot je-tag-caption';
            outlet.dataset.jeSlot = 'caption';
            anchor.parent.insertBefore(outlet, anchor.before);
        }
        outlet.dataset.jeOwner = String(++outletSeq);
        outlet.replaceChildren();
        ctrl.outlet = (outlet);
        return ctrl.outlet;
    }
    function reservesCaption(conf: LayoutSettings, el: HTMLElement) {
        if (!conf.reserveCaption)
            return false;
        const scopes = JE.core.tagScopes;
        if (!scopes)
            return true;
        return DEFAULT_ORDER.some((g) => conf.slots[g] === 'caption' && !!JE.currentSettings?.[ENABLED_SETTING[g]] && !scopes.excludes(g, el));
    }
    function placeSorted(ctrl: CardController, conf: LayoutSettings, slotEl: HTMLElement | null, node: HTMLElement) {
        if (!slotEl)
            return;
        const rank = rankOf(ctrl, conf, normalizeGroup(node.dataset.jeGroup) || 'quality');
        let before = null;
        for (const sibling of childrenOf(slotEl)) {
            const group = normalizeGroup(sibling.dataset.jeGroup);
            if (group && rankOf(ctrl, conf, group) > rank) {
                before = sibling;
                break;
            }
        }
        // The "+N" overflow chip stays last.
        slotEl.insertBefore(node, before || moreChipOf(slotEl));
    }
    function removeNodes(ctrl: CardController, group: Group) {
        const nodes = ctrl.nodes.get(group);
        if (!nodes)
            return;
        ctrl.nodes.delete(group);
        for (const node of nodes) {
            const slot = node.parentElement;
            node.remove();
            if (slot && slot !== ctrl.outlet && slot.classList.contains('je-tag-slot') && !holdsGroups(slot))
                slot.remove();
        }
    }
    function effectiveSlot(ctrl: CardController, conf: LayoutSettings, group: Group) {
        const slot = conf.slots[group] || 'off';
        if (slot === 'caption' && !ensureOutlet(ctrl))
            return 'poster';
        return slot;
    }
    function refreshPill(ctrl: CardController, conf: LayoutSettings) {
        if (ctrl.pill) {
            const slot = ctrl.pill.parentElement;
            ctrl.pill.remove();
            if (slot && slot.children.length === 0)
                slot.remove();
            ctrl.pill = null;
        }
        if (conf.layout !== 'summary')
            return;
        const groups = Array.from(ctrl.groups.keys())
            .filter((g) => conf.slots[g] === 'pill')
            .sort((a, b) => rankOf(ctrl, conf, a) - rankOf(ctrl, conf, b));
        const facts = [];
        for (const group of groups) {
            // From the same capped, density-adjusted copy the chips show, so
            // the pill never names a chip the caps or density left out.
            const master = ctrl.groups.get(group)?.master;
            if (!master)
                continue;
            const shown = buildChips(group, master, conf);
            const fact = pillFact(group, shown);
            if (fact)
                facts.push({ group, ...fact });
            if (facts.length >= PILL_MAX_FACTS)
                break;
        }
        if (facts.length === 0)
            return;
        const link = facts.some(f => f.group === 'language' || f.group === 'awards') ? cardLinkOf(ctrl.host) : null;
        const pill = document.createElement(link?.matches('a[href]') && !link.contains(ctrl.host) ? 'a' : 'div');
        if (pill.tagName === 'A' && link) {
            pill.setAttribute('href', link.getAttribute('href') || '');
            pill.setAttribute('tabindex', '-1');
            for (const attr of ['target', 'rel']) {
                if (link.hasAttribute(attr))
                    pill.setAttribute(attr, link.getAttribute(attr) || '');
            }
        }
        pill.className = 'je-tag-pill';
        const spoken: string[] = [];
        facts.forEach((fact, i) => {
            if (i > 0) {
                const sep = document.createElement('span');
                sep.className = 'je-tag-pill-sep';
                sep.setAttribute('aria-hidden', 'true');
                sep.textContent = '·';
                pill.appendChild(sep);
            }
            const span = document.createElement('span');
            span.className = 'je-tag-pill-fact';
            span.dataset.jeGroup = fact.group;
            if (fact.title)
                span.title = fact.title;
            if (fact.glyph) {
                const glyph = document.createElement('span');
                glyph.className = fact.group === 'language' ? 'language-cc' : 'je-tag-pill-glyph';
                glyph.setAttribute('aria-hidden', 'true');
                glyph.textContent = fact.glyph;
                span.append(glyph, ' ');
            }
            if (fact.flag) {
                span.appendChild(fact.flag);
            }
            else {
                span.append(fact.text);
            }
            pill.appendChild(span);
            spoken.push(fact.title || fact.text);
        });
        pill.title = spoken.join(' · ');
        pill.setAttribute('aria-label', spoken.join(', '));
        slotElement(ctrl, 'pill')?.appendChild(pill);
        ctrl.pill = pill;
    }
    function presentGroup(ctrl: CardController, conf: LayoutSettings, group: Group) {
        removeNodes(ctrl, group);
        const rec = ctrl.groups.get(group);
        if (!rec)
            return;
        const slot = effectiveSlot(ctrl, conf, group);
        if (slot === 'off')
            return;
        const nodes: HTMLElement[] = [];
        if (slot === 'dots') {
            const dots = buildDots(rec.master, conf);
            if (dots) {
                placeSorted(ctrl, conf, slotElement(ctrl, 'dots'), dots);
                nodes.push(dots);
            }
        }
        else if (slot !== 'pill') {
            const chips = buildChips(group, rec.master, slot === 'hover' || (conf.layout === 'bands' && ctrl.narrow) ? revealSettings(conf) : conf, ctrl.host);
            if (conf.layout === 'corners')
                chips.dataset.jeCorner = SLOT_TO_POSITION[slot];
            // The original web rule for settings saved before layouts: only a
            // container set to exactly top-right clears the played indicator.
            if (conf.layout === 'corners' && conf.legacy && conf.indicatorGap.has(group))
                chips.dataset.jeIndicatorGap = '1';
            if (chips.children.length > 0) {
                placeSorted(ctrl, conf, slotElement(ctrl, slot), chips);
                nodes.push(chips);
            }
        }
        // Summaries (pill, dots, corner score) keep their full chips for the
        // hover/focus scrim of the summary and minimal layouts.
        if (SUMMARY_SLOTS.has(slot) && (conf.layout === 'summary' || conf.layout === 'minimal')) {
            const full = buildChips(group, rec.master, revealSettings(conf), ctrl.host);
            if (full.children.length > 0) {
                placeSorted(ctrl, conf, slotElement(ctrl, 'hover'), full);
                nodes.push(full);
            }
        }
        ctrl.nodes.set(group, nodes);
    }
    function syncIndicatorGap(ctrl: CardController, conf: LayoutSettings) {
        const on = conf.layout === 'corners' && !conf.legacy
            && Array.from(ctrl.groups.keys()).some((g) => conf.indicatorGap.has(g) && (ctrl.nodes.get(g)?.length || 0) > 0);
        if (on)
            ctrl.host.dataset.jeIndicatorGap = '1';
        else
            delete ctrl.host.dataset.jeIndicatorGap;
    }
    function teardown(ctrl: CardController) {
        for (const group of Array.from(ctrl.nodes.keys()))
            removeNodes(ctrl, group);
        ctrl.pill?.remove();
        ctrl.pill = null;
        for (const child of childrenOf(ctrl.host)) {
            if (child.classList.contains('je-tag-slot'))
                child.remove();
        }
        ctrl.outlet?.remove();
        ctrl.outlet = null;
        describeHidden(ctrl, []);
        ctrl.layout = null;
        ctrl.lookKey = '';
        ctrl.host.style.removeProperty('--je-tag-scale');
        ctrl.host.style.removeProperty('--je-tag-gap');
        delete ctrl.host.dataset.jeLayout;
        delete ctrl.host.dataset.jeLegacy;
        delete ctrl.host.dataset.jeLocked;
        delete ctrl.host.dataset.jeIndicatorGap;
        delete ctrl.host.dataset.jeShape;
        delete ctrl.host.dataset.jeEdge;
        delete ctrl.host.dataset.jeGenreBound;
    }
    function presentAll(ctrl: CardController) {
        ctrl.pendingPresentation = false;
        const declaredShape = shapeOfCard(ctrl.host);
        if (declaredShape)
            ctrl.shape = declaredShape;
        const conf = resolveLayout(ctrl);
        const shaped = shapesInUse();
        teardown(ctrl);
        ctrl.layout = conf.layout;
        ctrl.lookKey = conf.lookKey;
        ctrl.host.dataset.jeLayout = conf.layout;
        applySize(ctrl.host, conf);
        if (shaped) {
            // A card its markup doesn't classify waits for the fitting pass
            // to measure its image, so its chips don't land in the portrait
            // look first and then move.
            if (ctrl.shape === null) {
                ctrl.lookKey = '';
                scheduleFit(ctrl);
                return;
            }
            ctrl.host.dataset.jeShape = ctrl.shape;
        }
        // Settings saved before layouts keep the original web geometry
        // (tags/tag-layout-styles.js keys its legacy rules off this).
        if (conf.legacy)
            ctrl.host.dataset.jeLegacy = '1';
        if (reservesCaption(conf, ctrl.host) && !isIgnoredContext(ctrl.host)) {
            const outlet = ensureOutlet(ctrl);
            if (outlet)
                applySize(outlet, conf);
        }
        if (conf.locked)
            ctrl.host.dataset.jeLocked = '1';
        // Corners edge spacing (tags/tag-layout-styles.js); the default inset has no marker.
        if (conf.layout === 'corners' && conf.edge && conf.edge !== 'default')
            ctrl.host.dataset.jeEdge = conf.edge;
        // Waiting for item data: keep the groups, show none yet.
        if (isAwaiting(ctrl.host))
            return;
        const groups = Array.from(ctrl.groups.keys()).sort((a, b) => rankOf(ctrl, conf, a) - rankOf(ctrl, conf, b));
        for (const group of groups)
            presentGroup(ctrl, conf, group);
        refreshPill(ctrl, conf);
        syncIndicatorGap(ctrl, conf);
        scheduleFit(ctrl);
        // Poster preset: the card's colours follow its artwork (tags/tag-poster-colours.js).
        JE.tagPosterColours?.track(ctrl.host);
    }
    // ── Fitting ────────────────────────────────────────────────────────
    // What fits on a card depends on its rendered size, which only the
    // browser knows. After cards are presented, one pass after the next
    // paint measures every card queued by then — reads and writes batched
    // across the page to avoid a layout per card — and hides what does not
    // fit, never half a chip or fact:
    //   - the summary pill's lowest-priority facts;
    //   - in the caption strip, the bottom band and the hover reveal, chips
    //     past their two rows (fewer when the reveal's share of the card
    //     height has room for less), lowest priority first, behind a "+N"
    //     chip whose title names them;
    //   - centre anchors' whole chips, in at most two rows or one side column,
    //     within budgets measured between occupied corners and Jellyfin
    //     overlays, with omitted chips counted in "+N".
    // It also switches bands on cards narrower than NARROW_CARD_PX to compact
    // labels. The four original corner stacks keep their geometry, except a
    // card saved before layouts with an exact top-right container below
    // another container: the indicator offset depends on the measured height
    // of the containers above it (indicatorGapsToMeasure).
    function holdsGroups(slotEl: Element) {
        return childrenOf(slotEl).some((c) => !!((c).dataset.jeGroup));
    }
    function moreChipOf(slotEl: HTMLElement) {
        const last = slotEl.lastElementChild;
        return last instanceof HTMLElement && last.classList.contains('je-tag-more') ? (last) : null;
    }
    function rowSlots(ctrl: CardController) {
        const slots = [];
        if (ctrl.outlet && ctrl.outlet.isConnected)
            slots.push(ctrl.outlet);
        const wrapping = ctrl.layout === 'bands' ? 'bottom' : 'hover';
        for (const child of childrenOf(ctrl.host)) {
            if (child.classList.contains('je-tag-slot') && ((child).dataset.jeSlot === wrapping
                || (ctrl.layout === 'corners' && CENTRE_SLOTS.has((child).dataset.jeSlot || '')))) {
                slots.push((child));
            }
        }
        return slots;
    }
    function posterStack(ctrl: CardController) {
        const slot = ctrl.layout === 'caption' ? ctrl.host.querySelector<HTMLElement>(':scope > .je-tag-slot[data-je-slot="poster"]') : null;
        return slot ? [(slot)] : [];
    }
    function slotChips(slotEl: HTMLElement) {
        const chips = [];
        for (const child of childrenOf(slotEl)) {
            if ((child).dataset.jeGroup)
                chips.push(...(childrenOf(child)));
        }
        return chips;
    }
    function chipLabel(chip: HTMLElement) {
        return chip.getAttribute('title') || chip.getAttribute('alt')
            || chip.querySelector<HTMLElement>('.rating-text')?.textContent?.trim()
            || (chip.textContent || '').trim();
    }
    function rowWidth(slotEl: HTMLElement, style: CSSStyleDeclaration) {
        const pad = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
        const width = parseFloat(style.width);
        if (!Number.isFinite(width))
            return slotEl.clientWidth - pad;
        return style.boxSizing === 'border-box'
            ? width - pad - (parseFloat(style.borderLeftWidth) || 0) - (parseFloat(style.borderRightWidth) || 0)
            : width;
    }
    const pendingFit: Set<CardController> = new Set();
    let fitScheduled = false;
    let fitting = false;
    const INDICATOR_BEFORE = '--je-indicator-before';
    function indicatorGapsToMeasure(ctrl: CardController) {
        if (ctrl.layout !== 'corners' || ctrl.host.dataset.jeLegacy !== '1')
            return null;
        for (const child of childrenOf(ctrl.host)) {
            const slot = (child);
            if (!slot.classList.contains('je-tag-slot') || slot.dataset.jeSlot !== 'tr')
                continue;
            const items = (childrenOf(slot));
            const needs = items.some((el, i) => !!el.dataset.jeIndicatorGap
                && ((i > 0 && !items[i - 1]?.dataset.jeIndicatorGap) || !!el.style.getPropertyValue(INDICATOR_BEFORE)));
            return needs ? slot : null;
        }
        return null;
    }
    function needsShape(ctrl: CardController) {
        return shapeOfCard(ctrl.host) === null && shapesInUse();
    }
    function scheduleFit(ctrl: CardController) {
        if (fitting || !(FIT_LAYOUTS.has(ctrl.layout || '') || centreSlots(ctrl).length || cornerLanguageGroups(ctrl).length || indicatorGapsToMeasure(ctrl) || needsShape(ctrl) || needsRadius(ctrl)))
            return;
        pendingFit.add(ctrl);
        watchSize(ctrl.host);
        if (fitScheduled)
            return;
        fitScheduled = true;
        if (typeof JE.core.dom?.afterNextPaint === 'function')
            JE.core.dom.afterNextPaint(flushFit);
        else
            requestAnimationFrame(flushFit);
    }
    let sizeObserver: ResizeObserver | null = null;
    const fittedWidths: WeakMap<HTMLElement, {
        observed: number;
        observedHeight: number;
        fitted: number;
        fittedHeight: number;
        measured: {
            width: number;
            height: number;
        } | null;
    }> = new WeakMap();
    const SAME_WIDTH_PX = 0.01;
    function watchSize(host: HTMLElement) {
        if (typeof ResizeObserver !== 'function' || fittedWidths.has(host))
            return;
        sizeObserver ??= new ResizeObserver(refitOnSizeChange);
        fittedWidths.set(host, { observed: -1, observedHeight: -1, fitted: -1, fittedHeight: -1, measured: null });
        sizeObserver.observe(host);
    }
    function unwatchSize(host: HTMLElement) {
        if (!fittedWidths.has(host))
            return;
        fittedWidths.delete(host);
        sizeObserver?.unobserve(host);
    }
    function refitOnSizeChange(entries: ResizeObserverEntry[]) {
        for (const entry of entries) {
            const host = entry.target;
            if (!(host instanceof HTMLElement))
                continue;
            const ctrl = controllers.get(host);
            const sizes = fittedWidths.get(host);
            if (!ctrl || !sizes || !host.isConnected) {
                unwatchSize(host);
                continue;
            }
            const width = entry.contentRect.width;
            const height = entry.contentRect.height;
            if (width <= 0)
                continue;
            sizes.observed = width;
            sizes.observedHeight = height;
            // The first observation reports the size the queued fit is about to use.
            if (sizes.fitted < 0) {
                sizes.fitted = width;
                sizes.fittedHeight = height;
                continue;
            }
            // The change the last pass already measured and fitted (in whole pixels).
            const measured = sizes.measured;
            sizes.measured = null;
            if (measured && Math.abs(width - measured.width) < 1 && Math.abs(height - measured.height) < 1) {
                sizes.fitted = width;
                sizes.fittedHeight = height;
                continue;
            }
            if (Math.abs(width - sizes.fitted) < SAME_WIDTH_PX && Math.abs(height - sizes.fittedHeight) < SAME_WIDTH_PX)
                continue;
            scheduleFit(ctrl);
        }
    }
    function edgeOf(ctrl: CardController) {
        const edge = ctrl.layout === 'corners' ? ctrl.host.dataset.jeEdge : undefined;
        return (edge && rules.hasOwn(EDGE_SPACINGS, edge) ? EDGE_SPACINGS[edge] : EDGE_SPACINGS.default) ?? 6;
    }
    function needsRadius(ctrl: CardController) {
        return ctrl.host.dataset.jeEdge === 'flush' && !ctrl.host.style.getPropertyValue('--je-card-radius');
    }
    function cardRadiusOf(ctrl: CardController) {
        const parent = ctrl.host.parentElement;
        const art = (parent?.classList.contains('cardScalable') && parent.querySelector<HTMLElement>('.cardImageContainer')) || parent;
        if (!art)
            return '0px';
        const style = getComputedStyle(art);
        return style.borderTopLeftRadius || style.borderRadius.split(' ')[0] || '0px';
    }
    function flushFit() {
        fitScheduled = false;
        const list = Array.from(pendingFit).filter((c) => c.host.isConnected && controllers.get(c.host) === c);
        pendingFit.clear();
        if (list.length === 0)
            return;
        fitting = true;
        try {
            // Reads: cards not laid out (hidden, detached tab) are left as they
            // are. The image's height shapes only cards whose shape is measured.
            const widths = list.map((ctrl) => ctrl.host.clientWidth);
            const hostHeights = list.map((ctrl, i) => ((widths[i] ?? 0) > 0 ? ctrl.host.clientHeight : 0));
            // The size this pass fits at, in the observer's units: its latest observation
            // (delivered before this pass's paint), or 0 for a card left unfitted.
            list.forEach((ctrl, i) => {
                const sizes = fittedWidths.get(ctrl.host);
                if (!sizes)
                    return;
                sizes.fitted = (widths[i] ?? 0) > 0 ? sizes.observed : 0;
                sizes.fittedHeight = (widths[i] ?? 0) > 0 ? sizes.observedHeight : 0;
                // Changed after the frame observed it: the next observation is this pass's size.
                const moved = (widths[i] ?? 0) > 0 && sizes.observed >= 0
                    && (Math.abs((widths[i] ?? 0) - sizes.observed) >= 1 || Math.abs((hostHeights[i] ?? 0) - sizes.observedHeight) >= 1);
                sizes.measured = moved ? { width: (widths[i] ?? 0), height: (hostHeights[i] ?? 0) } : null;
            });
            const heights = list.map((ctrl, i) => (needsShape(ctrl) ? (hostHeights[i] ?? 0) : 0));
            const radii = list.map((ctrl, i) => ((widths[i] ?? 0) > 0 && needsRadius(ctrl) ? cardRadiusOf(ctrl) : null));
            const shown = list.filter((ctrl, i) => (widths[i] ?? 0) > 0);
            // Writes: a card whose shape was measured is presented in its
            // shape's look (one not laid out as a portrait, measured again
            // next time); bands that crossed the narrow-card width re-present
            // with the other labels; then show what an earlier pass hid, and
            // give every wrapping slot its "+N" chip, so both are measured afresh.
            const presented = new Set();
            const narrowed = new Set<CardController>();
            list.forEach((ctrl, i) => {
                const narrow = (widths[i] ?? 0) > 0 && (widths[i] ?? 0) < NARROW_CARD_PX;
                if ((widths[i] ?? 0) === 0 || narrow === !!ctrl.narrow)
                    return;
                ctrl.narrow = narrow;
                narrowed.add(ctrl);
            });
            list.forEach((ctrl, i) => {
                if (!needsShape(ctrl))
                    return;
                const shape = (widths[i] ?? 0) > 0 ? shapeOfSize((widths[i] ?? 0), (heights[i] ?? 0)) : 'portrait';
                const changed = shape !== ctrl.shape;
                ctrl.shape = shape;
                if (changed) {
                    presentAll(ctrl);
                    presented.add(ctrl);
                }
            });
            for (const ctrl of narrowed) {
                if (ctrl.layout === 'bands' && !presented.has(ctrl))
                    presentAll(ctrl);
            }
            list.forEach((ctrl, i) => { if (typeof radii[i] === 'string')
                ctrl.host.style.setProperty('--je-card-radius', radii[i]); });
            for (const ctrl of shown)
                prepareFit(ctrl);
            // Language columns yield whole chips before centre budgets are read,
            // keeping a full rating value or a readable overflow chip beside them.
            const languages = shown.map(measureCornerLanguages);
            languages.forEach(applyChipRows);
            // Read every occupied corner before writing centre-anchor budgets.
            const anchors = shown.map(measureAnchors);
            shown.forEach((ctrl, i) => applyAnchors(anchors[i] || []));
            // Reads, then writes.
            const plans = shown.map((ctrl, i) => {
                const plan = measureFit(ctrl);
                plan.rows.unshift(...(languages[i] || []));
                return plan;
            });
            shown.forEach((ctrl, i) => plans[i] && applyFit(ctrl, plans[i]));
        }
        finally {
            fitting = false;
        }
        // Genre names asked for while this pass was pending, and those of revealed
        // cards it changed, are bounded against the fitted chips.
        const bound = new Set(genreAfterFit);
        genreAfterFit.clear();
        for (const ctrl of list)
            if (ctrl.host.dataset.jeGenreBound && isRevealed(ctrl.host))
                bound.add(ctrl.host);
        for (const host of bound)
            if (host.isConnected)
                fitReveal(host);
    }
    function centreSlots(ctrl: CardController) {
        return ctrl.layout === 'corners' ? childrenOf(ctrl.host).filter((el) => CENTRE_SLOTS.has((el).dataset.jeSlot || '')) : [];
    }
    function measureAnchors(ctrl: CardController) {
        const centres = centreSlots(ctrl);
        if (!centres.length)
            return [];
        const conf = resolveLayout(ctrl);
        const gap = 4 * (TAG_SCALES[conf.tagScale] ?? 1) * (TAG_GAPS[conf.tagGap] ?? 1);
        const edge = edgeOf(ctrl);
        const host = ctrl.host.getBoundingClientRect();
        const boxes: Record<string, DOMRect[]> = {};
        for (const el of childrenOf(ctrl.host)) {
            const slot = (el).dataset.jeSlot;
            if (!['tl', 'tr', 'bl', 'br'].includes(slot || ''))
                continue;
            boxes[slot || ''] = childrenOf(el).filter((g) => (g).dataset.jeGroup).map((g) => g.getBoundingClientRect());
        }
        const width = (slots: string[]) => Math.max(edge, ...slots.flatMap((s) => (boxes[s] || []).map((b) => s.endsWith('l') ? b.right - host.left + gap : host.right - b.left + gap)));
        const height = (slots: string[]) => Math.max(edge, ...slots.flatMap((s) => (boxes[s] || []).map((b) => s.startsWith('t') ? b.bottom - host.top + gap : host.bottom - b.top + gap)));
        const scalable = ctrl.host.parentElement;
        const progress = scalable?.querySelector<HTMLElement>('.itemProgressBar, .cardProgressBar, .cardProgress');
        const flush = conf.edge === 'flush';
        const bottom = progress ? Math.max(edge, host.bottom - progress.getBoundingClientRect().top + (flush ? 0 : gap)) : edge;
        let top = edge;
        const cornerReserve = width(['tl', 'tr']);
        let topReserve = cornerReserve;
        let overlayBottom = 0;
        for (const overlay of scalable?.querySelectorAll<HTMLElement>('.cardIndicators > *, .countIndicator, .playedIndicator') || []) {
            // Jellyfin sometimes wraps a tiny indicator in a full-width box.
            // Its leaf supplies the actual obstruction, rather than that box.
            if (flush && overlay.querySelector<HTMLElement>('.countIndicator, .playedIndicator'))
                continue;
            const b = overlay.getBoundingClientRect();
            if (flush && (!b.width || !b.height))
                continue;
            if (b.bottom <= host.top || b.top >= host.top + host.height / 3)
                continue;
            overlayBottom = Math.max(overlayBottom, b.bottom - host.top + gap);
            const middle = host.left + host.width / 2;
            if (b.left < middle && b.right > middle)
                top = Math.max(top, b.bottom - host.top + gap);
            else
                topReserve = Math.max(topReserve, b.right <= middle ? b.right - host.left + gap : host.right - b.left + gap);
        }
        if (flush) {
            const row = centres.find(el => el.dataset.jeSlot === 'tc');
            const first = row && slotChips(row)[0];
            const firstWidth = first?.getBoundingClientRect().width || 0;
            // Prefer the gap between corner indicators. Only a first chip that
            // cannot fit there moves below the obstructions and gets full width.
            if (top > 0 || firstWidth > host.width - 2 * topReserve + 0.01) {
                // Below them only while the row stays in the image's top half
                // (a short image has no room there): else it keeps its place.
                const below = Math.max(overlayBottom, height(['tl', 'tr']));
                if (below + (first?.getBoundingClientRect().height || 0) <= host.height / 2 + 0.01) {
                    top = below;
                    topReserve = 0;
                }
            }
            else
                top = 0;
        }
        // On a short image a tall column of the other edge (languages
        // bottom-left, a status column top-right) reaches into a centre row's
        // band: the row keeps clear of it too.
        const crossing = (slots: string[], from: number, to: number) => Math.max(0, ...slots.flatMap((s) => (boxes[s] || [])
            .filter((b) => b.bottom - host.top > from && b.top - host.top < to)
            .map((b) => s.endsWith('l') ? b.right - host.left + gap : host.right - b.left + gap)));
        const topRow = top + centreRowLimit(host.height, top);
        const bottomRow = host.height - bottom - centreRowLimit(host.height, bottom);
        topReserve = Math.max(topReserve, crossing(['bl', 'br'], top, topRow));
        const bottomReserve = Math.max(width(['bl', 'br']), crossing(['tl', 'tr'], bottomRow, host.height - bottom));
        return centres.map((el) => {
            const slot = el.dataset.jeSlot;
            return { el, top, bottom, reserve: slot === 'tc' ? topReserve : slot === 'bc' ? bottomReserve : slot === 'ml' ? height(['tl', 'bl']) : slot === 'mr' ? height(['tr', 'br']) : edge };
        });
    }
    function applyAnchors(anchors: ReturnType<typeof measureAnchors>) {
        for (const { el, reserve, top, bottom } of anchors) {
            el.style.setProperty('--je-anchor-reserve', `${reserve}px`);
            el.style.setProperty('--je-anchor-top', `${top}px`);
            el.style.setProperty('--je-anchor-bottom', `${bottom}px`);
            el.toggleAttribute('data-je-flush-detached', el.dataset.jeSlot === 'tc' && top > 0);
        }
    }
    function cornerLanguageGroups(ctrl: CardController) {
        return ctrl.layout === 'corners' ? Array.from(ctrl.host.querySelectorAll<HTMLElement>(':scope > .je-tag-slot:is([data-je-slot="tl"], [data-je-slot="tr"], [data-je-slot="bl"], [data-je-slot="br"]) > [data-je-group="language"]'))
            .filter(group => group.querySelector<HTMLElement>('.language-chip') && childrenOf(ctrl.host)
            .some(slot => slot.dataset.jeSlot === ((group.parentElement?.dataset.jeSlot || '').startsWith('t') ? 'tc' : 'bc') && slot.querySelector<HTMLElement>('.rating-tag'))) : [];
    }
    function measureCornerLanguages(ctrl: CardController) {
        const rows: FitRow[] = [];
        const conf = resolveLayout(ctrl);
        const gap = 4 * (TAG_SCALES[conf.tagScale] ?? 1) * (TAG_GAPS[conf.tagGap] ?? 1);
        const inner = Math.max(0, ctrl.host.clientWidth - 2 * edgeOf(ctrl));
        for (const group of cornerLanguageGroups(ctrl)) {
            const slot = group.parentElement?.dataset.jeSlot || '';
            const centre = childrenOf(ctrl.host).find(el => el.dataset.jeSlot === (slot.startsWith('t') ? 'tc' : 'bc'));
            const rating = centre?.querySelector<HTMLElement>('.rating-tag');
            const centreMore = centre && moreChipOf(centre);
            const more = moreChipOf(group);
            if (!rating || !centreMore || !more)
                continue;
            const chips = childrenOf(group).filter(chip => chip !== more);
            if (!chips.length)
                continue;
            const rects = chips.map(chip => chip.getBoundingClientRect());
            const ratingWidth = rating.getBoundingClientRect().width;
            const moreRect = more.getBoundingClientRect();
            const languageMinimum = Math.max((rects[0]?.width || 0), chips.length > 1 ? moreRect.width : 0);
            const fullRoom = (inner - ratingWidth) / 2 - gap;
            const minimum = languageMinimum <= fullRoom ? Math.max(ratingWidth, centreMore.getBoundingClientRect().width) : centreMore.getBoundingClientRect().width;
            const available = Math.max((rects[0]?.width || 0), (inner - minimum) / 2 - gap);
            const height = ctrl.host.clientHeight * 0.9;
            const rowGap = parseFloat(getComputedStyle(group).rowGap) || 0;
            const shown = chipsThatFit(rects.map((rect, i) => i === 0 || rect.width <= available + 0.01 ? rect.height : Infinity), height, rowGap, 1, moreRect.height);
            shown[0] = true;
            rows.push({ slot: group, chips, shown, more: moreRect.width <= available + 0.01 && (rects[0]?.height || 0) + rowGap + moreRect.height <= height });
        }
        return rows;
    }
    function prepareFit(ctrl: CardController) {
        ctrl.host.querySelector<HTMLElement>(':scope > .je-tag-slot[data-je-slot="corner"]')?.style.removeProperty(STACK_LIFT);
        for (const root of [ctrl.host, ctrl.outlet]) {
            root?.querySelectorAll<HTMLElement>('[data-je-overflow]').forEach((el) => el.removeAttribute('data-je-overflow'));
            // Restore the intrinsic markup before any measurements.
            root?.querySelectorAll<HTMLElement>('.je-tag-fit-text').forEach((text) => text.replaceWith(...text.childNodes));
            root?.querySelectorAll<HTMLElement>('[data-je-fit-width]').forEach((el) => {
                el.removeAttribute('data-je-fit-width');
                el.style.removeProperty('--je-chip-fit-width');
            });
        }
        const languages = cornerLanguageGroups(ctrl);
        for (const slotEl of [...rowSlots(ctrl), ...languages, ...posterStack(ctrl)]) {
            const count = languages.includes(slotEl) ? childrenOf(slotEl).filter(el => !el.classList.contains('je-tag-more')).length : slotChips(slotEl).length;
            let more = moreChipOf(slotEl) || slotEl.querySelector<HTMLElement>(':scope > .je-tag-more');
            if (count === 0) {
                more?.remove();
                continue;
            }
            if (!more) {
                more = document.createElement('span');
                more.className = 'je-tag-more';
            }
            if (more !== slotEl.lastElementChild)
                slotEl.appendChild(more);
            const text = `+${count}`;
            if (more.textContent !== text)
                more.textContent = text;
        }
    }
    function rowRoom(ctrl: CardController, style: CSSStyleDeclaration, slotEl: HTMLElement) {
        const raw = style.maxHeight;
        if (slotEl === ctrl.outlet) {
            const height = parseFloat(style.height);
            return height > 0 ? { inside: height, oneRow: height, gap: parseFloat(style.rowGap) || 0 } : null;
        }
        if (!raw || raw === 'none')
            return ctrl.layout === 'bands' && slotEl.dataset.jeSlot === 'bottom' ? bandRoom(ctrl, style) : null;
        let limit = parseFloat(raw);
        if (raw.endsWith('%')) {
            // The slot is positioned in the host, which covers the image.
            const height = ctrl.host.clientHeight;
            if (!(height > 0))
                return null;
            limit = (limit / 100) * height;
        }
        if (!Number.isFinite(limit))
            return null;
        const padTop = parseFloat(style.paddingTop) || 0;
        const padBottom = parseFloat(style.paddingBottom) || 0;
        return { inside: limit - padTop - padBottom, oneRow: limit - padBottom, gap: parseFloat(style.rowGap) || 0 };
    }
    function bandRoom(ctrl: CardController, style: CSSStyleDeclaration) {
        const height = ctrl.host.clientHeight;
        const top = ctrl.host.querySelector<HTMLElement>(':scope > .je-tag-slot[data-je-slot="top"]');
        const bottoms = Array.from(top?.querySelectorAll<HTMLElement>(':scope > [data-je-group] > *') || [])
            .map((chip) => chip.getBoundingClientRect()).filter((r) => r.height > 0).map((r) => r.bottom);
        if (!(height > 0) || !bottoms.length)
            return null;
        const below = Math.max(...bottoms) - ctrl.host.getBoundingClientRect().top;
        const gap = parseFloat(style.rowGap) || 0;
        const inside = height - (parseFloat(style.paddingBottom) || 0) - below - gap;
        return { inside, oneRow: inside, gap };
    }
    function measureFit(ctrl: CardController) {
        const plan: FitPlan = { pillFacts: ctrl.pill ? pillFactsThatFit(ctrl.pill) : -1, rows: measurePosterStack(ctrl), indicator: measureIndicatorGaps(ctrl), stacks: measureStacks(ctrl), lift: measureCornerLift(ctrl) };
        const slots = rowSlots(ctrl);
        const sides = new Map(slots.filter(el => ['ml', 'mr'].includes(el.dataset.jeSlot || ''))
            .map(el => [el.dataset.jeSlot, slotChips(el).map(chip => chip.getBoundingClientRect())]));
        const conf = resolveLayout(ctrl);
        // Only rows sharing the corner-language reservation path require whole
        // ratings. Cards without boxed language columns keep first-chip fitting.
        const mixedRatingSlots = new Set<string>(cornerLanguageGroups(ctrl).map(group => (group.parentElement?.dataset.jeSlot || '').startsWith('t') ? 'tc' : 'bc'));
        const innerWidth = sides.size ? Math.max(0, ctrl.host.clientWidth - 2 * edgeOf(ctrl)) : 0;
        const sideGap = 4 * (TAG_SCALES[conf.tagScale] ?? 1) * (TAG_GAPS[conf.tagGap] ?? 1);
        const half = Math.max(0, (innerWidth - sideGap) / 2);
        for (const slotEl of slots) {
            const chips = slotChips(slotEl);
            const more = moreChipOf(slotEl);
            if (chips.length === 0 || !more)
                continue;
            const style = getComputedStyle(slotEl);
            const vertical = ctrl.layout === 'corners' && ['ml', 'mr'].includes(slotEl.dataset.jeSlot || '');
            const opposite = sides.get(slotEl.dataset.jeSlot === 'ml' ? 'mr' : 'ml') || [];
            const oppositeWidth = Math.min(half, Math.max(0, ...opposite.map(rect => rect.width)));
            // Side budgets come from the host, never the column's content width:
            // a previous +N chip must not shrink the next measurement's budget.
            const available = vertical ? Math.max(0, Math.min(opposite.length ? half : innerWidth, innerWidth - oppositeWidth - sideGap))
                : rowWidth(slotEl, style);
            const gap = parseFloat(style.columnGap) || 0;
            // Centre chips are unconstrained by CSS, so these batched reads
            // measure their intrinsic widths, including padding and borders.
            const rects = chips.map((chip) => chip.getBoundingClientRect());
            const widths = rects.map((r) => r.width);
            const moreRect = more.getBoundingClientRect();
            if (!(available > 0) && ctrl.layout !== 'corners') {
                plan.rows.push({ slot: slotEl, chips, shown: chips.map(() => true), more: true });
                continue;
            }
            if (ctrl.layout === 'corners') {
                const measured = parseFloat(slotEl.style.getPropertyValue('--je-anchor-reserve'));
                const reserve = Number.isFinite(measured) ? measured : edgeOf(ctrl);
                const offset = parseFloat(slotEl.style.getPropertyValue(slotEl.dataset.jeSlot === 'tc' ? '--je-anchor-top' : '--je-anchor-bottom'));
                const limit = Math.max(0, vertical ? ctrl.host.clientHeight - 2 * reserve
                    : ['tc', 'bc'].includes(slotEl.dataset.jeSlot || '') ? centreRowLimit(ctrl.host.clientHeight, Number.isFinite(offset) ? offset : reserve)
                        : ctrl.host.clientHeight / 3);
                if (!vertical && ctrl.host.clientHeight > 0 && available < moreRect.width - 0.01) {
                    // No room between the corner stacks even for "+N" (a short
                    // image crowded with tags): the row is left out, its facts
                    // stay in the card's description.
                    plan.rows.push({ slot: slotEl, chips, shown: chips.map(() => false), more: false });
                    continue;
                }
                const heights = rects.map((r) => r.height);
                const rowGap = parseFloat(style.rowGap) || 0;
                let shown = null;
                let fittedRows: number[] = [];
                let fittedMoreRow = 0;
                const ratingFirst = mixedRatingSlots.has(slotEl.dataset.jeSlot || '') && !!chips[0]?.matches('.rating-tag');
                const fitWidths = widths.map((width, i) => i === 0 && !ratingFirst ? Math.min(width, Math.max(0, available)) : width);
                if (vertical) {
                    // Keep the first label (ellipsized if necessary); later chips
                    // still need both height and width to be shown whole.
                    shown = chipsThatFit(heights.map((height, i) => (fitWidths[i] ?? 0) <= available + 0.01 ? height : Infinity), limit, rowGap, 1, moreRect.height);
                }
                else {
                    // The rows the height has room for, then chips in priority order until one no longer fits.
                    const rows: number[] = [], moreRow = { row: 0 };
                    const budget = rowBudget(heights, moreRect.height, limit, rowGap);
                    if (budget > 0) {
                        shown = chipsThatFit(fitWidths, available, gap, budget, moreRect.width, rows, moreRow);
                        fittedRows = rows;
                        fittedMoreRow = moreRow.row;
                    }
                }
                if (!shown?.[0] && !ratingFirst) {
                    // An anchor always tells the user at least its first fact.
                    // +N counts only later chips, and is omitted without room.
                    shown = chips.map((_, i) => i === 0);
                    fittedRows = chips.map((_, i) => i === 0 ? 1 : 0);
                    fittedMoreRow = 2;
                }
                if (!shown)
                    shown = chips.map(() => false);
                const moreFits = vertical ? (shown.some(Boolean) ? (heights[0] ?? 0) + rowGap : 0) + moreRect.height <= limit
                    : rowsHeight(shown, fittedRows, heights, moreRect.height, rowGap, fittedMoreRow) <= limit;
                plan.rows.push({ slot: slotEl, chips, shown, fittedRows, fittedMoreRow,
                    width: vertical ? available : undefined, firstWidth: !ratingFirst && (widths[0] ?? 0) > available ? Math.max(0, available) : undefined,
                    more: moreFits && limit >= moreRect.height && available >= moreRect.width });
                continue;
            }
            const room = rowRoom(ctrl, style, slotEl);
            if (!room) {
                plan.rows.push({ slot: slotEl, chips, shown: chipsThatFit(widths, available, gap, FIT_MAX_ROWS, moreRect.width), more: true });
                continue;
            }
            // As many whole rows as the height has room for, "+N" included, then chips in
            // priority order until one no longer fits. A slot with room for only one row in
            // its padding (a short hover reveal) uses that row.
            const heights = rects.map((r) => r.height);
            let budget = rowBudget(heights, moreRect.height, room.inside, room.gap);
            if (budget === 0 && Math.max(moreRect.height, ...heights) <= room.oneRow + 0.01)
                budget = 1;
            const shown = chipsThatFit(widths, available, gap, budget, moreRect.width);
            plan.rows.push(budget > 0
                ? { slot: slotEl, chips, shown, more: true }
                : { slot: slotEl, chips, shown: chips.map(() => false), more: false });
        }
        return plan;
    }
    function measurePosterStack(ctrl: CardController): FitRow[] {
        const slot = posterStack(ctrl)[0];
        const more = slot && moreChipOf(slot);
        if (!more)
            return [];
        const height = ctrl.host.clientHeight;
        const chips = slotChips(slot);
        const top = ctrl.host.getBoundingClientRect().top;
        const bottoms = chips.map((chip) => chip.getBoundingClientRect().bottom - top);
        const limit = height - STACK_INSET;
        if (!(height > 0) || bottoms.every((bottom) => bottom <= limit + 0.01))
            return [{ slot, chips, shown: chips.map(() => true), more: true }];
        const room = limit - more.getBoundingClientRect().height - (parseFloat(getComputedStyle(slot).rowGap) || 0);
        let fits = true;
        return [{ slot, chips, shown: bottoms.map((bottom) => (fits = fits && bottom <= room + 0.01)), more: true }];
    }
    function measureStacks(ctrl: CardController) {
        const slots = STACK_SLOTS[ctrl.layout || ''];
        if (!slots)
            return [];
        const width = Math.max(0, ctrl.host.clientWidth - 2 * STACK_INSET);
        const out = [];
        for (const slot of childrenOf(ctrl.host)) {
            if (!slots.includes((slot).dataset.jeSlot || ''))
                continue;
            for (const group of childrenOf(slot)) {
                if (!((group).dataset.jeGroup))
                    continue;
                for (const chip of (childrenOf(group))) {
                    if (chip.getBoundingClientRect().width > width + 0.01)
                        out.push({ chip, width });
                }
            }
        }
        return out;
    }
    function measureCornerLift(ctrl: CardController) {
        if (ctrl.layout !== 'minimal')
            return null;
        const slots = (childrenOf(ctrl.host));
        const corner = slots.find((el) => el.dataset.jeSlot === 'corner');
        if (!corner)
            return null;
        const dots = slots.find((el) => el.dataset.jeSlot === 'dots')?.getBoundingClientRect();
        const chipRects = (slot: HTMLElement | undefined) => Array.from(slot?.querySelectorAll<HTMLElement>(':scope > [data-je-group] > *') || [])
            .map((chip) => ({ chip: (chip), r: chip.getBoundingClientRect() })).filter(({ r }) => r.width > 0);
        const chips = chipRects(corner);
        const conf = resolveLayout(ctrl);
        const gap = 4 * (TAG_SCALES[conf.tagScale] ?? 1) * (TAG_GAPS[conf.tagGap] ?? 1);
        const meets = !!dots?.width && chips.some(({ r }) => r.left < dots.right + gap && r.top < dots.bottom && r.bottom > dots.top);
        const lift = meets ? Math.max(0, corner.getBoundingClientRect().bottom - dots.top + gap) : 0;
        const host = ctrl.host.getBoundingClientRect();
        if (!(ctrl.host.clientHeight > 0))
            return { slot: corner, lift, hidden: [] };
        const ceiling = host.top + STACK_INSET;
        const above = chipRects(slots.find((el) => el.dataset.jeSlot === 'top')).map(({ r }) => r);
        const hidden = [];
        for (const { chip, r } of chips.sort((a, b) => b.r.bottom - a.r.bottom)) {
            const top = r.top - lift;
            if (hidden.length || top < ceiling - 0.01
                || above.some((t) => r.left < t.right && r.right > t.left && top < t.bottom + gap - 0.01))
                hidden.push(chip);
        }
        return { slot: corner, lift, hidden };
    }
    function measureIndicatorGaps(ctrl: CardController) {
        const slot = indicatorGapsToMeasure(ctrl);
        if (!slot)
            return [];
        const items = (childrenOf(slot));
        const top = slot.getBoundingClientRect().top;
        const gap = parseFloat(getComputedStyle(slot).rowGap) || 0;
        const out: FitPlan['indicator'] = [];
        items.forEach((el, i) => {
            if (!el.dataset.jeIndicatorGap)
                return;
            const prev = items[i - 1];
            out.push({ el, before: !prev || prev.dataset.jeIndicatorGap ? null : Math.max(0, prev.getBoundingClientRect().bottom + gap - top) });
        });
        return out;
    }
    function pillFactsThatFit(pill: HTMLElement) {
        const facts = Array.from(pill.querySelectorAll<HTMLElement>('.je-tag-pill-fact'));
        const excess = pill.scrollWidth - pill.clientWidth;
        let keep = facts.length;
        let freed = 0;
        while (keep > 1 && freed < excess - 0.5) {
            const fact = facts[keep - 1];
            if (!fact)
                break;
            const sep = fact.previousElementSibling;
            freed += fact.getBoundingClientRect().width + (sep ? sep.getBoundingClientRect().width : 0);
            keep--;
        }
        return keep;
    }
    function prepareFitText(first: HTMLElement) {
        const chip = first.matches('.awards-link, .language-link') ? first.firstElementChild : first;
        if (!chip)
            return;
        if (chip.matches('.status-tag, .quality-overlay-label, .age-rating-tag, .je-logo-text')) {
            const text = document.createElement('span');
            text.className = 'je-tag-fit-text';
            text.append(...chip.childNodes);
            chip.append(text);
        }
        else if (chip.matches('.language-chip')) {
            for (const node of Array.from(chip.childNodes)) {
                if (node.nodeType !== 3)
                    continue;
                const text = document.createElement('span');
                text.className = 'je-tag-fit-text';
                node.replaceWith(text);
                text.append(node);
            }
        }
    }
    function applyFit(ctrl: CardController, plan: FitPlan) {
        for (const row of plan.rows) {
            if (row.width !== undefined)
                row.slot.style.setProperty('--je-anchor-width', `${row.width}px`);
            if (row.firstWidth !== undefined && row.chips[0]) {
                prepareFitText(row.chips[0]);
                row.chips[0].setAttribute('data-je-fit-width', '');
                row.chips[0].style.setProperty('--je-chip-fit-width', `${row.firstWidth}px`);
            }
        }
        for (const { chip, width } of plan.stacks) {
            prepareFitText(chip);
            chip.setAttribute('data-je-fit-width', '');
            chip.style.setProperty('--je-chip-fit-width', `${width}px`);
        }
        if (plan.lift?.lift)
            plan.lift.slot.style.setProperty(STACK_LIFT, `${Math.round(plan.lift.lift * 100) / 100}px`);
        if (plan.lift?.hidden.length) {
            for (const chip of plan.lift.hidden)
                chip.setAttribute('data-je-overflow', '');
            // A group left without chips takes no gap in the stack either.
            for (const group of childrenOf(plan.lift.slot)) {
                if (childrenOf(group).every((chip) => chip.hasAttribute('data-je-overflow')))
                    group.setAttribute('data-je-overflow', '');
            }
        }
        if (ctrl.layout === 'corners' && resolveLayout(ctrl).edge === 'flush') {
            for (const row of plan.rows) {
                const slot = row.slot.dataset.jeSlot;
                if (!['tc', 'bc'].includes(slot || ''))
                    continue;
                const last = Math.max(0, ...row.chips.map((chip, i) => row.shown[i] ? row.fittedRows?.[i] || 0 : 0), row.shown.includes(false) && row.more ? row.fittedMoreRow || 0 : 0);
                row.chips.forEach((chip, i) => {
                    chip.toggleAttribute('data-je-flush-top', slot === 'tc' && !row.slot.hasAttribute('data-je-flush-detached') && row.shown[i] && row.fittedRows?.[i] === 1);
                    chip.toggleAttribute('data-je-flush-bottom', slot === 'bc' && row.shown[i] && row.fittedRows?.[i] === last);
                });
                const more = moreChipOf(row.slot);
                const visible = row.more && row.shown.includes(false);
                more?.toggleAttribute('data-je-flush-top', visible && slot === 'tc' && !row.slot.hasAttribute('data-je-flush-detached') && row.fittedMoreRow === 1);
                more?.toggleAttribute('data-je-flush-bottom', visible && slot === 'bc' && row.fittedMoreRow === last);
            }
        }
        if (plan.pillFacts >= 0 && ctrl.pill) {
            Array.from(ctrl.pill.querySelectorAll<HTMLElement>('.je-tag-pill-fact')).slice(plan.pillFacts).forEach((fact) => {
                fact.setAttribute('data-je-overflow', '');
                fact.previousElementSibling?.setAttribute('data-je-overflow', '');
            });
        }
        const names = applyChipRows(plan.rows);
        describeHidden(ctrl, names);
        // A poster-stack group left with no chip takes no gap in the column either.
        for (const slot of posterStack(ctrl)) {
            for (const group of childrenOf(slot)) {
                const chips = childrenOf(group);
                if ((group).dataset.jeGroup && chips.length && chips.every((chip) => chip.hasAttribute('data-je-overflow')))
                    group.setAttribute('data-je-overflow', '');
            }
        }
        for (const { el, before } of plan.indicator) {
            const value = before === null ? '' : `${Math.round(before * 100) / 100}px`;
            if (el.style.getPropertyValue(INDICATOR_BEFORE) === value)
                continue;
            if (value)
                el.style.setProperty(INDICATOR_BEFORE, value);
            else
                el.style.removeProperty(INDICATOR_BEFORE);
        }
    }
    function applyChipRows(rows: FitPlan['rows']) {
        const names: string[] = [];
        for (const { slot, chips, shown, more: room } of rows) {
            const more = moreChipOf(slot);
            if (!more)
                continue;
            const hidden = chips.filter((chip, i) => !shown[i]);
            for (const chip of hidden)
                chip.setAttribute('data-je-overflow', '');
            names.push(...hidden.map(chipLabel).filter(Boolean));
            // Not a single row fits: no empty scrim either.
            if (!room && !shown.some(Boolean))
                slot.setAttribute('data-je-overflow', '');
            if (hidden.length === 0 || !room) {
                more.setAttribute('data-je-overflow', '');
                more.removeAttribute('title');
                continue;
            }
            more.textContent = `+${hidden.length}`;
            more.title = hidden.map(chipLabel).filter(Boolean).join(', ');
        }
        return names;
    }
    // ── Genre names ────────────────────────────────────────────────────
    // A genre icon's name floats out beside it while the card is hovered,
    // focused or revealed. Each name is bounded to the free room on its own
    // line: from its icon (plus a gap) to the nearest other chip on that line
    // or the card's inner edge, ellipsized past it, and hidden (the icon keeps
    // its title) when that leaves less than GENRE_NAME_MIN. Icons side by side
    // (a centre row, a band) would push their names into each other: there
    // the names become one list, a line each, below a top row or above a
    // bottom one, inside the card. The "+N" names tip then takes the first band
    // across the card that no chip or shown name touches (from the top down),
    // or is left out (it stays the card link's description). Measured for one
    // card when it is revealed (pointer, focus, a preview's Hover view), never
    // for every card at load.
    const GENRE_NAME_GAP = 4;
    const GENRE_NAME_MIN = 24;
    const GENRE_NAME_SHARE = 0.6;
    const genreAfterFit: Set<HTMLElement> = new Set();
    function isRevealed(host: HTMLElement) {
        const card = host.closest<HTMLElement>('.card, .je-mtp-card, .je-tie-card');
        if (!card)
            return false;
        try {
            return card.classList.contains('je-tag-reveal') || card.matches(':hover, :focus-within');
        }
        catch {
            return false;
        }
    }
    function fitReveal(host: HTMLElement | null | undefined) {
        if (!host)
            return;
        const ctrl = controllers.get(host);
        if (ctrl && fitScheduled && pendingFit.has(ctrl)) {
            genreAfterFit.add(host);
            return;
        }
        const names = (Array.from(host.querySelectorAll<HTMLElement>(':scope > .je-tag-slot:not([data-je-slot="hover"]) .genre-tag > .genre-text')));
        const tip = (host.querySelector<HTMLElement>(':scope > .je-tag-more-tip'));
        if (names.length === 0 && !tip)
            return;
        if (tip) {
            delete tip.dataset.jeTipFit;
            tip.style.removeProperty('top');
        }
        // Undo an earlier bound, so the names are read where the stylesheet puts them (one card, on demand).
        for (const name of names) {
            delete name.dataset.jeGenreFit;
            for (const prop of ['max-width', 'left', 'right', 'top', 'transform'])
                name.style.removeProperty(prop);
        }
        // Reads.
        const card = host.getBoundingClientRect();
        if (!(card.width > 0) || !(card.height > 0))
            return;
        const left = card.left + STACK_INSET;
        const right = card.right - STACK_INSET;
        const obstacles = (Array.from(host.querySelectorAll<HTMLElement>(':scope > .je-tag-slot:not([data-je-slot="hover"]) > [data-je-group] > *')))
            .map((el) => ({ el, r: el.getBoundingClientRect() })).filter(({ r }) => r.width > 0 && r.height > 0);
        const items = names.map((name) => {
            const tag = name.parentElement || name;
            const icon = tag.getBoundingClientRect();
            const box = name.getBoundingClientRect();
            // A name custom CSS shows inline (position: static) is not a floating name: left alone.
            const floating = getComputedStyle(name).position === 'absolute';
            return { tag, name, icon, floating, height: box.height, natural: box.width, floatsLeft: box.right <= icon.left + 0.5, borderLeft: tag.clientLeft, borderTop: tag.clientTop };
        }).filter((m) => m.icon.width > 0 && m.floating);
        // Icons side by side in one group: the names list under (or over) the row.
        const groups = new Map<HTMLElement | null, typeof items>();
        for (const item of items) {
            const group = item.tag.parentElement;
            if (!groups.has(group))
                groups.set(group, []);
            groups.get(group)?.push(item);
        }
        const writes: Array<{
            name: HTMLElement;
            mode: string;
            room: number;
            x?: number;
            y?: number;
        }> = [];
        for (const members of groups.values()) {
            const row = members.length > 1 && members.every((m) => Math.abs(m.icon.top - (members[0]?.icon.top || 0)) < 1);
            if (!row) {
                for (const m of members) {
                    // The name's line: centred on its icon.
                    const top = m.icon.top + (m.icon.height - m.height) / 2;
                    const bottom = top + m.height;
                    // The line must lie inside the card (a short image can push an icon past its edge).
                    let blocked = top < card.top - 0.5 || bottom > card.bottom + 0.5;
                    // The side the name floats to: from its icon (plus the gap) to the card's inner edge.
                    const near = m.floatsLeft ? m.icon.left - GENRE_NAME_GAP : m.icon.right + GENRE_NAME_GAP;
                    let limit = m.floatsLeft ? left : right;
                    for (const { el, r } of obstacles) {
                        if (el === m.tag || r.bottom <= top + 0.5 || r.top >= bottom - 0.5)
                            continue;
                        if (m.floatsLeft && r.left < m.icon.left - 0.5) {
                            // A chip on the name's line: the room ends a gap before it; one reaching the icon leaves none.
                            if (r.right <= near + 0.5)
                                limit = Math.max(limit, r.right + GENRE_NAME_GAP);
                            else
                                blocked = true;
                        }
                        if (!m.floatsLeft && r.right > m.icon.right + 0.5) {
                            if (r.left >= near - 0.5)
                                limit = Math.min(limit, r.left - GENRE_NAME_GAP);
                            else
                                blocked = true;
                        }
                    }
                    const room = blocked ? 0 : Math.floor(m.floatsLeft ? near - limit : limit - near);
                    const needed = Math.min(m.natural, Math.max(GENRE_NAME_MIN, GENRE_NAME_SHARE * m.natural));
                    writes.push({ name: m.name, mode: room < needed - 0.5 ? 'hidden' : 'side', room: Math.max(0, room) });
                }
                continue;
            }
            const rowLeft = Math.min(...members.map((m) => m.icon.left));
            const rowTop = Math.min(...members.map((m) => m.icon.top));
            const rowBottom = Math.max(...members.map((m) => m.icon.bottom));
            const below = (rowTop + rowBottom) / 2 < card.top + card.height / 2;
            const room = Math.floor(right - left);
            members.forEach((m, i) => {
                const width = Math.min(m.natural, room);
                const x = Math.min(Math.max(rowLeft, left), right - width);
                const line = m.height + 2;
                const y = below ? rowBottom + GENRE_NAME_GAP + i * line : rowTop - GENRE_NAME_GAP - (members.length - i) * line + 2;
                const inside = y >= card.top + STACK_INSET - 0.5 && y + m.height <= card.bottom - STACK_INSET + 0.5;
                // Offsets from the icon's padding box (the name's containing block).
                writes.push({ name: m.name, mode: inside ? 'list' : 'hidden', room, x: x - m.icon.left - m.borderLeft, y: y - m.icon.top - m.borderTop });
            });
        }
        // Writes.
        for (const w of writes) {
            w.name.dataset.jeGenreFit = w.mode;
            w.name.style.maxWidth = `${w.room}px`;
            if (w.mode !== 'list')
                continue;
            w.name.style.left = `${Math.round((w.x ?? 0) * 100) / 100}px`;
            w.name.style.right = 'auto';
            w.name.style.top = `${Math.round((w.y ?? 0) * 100) / 100}px`;
            w.name.style.transform = 'none';
        }
        if (tip)
            placeMoreTip(host, tip, card);
        host.dataset.jeGenreBound = '1';
    }
    function placeMoreTip(host: HTMLElement, tip: HTMLElement, card: DOMRect) {
        const box = tip.getBoundingClientRect();
        const busy = (Array.from(host.querySelectorAll<HTMLElement>(':scope > .je-tag-slot:not([data-je-slot="hover"]) > [data-je-group] > *, :scope > .je-tag-slot:not([data-je-slot="hover"]) .genre-tag > .genre-text')))
            .filter((el) => !el.matches('.genre-text') || (el.dataset.jeGenreFit !== 'hidden' && getComputedStyle(el).display !== 'none'))
            .map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
        const left = card.left + (card.width - box.width) / 2;
        const right = left + box.width;
        const free = (top: number) => busy.every((r) => r.right <= left - GENRE_NAME_GAP + 0.5 || r.left >= right + GENRE_NAME_GAP - 0.5
            || r.bottom <= top - GENRE_NAME_GAP + 0.5 || r.top >= top + box.height + GENRE_NAME_GAP - 0.5);
        // Candidate tops: the card's own inset, then a gap below every chip, nearest the top first.
        const tops = [card.top + STACK_INSET, ...busy.map((r) => r.bottom + GENRE_NAME_GAP)].sort((a, b) => a - b);
        const top = tops.find((y) => y >= card.top + STACK_INSET - 0.5 && y + box.height <= card.bottom - STACK_INSET + 0.5 && free(y));
        if (top === undefined) {
            tip.dataset.jeTipFit = 'hidden';
            return;
        }
        tip.dataset.jeTipFit = 'placed';
        tip.style.top = `${Math.round((top - card.top) * 100) / 100}px`;
    }
    let revealedCard: HTMLElement | null = null;
    function onReveal(event: Event) {
        const target = (event.target instanceof Element ? event.target : null);
        const card = target?.closest<HTMLElement>('.card');
        if (!card || card === revealedCard)
            return;
        revealedCard = card;
        fitReveal((card.querySelector<HTMLElement>('.je-tag-host')));
    }
    if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('pointerover', onReveal, { passive: true });
        document.addEventListener('focusin', onReveal);
        document.addEventListener('pointerout', (event) => {
            if (revealedCard && !(event.relatedTarget instanceof Node && revealedCard.contains(event.relatedTarget)))
                revealedCard = null;
        }, { passive: true });
    }
    // ── Hidden chip names ──────────────────────────────────────────────
    // A "+N" chip takes no pointer events and no focus (on the poster it
    // would take clicks from the card and Jellyfin's buttons). The names it
    // stands for are given to the card's own link instead: an accessible
    // description, and a small tooltip while the card is hovered or focused.
    const FOCUSABLE = 'a[href], button, [tabindex]:not([tabindex="-1"])';
    let moreTipSeq = 0;
    function cardLinkOf(host: HTMLElement) {
        const card = host.closest<HTMLElement>('.card, .listItem');
        const image = card?.querySelector<HTMLElement>(`.cardImageContainer:is(${FOCUSABLE})`);
        if (image)
            return (image);
        const around = host.parentElement?.closest<HTMLElement>(FOCUSABLE);
        if (around)
            return (around);
        return (card?.querySelector<HTMLElement>(FOCUSABLE) || null);
    }
    function toggleDescribedBy(el: HTMLElement, id: string, on: boolean) {
        const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter((t) => t && t !== id);
        if (on)
            ids.push(id);
        if (ids.length)
            el.setAttribute('aria-describedby', ids.join(' '));
        else
            el.removeAttribute('aria-describedby');
    }
    function describeHidden(ctrl: CardController, names: string[]) {
        const link = names.length ? cardLinkOf(ctrl.host) : null;
        if (ctrl.described && (ctrl.described !== link || !names.length) && ctrl.moreTip) {
            toggleDescribedBy(ctrl.described, ctrl.moreTip.id, false);
            ctrl.described = null;
        }
        if (!names.length) {
            ctrl.moreTip?.remove();
            ctrl.moreTip = null;
            return;
        }
        let tip = ctrl.moreTip;
        if (!tip || tip.parentElement !== ctrl.host) {
            tip?.remove();
            tip = document.createElement('span');
            tip.className = 'je-tag-more-tip';
            tip.id = `je-tag-more-${++moreTipSeq}`;
            tip.setAttribute('aria-hidden', 'true');
            ctrl.host.appendChild(tip);
            ctrl.moreTip = tip;
        }
        const list = names.join(', ');
        const label = typeof JE.t === 'function' ? JE.t('tag_layout_more_tags', { tags: list }) : '';
        const text = label && label !== 'tag_layout_more_tags' ? label : list;
        if (tip.textContent !== text)
            tip.textContent = text;
        if (link && link !== ctrl.described) {
            toggleDescribedBy(link, tip.id, true);
            ctrl.described = link;
        }
    }
    // ── Public operations ──────────────────────────────────────────────
    function commitGroup(target: HTMLElement, groupId: string, overlay: HTMLElement) {
        const group = normalizeGroup(groupId);
        if (!group || !target)
            return false;
        if (!overlay || overlay.children.length === 0) {
            removeGroup(target, group);
            return false;
        }
        const ctrl = controllerFor(target, true);
        if (!ctrl)
            return false;
        const conf = resolveLayout(ctrl);
        const previous = ctrl.groups.get(group);
        // A group keeps the place it first arrived at on this card, even after being removed and
        // drawn again (legacy documents order a slot by arrival).
        if (!ctrl.arrived)
            ctrl.arrived = new Map();
        if (!ctrl.arrived.has(group))
            ctrl.arrived.set(group, previous ? previous.seq : ++ctrl.seq);
        ctrl.groups.set(group, { master: overlay, seq: ctrl.arrived.get(group) ?? ctrl.seq });
        if (ctrl.layout !== conf.layout || ctrl.lookKey !== conf.lookKey) {
            presentAll(ctrl);
        }
        else if (!isAwaiting(ctrl.host)) {
            presentGroup(ctrl, conf, group);
            if (conf.layout === 'summary')
                refreshPill(ctrl, conf);
            syncIndicatorGap(ctrl, conf);
            scheduleFit(ctrl);
        }
        return true;
    }
    function removeGroup(target: HTMLElement, groupId: string) {
        const group = normalizeGroup(groupId);
        const ctrl = target ? controllerFor(target, false) : null;
        if (!group || !ctrl || !ctrl.groups.has(group))
            return;
        ctrl.groups.delete(group);
        removeNodes(ctrl, group);
        if (isAwaiting(ctrl.host))
            return;
        const conf = resolveLayout(ctrl);
        if (conf.layout === 'summary')
            refreshPill(ctrl, conf);
        syncIndicatorGap(ctrl, conf);
        scheduleFit(ctrl);
    }
    function hasGroup(target: HTMLElement, groupId: string) {
        const group = normalizeGroup(groupId);
        const ctrl = target ? controllerFor(target, false) : null;
        return !!(group && ctrl && ctrl.groups.has(group));
    }
    function getGroup(target: HTMLElement, groupId: string) {
        const group = normalizeGroup(groupId);
        const ctrl = target ? controllerFor(target, false) : null;
        return (group && ctrl?.groups.get(group)?.master) || null;
    }
    function refreshPresentation(targets?: HTMLElement | HTMLElement[]) {
        const list = targets === undefined
            ? Array.from(document.querySelectorAll<HTMLElement>('.je-tag-host'))
            : (Array.isArray(targets) ? targets : [targets]);
        for (const target of list) {
            const ctrl = controllerFor((target), false);
            if (ctrl && ctrl.host.isConnected)
                presentAll(ctrl);
        }
    }
    function describe(target: HTMLElement) {
        const ctrl = target ? controllerFor(target, false) : null;
        if (!ctrl)
            return [];
        const conf = resolveLayout(ctrl);
        return Array.from(ctrl.groups.entries())
            .sort((a, b) => a[1].seq - b[1].seq)
            .map(([group, rec]) => ({
            group,
            slot: conf.slots[group] === 'caption' && !ctrl.outlet ? 'poster' : (conf.slots[group] || 'off'),
            seq: rec.seq,
            element: ctrl.nodes.get(group)?.[0] || null,
        }));
    }
    function clearCard(target: HTMLElement) {
        // The user review key lives on the render target (the host, or the
        // image of a card without one): a lookup still out for the old item
        // checks it before adding its chip.
        if (target?.dataset)
            delete target.dataset.jeReviewKey;
        if (target)
            cardData.delete(target);
        const host = findHost(target);
        if (!host)
            return;
        cardData.delete(host);
        if (host.parentElement)
            cardData.delete(host.parentElement);
        delete host.dataset.jeReviewKey;
        endAwait(host);
        const ctrl = host ? controllers.get(host) : null;
        if (!ctrl)
            return;
        forget(ctrl);
    }
    function forget(ctrl: CardController) {
        // A reused host may already be waiting for the replacement item.
        // Retiring its old controller must cancel only the old item's hold.
        if (contextOf(awaitingData, ctrl.host)?.cardId === ctrl.itemId)
            endAwait(ctrl.host);
        teardown(ctrl);
        controllers.delete(ctrl.host);
        unwatchSize(ctrl.host);
        // Its artwork watch (tags/tag-poster-colours.js) goes with it.
        JE.tagPosterColours?.release(ctrl.host);
    }
    function removeGroupEverywhere(groupId: string) {
        for (const host of document.querySelectorAll<HTMLElement>('.je-tag-host')) {
            const reserve = reservesCaption(resolveLayout(controllers.get(host) || host), host);
            removeGroup((host), groupId);
            // The group was the last one switched on that could fill the
            // caption strip: give the reserved space back.
            const ctrl = reserve ? null : controllers.get((host));
            if (ctrl?.outlet && !holdsGroups(ctrl.outlet)) {
                ctrl.outlet.remove();
                ctrl.outlet = null;
            }
        }
    }
    function clearAll() {
        for (const host of document.querySelectorAll<HTMLElement>('.je-tag-host'))
            clearCard((host));
        document.querySelectorAll<HTMLElement>('.je-tag-caption').forEach((el) => el.remove());
        document.querySelectorAll<HTMLElement>('[data-je-review-key]').forEach((el) => { delete (el).dataset.jeReviewKey; });
    }
    function prepareCard(target: HTMLElement) {
        if (!target || !reservesCaption(resolveLayout(findHost(target) || target), target))
            return;
        const host = ensureHost(target);
        if (!host || isIgnoredContext(host))
            return;
        const ctrl = controllerFor(host, true);
        // A card presented while nothing could fill the strip has no outlet yet.
        if (ctrl && (ctrl.layout !== 'caption' || (!ctrl.outlet?.isConnected && captionAnchor(ctrl.host))))
            presentAll(ctrl);
    }
    function syncBodyClasses() {
        if (!document.body)
            return;
        document.body.classList.toggle('je-tags-hide-on-hover', !!JE.currentSettings?.tagsHideOnHover);
    }
    let reinitPending: Promise<void> | null = null;
    function reinitialize() {
        invalidateSettings();
        syncBodyClasses();
        if (reinitPending)
            return reinitPending;
        reinitPending = Promise.resolve().then(() => {
            reinitPending = null;
            invalidateSettings();
            const owned = new Set();
            for (const host of document.querySelectorAll<HTMLElement>('.je-tag-host')) {
                const el = (host);
                const reserve = reservesCaption(resolveLayout(controllers.get(el) || el), el);
                const ctrl = controllerFor(el, reserve && !isIgnoredContext(el));
                if (!ctrl)
                    continue;
                presentAll(ctrl);
                if (ctrl.outlet)
                    owned.add(ctrl.outlet);
            }
            document.querySelectorAll<HTMLElement>('.je-tag-caption').forEach((el) => { if (!owned.has(el))
                el.remove(); });
            document.dispatchEvent(new CustomEvent('je:tag-layout-changed'));
        });
        return reinitPending;
    }
    // A user switch: forget the outgoing user's settings and every fact their
    // cards hold (they may be spoiler-stripped differently for the incoming
    // user), including the item data kept for hosts without a controller and
    // the waits for it; the pipeline re-renders the cards, and
    // je:user-data-loaded re-applies the incoming user's layout.
    JE.session?.onUserChange?.('tag-layout', () => {
        invalidateSettings();
        // Clear first so every hold's timer is cancelled through clearCard,
        // then forget whatever a host without a controller still kept.
        clearAll();
        cardData = new WeakMap();
        awaitingData = new WeakMap();
    });
    // Explicit translatable vocabularies keep callers independent of locale key names.
    const VOCABULARY_KEYS: Record<'type' | 'layout' | 'edge' | 'gap' | 'preset' | 'group' | 'slot' | 'language' | 'tab' | 'adminTab' | 'field' | 'builtin', Record<string, string>> = { group: {}, slot: {}, language: {}, tab: {}, adminTab: {}, field: {}, builtin: {},
        "type": {
            "movie": "jellyseerr_card_badge_movie",
            "series": "tag_looks_type_series",
            "season": "jellyseerr_report_issue_season",
            "episode": "jellyseerr_report_issue_episode",
            "boxset": "jellyseerr_card_badge_collection",
            "video": "jellyseerr_report_issue_type_video"
        },
        "layout": {
            "corners": "tag_looks_layout_corners",
            "bands": "tag_looks_layout_bands",
            "caption": "panel_settings_ui_tag_slot_caption_caption",
            "summary": "tag_layout_summary",
            "minimal": "tag_looks_layout_minimal"
        },
        "edge": {
            "default": "common_default",
            "tight": "panel_settings_ui_tag_edge_tight",
            "flush": "panel_settings_ui_tag_edge_flush"
        },
        "gap": {
            "tight": "panel_settings_ui_tag_edge_tight",
            "default": "common_default",
            "roomy": "tag_gap_roomy"
        },
        "preset": {
            "default": "common_default",
            "glass": "panel_settings_ui_tag_style_preset_glass",
            "outline": "panel_settings_ui_tag_style_preset_outline",
            "dark": "panel_settings_ui_tag_style_preset_dark",
            "light": "panel_settings_ui_tag_style_preset_light",
            "mono": "panel_settings_ui_tag_style_preset_mono",
            "poster": "panel_settings_ui_tag_style_preset_poster"
        }
    };
    VOCABULARY_KEYS.group = {
        "status": "panel_settings_ui_tag_group_status",
        "quality": "panel_settings_ui_tag_group_quality",
        "rating": "panel_settings_ui_tag_group_rating",
        "age_rating": "panel_settings_ui_tag_group_age_rating",
        "logos": "common_logos",
        "language": "panel_settings_ui_tag_group_language",
        "genre": "common_genre",
        "custom": "common_custom",
        "awards": "awards_label"
    };
    VOCABULARY_KEYS.slot = {
        "off": "panel_settings_ui_tag_slot_off",
        "corners_tl": "panel_settings_ui_tag_slot_corners_tl",
        "corners_tc": "panel_settings_ui_tag_slot_corners_tc",
        "corners_bc": "panel_settings_ui_tag_slot_corners_bc",
        "corners_ml": "panel_settings_ui_tag_slot_corners_ml",
        "corners_mr": "panel_settings_ui_tag_slot_corners_mr",
        "corners_c": "panel_settings_ui_tag_slot_corners_c",
        "corners_tr": "panel_settings_ui_tag_slot_corners_tr",
        "corners_bl": "panel_settings_ui_tag_slot_corners_bl",
        "corners_br": "panel_settings_ui_tag_slot_corners_br",
        "bands_top": "panel_settings_ui_tag_slot_bands_top",
        "bands_bottom": "panel_settings_ui_tag_slot_bands_bottom",
        "caption_poster": "panel_settings_ui_tag_slot_caption_poster",
        "caption_caption": "panel_settings_ui_tag_slot_caption_caption",
        "summary_pill": "panel_settings_ui_tag_slot_summary_pill",
        "summary_hover": "panel_settings_ui_tag_slot_summary_hover",
        "minimal_top": "panel_settings_ui_tag_slot_minimal_top",
        "minimal_dots": "panel_settings_ui_tag_slot_minimal_dots",
        "minimal_corner": "panel_settings_ui_tag_slot_minimal_corner",
        "minimal_hover": "panel_settings_ui_tag_slot_summary_hover"
    };
    VOCABULARY_KEYS.language = {
        "partial_tooltip": "language_tags_partial_tooltip",
        "audio": "jellyseerr_report_issue_type_audio",
        "subtitles": "jellyseerr_report_issue_type_subtitles",
        "style": "panel_settings_subtitles_style",
        "flags": "language_tags_flags",
        "codes": "language_tags_codes",
        "count_badge": "language_tags_count_badge",
        "badge_off": "track_off",
        "badge_only": "language_tags_badge_only",
        "badge_both": "language_tags_badge_both",
        "dual": "language_tags_dual",
        "multi": "language_tags_multi",
        "count_tooltip": "language_tags_count_tooltip",
        "subtitles_sdh": "language_tags_subtitles_sdh"
    };
    VOCABULARY_KEYS.tab = {
        "layout": "common_layout",
        "groups": "common_groups",
        "badges": "panel_media_tags_tab_badges",
        "badges_short": "common_badges",
        "rules": "panel_media_tags_tab_rules",
        "rules_short": "common_rules",
        "colours": "common_colours",
        "server": "common_server",
        "server_name": "panel_media_tags_tab_server_name"
    };
    VOCABULARY_KEYS.adminTab = {
        "overview": "admin_tags_tab_overview",
        "layout": "admin_tags_tab_layout",
        "groups": "common_groups",
        "rules": "common_rules",
        "colours": "common_colours",
        "badges": "panel_media_tags_tab_badges",
        "server": "common_server",
    };
    VOCABULARY_KEYS.field = {
        "library": "tag_looks_field_library",
        "type": "tag_looks_field_type",
        "genre": "common_genre",
        "agerating": "tag_looks_field_agerating"
    };
    VOCABULARY_KEYS.builtin = {
        "cinephile": "tag_presets_builtin_cinephile",
        "cinephile_desc": "tag_presets_builtin_cinephile_desc",
        "minimal": "tag_looks_layout_minimal",
        "minimal_desc": "tag_presets_builtin_minimal_desc",
        "kids": "tag_presets_builtin_kids",
        "kids_desc": "tag_presets_builtin_kids_desc"
    };
    function sizeLabel(kind: string, value: string) {
        return kind === 'scale' ? `${Math.round((TAG_SCALES[value] ?? 1) * 100)}%` : JE.t(VOCABULARY_KEYS.gap[value] || '');
    }
    const api = {
        sizeLabel,
        VOCABULARY_KEYS,
        isLegacySettings,
        GROUPS: DEFAULT_ORDER.slice(),
        LAYOUT_SLOTS,
        DEFAULT_ORDER: DEFAULT_ORDER.slice(),
        DEFAULT_CAPS: { ...DEFAULT_CAPS },
        MAX_CAP,
        preserveLegacySizing,
        TAG_SCALES,
        TAG_GAPS,
        readScale,
        readGap,
        EDGE_SPACINGS: { ...EDGE_SPACINGS },
        DEFAULT_PROFILES,
        SHAPES: SHAPES.slice(),
        RECOMMENDED_SHAPES,
        CONTAINER_CLASS,
        SLOT_TO_POSITION,
        POSITION_TO_SLOT,
        POSITION_SETTINGS,
        buildStyles: null as (() => string) | null,
        normalizeGroup,
        readEdge,
        normalizeSettings,
        promoteLegacySettings,
        invalidateSettings,
        resolveLayout,
        lookSource,
        setPreviewLook,
        shapeOf,
        shapeOfCard,
        readShapeOverrides,
        shapesToWire,
        setCardContext,
        cardIdentity,
        awaitCardContext,
        releaseCardContext,
        resumePresentation,
        ensureHost,
        commitGroup,
        removeGroup,
        hasGroup,
        getGroup,
        refreshPresentation,
        describe,
        clearCard,
        clearAll,
        removeGroupEverywhere,
        prepareCard,
        compactQualityLabel,
        singleChipGroup,
        reinitialize,
        flushFit,
        fitReveal,
        chipsThatFit,
        rowsHeight,
        rowBudget,
        isGroup: (name: unknown) => normalizeGroup(name) !== null,
    };
    return api;
}
export type TagLayout = ReturnType<typeof createTagLayout>;
