(() => {
"use strict";
(() => {
  // client/src/features/media-tags/host.ts
  function tagRuntimeHost() {
    const host = window;
    const bridge = host.JellyfinEnhanced ?? (host.JellyfinEnhanced = {});
    bridge.core ?? (bridge.core = {});
    return bridge;
  }
  function apiClient() {
    const host = window;
    if (!host.ApiClient) throw new Error("Jellyfin ApiClient unavailable");
    return host.ApiClient;
  }

  // client/src/features/media-tags/pipeline/dto.ts
  var EMPTY = Object.freeze({});
  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function record(value) {
    return isRecord(value) ? value : EMPTY;
  }
  function records(value) {
    return Array.isArray(value) ? value.filter(isRecord) : [];
  }

  // client/src/features/media-tags/layout/tag-styles.ts
  function createTagStyles(JE) {
    const logPrefix = "🪼 Jellyfin Enhanced: Tag Styles:";
    const styleId = "je-tag-style-overrides";
    const PRESETS = ["default", "glass", "outline", "dark", "light", "mono", "poster"];
    const STATUS_KEY = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
    const COLOUR = /^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*[\d.]+\s*\)$/;
    const decl = (prop, value) => typeof value === "string" && COLOUR.test(value) ? `${prop}: ${value} !important;` : "";
    const attr = (value) => String(value).replace(/["\\]/g, "\\$&").replace(/[\n\r\f]/g, "\\a ");
    let requestSeq = 0;
    let listening = false;
    function box(c) {
      return decl("background-color", c.background) + decl("color", c.color) + decl("border-color", c.border);
    }
    function ring(border) {
      return typeof border === "string" && COLOUR.test(border) ? `outline: 1px solid ${border} !important; outline-offset: -1px !important; --je-tag-ring-color: ${border} !important; outline-color: var(--je-tag-ring-outline, ${border}) !important;` : "";
    }
    const SCOPE_ID = /^#[A-Za-z_][A-Za-z0-9_-]*$/;
    const SCOPE_ATTR = "data-je-tag-styles-scope";
    const OUTSIDE_SCOPES = `:where(:not([${SCOPE_ATTR}] *))`;
    function push(rules, selector, body) {
      if (body) rules.push(`${selector} { ${body} }`);
    }
    const GENRE_NAME_FLOATS = ':not([data-je-slot="hover"] *)';
    function genreMap(genre) {
      if (!isRecord(genre)) return {};
      return ["background", "border", "color"].some((f) => typeof genre[f] === "string") ? { "*": genre } : genre;
    }
    function posterRules(P, groups) {
      const M = `${P}[data-je-poster-colour]`;
      const fill = "background: var(--je-tag-bg) !important; color: var(--je-tag-fg) !important;";
      const edge = "border-color: var(--je-tag-border) !important;";
      const ringed = "outline: 1px solid var(--je-tag-border) !important; outline-offset: -1px !important; --je-tag-ring-color: var(--je-tag-border) !important; outline-color: var(--je-tag-ring-outline, var(--je-tag-border)) !important;";
      const all = !groups;
      const on = (g) => all || groups.includes(g);
      const table = [
        // (0,4,0): over the quality module's !important label rules, level with the "*" override.
        ["quality", `${M} .quality-overlay-container.quality-overlay-container .quality-overlay-label { ${fill} ${edge} }`],
        ["ageRating", `${M} .age-rating-overlay-container .age-rating-tag { background-color: var(--je-tag-bg) !important; color: var(--je-tag-fg) !important; ${edge} }`],
        ["rating", `${M} .rating-overlay-container .rating-tag { ${fill} ${ringed} }`],
        ["rating", `${M} .rating-overlay-container .rating-tag :is(.rating-star-icon, .je-userreview-icon) { color: var(--je-tag-fg) !important; }`],
        ["awards", `${M} .awards-overlay-container .awards-tag { ${fill} ${ringed} }`],
        ["logos", `${M} .logo-overlay-container .je-logo-chip[data-je-logo-style] { ${fill} ${edge} }`],
        ["custom", `${M} .custom-overlay-container.custom-overlay-container .custom-tag { ${fill} ${edge} }`],
        ["genre", `${M} .genre-tag { background-color: var(--je-tag-bg) !important; color: var(--je-tag-fg) !important; ${edge} }`],
        ["language", `${M} .language-overlay-container .language-chip { ${fill} ${edge} }`],
        ["status", `${M} .status-overlay-container .status-tag { background-color: var(--je-tag-bg) !important; color: var(--je-tag-fg) !important; ${edge} }`],
        ["status", `${M} .status-overlay-container .status-tag .status-tag-rank { color: var(--je-tag-fg) !important; }`]
      ];
      const byGroup = table.filter(([g]) => on(g)).map(([, rule]) => rule);
      return all ? [
        ...byGroup,
        `${M} .je-tag-pill { background: var(--je-tag-bg); border-color: var(--je-tag-border); color: var(--je-tag-fg); }`,
        `${M} .je-tag-pill .je-tag-pill-glyph { color: inherit; }`
      ] : byGroup;
    }
    function posterGroupsOf(styles) {
      if (styles.preset === "poster") return null;
      return Array.isArray(styles.posterGroups) ? styles.posterGroups : [];
    }
    function buildCss(input, scope) {
      const styles = record(input);
      const rules = [];
      if (scope !== void 0 && scope !== null && scope !== "" && !SCOPE_ID.test(scope)) {
        throw new Error("tag-styles: scope must be a single #id selector");
      }
      const P = scope ? `${scope} ` : "";
      const add = (selectors, body) => push(rules, (typeof selectors === "string" ? [selectors] : selectors).map((sel) => scope ? sel : sel + OUTSIDE_SCOPES).join(", "), body);
      const posterGroups = posterGroupsOf(styles);
      if (!posterGroups || posterGroups.length) rules.push(...posterRules(P, posterGroups || void 0).map((rule) => scope ? rule : rule.replace(/ (\{)/, OUTSIDE_SCOPES + " $1")));
      const quality = record(styles.quality);
      const allQuality = record(quality["*"]);
      const Q = `${P}.quality-overlay-container.quality-overlay-container.quality-overlay-container .quality-overlay-label`;
      add(Q, `${decl("background", allQuality.background)}${decl("color", allQuality.color)}${decl("border-color", allQuality.border)}`);
      for (const [label, c] of Object.entries(quality)) {
        if (label === "*" || !isRecord(c)) continue;
        add(`${Q}[data-quality="${attr(label)}"]`, `${decl("background", c.background)}${decl("color", c.color)}${decl("border-color", c.border)}`);
      }
      const A = `${P}.age-rating-overlay-container .age-rating-tag`;
      add(`${P}.age-rating-overlay-container.age-rating-overlay-container .age-rating-tag`, box(record(styles.ageDefault)));
      for (const board of records(styles.age)) {
        const ratings = Array.isArray(board.ratings) ? board.ratings : [];
        if (!ratings.length) continue;
        add(ratings.map((r) => `${A}[rating="${attr(r)}"]`), box(board));
      }
      const chips = record(styles.rating);
      const R = `${P}.rating-overlay-container .rating-tag`;
      const community = record(chips.community);
      const critic = record(chips.critic);
      const userReview = record(chips.userReview);
      add(`${R}.rating-tag-tmdb`, decl("background", community.background) + decl("color", community.color) + ring(community.border));
      add(`${R}.rating-tag-tmdb .rating-star-icon`, decl("color", community.color));
      add(`${R}.rating-tag-critic`, decl("background", critic.background) + decl("color", critic.color) + ring(critic.border));
      add(`${R}.rating-tag-userreview`, decl("background", userReview.background) + decl("color", userReview.color) + ring(userReview.border));
      add(`${R}.rating-tag-userreview .je-userreview-icon`, decl("color", userReview.color));
      for (const [id, c] of Object.entries(chips)) {
        if (!isRecord(c) || ["community", "critic", "userReview"].includes(id)) continue;
        add(`${R}[data-je-rating-source="${attr(id)}"]`, decl("background", c.background) + decl("color", c.color) + ring(c.border));
      }
      const genre = genreMap(styles.genre);
      const G = `${P}.genre-overlay-container .genre-tag`;
      add(G, box(record(genre["*"])));
      for (const [label, c] of Object.entries(genre)) {
        if (label === "*" || !isRecord(c)) continue;
        const L = `[data-je-genre="${attr(label)}"]`;
        add(`${G}${L}`, box(c));
        if (!posterGroups || posterGroups.includes("genre")) {
          add(`${P}[data-je-poster-colour] .genre-tag${L} .genre-text`, "color: var(--je-tag-fg) !important;");
          add(`${P}[data-je-poster-colour] .genre-tag${L} .genre-text${GENRE_NAME_FLOATS}`, "background-color: var(--je-tag-bg) !important;");
        }
        add(`${G}${L} .genre-text`, decl("color", c.color));
        add(`${G}${L} .genre-text${GENRE_NAME_FLOATS}`, decl("background-color", c.background));
      }
      for (const [id, color] of Object.entries(record(styles.awards))) {
        if (isRecord(color)) add(`${P}.awards-overlay-container .awards-tag[data-je-award="${attr(id)}"]`, decl("background", color.background) + decl("color", color.color) + ring(color.border));
      }
      const status = record(styles.status);
      for (const key of Object.keys(status)) {
        const c = status[key];
        if (!isRecord(c) || !STATUS_KEY.test(key)) continue;
        const S = `${P}.status-overlay-container .status-tag[data-je-status="${key}"]`;
        add(S, box(c));
        if (key === "trending") add(`${S} .status-tag-rank`, decl("color", c.color));
      }
      const custom = record(styles.custom);
      const C = `${P}.custom-overlay-container.custom-overlay-container .custom-tag`;
      add(C, box(record(custom["*"])));
      for (const [label, c] of Object.entries(custom)) {
        if (label === "*" || !isRecord(c)) continue;
        add(`${C}[data-je-custom="${attr(label)}"]`, box(c));
      }
      add(`${P}.language-overlay-container .language-chip`, box(record(styles.language)));
      const languageLabels = record(styles.languageLabels);
      const flagColours = record(languageLabels.flag || styles.language);
      add(`${P}.language-overlay-container .language-flag:not(.language-flag-partial)`, ring(flagColours.border));
      for (const [label, color] of Object.entries(languageLabels)) {
        if (!isRecord(color)) continue;
        if (["subtitles", "countBadge", "code"].includes(label)) {
          const kind = label === "code" ? ".language-code" : `[data-je-language="${label}"]`;
          add(`${P}.language-overlay-container.language-overlay-container .language-chip${kind}`, box(color));
        } else if (label !== "flag") {
          add(`${P}.language-overlay-container.language-overlay-container.language-overlay-container .language-chip[data-je-language-label="${attr(label)}"]`, box(color));
        }
      }
      const logos = record(styles.logos);
      for (const key of ["provider", "company", "text"]) {
        const c = logos[key];
        if (isRecord(c)) add(`${P}.logo-overlay-container .je-logo-chip[data-je-logo-style="${key}"]`, box(c));
      }
      const flushStyles = JE.core?.tagLayout?.buildFlushStyles;
      if (scope && rules.length && flushStyles) rules.push(flushStyles(scope));
      return rules.join("\n");
    }
    function userPreset() {
      if (!JE.pluginConfig?.TagStylesAllowUserPreset) return null;
      const preset = JE.currentSettings?.tagStylePreset;
      return typeof preset === "string" && PRESETS.includes(preset) ? preset : null;
    }
    function deactivate() {
      requestSeq++;
      JE.core?.ui?.removeCss(styleId);
      JE.tagPosterColours?.setActive(false);
    }
    JE.session?.onUserChange("tag-styles", deactivate);
    async function initializeTagStyles() {
      if (!listening) {
        listening = true;
        document.addEventListener("je:user-data-loaded", () => {
          if (JE.pluginConfig?.TagStyleWebActive) void initializeTagStyles();
          else deactivate();
        });
      }
      if (!JE.pluginConfig?.TagStyleWebActive) {
        deactivate();
        return;
      }
      const seq = ++requestSeq;
      const epoch = JE.session ? JE.session.getEpoch() : 0;
      try {
        const preset = userPreset();
        const styles = await apiClient().ajax({
          type: "GET",
          url: apiClient().getUrl("JellyfinEnhanced/tag-styles", preset ? { preset } : void 0),
          dataType: "json"
        });
        if (seq !== requestSeq || JE.session && !JE.session.isCurrent(epoch) || !JE.pluginConfig?.TagStyleWebActive) return;
        const css = buildCss(styles);
        if (css) JE.core.ui.injectCss(styleId, css);
        else JE.core.ui.removeCss(styleId);
        const posterGroups = posterGroupsOf(record(styles));
        JE.tagPosterColours?.setActive(!posterGroups || posterGroups.length > 0);
      } catch (e) {
        console.warn(`${logPrefix} Could not load tag style overrides.`, e);
      }
    }
    JE.initializeTagStyles = initializeTagStyles;
    JE.tagStyles = { PRESETS, SCOPE_ATTR, buildCss, deactivate };
  }

  // client/src/features/media-tags/layout/tag-styles-entry.ts
  createTagStyles(tagRuntimeHost());
})();
})();
//# sourceMappingURL=tag-styles.js.map
