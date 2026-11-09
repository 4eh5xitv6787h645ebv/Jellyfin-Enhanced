(() => {
"use strict";
(() => {
  // client/src/features/details-providers/host.ts
  function hostWindow() {
    return window;
  }
  function bridge(feature) {
    const host = window;
    const JE2 = host.JellyfinEnhanced;
    if (!JE2) throw new Error(`${feature} loaded before Jellyfin Enhanced`);
    return JE2;
  }
  function api() {
    const client = hostWindow().ApiClient;
    if (!client) throw new Error("Jellyfin ApiClient unavailable");
    return client;
  }
  function hasApi() {
    return hostWindow().ApiClient !== void 0;
  }
  function currentUserId() {
    const id = hostWindow().ApiClient?.getCurrentUserId();
    return typeof id === "string" && id ? id : null;
  }
  function dashboard() {
    return hostWindow().Dashboard;
  }
  function browserTranslator() {
    return hostWindow().Translator;
  }

  // client/src/features/details-providers/wire.ts
  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function field(value, key) {
    return isRecord(value) ? value[key] : void 0;
  }
  function str(value) {
    return typeof value === "string" ? value : void 0;
  }
  function text(value) {
    return typeof value === "string" && value !== "" ? value : void 0;
  }
  function num(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : void 0;
  }
  function bool(value) {
    return typeof value === "boolean" ? value : void 0;
  }
  function list(value) {
    return Array.isArray(value) ? value : [];
  }
  function stringList(value) {
    return list(value).filter((entry) => typeof entry === "string");
  }
  function providerId(value) {
    if (typeof value === "string") return value || void 0;
    if (typeof value === "number" && Number.isFinite(value) && value !== 0) return String(value);
    return void 0;
  }
  function decodeProviderIds(value) {
    const ids = {};
    if (!isRecord(value)) return ids;
    const tmdb = providerId(value.Tmdb), imdb = providerId(value.Imdb), tvdb = providerId(value.Tvdb);
    const aniList = providerId(value.AniList), anilist = providerId(value.Anilist);
    if (tmdb !== void 0) ids.Tmdb = tmdb;
    if (imdb !== void 0) ids.Imdb = imdb;
    if (tvdb !== void 0) ids.Tvdb = tvdb;
    if (aniList !== void 0) ids.AniList = aniList;
    if (anilist !== void 0) ids.Anilist = anilist;
    return ids;
  }
  function decodeStreams(value) {
    if (!Array.isArray(value)) return void 0;
    return value.filter(isRecord).map((stream) => {
      const result = {};
      const type = str(stream.Type), language = str(stream.Language);
      if (type !== void 0) result.Type = type;
      if (language !== void 0) result.Language = language;
      return result;
    });
  }
  function decodeSources(value) {
    if (!Array.isArray(value)) return void 0;
    return value.map((source) => {
      const result = {};
      const id = str(field(source, "Id")), streams = decodeStreams(field(source, "MediaStreams"));
      if (id !== void 0) result.Id = id;
      if (streams !== void 0) result.MediaStreams = streams;
      return result;
    });
  }
  function set(item, key, value) {
    if (value !== void 0) item[key] = value;
  }
  function decodeDetailsItem(value) {
    if (!isRecord(value)) return null;
    const item = { ProviderIds: decodeProviderIds(value.ProviderIds), SeriesProviderIds: decodeProviderIds(value.SeriesProviderIds) };
    set(item, "Id", str(value.Id));
    set(item, "Type", str(value.Type));
    set(item, "Name", str(value.Name));
    set(item, "SeriesId", str(value.SeriesId));
    set(item, "SeriesName", str(value.SeriesName));
    set(item, "IndexNumber", num(value.IndexNumber));
    set(item, "ParentIndexNumber", num(value.ParentIndexNumber));
    set(item, "PremiereDate", str(value.PremiereDate));
    set(item, "DisplayOrder", str(value.DisplayOrder));
    set(item, "MediaSources", decodeSources(value.MediaSources));
    set(item, "MediaStreams", decodeStreams(value.MediaStreams));
    set(item, "FirstEpisodeId", str(field(value.FirstEpisode, "Id")));
    if (Array.isArray(value.Tags)) item.Tags = stringList(value.Tags);
    const userData = value.UserData;
    set(item, "Played", bool(field(userData, "Played")));
    set(item, "UnplayedItemCount", num(field(userData, "UnplayedItemCount")));
    return item;
  }
  function errorShape(error) {
    const shape = {};
    const status = num(field(error, "status")), message = str(field(error, "message"));
    const json = field(error, "responseJSON");
    const code = str(field(json, "code")), responseMessage = str(field(json, "message"));
    const retry = num(field(json, "retryAfterSeconds"));
    if (status !== void 0) shape.status = status;
    if (message !== void 0) shape.message = message;
    if (code !== void 0) shape.responseCode = code;
    if (responseMessage !== void 0) shape.responseMessage = responseMessage;
    if (retry !== void 0) shape.retryAfterSeconds = retry;
    return shape;
  }

  // client/src/features/details-providers/page.ts
  function hashItemId(hash = window.location.hash) {
    try {
      return new URLSearchParams(hash.split("?")[1] ?? "").get("id");
    } catch {
      return null;
    }
  }
  function visibleDetailPage() {
    return document.querySelector("#itemDetailPage:not(.hide)");
  }
  function lookupItem(helpers, itemId, withUser, userId = currentUserId()) {
    if (helpers?.getItemCached) {
      return withUser ? helpers.getItemCached(itemId, { userId }) : helpers.getItemCached(itemId);
    }
    return api().getItem(userId, itemId);
  }
  async function lookupDetailsItem(helpers, itemId, withUser, userId = currentUserId()) {
    return decodeDetailsItem(await lookupItem(helpers, itemId, withUser, userId));
  }
  function detailsLease(session, itemId, page) {
    const sameSession = sessionLease(session);
    return {
      itemId,
      page,
      current: () => sameSession() && hashItemId() === itemId && page.isConnected && visibleDetailPage() === page
    };
  }
  function sessionLease(session) {
    const epoch = session?.getEpoch();
    const userId = currentUserId();
    const client = api();
    const root = client.getUrl("/");
    const token = client.accessToken();
    return () => hasApi() && api() === client && client.getUrl("/") === root && client.accessToken() === token && (!session || epoch === void 0 || session.isCurrent(epoch)) && currentUserId() === userId;
  }

  // client/src/features/details-providers/links.ts
  function pathSegment(id) {
    return encodeURIComponent(id);
  }

  // client/src/features/details-providers/review-domain.ts
  function htmlToMarkdown(value) {
    return String(value).replace(/<a\s[^>]*?href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)").replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, "**$2**").replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, "*$2*").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>\s*<p[^>]*>/gi, "\n\n").replace(/<\/?[a-z][^>]*>/gi, "");
  }
  function toPlainText(value) {
    return htmlToMarkdown(value).replace(/\[([^\]]+)\]\(https?:\/\/[^)\s]+\)/g, "$1").replace(/https?:\/\/[^\s<]+/g, "").replace(/(\*\*|__|~~|\*|`)/g, "").replace(/(^|\W)_([^_\n]+)_(?=\W|$)/g, "$1$2").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").trim();
  }
  function extractLinks(value) {
    const links = [];
    for (const match of htmlToMarkdown(value).matchAll(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g)) {
      if (match[1] !== void 0 && match[2] !== void 0) links.push({ label: match[1], url: match[2] });
    }
    return links;
  }
  function relink(translated, links, labels) {
    if (labels.length !== links.length) return translated;
    let out = translated;
    const linked = [];
    links.forEach((link, i) => {
      const lower = out.toLowerCase();
      const label = [link.label, labels[i] || ""].map((l) => l.trim().replace(/[[\]]/g, "")).find((l) => l && lower.includes(l.toLowerCase()));
      if (!label) return;
      const at = lower.indexOf(label.toLowerCase());
      linked.push(`[${out.substr(at, label.length)}](${link.url})`);
      out = `${out.slice(0, at)}${linked.length - 1}${out.slice(at + label.length)}`;
    });
    return out.replace(/\u0001(\d+)\u0002/g, (_match, n) => linked[Number(n)] ?? "");
  }
  function parseMarkdown(value, escapeHtml) {
    if (!value) return "";
    let html = escapeHtml(htmlToMarkdown(value));
    let marker = "\0JE";
    while (html.includes(marker)) marker += "J";
    const protectedHtml = [];
    const protect = (content) => `${marker}${protectedHtml.push(content) - 1}\0`;
    const emphasize = (text2) => text2.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/__(.+?)__/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>").replace(/_(.+?)_/g, "<em>$1</em>").replace(/~~(.+?)~~/g, "<del>$1</del>");
    const anchor = (label, url) => `<a is="emby-linkbutton" href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    html = html.replace(
      /`([^`\n]+)`|\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<]+)/gi,
      (_match, code, label, url, plainUrl) => {
        if (code !== void 0) return protect(`<code>${code}</code>`);
        if (label !== void 0 && url !== void 0) return protect(anchor(emphasize(label), url));
        const raw = plainUrl ?? "";
        const trimmed = raw.replace(/[.,;!?)]+$/, "");
        return protect(anchor(trimmed, trimmed)) + raw.slice(trimmed.length);
      }
    );
    html = emphasize(html);
    const lines = html.split(/\r?\n/);
    const processed = [];
    let inBlockquote = false;
    let blockquoteLines = [];
    let inList = false;
    let listItems = [];
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith("&gt; ")) {
        if (!inBlockquote) {
          inBlockquote = true;
          blockquoteLines = [];
        }
        blockquoteLines.push(trimmedLine.substring(5));
        continue;
      } else if (inBlockquote) {
        processed.push("<blockquote>" + blockquoteLines.join("<br>") + "</blockquote>");
        inBlockquote = false;
        blockquoteLines = [];
      }
      if (/^[-*]\s+/.test(trimmedLine)) {
        if (!inList) {
          inList = true;
          listItems = [];
        }
        listItems.push("<li>" + trimmedLine.substring(2) + "</li>");
        continue;
      } else if (inList) {
        processed.push("<ul>" + listItems.join("") + "</ul>");
        inList = false;
        listItems = [];
      }
      const heading = /^(#{1,6})\s/.exec(trimmedLine);
      if (heading?.[1]) {
        const level = /^#+/.exec(trimmedLine)?.[0].length ?? heading[1].length;
        processed.push(`<h${level}>${trimmedLine.substring(level + 1)}</h${level}>`);
        continue;
      }
      if (/^([-*]){3,}$/.test(trimmedLine)) {
        processed.push("<hr>");
        continue;
      }
      processed.push(trimmedLine ? line : "<br>");
    }
    if (inBlockquote) processed.push("<blockquote>" + blockquoteLines.join("<br>") + "</blockquote>");
    if (inList) processed.push("<ul>" + listItems.join("") + "</ul>");
    return protectedHtml.reduce((text2, content, index) => text2.split(`${marker}${index}\0`).join(content), processed.join(""));
  }
  var STAR_POLYGON = '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>';
  function starIconHtml(fillFraction) {
    const pct = Math.round(Math.max(0, Math.min(1, fillFraction)) * 100);
    return `<span class="je-star-icon" aria-hidden="true">
                <svg class="je-star-icon-base" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${STAR_POLYGON}</svg>
                <svg class="je-star-icon-fill" style="clip-path: inset(0 ${100 - pct}% 0 0);" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${STAR_POLYGON}</svg>
            </span>`;
  }
  function renderUserStarRating(rating) {
    if (!rating) return "";
    const stars = Array.from({ length: 5 }, (_, index) => starIconHtml(Math.max(0, Math.min(1, rating - index)))).join("");
    return `<span class="je-user-star-rating">${stars}</span>`;
  }
  function reviewDate(value) {
    return value ? new Date(value).toLocaleDateString(void 0, { year: "numeric", month: "short", day: "numeric" }) : "";
  }
  function decodeTmdbReviews(value) {
    return list(field(value, "results")).filter(isRecord).map((review) => ({
      author: str(review.author),
      created_at: str(review.created_at),
      content: str(review.content),
      // Rendered into markup: only a finite number is a rating.
      rating: num(field(review.author_details, "rating")) ?? null,
      url: str(review.url)
    }));
  }
  function decodeAnilistReviews(value) {
    return list(field(value, "Reviews")).filter(isRecord).map((review) => {
      const content = str(review.Content);
      const summary = str(review.Summary);
      const score = num(review.Score);
      return {
        source: "anilist",
        author: text(review.Author) || "Anonymous",
        created_at: str(review.CreatedAt),
        content: summary ? `**${summary}**

${content}` : content,
        rating: score ? Number((score / 10).toFixed(1)) : null,
        url: str(review.Url)
      };
    });
  }
  function decodeUserReviews(value) {
    return list(field(value, "reviews")).filter(isRecord).map((review) => ({
      userId: str(review.userId) ?? "",
      userName: str(review.userName),
      content: str(review.content),
      rating: num(review.rating) ?? null,
      createdAt: str(review.createdAt),
      updatedAt: str(review.updatedAt)
    }));
  }
  var sameUser = (a, b) => a.replace(/-/g, "") === b.replace(/-/g, "");
  function averageUserRating(reviews) {
    const rated = reviews.filter((review) => !!review.rating);
    if (rated.length === 0) return null;
    const raw = rated.reduce((sum, review) => sum + review.rating, 0) / rated.length * 2;
    return { display: Number.isInteger(raw) ? `${raw}` : `${raw.toFixed(1)}`, count: rated.length };
  }
  function translationTargets(language) {
    const [base, region] = language.split("-");
    const code = (base || "").toLowerCase();
    if (!code || code === "en") return null;
    const traditional = code === "zh" && /^(tw|hk|mo)$/i.test(region || "");
    return { server: traditional ? "zt" : code, browser: traditional ? "zh-Hant" : code };
  }
  function interpolate(template, params) {
    let out = template;
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        out = out.replace(new RegExp(`\\{${key}\\}`, "g"), () => String(value));
      }
    }
    return out;
  }

  // client/src/features/details-providers/reviews.ts
  var JE = bridge("Reviews");
  var REVIEW_PREVIEW_LENGTH = 350;
  JE.initializeReviewsScript = function initializeReviewsScript() {
    const config = JE.pluginConfig;
    const tmdbReviewsEnabled = config.ShowReviews && config.TmdbEnabled;
    const userReviewsEnabled = config.ShowUserReviews;
    const anilistReviewsEnabled = config.ShowAnilistReviews;
    if (!tmdbReviewsEnabled && !userReviewsEnabled && !anilistReviewsEnabled) {
      console.log("🪼 Jellyfin Enhanced: Reviews feature disabled.");
      return;
    }
    const logPrefix = "🪼 Jellyfin Enhanced: Reviews:";
    let renderedOwners = /* @__PURE__ */ new WeakMap();
    let pageLoads = /* @__PURE__ */ new WeakMap();
    JE.session?.onUserChange("details-reviews", () => {
      document.querySelectorAll(".tmdb-reviews-section, .je-avg-user-rating-chip").forEach((section) => section.remove());
      renderedOwners = /* @__PURE__ */ new WeakMap();
      pageLoads = /* @__PURE__ */ new WeakMap();
    });
    const escapeHtml = (value) => JE.escapeHtml(value);
    const markdown = (value) => parseMarkdown(value, escapeHtml);
    async function shouldSuppressForSpoilerMode(item, mediaType) {
      try {
        if (mediaType !== "Series" && mediaType !== "Movie" && mediaType !== "Season" && mediaType !== "Episode") return false;
        if (!JE.pluginConfig.SpoilerBlurEnabled) return false;
        if (JE.pluginConfig.SpoilerStripReviews === false) return false;
        const guard = JE.spoilerBlur;
        if (!guard) return false;
        if (typeof guard.whenLoaded === "function") await guard.whenLoaded();
        if (typeof guard.isLoadOk === "function" && !guard.isLoadOk()) {
          console.warn(`${logPrefix} Spoiler Guard state load failed; suppressing reviews fail-closed.`);
          return true;
        }
        if (typeof guard.getUserPrefs === "function") {
          const prefs = guard.getUserPrefs() || {};
          if (prefs.HideReviews === false) return false;
        }
        if (mediaType === "Movie") {
          const inScope = guard.isMovieInScope;
          if (typeof inScope !== "function") throw new TypeError("Spoiler Guard movie scope unavailable");
          return await inScope.call(guard, item?.Id || "");
        }
        const seriesKey = mediaType === "Series" ? item?.Id || "" : item?.SeriesId || "";
        return !!(guard.isEnabledFor && guard.isEnabledFor(seriesKey));
      } catch (e) {
        console.warn(`${logPrefix} Spoiler Guard check failed; suppressing reviews:`, e);
        return true;
      }
    }
    function removeReviewsSection(page) {
      try {
        const root = page || visibleDetailPage() || document;
        root.querySelector(".tmdb-reviews-section")?.remove();
        root.querySelector(".je-avg-user-rating-chip")?.remove();
      } catch (e) {
        console.warn(`${logPrefix} removeReviewsSection failed:`, e);
      }
    }
    function fetchReviews(tmdbId, mediaType) {
      const apiMediaType = mediaType === "Series" ? "tv" : "movie";
      const id = pathSegment(tmdbId);
      const path = `/${apiMediaType}/${id}/reviews?language=en-US&page=1`;
      const url = `${api().getUrl(`/JellyfinEnhanced/tmdb/${apiMediaType}/${id}/reviews`)}?language=en-US&page=1`;
      return JE.core.api.fetch(url, { cacheKey: `tmdb:${path}` }).then(decodeTmdbReviews).catch((error) => {
        console.error(`${logPrefix} Failed to fetch reviews.`, error);
        return null;
      });
    }
    function fetchAnilistReviews(item) {
      const ids = item?.ProviderIds;
      const anilistId = parseInt(ids?.AniList || ids?.Anilist || "", 10);
      if (!anilistId) return Promise.resolve(null);
      const query = `anilistId=${anilistId}`;
      return JE.core.api.fetch(`${api().getUrl("/JellyfinEnhanced/anilist/reviews")}?${query}`, { cacheKey: `anilist:${query}` }).then(decodeAnilistReviews).catch((error) => {
        console.error(`${logPrefix} Failed to fetch AniList reviews.`, error);
        return null;
      });
    }
    async function fetchExternalReviews(item, tmdbKey, mediaType) {
      if (mediaType !== "Movie" && mediaType !== "Series") return null;
      const [tmdb, anilist] = await Promise.all([
        tmdbReviewsEnabled ? fetchReviews(tmdbKey.split(":")[0] ?? "", mediaType) : null,
        anilistReviewsEnabled ? fetchAnilistReviews(item) : null
      ]);
      return tmdb || anilist ? [...tmdb || [], ...anilist || []] : null;
    }
    const keyPath = (tmdbKey) => tmdbKey.split(":").map(pathSegment).join(":");
    function fetchUserReviews(tmdbKey, mediaType) {
      return JE.core.api.plugin(`/reviews/${mediaType}/${keyPath(tmdbKey)}`).then(decodeUserReviews).catch((err) => {
        console.error(`${logPrefix} Failed to fetch user reviews.`, err);
        return [];
      });
    }
    async function saveUserReview(tmdbKey, mediaType, content, rating) {
      try {
        return await JE.core.api.plugin(`/reviews/${mediaType}/${keyPath(tmdbKey)}`, { method: "POST", body: { content, rating: rating || null }, skipRetry: true });
      } catch (e) {
        const shape = errorShape(e);
        throw new Error(shape.responseMessage || shape.message);
      }
    }
    async function deleteUserReview(tmdbKey, mediaType) {
      await JE.core.api.plugin(`/reviews/${mediaType}/${keyPath(tmdbKey)}`, { method: "DELETE", skipRetry: true });
    }
    async function adminDeleteUserReview(targetUserId, tmdbKey, mediaType) {
      const userIdN = (targetUserId || "").replace(/-/g, "");
      try {
        await JE.core.api.plugin(`/reviews/admin/${pathSegment(userIdN)}/${mediaType}/${keyPath(tmdbKey)}`, { method: "DELETE", skipRetry: true });
      } catch (e) {
        if (errorShape(e).status === 404) throw new Error("No matching review to delete (it may have already been removed).");
        throw e;
      }
    }
    function jeConfirm(message, title) {
      return new Promise((resolve) => {
        const host = dashboard();
        if (host && typeof host.confirm === "function") {
          try {
            host.confirm(message, title, resolve);
            return;
          } catch (err) {
            console.warn(`${logPrefix} Dashboard.confirm threw, falling back:`, err);
          }
        }
        resolve(window.confirm(title ? `${title}

${message}` : message));
      });
    }
    function jeAlert(message, title) {
      const host = dashboard();
      if (host && typeof host.alert === "function") {
        try {
          host.alert({ title: title || "", message: message || "" });
          return;
        } catch (err) {
          console.warn(`${logPrefix} Dashboard.alert threw, falling back:`, err);
        }
      }
      window.alert(title ? `${title}

${message}` : message);
    }
    const tFallbackWarned = /* @__PURE__ */ new Set();
    function tWithFallback(key, fallback, params) {
      let result;
      try {
        result = JE.t(key, params);
      } catch (err) {
        console.warn(`${logPrefix} JE.t('${key}') threw, using fallback:`, err);
        result = null;
      }
      if (!result || result === key) {
        if (!tFallbackWarned.has(key)) {
          tFallbackWarned.add(key);
          console.warn(`${logPrefix} Missing translation key '${key}', using inline fallback.`);
        }
        return interpolate(fallback, params);
      }
      return result;
    }
    const toggleHtml = (key) => `<span class="tmdb-review-toggle">${JE.t(key)}</span>`;
    function previewHtml(content, expanded) {
      const long = content.length > REVIEW_PREVIEW_LENGTH;
      return markdown(long && !expanded ? content.substring(0, REVIEW_PREVIEW_LENGTH) : content) + (long ? toggleHtml(expanded ? "reviews_read_less" : "reviews_read_more") : "");
    }
    function createReviewElement(review) {
      const reviewCard = document.createElement("div");
      reviewCard.className = "tmdb-review-card";
      const isAnilist = review.source === "anilist";
      if (isAnilist) reviewCard.classList.add("je-anilist-review-card");
      reviewCard.dataset.fullContent = review.content || "";
      const content = review.content || "No content available";
      const date = reviewDate(review.created_at);
      const ratingDisplay = review.rating ? `<span class="tmdb-review-rating">${JE.icon(JE.IconName.STAR)} ${review.rating}</span>` : "";
      reviewCard.innerHTML = `
                <div class="tmdb-review-header">
                    <div class="tmdb-review-author-info">
                        <strong class="tmdb-review-author">${escapeHtml(review.author || "Anonymous")}</strong>
                        <span class="tmdb-review-date">${escapeHtml(date)}</span>
                    </div>
                    ${ratingDisplay}
                </div>
                <div class="tmdb-review-content-wrapper">
                    <p class="tmdb-review-text"></p>
                </div>
            `;
      const url = review.url || "";
      const sourceUrl = isAnilist ? /^https:\/\/anilist\.co\//.test(url) ? url : "" : /^https:\/\/www\.themoviedb\.org\//.test(url) ? url : "";
      const tag = sourceUrl ? JE.helpers.createExternalLink(sourceUrl, { className: "je-review-source", resetStyle: true }) : Object.assign(document.createElement("span"), { className: "je-review-source" });
      const logo = document.createElement("img");
      logo.src = JE.cdn.url("mdblist-logos", isAnilist ? "anilist.png" : "tmdb.png");
      logo.alt = "";
      logo.className = "je-review-source-logo";
      logo.loading = "lazy";
      tag.append(logo, isAnilist ? "AniList" : "TMDB");
      const dateEl = reviewCard.querySelector(".tmdb-review-date");
      if (date) dateEl?.append(Object.assign(document.createElement("span"), { textContent: "·" }));
      dateEl?.append(tag);
      const textElement = reviewCard.querySelector(".tmdb-review-text");
      if (textElement) textElement.innerHTML = previewHtml(content, false);
      attachTranslateButton(reviewCard, review.content || "");
      return reviewCard;
    }
    function getTranslationTargets() {
      let language = "";
      try {
        language = localStorage.getItem(`${currentUserId()}-language`) || "";
      } catch {
      }
      return translationTargets(language || document.documentElement.lang || "");
    }
    let translationLanguages = null;
    function getTranslationLanguages() {
      translationLanguages ?? (translationLanguages = JE.core.api.plugin("/translate/languages", { skipRetry: true }).then((response) => list(field(response, "languages")).filter((code) => typeof code === "string")).catch(() => []));
      return translationLanguages;
    }
    async function browserCanTranslate(target) {
      try {
        const translator = browserTranslator();
        if (!window.isSecureContext || !translator) return false;
        return await translator.availability({ sourceLanguage: "en", targetLanguage: target }) !== "unavailable";
      } catch {
        return false;
      }
    }
    async function translateInBrowser(value, target) {
      const factory = browserTranslator();
      if (!factory) throw new Error("Browser translator unavailable");
      const translator = await factory.create({ sourceLanguage: "en", targetLanguage: target });
      try {
        const lines = [];
        for (const line of value.split("\n")) lines.push(line.trim() ? await translator.translate(line) : line);
        return lines.join("\n");
      } finally {
        translator.destroy?.();
      }
    }
    function translateFailedMessage(error) {
      const shape = errorShape(error);
      if (shape.status === 429 || shape.responseCode === "translation_rate_limited") {
        const seconds = shape.retryAfterSeconds;
        return seconds !== void 0 && seconds > 0 ? JE.t("reviews_translate_rate_limited_wait", { seconds }) : JE.t("reviews_translate_rate_limited");
      }
      if (shape.responseCode === "translation_refused") return JE.t("reviews_translate_refused");
      return JE.t("reviews_translate_failed");
    }
    function attachTranslateButton(card, original) {
      if (!JE.pluginConfig.ReviewTranslationEnabled || !original.trim()) return;
      const targets = getTranslationTargets();
      if (!targets) return;
      void Promise.all([
        browserCanTranslate(targets.browser),
        JE.pluginConfig.ReviewTranslationServer ? getTranslationLanguages().then((languages) => languages.includes(targets.server)) : false
      ]).then(([browserOk, serverOk]) => {
        if (!browserOk && !serverOk) return;
        const textElement = card.querySelector(".tmdb-review-text");
        const parent = textElement?.parentElement;
        if (!textElement || !parent) return;
        const button = document.createElement("span");
        button.className = "je-review-translate";
        const icon = Object.assign(document.createElement("span"), { className: "je-msym-rounded", textContent: "translate" });
        icon.setAttribute("aria-hidden", "true");
        const label = Object.assign(document.createElement("span"), { className: "je-review-translate-label" });
        button.append(icon, label);
        const setLabel = (key) => {
          label.textContent = JE.t(key);
        };
        setLabel("reviews_translate");
        parent.appendChild(button);
        const translateText = async (value) => {
          if (browserOk) {
            try {
              return await translateInBrowser(value, targets.browser);
            } catch (e) {
              if (!serverOk) throw e;
            }
          }
          const response = await JE.core.api.plugin("/translate", { method: "POST", body: { text: value, target: targets.server }, skipRetry: true });
          const translated = str(field(response, "text"));
          if (translated === void 0) throw new Error("Invalid translation response");
          return translated;
        };
        const translate = async () => {
          const body = await translateText(toPlainText(original));
          const links = extractLinks(original);
          if (!links.length) return body;
          const labels = await translateText(links.map((link) => link.label.replace(/\s+/g, " ")).join("\n"));
          return relink(body, links, labels.split("\n"));
        };
        const show = (full) => {
          textElement.innerHTML = previewHtml(full, textElement.classList.contains("expanded"));
        };
        let busy = false;
        button.addEventListener("click", async () => {
          if (busy) return;
          if (card.dataset.showTranslated === "1") {
            card.dataset.showTranslated = "0";
            show(original);
            setLabel("reviews_translate");
            return;
          }
          if (card.dataset.translatedContent === void 0) {
            busy = true;
            setLabel("reviews_translating");
            try {
              card.dataset.translatedContent = await translate();
            } catch (e) {
              setLabel("reviews_translate");
              JE.toast(translateFailedMessage(e));
              return;
            } finally {
              busy = false;
            }
          }
          card.dataset.showTranslated = "1";
          show(card.dataset.translatedContent ?? "");
          setLabel("reviews_show_original");
        });
      });
    }
    function createUserReviewElement(review, viewer, onEdit, onDelete) {
      const reviewCard = document.createElement("div");
      reviewCard.className = "tmdb-review-card je-user-review-card";
      const content = review.content || "";
      const date = reviewDate(review.updatedAt) || reviewDate(review.createdAt);
      const ratingDisplay = review.rating ? `<span class="tmdb-review-rating je-user-review-rating">${renderUserStarRating(review.rating)}</span>` : "";
      const avatarSrc = api().getUrl(`/Users/${pathSegment(review.userId)}/Images/Primary`) + "?width=48&quality=90";
      const isOwn = sameUser(review.userId, viewer.id);
      const showModerationDelete = !isOwn && viewer.isAdmin;
      const editTitle = tWithFallback("reviews_edit", "Edit");
      const deleteTitle = tWithFallback("reviews_delete", "Delete");
      const adminDeleteTitle = tWithFallback("reviews_admin_delete", "Delete as admin");
      let actionButtons = "";
      if (isOwn) {
        actionButtons = `
                <div class="je-user-review-actions">
                    <button class="je-review-btn je-review-edit-btn" title="${escapeHtml(editTitle)}"><span class="material-icons" aria-hidden="true">edit</span></button>
                    <button class="je-review-btn je-review-delete-btn" title="${escapeHtml(deleteTitle)}"><span class="material-icons" aria-hidden="true">delete</span></button>
                </div>`;
      } else if (showModerationDelete) {
        actionButtons = `
                <div class="je-user-review-actions">
                    <button class="je-review-btn je-review-delete-btn je-review-admin-delete-btn" title="${escapeHtml(adminDeleteTitle)}"><span class="material-icons" aria-hidden="true">delete</span></button>
                </div>`;
      }
      reviewCard.innerHTML = `
                <div class="tmdb-review-header je-user-review-header">
                    <div class="je-user-review-avatar-wrapper">
                        <img class="je-user-avatar" src="${escapeHtml(avatarSrc)}" alt="">
                    </div>
                    <div class="tmdb-review-author-info">
                        <strong class="tmdb-review-author">${escapeHtml(review.userName || "User")}</strong>
                        <span class="tmdb-review-date">${escapeHtml(date)}</span>
                    </div>
                    ${ratingDisplay}
                    ${actionButtons}
                </div>
                ${content.length > 0 ? `
                <div class="tmdb-review-content-wrapper">
                    <p class="tmdb-review-text"></p>
                </div>` : ""}
            `;
      const avatar = reviewCard.querySelector(".je-user-avatar");
      if (avatar) avatar.onerror = () => {
        avatar.style.display = "none";
      };
      const textElement = reviewCard.querySelector(".tmdb-review-text");
      if (textElement) textElement.innerHTML = previewHtml(content, false);
      reviewCard.dataset.fullContent = content;
      if (isOwn) {
        reviewCard.querySelector(".je-review-edit-btn")?.addEventListener("click", () => onEdit(review));
        reviewCard.querySelector(".je-review-delete-btn")?.addEventListener("click", () => onDelete(review));
      } else if (showModerationDelete) {
        reviewCard.querySelector(".je-review-admin-delete-btn")?.addEventListener("click", () => onDelete(review));
      }
      return reviewCard;
    }
    function createReviewForm(existingReview, onSave, onCancel) {
      const form = document.createElement("div");
      form.className = "je-review-form";
      let currentRating = existingReview?.rating || 0;
      form.innerHTML = `
                ${existingReview ? "" : `<h4 class="je-review-form-title">${JE.t("reviews_add")}</h4>`}
                <div class="je-review-star-picker" role="radiogroup">
                    ${[1, 2, 3, 4, 5].map((n) => `<button class="je-star-btn" data-value="${n}" type="button" aria-label="${n} stars">${starIconHtml(0)}</button>`).join("")}
                    <button class="je-star-clear-btn" type="button"><span class="material-icons" aria-hidden="true">close</span></button>
                    <span class="je-star-label"></span>
                </div>
                <textarea class="je-review-textarea" maxlength="2000">${escapeHtml(existingReview?.content || "")}</textarea>
                <div class="je-review-char-counter"><span class="je-review-char-count">${existingReview?.content?.length || 0}</span>/2000</div>
                <div class="je-review-form-btns">
                    <button class="je-review-btn je-review-submit-btn" type="button"><span class="material-icons" aria-hidden="true">save</span></button>
                    <button class="je-review-btn je-review-cancel-btn" type="button"><span class="material-icons" aria-hidden="true">close</span></button>
                </div>
                <div class="je-review-form-error" aria-live="polite"></div>
            `;
      const starBtns = form.querySelectorAll(".je-star-btn");
      const required = (selector) => {
        const found = form.querySelector(selector);
        if (!found) throw new Error(`Review form is missing ${selector}`);
        return found;
      };
      const clearBtn = required(".je-star-clear-btn");
      const starLabel = required(".je-star-label");
      const textarea = required(".je-review-textarea");
      const charCount = required(".je-review-char-count");
      const submitBtn = required(".je-review-submit-btn");
      const cancelBtn = required(".je-review-cancel-btn");
      const errorEl = required(".je-review-form-error");
      const setFill = (value) => {
        starBtns.forEach((btn) => {
          const n = parseInt(btn.dataset.value ?? "0", 10);
          const pct = Math.round(Math.max(0, Math.min(1, value - (n - 1))) * 100);
          const fillSvg = btn.querySelector(".je-star-icon-fill");
          if (fillSvg) fillSvg.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
        });
      };
      const updateStars = (value) => {
        currentRating = value;
        setFill(value);
        starLabel.textContent = currentRating > 0 ? `${currentRating}/5` : "";
      };
      const valueForPointer = (btn, clientX) => {
        const n = parseInt(btn.dataset.value ?? "0", 10);
        const rect = btn.getBoundingClientRect();
        return clientX - rect.left < rect.width / 2 ? n - 0.5 : n;
      };
      updateStars(currentRating);
      starBtns.forEach((btn) => {
        btn.addEventListener("click", (event) => updateStars(valueForPointer(btn, event.clientX)));
        btn.addEventListener("mousemove", (event) => setFill(valueForPointer(btn, event.clientX)));
        btn.addEventListener("mouseleave", () => setFill(currentRating));
      });
      clearBtn.addEventListener("click", () => updateStars(0));
      textarea.addEventListener("input", () => {
        charCount.textContent = String(textarea.value.length);
      });
      submitBtn.addEventListener("click", async () => {
        const content = textarea.value.trim();
        if (!content && !currentRating) {
          errorEl.textContent = JE.t("reviews_form_error_empty");
          return;
        }
        errorEl.textContent = "";
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="material-icons" aria-hidden="true">hourglass_empty</span>';
        try {
          await onSave(content, currentRating || null);
        } catch {
          errorEl.textContent = JE.t("reviews_form_error_save");
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span class="material-icons" aria-hidden="true">save</span>';
        }
      });
      cancelBtn.addEventListener("click", onCancel);
      return form;
    }
    function insertAverageChip(contextPage, userReviews) {
      const average = averageUserRating(userReviews);
      contextPage.querySelector(".je-avg-user-rating-chip")?.remove();
      if (!average) return;
      const chip = document.createElement("div");
      chip.className = "mediaInfoCriticRating mediaInfoItem je-avg-user-rating-chip";
      chip.title = tWithFallback("reviews_avg_rating_tooltip", "Average rating from {count} user(s)", { count: average.count });
      chip.innerHTML = `<span class="je-msym-rounded starIcon" aria-hidden="true" style="color:#e91e8c;">person_heart</span>${escapeHtml(average.display)}`;
      const anchor = contextPage.querySelector(".mediaInfoCriticRating") || contextPage.querySelector(".starRatingContainer");
      if (anchor?.parentNode) anchor.parentNode.insertBefore(chip, anchor.nextSibling);
      else contextPage.querySelector(".mediaInfoItems")?.appendChild(chip);
    }
    function addReviewsToPage(reviews, userReviews, contextPage, target, viewer) {
      removeReviewsSection(contextPage);
      if (userReviewsEnabled && userReviews.length > 0) insertAverageChip(contextPage, userReviews);
      const { tmdbKey, apiMediaType } = target;
      const ownReview = userReviews.find((review) => sameUser(review.userId, viewer.id));
      const reviewsSection = document.createElement("details");
      reviewsSection.className = "detailSection tmdb-reviews-section";
      const owner = detailsLease(JE.session, hashItemId() || "", contextPage);
      const current = () => reviewsSection.isConnected && owner.current();
      if (JE.currentSettings?.reviewsExpandedByDefault) reviewsSection.setAttribute("open", "");
      const totalCount = (reviews ? reviews.length : 0) + userReviews.length;
      const summary = document.createElement("summary");
      summary.className = "sectionTitle";
      summary.innerHTML = `${JE.t("reviews_title", { count: totalCount })} <i class="material-icons expand-icon">expand_more</i>`;
      reviewsSection.appendChild(summary);
      const actionBar = document.createElement("div");
      actionBar.className = "je-review-action-bar";
      let writeBtn = null;
      if (userReviewsEnabled && !ownReview) {
        writeBtn = document.createElement("button");
        writeBtn.className = "je-review-btn je-review-write-btn";
        writeBtn.textContent = JE.t("reviews_add");
        actionBar.appendChild(writeBtn);
      }
      reviewsSection.appendChild(actionBar);
      const formPlaceholder = document.createElement("div");
      formPlaceholder.className = "je-review-form-placeholder";
      reviewsSection.appendChild(formPlaceholder);
      const swipeContainer = document.createElement("div");
      swipeContainer.className = "tmdb-review-swipe-container";
      const openForm = (existingReview) => {
        if (!current()) return;
        formPlaceholder.replaceChildren();
        const form = createReviewForm(existingReview, async (content, rating) => {
          if (!current()) return;
          await saveUserReview(tmdbKey, apiMediaType, content, rating);
          if (current()) void refreshReviews(contextPage);
        }, () => {
          formPlaceholder.replaceChildren();
        });
        formPlaceholder.appendChild(form);
        reviewsSection.setAttribute("open", "");
        form.querySelector(".je-review-textarea")?.focus();
      };
      const deleteReview = async (review) => {
        if (!current()) return;
        const isOwn = sameUser(review.userId, viewer.id);
        const userName = review.userName || "user";
        const title = isOwn ? tWithFallback("reviews_delete_title", "Delete review") : tWithFallback("reviews_admin_delete_title", "Delete review (admin)");
        const body = isOwn ? tWithFallback("reviews_delete_confirm", "Delete your review for this item?") : tWithFallback("reviews_admin_delete_confirm", "Delete this review by {user}? This cannot be undone.", { user: userName });
        if (!await jeConfirm(body, title) || !current()) return;
        try {
          if (isOwn) await deleteUserReview(tmdbKey, apiMediaType);
          else await adminDeleteUserReview(review.userId, tmdbKey, apiMediaType);
          if (current()) void refreshReviews(contextPage);
        } catch (e) {
          if (!current()) return;
          console.error(`${logPrefix} Delete failed`, e);
          const errTitle = tWithFallback("reviews_delete_error_title", "Delete failed");
          const errBody = tWithFallback("reviews_delete_error_body", "Could not delete the review: {err}", { err: errorShape(e).message || "Unknown error" });
          jeAlert(errBody, errTitle);
          void refreshReviews(contextPage);
        }
      };
      for (const userReview of userReviews) swipeContainer.appendChild(createUserReviewElement(userReview, viewer, (review) => openForm(review), deleteReview));
      for (const review of (reviews ?? []).slice(0, 10)) swipeContainer.appendChild(createReviewElement(review));
      reviewsSection.appendChild(swipeContainer);
      writeBtn?.addEventListener("click", () => {
        if (formPlaceholder.querySelector(".je-review-form")) formPlaceholder.replaceChildren();
        else openForm(ownReview || null);
      });
      swipeContainer.addEventListener("click", (event) => {
        const toggle = event.target;
        if (!(toggle instanceof Element) || !toggle.classList.contains("tmdb-review-toggle")) return;
        const textElement = toggle.parentElement;
        const card = textElement?.closest(".tmdb-review-card");
        if (!textElement || !card) return;
        const full = (card.dataset.showTranslated === "1" ? card.dataset.translatedContent : card.dataset.fullContent) || "";
        const expanded = textElement.classList.toggle("expanded");
        textElement.innerHTML = expanded ? markdown(full) + toggleHtml("reviews_read_less") : markdown(full.substring(0, REVIEW_PREVIEW_LENGTH)) + toggleHtml("reviews_read_more");
      });
      reviewsSection.addEventListener("toggle", () => {
        if (!current()) return;
        try {
          const settings = JE.currentSettings = JE.currentSettings || JE.loadSettings?.() || {};
          if (settings.reviewsExpandedByDefault !== reviewsSection.open) {
            settings.reviewsExpandedByDefault = reviewsSection.open;
            if (typeof JE.saveUserSettings === "function") JE.saveUserSettings("settings.json", settings);
          }
        } catch (err) {
          console.error(`${logPrefix} Failed to persist reviews expanded state`, err);
        }
      });
      const insertionAnchor = contextPage.querySelector(".streaming-lookup-container") || contextPage.querySelector(".itemExternalLinks") || contextPage.querySelector(".tagline");
      if (insertionAnchor?.parentNode) insertionAnchor.parentNode.insertBefore(reviewsSection, insertionAnchor.nextSibling);
      else console.error(`${logPrefix} Could not find a suitable anchor to insert reviews.`);
    }
    async function resolveTarget(item, mediaType, seriesLookup) {
      if (!item) return null;
      if (mediaType === "Movie" || mediaType === "Series") {
        const tmdbId = item.ProviderIds.Tmdb;
        return tmdbId ? { tmdbKey: tmdbId, apiMediaType: mediaType === "Movie" ? "movie" : "tv" } : null;
      }
      if (mediaType !== "Season" && mediaType !== "Episode") return null;
      let seriesTmdbId = item.SeriesProviderIds.Tmdb;
      if (!seriesTmdbId && item.SeriesId) {
        try {
          seriesTmdbId = (await seriesLookup(item.SeriesId))?.ProviderIds.Tmdb;
        } catch {
        }
      }
      if (!seriesTmdbId || item.IndexNumber == null) return null;
      if (mediaType === "Season") return { tmdbKey: `${seriesTmdbId}:s${item.IndexNumber}`, apiMediaType: "tv" };
      if (item.ParentIndexNumber == null) return null;
      return { tmdbKey: `${seriesTmdbId}:s${item.ParentIndexNumber}:e${item.IndexNumber}`, apiMediaType: "tv" };
    }
    async function fetchViewer() {
      const client = api();
      let user = null;
      try {
        user = client.getCurrentUser ? await client.getCurrentUser() : null;
      } catch {
        user = null;
      }
      return {
        id: str(field(user, "Id")) || client.getCurrentUserId() || "",
        isAdmin: bool(field(field(user, "Policy"), "IsAdministrator")) === true
      };
    }
    async function loadInto(page, seriesLookup, force = false) {
      const itemId = hashItemId();
      const userId = currentUserId();
      if (!itemId || !userId) return;
      const lease = detailsLease(JE.session, itemId, page);
      const request = {};
      pageLoads.set(page, request);
      const current = () => lease.current() && pageLoads.get(page) === request;
      const item = await lookupDetailsItem(JE.helpers, itemId, true, userId);
      if (!current()) return;
      const mediaType = item?.Type;
      if (!item || !mediaType) {
        removeReviewsSection(page);
        renderedOwners.delete(page);
        return;
      }
      if (await shouldSuppressForSpoilerMode(item, mediaType)) {
        if (current()) {
          removeReviewsSection(page);
          renderedOwners.delete(page);
        }
        return;
      }
      if (!current()) return;
      if (!force && renderedOwners.get(page)?.current() && page.querySelector(".tmdb-reviews-section")) return;
      const target = await resolveTarget(item, mediaType, (seriesId) => seriesLookup(userId, seriesId));
      if (!target || !mediaType || !current()) return;
      const [externalReviews, userReviews, viewer] = await Promise.all([
        // TMDB and AniList reviews are movie/series only
        fetchExternalReviews(item, target.tmdbKey, mediaType),
        userReviewsEnabled ? fetchUserReviews(target.tmdbKey, target.apiMediaType) : Promise.resolve([]),
        fetchViewer()
      ]);
      if (!current()) return;
      addReviewsToPage(externalReviews, userReviews, page, target, viewer);
      renderedOwners.set(page, lease);
      if (typeof JE.invalidateUserReviewTagCache === "function") JE.invalidateUserReviewTagCache(target.tmdbKey);
    }
    async function refreshReviews(contextPage) {
      try {
        await loadInto(visibleDetailPage() || contextPage, async (userId, seriesId) => decodeDetailsItem(await api().getItem(userId, seriesId)), true);
      } catch (err) {
        console.error(`${logPrefix} Failed to refresh reviews:`, err);
      }
    }
    async function processPage(visiblePage) {
      if (!visiblePage) return;
      if (!renderedOwners.get(visiblePage)?.current()) {
        removeReviewsSection(visiblePage);
        renderedOwners.delete(visiblePage);
      }
      try {
        await loadInto(visiblePage, (userId, seriesId) => lookupDetailsItem(JE.helpers, seriesId, true, userId));
      } catch (error) {
        console.error(`${logPrefix} Error processing page:`, error);
      }
    }
    function injectCss() {
      const styleId = "tmdb-reviews-enhanced-styles";
      if (document.getElementById(styleId)) return;
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = REVIEWS_CSS;
      document.head.appendChild(style);
    }
    injectCss();
    const unregister = JE.helpers.onViewPage(async (_view, element, hash) => {
      if (!JE.pluginConfig.ShowReviews && !JE.pluginConfig.ShowUserReviews && !JE.pluginConfig.ShowAnilistReviews) {
        unregister?.();
        return;
      }
      const hasItemId = window.location.hash.includes("id=") || typeof hash === "string" && hash.includes("id=");
      const isItemDetailElement = !!element && (element.id === "itemDetailPage" || element.classList.contains("itemDetailPage"));
      if (!hasItemId && !isItemDetailElement) return;
      await new Promise((resolve) => setTimeout(resolve, 150));
      const visiblePage = visibleDetailPage();
      if (visiblePage) void processPage(visiblePage);
    }, { pages: null, fetchItem: false, immediate: true });
  };
  var REVIEWS_CSS = `
                .je-msym-rounded {
                    font-family: 'JE Material Symbols Rounded';
                    font-weight: normal;
                    font-style: normal;
                    line-height: 1;
                    letter-spacing: normal;
                    text-transform: none;
                    display: inline-block;
                    white-space: nowrap;
                    word-wrap: normal;
                    direction: ltr;
                    -webkit-font-feature-settings: 'liga';
                    font-feature-settings: 'liga';
                    -webkit-font-smoothing: antialiased;
                }
                /* Some themes style .detailSection as a grid, and a flex/grid
                   item's default min-width is auto — so this section's
                   horizontally-scrolling card row can report its full
                   unscrolled width as intrinsic size and blow out past the
                   viewport. width:100%+min-width:0 here and on the swipe
                   container below keep both pinned to the available width. */
                .tmdb-reviews-section { margin: 2em 0 1em 0; display: flex !important; flex-direction: column; width: 100%; min-width: 0;}
                .tmdb-reviews-section summary { cursor: pointer; display: flex; align-items: center; justify-content: space-between; user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; -webkit-tap-highlight-color: transparent;}
                .tmdb-reviews-section summary .expand-icon { color: rgba(255, 255, 255,.8);transition: transform 0.2s ease-in-out;}
                .tmdb-reviews-section[open] summary .expand-icon { transform: rotate(180deg);}
                .tmdb-review-swipe-container {
                    display: flex;
                    overflow-x: auto;
                    gap: 1.2em;
                    padding: 1em 0.5em;
                    scroll-snap-type: x mandatory;
                    width: 100%;
                    min-width: 0;
                }
                .tmdb-review-card {
                    flex: 0 0 85%;
                    max-width: 500px;
                    background: rgba(0, 0, 0, 0.3);
                    border-radius: 8px;
                    border-left: 4px solid rgb(1, 180, 228);
                    padding: 1.5em;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                    scroll-snap-align: start;
                    display: flex;
                    flex-direction: column;
                }
                .je-anilist-review-card { border-left-color: rgb(61, 180, 242); }
                .je-review-source { color: rgb(1, 180, 228); display: inline-flex; align-items: center; gap: 0.3em; }
                .je-anilist-review-card .je-review-source { color: rgb(61, 180, 242); }
                .je-review-source-logo { width: 1.1em; height: 1.1em; border-radius: 3px; }
                .je-user-review-card {
                    border-left-color: rgb(94, 213, 95);
                    background: rgba(10, 26, 10, 0.52);
                }
                @media (min-width: 768px) { .tmdb-review-card { flex-basis: 400px; } }
                .tmdb-review-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1em; }
                .je-user-review-header { align-items: center; gap: 0.75em; }
                .tmdb-review-author-info { display: flex; flex-direction: column; gap: 0.3em; flex: 1; }
                .tmdb-review-author { color: #fff; font-size: 1.1em; font-weight: 600; }
                .tmdb-review-date { color: #aaa; font-size: 0.9em; display: flex; align-items: center; gap: 0.4em; }
                .tmdb-review-rating { display: inline-flex; align-items: center; color: #ffd700; background: rgba(255, 215, 0, 0.1); padding: 0.2em 0.5em; border-radius: 4px; gap: 0.2em;}
                .je-user-review-rating {
                    white-space: nowrap;
                    background: rgba(94, 213, 95, 0.12);
                    color: #ffd700;
                }
                .je-user-star-rating { display: inline-flex; align-items: center; gap: 0.02em; }
                .je-star-icon { position: relative; display: inline-block; width: 1em; height: 1em; color: rgba(255, 255, 255, 0.28); }
                .je-star-icon svg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: block; }
                .je-star-icon-fill { color: #ffd700; }
                .je-user-star-rating .je-star-icon { width: 1.05em; height: 1.05em; vertical-align: middle; }
                .tmdb-review-content-wrapper { flex-grow: 1; line-height: 1.7; overflow-y: auto; color: #ddd; font-size: 0.95em; }
                .tmdb-review-text { word-wrap: break-word; }
                .tmdb-review-text strong { color: #fff; font-weight: 600; }
                .tmdb-review-text em { font-style: italic; color: #e0e0e0; }
                .tmdb-review-text del { text-decoration: line-through; opacity: 0.7; }
                .tmdb-review-text code { background: rgba(255, 255, 255, 0.1); padding: 2px 6px; border-radius: 3px; font-family: monospace; font-size: 0.9em; color: #ffa500; }
                .tmdb-review-text blockquote { border-left: 3px solid rgb(1, 180, 228); padding-left: 1em; margin: 0.8em 0; color: #aaa; font-style: italic; }
                .tmdb-review-text h1, .tmdb-review-text h2, .tmdb-review-text h3, .tmdb-review-text h4, .tmdb-review-text h5, .tmdb-review-text h6 { color: #fff; margin: 0.8em 0 0.4em 0; font-weight: 600; }
                .tmdb-review-text h1 { font-size: 1.5em; }
                .tmdb-review-text h2 { font-size: 1.3em; }
                .tmdb-review-text h3 { font-size: 1.15em; }
                .tmdb-review-text h4, .tmdb-review-text h5, .tmdb-review-text h6 { font-size: 1.05em; }
                .tmdb-review-text ul, .tmdb-review-text ol { margin: 0.5em 0; padding-left: 1.5em; }
                .tmdb-review-text li { margin: 0.3em 0; }
                .tmdb-review-text hr { border: none; border-top: 1px solid rgba(255, 255, 255, 0.2); margin: 1em 0; }
                .tmdb-review-text a { color: rgb(1, 180, 228); text-decoration: underline; }
                .tmdb-review-text a:hover { color: rgb(50, 200, 250); }
                /* emby-linkbutton gives links button padding, margin and weight, which breaks line spacing */
                .tmdb-review-text a[is="emby-linkbutton"] { display: inline !important; padding: 0 !important; margin: 0 !important; min-width: 0 !important; font-weight: inherit !important; vertical-align: baseline !important; }
                .tmdb-review-toggle { color: rgb(1, 180, 228); font-weight: bold; cursor: pointer; text-decoration: underline; margin-left: 0.3em; }
                .je-review-translate { display: inline-flex; align-items: center; gap: 0.3em; margin-top: 0.5em; color: rgb(1, 180, 228); font-size: 0.9em; cursor: pointer; }
                .je-review-translate .je-msym-rounded { font-size: 1.3em; }
                .je-review-translate-label { text-decoration: underline; }

                /* User avatar */
                .je-user-avatar-wrapper { flex-shrink: 0; }
                .je-user-avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 2px solid rgb(94, 213, 95); display: block; }

                /* Action bar */
                .je-review-action-bar { padding: 0.5em 0.5em 0; display: flex; gap: 0.75em; }
                .je-user-review-actions { display: flex; gap: 0.5em; flex-shrink: 0; }

                /* Shared button style */
                .je-review-btn {
                    background: rgba(255,255,255,0.08);
                    border: 1px solid rgba(255,255,255,0.15);
                    border-radius: 6px;
                    color: #fff;
                    cursor: pointer;
                    font-size: 0.85em;
                    padding: 0.35em 0.9em;
                    transition: background 0.15s;
                }
                .je-review-btn:hover { background: rgba(255,255,255,0.15); }
                .je-review-write-btn { border-color: rgb(94, 213, 95); color: rgb(94, 213, 95); }
                .je-review-write-btn:hover { background: rgba(94, 213, 95, 0.15); }
                .je-review-edit-btn, .je-review-delete-btn, .je-review-submit-btn, .je-review-cancel-btn {
                    width: 2.4em;
                    height: 2.4em;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0;
                }
                .je-review-edit-btn .material-icons, .je-review-delete-btn .material-icons, .je-review-submit-btn .material-icons, .je-review-cancel-btn .material-icons, .je-star-clear-btn .material-icons { font-size: 18px; }
                .je-review-edit-btn { border-color: rgb(94, 213, 95); color: rgb(94, 213, 95); }
                .je-review-delete-btn { border-color: rgb(244, 67, 54); color: rgb(244, 67, 54); }
                .je-review-delete-btn:hover { background: rgba(244, 67, 54, 0.15); }

                /* Inline review form */
                .je-review-form-placeholder { padding: 0 0.5em; }
                .je-review-form {
                    background: rgba(0,0,0,0.4);
                    border: 1px solid rgba(94, 213, 95, 0.4);
                    border-radius: 8px;
                    padding: 1.2em;
                    margin: 0.75em 0;
                    display: flex;
                    flex-direction: column;
                    gap: 0.75em;
                }
                .je-review-form-title { margin: 0; font-size: 1em; color: #fff; font-weight: 600; }
                .je-review-star-picker { display: flex; align-items: center; gap: 0.3em; }
                .je-star-btn {
                    display: inline-flex;
                    align-items: center;
                    background: none;
                    border: none;
                    cursor: pointer;
                    padding: 0;
                    line-height: 1;
                    transition: transform 0.1s;
                }
                .je-star-btn .je-star-icon { width: 1.6em; height: 1.6em; pointer-events: none; }
                .je-star-btn:hover { transform: scale(1.2); }
                .je-star-clear-btn {
                    background: rgba(255,255,255,0.08);
                    border: 1px solid rgba(255,255,255,0.15);
                    border-radius: 6px;
                    cursor: pointer;
                    color: rgba(255,255,255,0.7);
                    width: 2.2em;
                    height: 2.2em;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0;
                }
                .je-star-clear-btn:hover { background: rgba(255,255,255,0.15); }
                .je-star-label { color: #ffd700; font-size: 0.9em; margin-left: 0.25em; min-width: 2.5em; }
                .je-review-textarea {
                    width: 100%;
                    min-height: 100px;
                    resize: vertical;
                    background: rgba(255,255,255,0.06);
                    border: 1px solid rgba(255,255,255,0.15);
                    border-radius: 6px;
                    color: #fff;
                    font-size: 0.95em;
                    padding: 0.6em 0.8em;
                    box-sizing: border-box;
                    font-family: inherit;
                    line-height: 1.5;
                }
                .je-review-textarea:focus { outline: none; border-color: rgb(94, 213, 95); }
                .je-review-char-counter { font-size: 0.8em; color: rgba(255,255,255,0.4); text-align: right; }
                .je-review-form-btns { display: flex; gap: 0.75em; }
                .je-review-submit-btn { border-color: rgb(94, 213, 95); color: rgb(94, 213, 95); }
                .je-review-submit-btn:hover { background: rgba(94, 213, 95, 0.15); }
                .je-review-submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
                .je-review-form-error { color: rgb(244, 67, 54); font-size: 0.85em; min-height: 1em; }

                /* Average user rating chip in item details */
                .je-avg-user-rating-chip .starIcon { color: #e91e8c !important; }
                /* Remove the padding coming from using critic rating container */
                .je-avg-user-rating-chip { padding-left: 0 !important; }
                /* Remove the % added by ElegantFin Theme */
                .mediaInfoCriticRating.mediaInfoItem.je-avg-user-rating-chip::after {
                    content: "";
                }
            `;
})();
})();
//# sourceMappingURL=reviews.js.map
