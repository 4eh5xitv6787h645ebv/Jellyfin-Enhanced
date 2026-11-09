(() => {
"use strict";
(() => {
  // client/src/features/player/host.ts
  function playerHost() {
    const host = window;
    const JE2 = host.JellyfinEnhanced;
    if (!JE2) throw new Error("Player loaded before Jellyfin Enhanced");
    const requireApi = () => {
      if (!host.ApiClient) throw new Error("Jellyfin API unavailable");
      return host.ApiClient;
    };
    const ApiClient2 = {
      getCurrentUserId: () => host.ApiClient?.getCurrentUserId() ?? null,
      deviceId: () => host.ApiClient?.deviceId?.() ?? "",
      serverId: () => {
        const id = host.ApiClient?.serverId;
        return typeof id === "function" ? id.call(host.ApiClient) : id ?? "";
      },
      serverAddress: () => requireApi().serverAddress(),
      getUrl: (path, params) => requireApi().getUrl(path, params),
      ajax: (options) => requireApi().ajax(options),
      getItem: (userId, itemId) => requireApi().getItem(userId, itemId)
    };
    return { JE: JE2, ApiClient: ApiClient2 };
  }

  // client/src/features/player/wire.ts
  function record(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : {};
  }
  var text = (v) => typeof v === "string" ? v : void 0;
  var number = (v) => typeof v === "number" && Number.isFinite(v) ? v : void 0;
  var strings = (v) => Array.isArray(v) ? v.filter((s) => typeof s === "string") : [];
  var list = (v) => Array.isArray(v) ? v : [];
  function stream(v) {
    const r = record(v);
    const fps = (v2) => typeof v2 === "string" ? v2 : number(v2);
    return { Type: text(r.Type), Index: number(r.Index), ReferenceFrameRate: fps(r.ReferenceFrameRate), RealFrameRate: fps(r.RealFrameRate), AverageFrameRate: fps(r.AverageFrameRate), DisplayTitle: text(r.DisplayTitle), Title: text(r.Title), Language: text(r.Language), Codec: text(r.Codec) };
  }
  function decodeItem(v) {
    const r = record(v);
    return { Id: text(r.Id), Type: text(r.Type), SeriesId: text(r.SeriesId), ParentId: text(r.ParentId), RunTimeTicks: number(r.RunTimeTicks), ProductionYear: number(r.ProductionYear), CommunityRating: number(r.CommunityRating), CriticRating: number(r.CriticRating), OfficialRating: text(r.OfficialRating), Overview: text(r.Overview), Container: text(r.Container), Genres: strings(r.Genres), Tags: strings(r.Tags), ImageTags: { Logo: text(record(r.ImageTags).Logo) }, MediaStreams: list(r.MediaStreams).map(stream), MediaSources: list(r.MediaSources).map((v2) => {
      const s = record(v2);
      return { Id: text(s.Id), MediaStreams: list(s.MediaStreams).map(stream) };
    }) };
  }
  function decodeSessions(v) {
    return list(v).map((v2) => {
      const r = record(v2), p = record(r.PlayState), t = record(r.TranscodingInfo);
      return { Id: text(r.Id), DeviceId: text(r.DeviceId), NowPlayingItem: decodeItem(r.NowPlayingItem), PlayState: { PlayMethod: text(p.PlayMethod), MediaSourceId: text(p.MediaSourceId), AudioStreamIndex: number(p.AudioStreamIndex), SubtitleStreamIndex: number(p.SubtitleStreamIndex) }, TranscodingInfo: r.TranscodingInfo ? { CompletionPercentage: number(t.CompletionPercentage), Container: text(t.Container), VideoCodec: text(t.VideoCodec), AudioCodec: text(t.AudioCodec), Bitrate: number(t.Bitrate), TranscodeReasons: typeof t.TranscodeReasons === "string" ? [t.TranscodeReasons] : strings(t.TranscodeReasons) } : null };
    });
  }
  function decodeSegments(v) {
    return list(record(v).Items).map((v2) => {
      const r = record(v2);
      return { Id: text(r.Id), Type: text(r.Type), StartTicks: number(r.StartTicks), EndTicks: number(r.EndTicks) };
    });
  }

  // client/src/features/player/lifetime.ts
  function createPlayerLifetime(JE2, name) {
    let generation = 0;
    let controller = new AbortController();
    const cleanups = /* @__PURE__ */ new Set();
    const timers = /* @__PURE__ */ new Set();
    function reset() {
      generation++;
      controller.abort();
      controller = new AbortController();
      for (const cleanup of cleanups) cleanup();
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
    }
    JE2.session?.onUserChange(name + "-lifetime", reset);
    if (JE2.core?.navigation) JE2.core.navigation.onNavigate(reset);
    else window.addEventListener("hashchange", reset);
    function lease(video) {
      const captured = generation, hash = location.hash;
      const session = JE2.session?.createLease?.();
      const source = video ? video.currentSrc || video.src : null;
      return { signal: controller.signal, current: () => captured === generation && hash === location.hash && (!session || session.isCurrent()) && (!video || video.isConnected && (video.currentSrc || video.src) === source) };
    }
    return {
      lease,
      reset,
      onReset(cleanup) {
        cleanups.add(cleanup);
        return () => cleanups.delete(cleanup);
      },
      timeout(callback, delay) {
        const id = window.setTimeout(() => {
          timers.delete(id);
          callback();
        }, delay);
        timers.add(id);
        return id;
      },
      cancel(id) {
        if (id != null) {
          clearTimeout(id);
          timers.delete(id);
        }
      },
      sleep(delay, signal) {
        return new Promise((resolve) => {
          if (signal.aborted) {
            resolve();
            return;
          }
          const done = () => {
            clearTimeout(id);
            signal.removeEventListener("abort", done);
            resolve();
          };
          const id = window.setTimeout(done, delay);
          signal.addEventListener("abort", done, { once: true });
        });
      }
    };
  }

  // client/src/features/player/auto-skip-engine.ts
  var TICKS_PER_SECOND = 1e7;
  var MIN_SEGMENT_TICKS = TICKS_PER_SECOND;
  var MAX_PROBE_ATTEMPTS = 5;
  function segmentKey(seg) {
    return seg.Id || `${seg.Type || "Unknown"}:${seg.StartTicks != null ? seg.StartTicks : ""}:${seg.EndTicks != null ? seg.EndTicks : ""}`;
  }
  function parseTranscodeOffsetTicksFromSrc(src) {
    try {
      const q = src.indexOf("?");
      if (q === -1) return 0;
      if (src.substring(0, q).toLowerCase().endsWith(".m3u8")) return 0;
      let startTimeTicks = 0;
      for (const [name, value] of new URLSearchParams(src.substring(q + 1))) {
        const lower = name.toLowerCase();
        if ((lower === "static" || lower === "copytimestamps") && String(value).toLowerCase() === "true") {
          return 0;
        }
        if (lower === "starttimeticks") {
          const n = parseInt(value, 10);
          if (Number.isFinite(n) && n > 0) startTimeTicks = n;
        }
      }
      return startTimeTicks;
    } catch (err) {
      console.warn("🪼 Jellyfin Enhanced: auto-skip offset parse failed", err);
      return 0;
    }
  }
  function createSessionItemResolver(opts) {
    let probedSrc = null;
    let probedId = null;
    let probeAttempts = 0;
    let inFlight = false;
    return (video) => {
      const src = video.currentSrc || "";
      const direct = src ? opts.parseFromSrc(src) : null;
      if (direct) return direct;
      const fromPage = opts.fallbackId();
      if (fromPage) return fromPage;
      if (src !== probedSrc) {
        probedSrc = src;
        probedId = null;
        probeAttempts = 0;
      }
      if (src && !probedId && !inFlight && probeAttempts < MAX_PROBE_ATTEMPTS) {
        probeAttempts++;
        inFlight = true;
        opts.probeNowPlayingId().then((id) => {
          if (probedSrc === src) probedId = id;
        }).catch(() => void 0).finally(() => {
          inFlight = false;
        });
      }
      return src && src === probedSrc ? probedId : null;
    };
  }
  function createAutoSkipEngine(deps) {
    let video = null;
    let listener = null;
    let itemId = null;
    let segments = [];
    let fetchToken = 0;
    let lastTimeTicks = -1;
    let lastKey = null;
    let lastIgnored = false;
    async function loadSegments(id) {
      const token = ++fetchToken;
      let result = [];
      try {
        result = await deps.fetchSegments(id);
      } catch (err) {
        console.warn("🪼 Jellyfin Enhanced: media-segments fetch failed", err);
        result = [];
      }
      if (token !== fetchToken) return;
      segments = (Array.isArray(result) ? result : []).filter((s) => s && s.StartTicks != null).slice().sort((a, b) => (a.StartTicks || 0) - (b.StartTicks || 0));
    }
    function reinitIfItemChanged() {
      if (!video) return;
      const id = deps.resolveItemId(video);
      if (id === itemId) return;
      if (!id) {
        itemId = null;
        segments = [];
        lastTimeTicks = -1;
        lastKey = null;
        lastIgnored = false;
        fetchToken++;
        return;
      }
      itemId = id;
      segments = [];
      lastTimeTicks = -1;
      lastKey = null;
      lastIgnored = false;
      loadSegments(id);
    }
    function evaluate() {
      if (!video) return;
      const t = video.currentTime;
      if (!Number.isFinite(t)) return;
      const offsetTicks = deps.getPositionOffsetTicks(video);
      const timeTicks = t * TICKS_PER_SECOND + offsetTicks;
      if (!segments.length) return;
      for (const seg of segments) {
        if (seg.StartTicks == null || seg.EndTicks == null) continue;
        const inSegment = seg.StartTicks <= timeTicks && seg.EndTicks > timeTicks;
        if (!inSegment) continue;
        if (!deps.shouldSkipType(seg.Type)) continue;
        const key = segmentKey(seg);
        if (lastIgnored && lastKey === key) break;
        lastKey = key;
        if (lastTimeTicks > seg.StartTicks) {
          lastIgnored = true;
          break;
        }
        if (seg.EndTicks - seg.StartTicks < MIN_SEGMENT_TICKS) {
          lastIgnored = true;
          break;
        }
        lastIgnored = false;
        const endSeconds = (seg.EndTicks - offsetTicks) / TICKS_PER_SECOND;
        const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : Infinity;
        const target = Math.min(endSeconds, duration);
        if (target > t) {
          video.currentTime = target;
          deps.onSkipped(seg);
        }
        break;
      }
      lastTimeTicks = timeTicks;
    }
    function onTick() {
      reinitIfItemChanged();
      evaluate();
    }
    return {
      /**
       * Begin driving auto-skip off `v`'s timeupdate. Idempotent.
       * @param {HTMLVideoElement} v
       */
      attach(v) {
        if (v === video) {
          reinitIfItemChanged();
          return;
        }
        this.detach();
        video = v;
        listener = onTick;
        v.addEventListener("timeupdate", listener);
        reinitIfItemChanged();
      },
      /** Stop and reset all state. Idempotent. */
      detach() {
        if (video && listener) video.removeEventListener("timeupdate", listener);
        video = null;
        listener = null;
        itemId = null;
        segments = [];
        lastTimeTicks = -1;
        lastKey = null;
        lastIgnored = false;
        fetchToken++;
      },
      /** Inspection hooks for tests/debugging — not part of the public surface. */
      _internal: {
        evaluate,
        reinitIfItemChanged,
        get segments() {
          return segments;
        },
        get itemId() {
          return itemId;
        },
        get lastKey() {
          return lastKey;
        },
        get lastIgnored() {
          return lastIgnored;
        }
      }
    };
  }

  // client/src/features/player/auto-skip.ts
  var { JE, ApiClient } = playerHost();
  var lifetime = createPlayerLifetime(JE, "auto-skip");
  function segmentTypeEnabled(type) {
    if (type === "Intro") return !!JE.currentSettings?.autoSkipIntro;
    if (type === "Outro") return !!JE.currentSettings?.autoSkipOutro;
    return false;
  }
  function segmentTypeEnabledFor(epoch, type) {
    if (JE.session && !JE.session.isCurrent(epoch)) return false;
    return segmentTypeEnabled(type);
  }
  function autoSkipToast(seg) {
    if (seg.Type === "Intro") JE.toast(JE.t("toast_auto_skipped_intro"));
    else if (seg.Type === "Outro") JE.toast(JE.t("toast_auto_skipped_outro"));
  }
  function parseItemIdFromVideosSrc(src) {
    const m = src.match(/\/[Vv]ideos\/([0-9a-fA-F-]{32,36})\b/);
    return m?.[1]?.replace(/-/g, "").toLowerCase() ?? null;
  }
  async function probeNowPlayingItemId(userId) {
    try {
      const api = JE.core?.api;
      const ac = ApiClient;
      if (!api || typeof api.jf !== "function" || !ac) return null;
      const deviceId = typeof ac.deviceId === "function" ? ac.deviceId() : "";
      if (!userId || !deviceId) return null;
      const sessions = await api.jf(
        `/Sessions?ControllableByUserId=${encodeURIComponent(userId)}`,
        { skipCache: true }
      );
      if (!Array.isArray(sessions)) return null;
      const matches = decodeSessions(sessions).filter((x) => x?.DeviceId === deviceId && x?.NowPlayingItem?.Id);
      return matches.length === 1 ? matches[0]?.NowPlayingItem?.Id || null : null;
    } catch (err) {
      console.warn("🪼 Jellyfin Enhanced: auto-skip now-playing probe failed", err);
      return null;
    }
  }
  async function fetchMediaSegments(itemId) {
    const api = JE.core?.api;
    if (!api || typeof api.jf !== "function") return [];
    const res = await api.jf(`/MediaSegments/${encodeURIComponent(itemId)}`, { skipCache: true });
    return decodeSegments(res);
  }
  function currentUserId() {
    try {
      return JE.session?.getUserId?.() || ApiClient?.getCurrentUserId?.() || null;
    } catch (err) {
      console.warn("🪼 Jellyfin Enhanced: auto-skip user lookup failed", err);
      return null;
    }
  }
  var _engine = null;
  var _engineEpoch = null;
  function autoSkipEngine() {
    const epoch = JE.session ? JE.session.getEpoch() : 0;
    if (!_engine || _engineEpoch !== epoch) {
      _engine?.detach();
      _engineEpoch = epoch;
      const userId = currentUserId();
      _engine = createAutoSkipEngine({
        shouldSkipType: (type) => segmentTypeEnabledFor(epoch, type),
        fetchSegments: fetchMediaSegments,
        resolveItemId: createSessionItemResolver({
          parseFromSrc: parseItemIdFromVideosSrc,
          fallbackId: () => JE.internals?.player?.getCurrentVideoItemId?.() || null,
          probeNowPlayingId: () => probeNowPlayingItemId(userId)
        }),
        onSkipped: autoSkipToast,
        getPositionOffsetTicks: (video) => parseTranscodeOffsetTicksFromSrc(video.currentSrc || "")
      });
    }
    return _engine;
  }
  JE.session?.onUserChange("auto-skip", () => {
    _engine?.detach();
    _engine = null;
    _engineEpoch = null;
  });
  JE.initializeAutoSkipObserver = () => {
    if (!currentUserId()) return;
    const video = JE.internals?.player?.getVideo?.();
    if (!video) return;
    autoSkipEngine().attach(video);
  };
  JE.stopAutoSkip = () => {
    _engine?.detach();
  };
  JE.internals = JE.internals || {};
  JE.internals.autoSkip = {
    TICKS_PER_SECOND,
    MIN_SEGMENT_TICKS,
    createAutoSkipEngine,
    createSessionItemResolver,
    parseTranscodeOffsetTicksFromSrc,
    parseItemIdFromVideosSrc,
    segmentTypeEnabled
  };
  lifetime.onReset(() => {
    _engine?.detach();
    _engine = null;
    _engineEpoch = null;
  });
})();
})();
//# sourceMappingURL=auto-skip.js.map
