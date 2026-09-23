// Quality badge presentation policy: category metadata, normalization, and ordering.
// Pure inputs make user preference precedence testable without a browser.
(function (JE) {
    'use strict';

    // Within-category sort orders (more important = lower index inside each category).
    const resolutionOrder = ['8K', '4K', '1440p', '1080p', '720p', '576p', '480p', 'LOW-RES', 'SD'];
    const sourceOrder = ['BluRay', 'HD DVD', 'DVD', 'VHS', 'HDTV', 'Physical'];
    const dynamicRangeOrder = ['Dolby Vision', 'HDR10+', 'HDR10', 'HDR'];
    const specialFormatOrder = ['IMAX', '3D'];
    const codecOrder = ['AV1', 'HEVC', 'H265', 'VP9', 'H264', 'VP8', 'XVID', 'DIVX', 'WMV', 'MPEG2', 'MPEG4', 'MJPEG', 'THEORA'];
    const audioOrder = ['ATMOS', 'DTS-X', 'TRUEHD', 'DTS', 'Dolby Digital+', '7.1', '5.1'];

    // showXxxTag = enable, xxxTagOrder = 1..N stack position.
    const CATEGORIES = [
        { key: 'resolution',    items: resolutionOrder,    settingKey: 'showResolutionTag',    pluginKey: 'ShowResolutionTag',    orderUserKey: 'resolutionTagOrder',    orderPluginKey: 'ResolutionTagOrder',    defaultOrder: 1 },
        { key: 'source',        items: sourceOrder,        settingKey: 'showSourceTag',        pluginKey: 'ShowSourceTag',        orderUserKey: 'sourceTagOrder',        orderPluginKey: 'SourceTagOrder',        defaultOrder: 2 },
        { key: 'dynamicRange',  items: dynamicRangeOrder,  settingKey: 'showDynamicRangeTag',  pluginKey: 'ShowDynamicRangeTag',  orderUserKey: 'dynamicRangeTagOrder',  orderPluginKey: 'DynamicRangeTagOrder',  defaultOrder: 3 },
        { key: 'specialFormat', items: specialFormatOrder, settingKey: 'showSpecialFormatTag', pluginKey: 'ShowSpecialFormatTag', orderUserKey: 'specialFormatTagOrder', orderPluginKey: 'SpecialFormatTagOrder', defaultOrder: 4 },
        { key: 'videoCodec',    items: codecOrder,         settingKey: 'showVideoCodecTag',    pluginKey: 'ShowVideoCodecTag',    orderUserKey: 'videoCodecTagOrder',    orderPluginKey: 'VideoCodecTagOrder',    defaultOrder: 5 },
        { key: 'audio',         items: audioOrder,         settingKey: 'showAudioInfoTag',     pluginKey: 'ShowAudioInfoTag',     orderUserKey: 'audioInfoTagOrder',     orderPluginKey: 'AudioInfoTagOrder',     defaultOrder: 6 },
    ];

    const TAG_TO_CATEGORY = new Map();
    for (const cat of CATEGORIES) {
        for (const item of cat.items) TAG_TO_CATEGORY.set(item, cat.key);
    }
    const CATEGORY_BY_KEY = new Map(CATEGORIES.map(c => [c.key, c]));

    // Color definitions for each quality tag.
    const qualityColors = {
        '8K': { bg: 'rgba(220, 20, 60, 0.95)', text: '#ffffff' },
        '4K': { bg: 'rgba(189, 5, 232, 0.95)', text: '#ffffff' },
        '1440p': { bg: 'rgba(255, 20, 147, 0.9)', text: '#ffffff' },
        '1080p': { bg: 'rgba(0, 191, 255, 0.9)', text: '#ffffff' },
        '720p': { bg: 'rgba(255, 165, 0, 0.9)', text: '#000000' },
        '576p': { bg: 'rgba(255, 179, 0, 0.85)', text: '#000000' },
        '480p': { bg: 'rgba(255, 193, 7, 0.85)', text: '#000000' },
        'SD': { bg: 'rgba(108, 117, 125, 0.85)', text: '#ffffff' },
        'HDR': { bg: 'rgba(255, 215, 0, 0.95)', text: '#000000' },
        'HDR10': { bg: 'rgba(255, 215, 0, 0.95)', text: '#000000' },
        'HDR10+': { bg: 'rgba(255, 215, 0, 0.95)', text: '#000000' },
        'Dolby Vision': { bg: 'rgba(139, 69, 19, 0.95)', text: '#ffffff' },
        'IMAX': { bg: 'rgba(0, 114, 206, 0.9)', text: '#ffffff' },
        'ATMOS': { bg: 'rgba(0, 100, 255, 0.9)', text: '#ffffff' },
        'DTS-X': { bg: 'rgba(255, 100, 0, 0.9)', text: '#ffffff' },
        'DTS': { bg: 'rgba(255, 140, 0, 0.85)', text: '#ffffff' },
        'Dolby Digital+': { bg: 'rgba(0, 150, 136, 0.9)', text: '#ffffff' },
        'TRUEHD': { bg: 'rgba(76, 175, 80, 0.9)', text: '#ffffff' },
        '7.1': { bg: 'rgba(156, 39, 176, 0.9)', text: '#ffffff' },
        '5.1': { bg: 'rgba(103, 58, 183, 0.9)', text: '#ffffff' },
        '3D': { bg: 'rgba(0, 150, 255, 0.9)', text: '#ffffff' },
        'AV1': { bg: 'rgba(255, 87, 34, 0.95)', text: '#ffffff' },
        'HEVC': { bg: 'rgba(33, 150, 243, 0.9)', text: '#ffffff' },
        'H265': { bg: 'rgba(63, 81, 181, 0.9)', text: '#ffffff' },
        'VP9': { bg: 'rgba(156, 39, 176, 0.9)', text: '#ffffff' },
        'H264': { bg: 'rgba(76, 175, 80, 0.9)', text: '#ffffff' },
        'VP8': { bg: 'rgba(121, 85, 72, 0.9)', text: '#ffffff' },
        'XVID': { bg: 'rgba(255, 152, 0, 0.9)', text: '#ffffff' },
        'DIVX': { bg: 'rgba(255, 193, 7, 0.9)', text: '#000000' },
        'WMV': { bg: 'rgba(0, 188, 212, 0.9)', text: '#ffffff' },
        'MPEG2': { bg: 'rgba(96, 125, 139, 0.9)', text: '#ffffff' },
        'MPEG4': { bg: 'rgba(158, 158, 158, 0.9)', text: '#ffffff' },
        'MJPEG': { bg: 'rgba(233, 30, 99, 0.9)', text: '#ffffff' },
        'THEORA': { bg: 'rgba(139, 195, 74, 0.9)', text: '#ffffff' },
        'BluRay': { bg: 'rgba(0, 102, 204, 0.95)', text: '#ffffff' },
        'HD DVD': { bg: 'rgba(128, 0, 32, 0.95)', text: '#ffffff' },
        'DVD': { bg: 'rgba(153, 76, 0, 0.95)', text: '#ffffff' },
        'VHS': { bg: 'rgba(139, 69, 19, 0.95)', text: '#ffffff' },
        'HDTV': { bg: 'rgba(192, 192, 192, 0.9)', text: '#000000' },
        'Physical': { bg: 'rgba(102, 102, 102, 0.9)', text: '#ffffff' }
    };

    /**
     * Normalizes dynamic quality labels to their base key for sorting and CSS color matching.
     * @param {string} label - The quality label to normalize.
     * @returns {string} The normalized base label.
     */
    function normalizeQualityLabel(label) {
        if (!label || typeof label !== 'string') return label;

        const audioBases = ['Dolby Digital+', 'ATMOS', 'DTS-X', 'TRUEHD', 'DTS'];
        for (const base of audioBases) {
            if (label === base || label.startsWith(`${base} `)) {
                return base;
            }
        }

        return label;
    }

    /**
     * Determines which category a quality tag belongs to
     * @param {string} tag - A quality tag, possibly composite (e.g. "ATMOS 7.1")
     * @returns {string|null} The category key, or null if uncategorized
     */
    function categorize(tag) {
        const norm = normalizeQualityLabel(tag);
        const direct = TAG_TO_CATEGORY.get(norm);
        if (direct) return direct;
        // Bare channel layouts (e.g. "2.0") fall into audio.
        if (/^\d+\.\d+$/.test(tag)) return 'audio';
        return null;
    }

    /** Select and order labels without modifying the caller's detected qualities. */
    function selectLabels(qualities, settings = {}) {
        // Bucket each tag by category. Disabled categories drop their tags.
        // Uncategorized labels (e.g. stale cache entries from a prior plugin
        // version) collect in `otherBucket` so they still render — preserves
        // the pre-PR `.other-quality` rendering behavior.
        const buckets = new Map();
        const otherBucket = [];
        for (const q of qualities) {
            const catKey = categorize(q);
            if (catKey) {
                const cat = CATEGORY_BY_KEY.get(catKey);
                if (!(typeof settings[cat.settingKey] === 'boolean' ? settings[cat.settingKey] : true)) continue;
                if (!buckets.has(catKey)) buckets.set(catKey, []);
                buckets.get(catKey).push(q);
            } else {
                otherBucket.push(q);
            }
        }
        // Sort each bucket by within-category priority and keep only the best resolution
        for (const [catKey, tags] of buckets) {
            const cat = CATEGORY_BY_KEY.get(catKey);
            tags.sort((a, b) => {
                const aKey = normalizeQualityLabel(a);
                const bKey = normalizeQualityLabel(b);
                const aIdx = cat.items.indexOf(aKey);
                const bIdx = cat.items.indexOf(bKey);
                return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
            });
            if (catKey === 'resolution' && tags.length > 1) tags.length = 1;
        }

        // Sort categories by user stack order, tie-broken by defaultOrder for determinism
        const categoriesSorted = [...buckets.keys()].map((key) => {
            const cat = CATEGORY_BY_KEY.get(key);
            return {
                key,
                cat,
                order: (Number.isFinite(settings[cat.orderUserKey]) ? settings[cat.orderUserKey] : cat.defaultOrder),
            };
        }).sort((a, b) => {
            if (a.order !== b.order) return a.order - b.order;
            return a.cat.defaultOrder - b.cat.defaultOrder;
        });

        return categoriesSorted.flatMap(({ key }) => buckets.get(key)).concat(otherBucket);
    }

    /** Preserve the established badge classes used by custom CSS. */
    function classForLabel(label) {
        const category = categorize(label);
        if (category === 'resolution') return 'resolution';
        if (category === 'videoCodec') return 'video-format';
        if (category === 'dynamicRange' || category === 'specialFormat') return 'video-codec';
        // Bare channel labels other than 7.1/5.1 historically use other-quality.
        if (audioOrder.includes(normalizeQualityLabel(label))) return 'audio-codec';
        return 'other-quality';
    }

    JE.tags = JE.tags || {};
    JE.tags.qualityPolicy = { normalizeQualityLabel, selectLabels, classForLabel, qualityColors };
})(window.JellyfinEnhanced);
