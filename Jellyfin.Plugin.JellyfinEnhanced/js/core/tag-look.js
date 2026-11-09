(() => {
"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // client/src/features/media-tags/rules-host.ts
  function tagRulesHost() {
    const host = window;
    if (!host.JellyfinEnhanced)
      throw new Error("Jellyfin Enhanced must load before tag rules");
    return host.JellyfinEnhanced;
  }
  function lookApiClient() {
    const host = window;
    if (!host.ApiClient)
      throw new Error("Jellyfin client is unavailable");
    return host.ApiClient;
  }
  function captureTagSession(bridge2) {
    const identity = () => {
      try {
        const client = lookApiClient();
        const server = (typeof client.serverId === "function" ? client.serverId() : client.serverId) || client._serverInfo?.Id;
        return `${server || ""}|${client.getCurrentUserId?.() || ""}`;
      } catch {
        return "|";
      }
    };
    const owner = identity();
    const epoch = bridge2.session?.getEpoch?.();
    return () => owner === identity() && epoch === bridge2.session?.getEpoch?.();
  }

  // client/src/features/media-tags/layout/layout-rules.ts
  var layout_rules_exports = {};
  __export(layout_rules_exports, {
    DEFAULT_CAPS: () => DEFAULT_CAPS,
    DEFAULT_ORDER: () => DEFAULT_ORDER,
    DEFAULT_PROFILES: () => DEFAULT_PROFILES,
    EDGE_SPACINGS: () => EDGE_SPACINGS,
    ENABLED_SETTING: () => ENABLED_SETTING,
    GROUPS: () => GROUPS,
    LAYOUTS: () => LAYOUTS,
    LAYOUT_SLOTS: () => LAYOUT_SLOTS,
    MAX_CAP: () => MAX_CAP,
    POSITION_SETTINGS: () => POSITION_SETTINGS,
    POSITION_TO_SLOT: () => POSITION_TO_SLOT,
    RECOMMENDED_SHAPES: () => RECOMMENDED_SHAPES,
    SHAPES: () => SHAPES,
    SLOT_TO_POSITION: () => SLOT_TO_POSITION,
    TAG_GAPS: () => TAG_GAPS,
    TAG_SCALES: () => TAG_SCALES,
    hasOwn: () => hasOwn,
    isLayout: () => isLayout,
    isLegacySettings: () => isLegacySettings,
    lookKeyOf: () => lookKeyOf,
    lookSettings: () => lookSettings,
    normalizeGroup: () => normalizeGroup,
    normalizeGroupCaps: () => normalizeGroupCaps,
    normalizeLayout: () => normalizeLayout,
    normalizeSettings: () => normalizeSettings,
    pick: () => pick,
    positionSlot: () => positionSlot,
    promoteLegacySettings: () => promoteLegacySettings,
    readCap: () => readCap,
    readEdge: () => readEdge,
    readGap: () => readGap,
    readOrder: () => readOrder,
    readProfile: () => readProfile,
    readScale: () => readScale,
    readShapeLook: () => readShapeLook,
    readShapeOverrides: () => readShapeOverrides,
    shapesToWire: () => shapesToWire,
    singleChipGroup: () => singleChipGroup,
    validSlots: () => validSlots,
    withShape: () => withShape
  });
  var hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  function isLayout(value) {
    return LAYOUTS.some((layout) => layout === value);
  }
  var DEFAULT_ORDER = ["status", "quality", "rating", "ageRating", "language", "genre", "awards", "logos", "custom"];
  var GROUPS = new Set(DEFAULT_ORDER);
  var LAYOUT_SLOTS = withoutPrototype({
    corners: ["tl", "tc", "tr", "ml", "c", "mr", "bl", "bc", "br", "off"],
    bands: ["top", "bottom", "off"],
    caption: ["poster", "caption", "off"],
    summary: ["pill", "hover", "off"],
    minimal: ["top", "dots", "corner", "hover", "off"]
  });
  var LAYOUTS = ["corners", "bands", "caption", "summary", "minimal"];
  var DEFAULT_PROFILES = {
    bands: { quality: "bottom", genre: "off", language: "bottom", rating: "bottom", ageRating: "top", status: "top", awards: "bottom", logos: "top", custom: "bottom" },
    caption: { quality: "caption", genre: "off", language: "caption", rating: "caption", ageRating: "caption", status: "poster", awards: "caption", logos: "caption", custom: "caption" },
    summary: { quality: "pill", genre: "hover", language: "hover", rating: "pill", ageRating: "hover", status: "pill", awards: "hover", logos: "hover", custom: "hover" },
    minimal: { quality: "dots", genre: "hover", language: "hover", rating: "corner", ageRating: "hover", status: "top", awards: "hover", logos: "hover", custom: "hover" }
  };
  var SHAPES = ["landscape", "list"];
  var RECOMMENDED_SHAPES = {
    landscape: {
      layout: "bands",
      density: "compact",
      caps: null,
      slots: { status: "top", ageRating: "top", quality: "bottom", rating: "bottom", language: "off", genre: "off", custom: "off" }
    },
    list: {
      layout: "corners",
      density: "compact",
      caps: { quality: 2, status: 2, rating: 2 },
      slots: { quality: "tl", status: "tr", rating: "br", ageRating: "off", language: "off", genre: "off", custom: "off" }
    }
  };
  var EDGE_SPACINGS = withoutPrototype({ default: 6, tight: 3, flush: 0 });
  var DEFAULT_CAPS = { quality: 0, genre: 3, language: 3, rating: 0, ageRating: 1, status: 1, awards: 2, logos: 0, custom: 3 };
  var MAX_CAP = 10;
  var TAG_SCALES = { smaller: 0.85, default: 1, larger: 1.15, largest: 1.3 };
  var TAG_GAPS = { tight: 0.75, default: 1, roomy: 1.5 };
  function readScale(value) {
    const key = typeof value === "string" ? value.trim().toLowerCase() : "";
    return hasOwn(TAG_SCALES, key) ? key : null;
  }
  function readGap(value) {
    const key = typeof value === "string" ? value.trim().toLowerCase() : "";
    return hasOwn(TAG_GAPS, key) ? key : null;
  }
  var POSITION_SETTINGS = {
    quality: { userKey: "qualityTagsPosition", pluginKey: "QualityTagsPosition", fallback: "top-left" },
    genre: { userKey: "genreTagsPosition", pluginKey: "GenreTagsPosition", fallback: "top-right" },
    language: { userKey: "languageTagsPosition", pluginKey: "LanguageTagsPosition", fallback: "bottom-left" },
    rating: { userKey: "ratingTagsPosition", pluginKey: "RatingTagsPosition", fallback: "bottom-right" },
    ageRating: { userKey: "ageRatingTagsPosition", pluginKey: "AgeRatingTagsPosition", fallback: "bottom-right" },
    awards: { userKey: "awardsTagsPosition", pluginKey: "AwardsTagsPosition", fallback: "top-left" },
    status: { userKey: "statusTagsPosition", pluginKey: "StatusTagsPosition", fallback: "top-right" },
    logos: { userKey: "logoTagsPosition", pluginKey: "LogoTagsPosition", fallback: "bottom-left" },
    custom: { userKey: "customTagsPosition", pluginKey: "CustomTagsPosition", fallback: "top-left" }
  };
  var POSITION_TO_SLOT = withoutPrototype({ "top-left": "tl", "top-right": "tr", "bottom-left": "bl", "bottom-right": "br", "top-center": "tc", "bottom-center": "bc", "center-left": "ml", "center-right": "mr", "center": "c" });
  var ENABLED_SETTING = {
    quality: "qualityTagsEnabled",
    genre: "genreTagsEnabled",
    language: "languageTagsEnabled",
    rating: "ratingTagsEnabled",
    ageRating: "ageRatingTagsEnabled",
    status: "statusTagsEnabled",
    awards: "awardsTagsEnabled",
    logos: "logoTagsEnabled",
    custom: "customTagsEnabled"
  };
  var SLOT_TO_POSITION = withoutPrototype({ tl: "top-left", tr: "top-right", bl: "bottom-left", br: "bottom-right", tc: "top-center", bc: "bottom-center", ml: "center-left", mr: "center-right", c: "center" });
  function pick(obj, key) {
    if (!obj || typeof obj !== "object")
      return void 0;
    const record = Object.fromEntries(Object.entries(obj));
    const pascal = key.charAt(0).toUpperCase() + key.slice(1);
    return (hasOwn(record, key) ? record[key] : void 0) ?? (hasOwn(record, pascal) ? record[pascal] : void 0) ?? void 0;
  }
  function normalizeGroup(name) {
    if (typeof name !== "string")
      return null;
    const lowered = name.trim().toLowerCase();
    for (const group of DEFAULT_ORDER) {
      if (group.toLowerCase() === lowered)
        return group;
    }
    return null;
  }
  function normalizeLayout(value) {
    const lowered = typeof value === "string" ? value.trim().toLowerCase() : "";
    return isLayout(lowered) ? lowered : "corners";
  }
  function readProfile(profiles, layout) {
    const out = {};
    const groups = pick(pick(profiles, layout), "groups");
    if (!Array.isArray(groups))
      return out;
    for (const entry of groups) {
      const group = normalizeGroup(pick(entry, "group"));
      const raw = pick(entry, "slot");
      const slot = typeof raw === "string" ? raw.trim().toLowerCase() : "";
      if (!group || out[group] || !LAYOUT_SLOTS[layout].includes(slot))
        continue;
      if (slot === "dots" && group !== "quality")
        continue;
      out[normalizeGroup(group) || "quality"] = slot;
    }
    return out;
  }
  function readOrder(order) {
    if (!Array.isArray(order))
      return null;
    const out = [];
    for (const entry of order) {
      const group = normalizeGroup(entry);
      if (group && !out.includes(group))
        out.push(group);
    }
    return out.length ? out : null;
  }
  function readEdge(value) {
    if (value === null || value === void 0 || value === "")
      return null;
    const lowered = String(value).trim().toLowerCase();
    return hasOwn(EDGE_SPACINGS, lowered) ? lowered : "default";
  }
  function readCap(value) {
    const n = Number(value);
    if (value === null || value === void 0 || value === "" || !Number.isFinite(n))
      return void 0;
    return Math.max(0, Math.min(MAX_CAP, Math.round(n)));
  }
  function singleChipGroup(group, config = {}) {
    return group === "status" || group === "ageRating" || group === "logos" && Number(pick(config, "logoTagsMaxLogos") ?? 1) < 2;
  }
  function normalizeGroupCaps(caps, config = {}) {
    return { ...caps, ...Object.fromEntries(DEFAULT_ORDER.map((group) => [group, singleChipGroup(group, config) ? 1 : caps[group]])) };
  }
  function readShapeLook(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      return null;
    const layoutRaw = pick(raw, "layout");
    const candidate = typeof layoutRaw === "string" ? layoutRaw.trim().toLowerCase() : "";
    const layout = isLayout(candidate) ? candidate : null;
    const densityRaw = String(pick(raw, "density") ?? "").trim().toLowerCase();
    const slotsRaw = pick(raw, "slots");
    const slots = {};
    const pairs = Array.isArray(slotsRaw) ? slotsRaw.map((entry) => [pick(entry, "group"), pick(entry, "slot")]) : slotsRaw && typeof slotsRaw === "object" ? Object.entries(slotsRaw) : [];
    const valid = layout ? LAYOUT_SLOTS[layout] : LAYOUTS.flatMap((name) => LAYOUT_SLOTS[name]);
    for (const [rawGroup, rawSlot] of pairs) {
      const group = normalizeGroup(rawGroup);
      const slot = typeof rawSlot === "string" ? rawSlot.trim().toLowerCase() : "";
      if (!group || slots[group] || !valid.includes(slot) || slot === "dots" && group !== "quality")
        continue;
      slots[group] = slot;
    }
    const caps = {};
    const capsRaw = pick(raw, "caps");
    for (const group of DEFAULT_ORDER) {
      const cap = readCap(pick(capsRaw, group));
      if (cap !== void 0)
        caps[group] = cap;
    }
    return {
      layout,
      density: densityRaw === "compact" || densityRaw === "full" ? densityRaw : null,
      ...readScale(pick(raw, "tagScale")) ? { tagScale: readScale(pick(raw, "tagScale")) } : {},
      ...readGap(pick(raw, "tagGap")) ? { tagGap: readGap(pick(raw, "tagGap")) } : {},
      slots: Object.keys(slots).length ? slots : null,
      caps: Object.keys(caps).length ? caps : null
    };
  }
  function readShapeOverrides(raw) {
    const out = { landscape: null, list: null };
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      return out;
    for (const shape of SHAPES)
      out[shape] = readShapeLook(pick(raw, shape));
    return out;
  }
  function shapesToWire(shapes) {
    if (!shapes || !SHAPES.some((shape) => shapes[shape]))
      return null;
    const out = {};
    for (const shape of SHAPES) {
      const look = shapes[shape];
      out[shape] = look ? {
        layout: look.layout || null,
        density: look.density || null,
        ...look.tagScale ? { tagScale: look.tagScale } : {},
        ...look.tagGap ? { tagGap: look.tagGap } : {},
        slots: look.slots ? Object.entries(look.slots).map(([group, slot]) => ({ group, slot })) : null,
        caps: look.caps ? { ...look.caps } : null
      } : null;
    }
    return out;
  }
  function positionSlot(settings, plugin, group) {
    const p = POSITION_SETTINGS[group];
    const pos = String(settings?.[p.userKey] || plugin?.[p.pluginKey] || p.fallback);
    if (hasOwn(POSITION_TO_SLOT, pos))
      return POSITION_TO_SLOT[pos] || "br";
    const isTop = pos.includes("top");
    const isLeft = pos.includes("left");
    return isTop ? isLeft ? "tl" : "tr" : isLeft ? "bl" : "br";
  }
  function isLegacySettings(settings = {}) {
    return !(Number(settings.tagLayoutSettingsVersion) >= 1);
  }
  function normalizeSettings(s = {}, p = {}) {
    const legacy = isLegacySettings(s);
    const layout = legacy ? "corners" : normalizeLayout(s.tagLayout);
    const densityRaw = legacy ? "full" : String(s.tagLabelDensity || "").toLowerCase();
    const density = densityRaw === "compact" ? "compact" : "full";
    const profiles = { corners: {}, bands: {}, caption: {}, summary: {}, minimal: {} };
    const indicatorGap = /* @__PURE__ */ new Set();
    const ownCorners = readProfile(s.tagLayouts, "corners");
    for (const group of DEFAULT_ORDER) {
      const pos = POSITION_SETTINGS[group];
      const raw = s[pos.userKey] || p[pos.pluginKey] || pos.fallback;
      if (ownCorners[group] ? ownCorners[group] === "tr" : raw === "top-right")
        indicatorGap.add(group);
    }
    for (const name of LAYOUTS) {
      const own = readProfile(s.tagLayouts, name);
      const admin = name === "corners" ? {} : readProfile(pick(p, "tagLayouts"), name);
      const profile = {};
      for (const group of DEFAULT_ORDER) {
        profile[group] = own[group] || admin[group] || (name === "corners" ? positionSlot(s, p, group) : DEFAULT_PROFILES[name][group] || "off");
      }
      profiles[name] = profile;
    }
    let order = null;
    let orderChosen = false;
    if (!legacy) {
      const own = readOrder(s.tagGroupOrder);
      orderChosen = !!own;
      const chosen = own || (layout === "corners" ? null : DEFAULT_ORDER);
      if (chosen)
        order = chosen.concat(DEFAULT_ORDER.filter((g) => !chosen.includes(g)));
    }
    const caps = {};
    for (const group of DEFAULT_ORDER) {
      const own = legacy ? void 0 : readCap(pick(s.tagGroupCaps, group));
      const admin = legacy ? void 0 : readCap(pick(pick(p, "tagGroupCaps"), group));
      caps[group] = singleChipGroup(group, p) ? 1 : own ?? admin ?? DEFAULT_CAPS[group];
    }
    const reserveCaption = layout === "caption" && DEFAULT_ORDER.some((g) => profiles.caption[g] === "caption" && !!s[ENABLED_SETTING[g]] && (g !== "awards" || p.AwardsTagsEnabled !== false));
    const ownShapes = s.tagShapeOverrides;
    const shapes = readShapeOverrides(ownShapes && typeof ownShapes === "object" ? ownShapes : legacy ? null : pick(p, "tagShapeOverrides"));
    const tagScale = legacy ? "default" : readScale(s.tagScale) || (s.tagScale != null ? "default" : readScale(pick(p, "tagScale"))) || "default";
    const tagGap = legacy ? "default" : readGap(s.tagGap) || (s.tagGap != null ? "default" : readGap(pick(p, "tagGap"))) || "default";
    const edge = legacy ? "default" : readEdge(s.tagEdgeSpacing) || readEdge(pick(p, "tagEdgeSpacing")) || "default";
    const conf = { layout, legacy, density, tagScale, tagGap, order, orderChosen, caps: { ...DEFAULT_CAPS, ...caps }, profiles, slots: profiles[layout], indicatorGap, reserveCaption, locked: false, shapes, edge, lookKey: "" };
    conf.lookKey = lookKeyOf(conf);
    return conf;
  }
  function promoteLegacySettings(s) {
    if (!s || !isLegacySettings(s))
      return false;
    s.tagLayout = "corners";
    s.tagLabelDensity = "full";
    s.tagScale = "default";
    s.tagGap = "default";
    s.tagGroupCaps = { ...DEFAULT_CAPS };
    s.tagGroupOrder = null;
    if (!Array.isArray(s.tagLookRules))
      s.tagLookRules = [];
    if (!s.tagShapeOverrides || typeof s.tagShapeOverrides !== "object" || Array.isArray(s.tagShapeOverrides)) {
      s.tagShapeOverrides = { landscape: null, list: null };
    }
    if (!readEdge(s.tagEdgeSpacing))
      s.tagEdgeSpacing = "default";
    s.tagLayoutSettingsVersion = 1;
    return true;
  }
  function lookKeyOf(conf) {
    return [
      conf.layout,
      conf.density,
      conf.tagScale,
      conf.tagGap,
      conf.locked ? "L" : "",
      DEFAULT_ORDER.map((g) => conf.slots[g] || "").join(","),
      DEFAULT_ORDER.map((g) => conf.caps[g]).join(","),
      conf.edge === "default" ? "" : conf.edge
    ].join("|");
  }
  function validSlots(layout, slots) {
    const out = {};
    for (const [group, slot] of Object.entries(slots || {})) {
      if (normalizeGroup(group) !== null && LAYOUT_SLOTS[layout].includes(slot) && (slot !== "dots" || group === "quality"))
        out[normalizeGroup(group) || "quality"] = slot;
    }
    return out;
  }
  function withShape(look, shapeLook) {
    if (!shapeLook)
      return { ...look, caps: look.caps || null };
    const switches = !!shapeLook.layout && shapeLook.layout !== look.layout;
    const slots = switches ? shapeLook.slots : look.slots || shapeLook.slots ? { ...look.slots || {}, ...shapeLook.slots || {} } : null;
    const caps = look.caps || shapeLook.caps ? { ...look.caps || {}, ...shapeLook.caps || {} } : null;
    return {
      layout: shapeLook.layout || look.layout,
      density: shapeLook.density || look.density,
      tagScale: shapeLook.tagScale || look.tagScale,
      tagGap: shapeLook.tagGap || look.tagGap,
      edge: look.edge || null,
      slots,
      caps
    };
  }
  function lookSettings(base, look, locked, settings = {}, plugin = {}) {
    const layout = look.layout ? normalizeLayout(look.layout) : base.layout;
    const own = validSlots(layout, look.slots);
    const slots = { ...base.profiles[layout], ...own };
    const conf = {
      ...base,
      layout,
      density: look.density ? look.density === "compact" ? "compact" : "full" : base.density,
      tagScale: readScale(look.tagScale) || base.tagScale,
      tagGap: readGap(look.tagGap) || base.tagGap,
      // A lock or item look may set its own edge spacing (an unknown one inherits).
      edge: (look.edge && hasOwn(EDGE_SPACINGS, look.edge) ? look.edge : null) || base.edge,
      caps: look.caps ? normalizeGroupCaps({ ...base.caps, ...look.caps }, plugin) : base.caps,
      // A chosen order applies everywhere; otherwise corners keeps
      // arrival order and the other layouts the built-in order.
      order: base.orderChosen ? base.order : layout === "corners" ? null : DEFAULT_ORDER,
      profiles: { ...base.profiles, [layout]: slots },
      slots,
      indicatorGap: Object.keys(own).length && layout === "corners" ? new Set(DEFAULT_ORDER.filter((g) => slots[g] === "tr")) : base.indicatorGap,
      reserveCaption: layout === "caption" && DEFAULT_ORDER.some((g) => slots[g] === "caption" && !!settings[ENABLED_SETTING[g]] && (g !== "awards" || plugin.AwardsTagsEnabled !== false)),
      locked,
      lookKey: ""
    };
    conf.lookKey = lookKeyOf(conf);
    return conf;
  }
  function withoutPrototype(value) {
    Object.setPrototypeOf(value, null);
    return value;
  }

  // client/src/features/media-tags/layout/tag-look.ts
  function transportStatus(error) {
    try {
      if (typeof error === "object" && error !== null && "status" in error) {
        const status = error.status;
        if (typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599) return status;
      }
    } catch {
    }
    return void 0;
  }
  function lockTimestamp(value) {
    const number = typeof value === "number" || typeof value === "string" ? Number(value) : 0;
    return Number.isFinite(number) ? Math.max(0, number) : 0;
  }
  function createTagLook(host) {
    const FIELDS = ["library", "type", "genre", "ageRating"];
    const TYPES = ["Movie", "Series", "Season", "Episode", "BoxSet", "Video"];
    const DENSITIES = ["full", "compact"];
    const MAX_RULES = 50;
    const MAX_CONDITIONS = 5;
    const MAX_LOCKS = 500;
    const MAX_ITEM_OVERRIDES = 500;
    const PLUGIN_ID = "f69e946a-4b3c-4e9a-8f0a-8d7c1b2c4d9b";
    const SCALES = ["smaller", "default", "larger", "largest"];
    const GAPS = ["tight", "default", "roomy"];
    const EDGES = ["default", "tight", "flush"];
    const MAX_TEXT = 100;
    const RULE_ID = /^[A-Za-z0-9_-]{1,40}$/;
    const PRESET = /^[a-z0-9_-]{1,64}$/;
    function layoutSlots() {
      return LAYOUT_SLOTS || {};
    }
    function normalizeId(raw) {
      if (typeof raw !== "string")
        return null;
      const id = raw.trim().replace(/-/g, "").toLowerCase();
      return /^[0-9a-f]{32}$/.test(id) ? id : null;
    }
    function normalizeLayout2(raw) {
      const layout = typeof raw === "string" ? raw.trim().toLowerCase() : "";
      return isLayout(layout) ? layout : null;
    }
    function normalizeDensity(raw) {
      if (raw === void 0 || raw === null || raw === "")
        return "full";
      const density = String(raw).trim().toLowerCase();
      return DENSITIES.includes(density) ? density : null;
    }
    function normalizeSlots(raw, layout) {
      if (!raw || typeof raw !== "object")
        return null;
      const pairs = Array.isArray(raw) ? raw.map((entry) => [pick(entry, "group"), pick(entry, "slot")]) : Object.entries(raw);
      const layouts = layoutSlots();
      const valid = isLayout(layout) ? layouts[layout] : [];
      const out = {};
      for (const [rawGroup, rawSlot] of pairs) {
        const group = normalizeGroup(rawGroup);
        const slot = typeof rawSlot === "string" ? rawSlot.trim().toLowerCase() : "";
        if (!group || out[group] || !valid.includes(slot))
          continue;
        if (slot === "dots" && group !== "quality")
          continue;
        out[group] = slot;
      }
      return Object.keys(out).length ? out : null;
    }
    function normalizeShapes(raw) {
      const shapes = readShapeOverrides(raw);
      return shapes && (shapes.landscape || shapes.list) ? shapes : null;
    }
    function normalizeCaps(raw) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        return null;
      const layout = layout_rules_exports;
      const max = layout?.MAX_CAP ?? 10;
      const out = {};
      for (const group of layout?.GROUPS || []) {
        const value = pick(raw, group);
        const n = Number(value);
        if (value === void 0 || value === null || value === "" || !Number.isFinite(n))
          continue;
        out[group] = Math.max(0, Math.min(max, Math.round(n)));
      }
      return Object.keys(out).length ? out : null;
    }
    function choice(raw, values) {
      const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
      return values.includes(value) ? value : null;
    }
    function normalizeCondition(raw) {
      const rawField = pick(raw, "field");
      const field = FIELDS.find((f) => typeof rawField === "string" && f.toLowerCase() === rawField.trim().toLowerCase());
      const rawValue = pick(raw, "value");
      const text = typeof rawValue === "string" ? rawValue.trim() : "";
      if (!field || !text)
        return null;
      let value = null;
      if (field === "library")
        value = normalizeId(text);
      else if (field === "type")
        value = TYPES.find((t) => t.toLowerCase() === text.toLowerCase()) || null;
      else
        value = text.length <= MAX_TEXT ? text : null;
      return value ? { field, value } : null;
    }
    function normalizeRules(raw) {
      if (!Array.isArray(raw))
        return [];
      const out = [];
      const ids = /* @__PURE__ */ new Set();
      for (const rule of raw) {
        if (out.length >= MAX_RULES)
          break;
        if (!rule || typeof rule !== "object")
          continue;
        const layout = normalizeLayout2(pick(rule, "layout"));
        const density = normalizeDensity(pick(rule, "density"));
        if (!layout || !density)
          continue;
        const whenRaw = pick(rule, "when");
        const when = (Array.isArray(whenRaw) ? whenRaw : []).map(normalizeCondition);
        if (when.length === 0 || when.length > MAX_CONDITIONS || when.includes(null))
          continue;
        let id = String(pick(rule, "id") ?? "").trim();
        if (!RULE_ID.test(id) || ids.has(id))
          id = newRuleId(ids);
        ids.add(id);
        const enabled = pick(rule, "enabled");
        const preset = String(pick(rule, "colourPreset") ?? "").trim().toLowerCase();
        out.push({
          id,
          enabled: enabled !== false,
          when: when.filter((condition) => condition !== null),
          layout,
          density,
          colourPreset: PRESET.test(preset) ? preset : null,
          slots: normalizeSlots(pick(rule, "slots"), layout),
          shapes: normalizeShapes(pick(rule, "shapes"))
        });
      }
      return out;
    }
    function newRuleId(taken) {
      let id;
      do {
        id = "r" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      } while (taken && taken.has(id));
      return id;
    }
    function normalizeLock(value) {
      if (!value || typeof value !== "object")
        return null;
      const layout = normalizeLayout2(pick(value, "layout"));
      const density = normalizeDensity(pick(value, "density"));
      if (!layout || !density)
        return null;
      const preset = String(pick(value, "colourPreset") ?? "").trim().toLowerCase();
      return {
        layout,
        density,
        colourPreset: PRESET.test(preset) ? preset : null,
        slots: normalizeSlots(pick(value, "slots"), layout),
        shapes: normalizeShapes(pick(value, "shapes")),
        caps: normalizeCaps(pick(value, "caps")),
        tagScale: choice(pick(value, "tagScale"), SCALES),
        tagGap: choice(pick(value, "tagGap"), GAPS),
        edge: choice(pick(value, "edgeSpacing") ?? pick(value, "edge"), EDGES),
        scope: String(pick(value, "scope") ?? "").trim().toLowerCase() === "item" ? "item" : null,
        lockedAt: lockTimestamp(pick(value, "lockedAt"))
      };
    }
    function normalizeLocks(raw) {
      const byId = /* @__PURE__ */ new Map();
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        return byId;
      for (const [key, value] of Object.entries(raw)) {
        const id = normalizeId(key);
        const lock = id ? normalizeLock(value) : null;
        if (!id || !lock)
          continue;
        const previous = byId.get(id);
        if (previous && previous.lockedAt >= lock.lockedAt)
          continue;
        byId.set(id, lock);
      }
      if (byId.size <= MAX_LOCKS)
        return byId;
      const newest = Array.from(byId.entries()).sort((a, b) => b[1].lockedAt - a[1].lockedAt || (a[0] < b[0] ? -1 : 1)).slice(0, MAX_LOCKS);
      return new Map(newest);
    }
    function normalizeItemOverrides(raw) {
      if (!Array.isArray(raw))
        return /* @__PURE__ */ new Map();
      const byKey = {};
      for (const entry of raw) {
        const id = normalizeId(String(pick(entry, "itemId") ?? ""));
        if (!id)
          continue;
        const seen = byKey[id];
        if (seen && lockTimestamp(pick(seen, "lockedAt")) >= lockTimestamp(pick(entry, "lockedAt")))
          continue;
        byKey[id] = entry;
      }
      const looks = normalizeLocks(byKey);
      return looks.size <= MAX_ITEM_OVERRIDES ? looks : new Map(Array.from(looks).slice(0, MAX_ITEM_OVERRIDES));
    }
    function read(settings, plugin) {
      const s = settings || host.settings() || {};
      const p = plugin || host.config() || {};
      const legacy = isLegacySettings(s);
      const own = s.tagLookRules;
      const rules = Array.isArray(own) ? normalizeRules(own) : legacy ? [] : normalizeRules(pick(p, "tagLookRules"));
      return { rules, locks: normalizeLocks(s.tagLayoutLocks), overrides: normalizeItemOverrides(pick(p, "tagLookItemOverrides")) };
    }
    function normalizeRating(raw) {
      if (raw === null || raw === void 0)
        return "";
      const text = String(raw).replace(/\s+/g, " ").trim();
      if (!text)
        return "";
      const shared = host.normalizeOfficialRating;
      return String((typeof shared === "function" ? shared(text) : text) || text).toLowerCase();
    }
    function matches(rule, facts) {
      if (!rule || !rule.enabled || !rule.when.length)
        return false;
      return rule.when.every((cond) => {
        switch (cond.field) {
          case "library":
            return !!facts.libraryId && facts.libraryId === cond.value;
          case "type":
            return !!facts.type && facts.type.toLowerCase() === cond.value.toLowerCase();
          case "genre": {
            const wanted = cond.value.toLowerCase();
            return facts.genres.some((g) => String(g).trim().toLowerCase() === wanted);
          }
          case "ageRating": {
            const have = normalizeRating(facts.officialRating);
            return !!have && have === normalizeRating(cond.value);
          }
          default:
            return false;
        }
      });
    }
    function firstMatch(rules, facts) {
      for (const rule of rules) {
        if (matches(rule, facts))
          return rule;
      }
      return null;
    }
    function findLock(locks, facts) {
      if (!locks || !locks.size)
        return null;
      for (const id of facts.lockIds) {
        const lock = locks.get(id);
        if (!lock)
          continue;
        if (lock.scope === "item" && id === facts.seriesId && id !== facts.itemId)
          continue;
        return lock;
      }
      return null;
    }
    function factsFrom(entry, card = {}) {
      const e = entry;
      const itemId = normalizeId(card.itemId || "") || normalizeId(String(pick(e, "id") ?? "")) || "";
      const cardId = normalizeId(card.cardId || "") || "";
      const rawType = card.cardType || pick(e, "type");
      const type = typeof rawType === "string" ? rawType : null;
      const genresRaw = pick(e, "genres");
      const seriesId = type === "Season" || type === "Episode" || pick(e, "type") === "Season" || pick(e, "type") === "Episode" ? normalizeId(String(pick(e, "seriesId") ?? "")) : null;
      const lockIds = [];
      for (const id of [cardId, itemId, seriesId]) {
        if (id && !lockIds.includes(id))
          lockIds.push(id);
      }
      return {
        itemId: itemId || cardId,
        type,
        genres: Array.isArray(genresRaw) ? genresRaw : [],
        officialRating: pick(e, "officialRating") || null,
        libraryId: normalizeId(String(pick(e, "libraryId") ?? "")),
        seriesId,
        lockIds
      };
    }
    function slotsToWire(slots) {
      return slots ? Object.entries(slots).map(([group, slot]) => ({ group, slot })) : null;
    }
    function shapesToWire2(shapes) {
      return shapes ? shapesToWire(shapes) || null : null;
    }
    const represent = host.represent;
    const captureSession = host.captureSession;
    function persist(key, value) {
      const isCurrent = captureSession();
      const settings = host.settings();
      const previous = settings[key];
      if (!isCurrent())
        return Promise.resolve(false);
      settings[key] = value;
      represent();
      if (!isCurrent())
        return Promise.resolve(false);
      const save = host.saveUserSettings;
      const rollback = () => {
        if (host.settings() === settings && settings[key] === value) {
          settings[key] = previous;
          represent();
        }
      };
      if (typeof save !== "function") {
        rollback();
        return Promise.resolve(false);
      }
      return new Promise((resolve) => resolve(save("settings.json", settings, { throwOnError: true, isCurrent, onError: rollback }))).then(() => isCurrent(), (err) => {
        if (!isCurrent())
          return false;
        console.warn("🪼 Jellyfin Enhanced [TagLook]: saving the tag looks failed:", err);
        return false;
      });
    }
    function saveRules(rules) {
      return persist("tagLookRules", normalizeRules(rules).map((rule) => ({ ...rule, slots: slotsToWire(rule.slots), shapes: shapesToWire2(rule.shapes) })));
    }
    function lockToWire(lock) {
      const { edge, ...rest } = lock;
      return {
        ...rest,
        slots: slotsToWire(lock.slots),
        shapes: shapesToWire2(lock.shapes),
        caps: lock.caps ? { ...lock.caps } : null,
        edgeSpacing: edge || null
      };
    }
    function locksToWire(locks) {
      const out = {};
      for (const [id, lock] of locks)
        out[id] = lockToWire(lock);
      return Object.keys(out).length ? out : null;
    }
    function lockFrom(look, others) {
      const lock = normalizeLock({ ...look && typeof look === "object" ? look : {}, edgeSpacing: pick(look, "edge") ?? null, lockedAt: 0, shapes: null, colourPreset: null });
      if (!lock)
        return null;
      lock.lockedAt = Math.max(Date.now(), ...Array.from(others, (l) => l.lockedAt + 1));
      return lock;
    }
    function lockItem(itemId, look) {
      const id = normalizeId(itemId);
      const locks = normalizeLocks(host.settings().tagLayoutLocks);
      const lock = id ? lockFrom(look, locks.values()) : null;
      if (!id || !lock)
        return Promise.resolve(false);
      locks.delete(id);
      locks.set(id, lock);
      return persist("tagLayoutLocks", locksToWire(normalizeLocks(Object.fromEntries(locks))));
    }
    function unlockItems(ids) {
      const locks = normalizeLocks(host.settings().tagLayoutLocks);
      if (ids === void 0)
        locks.clear();
      else
        for (const raw of ids) {
          const id = normalizeId(raw);
          if (id)
            locks.delete(id);
        }
      return persist("tagLayoutLocks", locksToWire(locks));
    }
    function editLocks(set, remove = []) {
      const locks = normalizeLocks(host.settings().tagLayoutLocks);
      for (const raw of remove) {
        const id = normalizeId(raw);
        if (id)
          locks.delete(id);
      }
      for (const [raw, look] of Object.entries(set || {})) {
        const id = normalizeId(raw);
        const lock = id ? lockFrom(look, locks.values()) : null;
        if (!id || !lock)
          return Promise.resolve(false);
        locks.delete(id);
        locks.set(id, lock);
      }
      return persist("tagLayoutLocks", locksToWire(normalizeLocks(Object.fromEntries(locks))));
    }
    function restoreLocks(wire) {
      const locks = normalizeLocks(host.settings().tagLayoutLocks);
      for (const [id, lock] of normalizeLocks(wire)) {
        if (!locks.has(id) && locks.size < MAX_LOCKS)
          locks.set(id, lock);
      }
      return persist("tagLayoutLocks", locksToWire(locks));
    }
    function itemOverridesToWire(looks) {
      const out = Array.from(looks.entries()).sort((a, b) => b[1].lockedAt - a[1].lockedAt || (a[0] < b[0] ? -1 : 1)).map(([id, look]) => {
        const wire = lockToWire(look);
        return {
          ItemId: id,
          Layout: wire.layout,
          Density: wire.density,
          ColourPreset: wire.colourPreset,
          Slots: wire.slots ? wire.slots.map((e) => ({ Group: e.group, Slot: e.slot })) : null,
          Shapes: wire.shapes,
          Caps: capsToWire(wire.caps),
          TagScale: wire.tagScale,
          TagGap: wire.tagGap,
          EdgeSpacing: wire.edgeSpacing,
          Scope: wire.scope,
          LockedAt: wire.lockedAt
        };
      });
      return out.length ? out : null;
    }
    function capsToWire(caps) {
      if (!caps)
        return null;
      const out = {};
      for (const [group, n] of Object.entries(caps))
        out[group.charAt(0).toUpperCase() + group.slice(1)] = n;
      return out;
    }
    function itemOverridesWith(raw, itemId, look) {
      const id = normalizeId(itemId);
      if (!id)
        return void 0;
      const looks = normalizeItemOverrides(raw);
      looks.delete(id);
      if (look) {
        const lock = lockFrom(look, looks.values());
        if (!lock)
          return void 0;
        looks.set(id, lock);
      }
      return itemOverridesToWire(looks);
    }
    function restoreItemOverrides(raw, removed) {
      const looks = normalizeItemOverrides(raw);
      for (const [id, entry] of normalizeItemOverrides(removed)) {
        if (!looks.has(id) && looks.size < MAX_ITEM_OVERRIDES)
          looks.set(id, entry);
      }
      return itemOverridesToWire(looks);
    }
    function itemOverrideMutation(before, after) {
      const previous = normalizeItemOverrides(before);
      const next = normalizeItemOverrides(after);
      const sets = /* @__PURE__ */ new Map();
      const remove = [];
      const expected = {};
      for (const id of /* @__PURE__ */ new Set([...previous.keys(), ...next.keys()])) {
        if (JSON.stringify(previous.get(id)) === JSON.stringify(next.get(id)))
          continue;
        const value = next.get(id);
        if (value)
          sets.set(id, value);
        else
          remove.push(id);
        expected[id] = (Array.isArray(before) ? before.find((e) => normalizeId(pick(e, "itemId")) === id) : null) || null;
      }
      return { Set: itemOverridesToWire(sets) || [], Remove: remove, Expected: expected };
    }
    async function saveItemOverride(itemId, look, options = {}) {
      const isCurrent = captureSession();
      const id = normalizeId(itemId);
      if (!id)
        return false;
      const api = options.api || host.api;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (!isCurrent())
            return false;
          const config = await api.get();
          if (!isCurrent())
            return false;
          const before = config?.TagLookItemOverrides ?? null;
          const current = normalizeItemOverrides(before);
          if (options.restoreOnly && (current.has(id) || current.size >= MAX_ITEM_OVERRIDES))
            return true;
          let next = before;
          for (const child of options.remove || [])
            next = itemOverridesWith(next, child, null);
          next = itemOverridesWith(next, id, look);
          if (next === void 0)
            return false;
          if (!isCurrent())
            return false;
          const mutation = itemOverrideMutation(before, next);
          const result = mutation.Set.length || mutation.Remove.length ? await api.patch({ TagLookItemOverrides: mutation }, {}) : null;
          if (!isCurrent())
            return false;
          const stored = result?.values?.TagLookItemOverrides ?? result?.Values?.TagLookItemOverrides ?? (result ? next : before);
          const configView = host.config();
          configView.TagLookItemOverrides = visibleItemLooks(stored, configView.TagLookItemOverrides, id);
          represent();
          return true;
        } catch (err) {
          if (!isCurrent())
            return false;
          if (transportStatus(err) === 409 && attempt === 0)
            continue;
          console.warn("🪼 Jellyfin Enhanced [TagLook]: saving the item look for everyone failed:", err);
          return false;
        }
      }
      return false;
    }
    function visibleItemLooks(stored, previous, id) {
      if (!Array.isArray(stored))
        return null;
      const visible = new Set(normalizeItemOverrides(previous).keys()).add(id);
      const kept = stored.filter((entry) => visible.has(normalizeId(String(pick(entry, "itemId") ?? "")) || ""));
      return kept.length ? kept : null;
    }
    return {
      captureSession,
      FIELDS: FIELDS.slice(),
      TYPES: TYPES.slice(),
      MAX_RULES,
      MAX_CONDITIONS,
      MAX_LOCKS,
      MAX_ITEM_OVERRIDES,
      normalizeId,
      normalizeRules,
      normalizeLocks,
      normalizeLock,
      normalizeItemOverrides,
      normalizeCaps,
      normalizeSlots,
      normalizeRating,
      read,
      matches,
      firstMatch,
      findLock,
      factsFrom,
      newRuleId,
      saveRules,
      lockItem,
      unlockItems,
      editLocks,
      restoreLocks,
      saveItemOverride,
      itemOverrideMutation,
      restoreItemOverrides,
      itemOverridesWith,
      itemOverridesToWire
    };
  }

  // client/src/features/media-tags/layout/tag-look-entry.ts
  var bridge = tagRulesHost();
  bridge.core ?? (bridge.core = {});
  bridge.core.tagLook = createTagLook({
    settings: () => bridge.currentSettings || {},
    config: () => bridge.pluginConfig || {},
    normalizeOfficialRating: (text) => bridge.normalizeOfficialRating?.(text) || text,
    represent: () => {
      bridge.core?.tagLayout?.invalidateSettings?.();
      bridge.reinitializeTagLayout?.();
    },
    captureSession: () => captureTagSession(bridge),
    get saveUserSettings() {
      return bridge.saveUserSettings?.bind(bridge);
    },
    api: {
      get: () => lookApiClient().getPluginConfiguration("f69e946a-4b3c-4e9a-8f0a-8d7c1b2c4d9b"),
      patch: (changes, expected) => {
        const client = lookApiClient();
        return client.ajax({
          type: "POST",
          url: client.getUrl("/JellyfinEnhanced/admin/configuration"),
          data: JSON.stringify({ Changes: changes, Expected: expected }),
          contentType: "application/json",
          dataType: "json"
        });
      }
    }
  });
})();
})();
//# sourceMappingURL=tag-look.js.map
