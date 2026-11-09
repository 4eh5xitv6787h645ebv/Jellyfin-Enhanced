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

  // client/src/features/media-tags/pipeline/dto.ts
  var EMPTY = Object.freeze({});
  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function text(value) {
    return typeof value === "string" && value ? value : null;
  }

  // client/src/features/media-tags/types/age-rating/ageratingtags.ts
  function createAgeRatingTags(JE) {
    const logPrefix = "🪼 Jellyfin Enhanced: Age Rating Tags:";
    const containerClass = "age-rating-overlay-container";
    const tagClass = "age-rating-tag";
    const colourStyleId = "jellyfin-enhanced-age-rating-colours-css";
    let colourCssPromise = null;
    function normalizeRating(raw) {
      if (raw === null || raw === void 0) return null;
      const text2 = String(raw).replace(/\s+/g, " ").trim();
      if (!text2) return null;
      const shared = JE.normalizeOfficialRating;
      return text(typeof shared === "function" ? shared(text2) : text2);
    }
    function scopeRatingColours(cssText) {
      const withoutComments = cssText.replace(/\/\*[\s\S]*?\*\//g, "");
      const rules = [];
      const blockRe = /([^{}]+)\{([^{}]*)\}/g;
      let match;
      while ((match = blockRe.exec(withoutComments)) !== null) {
        const [, selectorList = "", body = ""] = match;
        const selectors = selectorList.split(",").map((s) => s.trim()).filter((s) => s.startsWith(".mediaInfoOfficialRating[rating=")).map((s) => s.replace(".mediaInfoOfficialRating", `.${tagClass}`));
        if (selectors.length === 0) continue;
        const declarations = body.replace(/\s*!important/g, "").trim();
        rules.push(`${selectors.join(",\n")} { ${declarations} }`);
      }
      return rules.join("\n");
    }
    function ensureColourCss() {
      if (colourCssPromise) return colourCssPromise;
      if (document.getElementById(colourStyleId)) return colourCssPromise = Promise.resolve();
      colourCssPromise = (async () => {
        try {
          const response = await fetch(JE.cdn.url("je-css", "ratings.css"));
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const scoped = scopeRatingColours(await response.text());
          if (!scoped) throw new Error("no [rating=] rules found");
          JE.core.ui.injectCss(colourStyleId, scoped);
        } catch (e) {
          console.warn(`${logPrefix} Could not load rating colours, badges will use the default colour.`, e);
          colourCssPromise = null;
        }
      })();
      return colourCssPromise;
    }
    function isGuardedSeries(seriesId) {
      if (!seriesId) return false;
      try {
        const cfg = JE.pluginConfig;
        if (!cfg || cfg.SpoilerBlurEnabled !== true || cfg.SpoilerStripRatings === false) return false;
        const sg = JE.spoilerBlur;
        if (!sg || typeof sg.isEnabledFor !== "function") return false;
        const prefs = typeof sg.getUserPrefs === "function" && sg.getUserPrefs() || {};
        if (prefs.HideRatings === false) return false;
        if (typeof sg.isLoadOk === "function" && sg.isLoadOk() !== true) return true;
        return sg.isEnabledFor(seriesId) === true;
      } catch {
        return true;
      }
    }
    function getCachedEntry(ctx, itemId) {
      const entry = ctx.getPersistent(itemId) ?? ctx.hot?.get(itemId);
      if (!isRecord(entry)) return null;
      return { rating: text(entry.rating), seriesId: text(entry.s) };
    }
    function setCachedEntry(ctx, itemId, rating, seriesId) {
      const entry = seriesId ? { rating, s: seriesId } : { rating };
      ctx.setPersistent(itemId, entry);
      ctx.hot?.set(itemId, entry);
    }
    function applyAgeRatingTag(ctx, el, rating) {
      if (!rating) return;
      ctx.removeExistingOverlay(el);
      const container = document.createElement("div");
      container.className = containerClass;
      const tag = document.createElement("div");
      tag.className = tagClass;
      tag.setAttribute("rating", rating);
      tag.textContent = rating;
      container.appendChild(tag);
      ctx.commitOverlay(el, container);
    }
    const spec = {
      logPrefix,
      settingKey: "ageRatingTagsEnabled",
      containerClass,
      taggedAttr: "jeAgeRatingTagged",
      styleId: "jellyfin-enhanced-age-rating-tags-css",
      position: { userKey: "ageRatingTagsPosition", pluginKey: "AgeRatingTagsPosition", fallback: "bottom-right" },
      cache: {
        key: "JellyfinEnhanced-ageRatingTagsCache",
        legacyPrefix: "ageRatingTagsCache",
        hotBucket: "ageRating",
        saveOnUnload: false
      },
      buildCss() {
        return `
                .${containerClass} {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-end;
                    z-index: 10;
                    pointer-events: none;
                    max-width: calc(100% - 12px);
                }

                .${tagClass} {
                    display: inline-flex;
                    align-items: center;
                    padding: calc(4px * var(--je-tag-scale, 1)) calc(8px * var(--je-tag-scale, 1));
                    /* Neutral fallback, same as the Colored Ratings default, until a
                       [rating=...] rule matches (or if the colour sheet fails to load). */
                    background-color: #607D8B;
                    color: #ffffff;
                    border: 1px solid rgba(255, 255, 255, 0.25);
                    border-radius: 4px;
                    font-size: calc(13px * var(--je-tag-scale, 1));
                    font-weight: 700;
                    line-height: 1;
                    letter-spacing: 0.02em;
                    text-transform: uppercase;
                    text-shadow: 0 0 2px rgba(0, 0, 0, 0.6);
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
                    white-space: nowrap;
                    pointer-events: none;
                }

                /* Card-width sizing, matching the rating tag rules in tag-pipeline.js */
                @supports (container-type: inline-size) {
                    html:not(.layout-mobile) .je-tag-host .${tagClass} {
                        font-size: calc(clamp(9px, 6.8cqw, 13px) * var(--je-tag-scale, 1));
                        padding: calc(clamp(2px, 2cqw, 4px) * var(--je-tag-scale, 1)) calc(clamp(4px, 4.5cqw, 8px) * var(--je-tag-scale, 1));
                    }
                }

                .layout-mobile .${tagClass} {
                    padding: calc(2px * var(--je-tag-scale, 1)) calc(6px * var(--je-tag-scale, 1));
                    font-size: calc(11px * var(--je-tag-scale, 1));
                    border-radius: 3px;
                }

                @media (max-width: 768px) {
                    .${tagClass} { padding: calc(3px * var(--je-tag-scale, 1)) calc(6px * var(--je-tag-scale, 1)); font-size: calc(12px * var(--je-tag-scale, 1)); }
                }

                @media (max-width: 480px) {
                    .${tagClass} { padding: calc(2px * var(--je-tag-scale, 1)) calc(4px * var(--je-tag-scale, 1)); font-size: calc(clamp(10px, 2vw, 11px) * var(--je-tag-scale, 1)); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4); }
                }
            `;
      },
      pipeline: {
        needsFirstEpisode: false,
        needsParentSeries: false,
        render(ctx, el, item, extras) {
          if (ctx.shouldIgnore(el)) return;
          if (ctx.isTagged(el)) return;
          if (el.closest(".je-hidden")) return;
          const rating = normalizeRating(item.OfficialRating) ?? normalizeRating(extras?.parentSeries?.OfficialRating);
          const isChild = item.Type === "Episode" || item.Type === "Season";
          if (!isChild || item.SeriesId) {
            setCachedEntry(ctx, String(item.Id), rating, isChild ? String(item.SeriesId) : null);
          }
          applyAgeRatingTag(ctx, el, rating);
        },
        renderFromCache(ctx, el, itemId) {
          if (ctx.isTagged(el)) return true;
          if (ctx.shouldIgnore(el)) return true;
          if (el.closest(".je-hidden")) return true;
          const cached = getCachedEntry(ctx, itemId);
          if (!cached) return false;
          if (isGuardedSeries(cached.seriesId)) return false;
          applyAgeRatingTag(ctx, el, cached.rating);
          return true;
        },
        renderFromServerCache(ctx, el, entry) {
          if (ctx.isTagged(el)) return;
          if (ctx.shouldIgnore(el)) return;
          applyAgeRatingTag(ctx, el, normalizeRating(entry.OfficialRating));
        }
      }
    };
    JE.initializeAgeRatingTags = function() {
      console.log(`${logPrefix} Starting...`);
      const ctx = JE.core.tagRenderer.register("agerating", spec);
      ctx.injectCss();
      ensureColourCss();
      console.log(`${logPrefix} Initialized successfully.`);
    };
    JE.reinitializeAgeRatingTags = function() {
      JE.core.tagRenderer.reinitialize("agerating", spec);
      ensureColourCss();
    };
    JE.core.tagRenderer.registerStyles(spec);
  }

  // client/src/features/media-tags/types/age-rating/ageratingtags-entry.ts
  createAgeRatingTags(tagRuntimeHost());
})();
})();
//# sourceMappingURL=ageratingtags.js.map
