(() => {
"use strict";
(() => {
  // client/src/host/chrome-host.ts
  function chromeBridge() {
    const host = window;
    if (!host.JellyfinEnhanced) throw new Error("Jellyfin Enhanced must initialize before chrome modules");
    return host.JellyfinEnhanced;
  }
  function hostClient() {
    const host = window;
    return host.ApiClient;
  }
  function idString(value) {
    return typeof value === "string" && value.length > 0 ? value : null;
  }
  function readClientIdentity(client) {
    let userId = null;
    let serverId = null;
    try {
      userId = idString(client?.getCurrentUserId?.());
    } catch {
    }
    try {
      const raw = client?.serverId;
      serverId = idString(typeof raw === "function" ? raw.call(client) : raw) || idString(client?._serverInfo?.Id);
    } catch {
    }
    return { userId, serverId };
  }
  function captureIdentity(session, client) {
    const live = readClientIdentity(client);
    let epoch = null;
    try {
      epoch = typeof session?.getEpoch === "function" ? session.getEpoch() : null;
    } catch {
      epoch = null;
    }
    const read = (get) => {
      try {
        return idString(get());
      } catch {
        return null;
      }
    };
    const token = read(() => client?.accessToken?.());
    const root = read(() => client?.getUrl?.("/"));
    return {
      userId: live.userId,
      serverId: live.serverId,
      epoch,
      client,
      credentialsCurrent: () => read(() => client?.accessToken?.()) === token && read(() => client?.getUrl?.("/")) === root
    };
  }
  function isSameIdentity(owner, current) {
    return owner.client === current.client && owner.credentialsCurrent() && current.credentialsCurrent() && owner.userId === current.userId && owner.serverId === current.serverId && owner.epoch === current.epoch;
  }

  // client/src/features/chrome/active-streams-styles.ts
  var ACTIVE_STREAMS_CSS = `
#je-active-streams {
  position: relative;
  overflow: visible;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}
#je-active-streams.je-as-in-osd {
  width: 48px;
  height: 48px;
  color: inherit;
  background: none;
  border: 0;
  cursor: pointer;
}
#je-active-streams .je-as-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  transition: color 0.3s;
}
#je-active-streams .je-as-sup {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 12px;
  padding: 0;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.15px;
  pointer-events: none;
  text-align: center;
  white-space: nowrap;
  transition: color 0.3s;
}
#je-active-streams .je-as-sup:empty { display: none; }
#je-active-streams.je-as-active .je-as-icon,
#je-active-streams.je-as-active .je-as-sup { color: var(--je-as-accent, #00a4dc); }
#je-active-streams.je-as-err .je-as-icon   { color: #b91c1c; }
#je-active-streams.je-as-err .je-as-sup    { color: #991b1b; }

/* Panel */
#je-active-streams-panel {
  position: fixed;
  right: 12px;
  width: 360px;
  max-width: calc(100vw - 16px);
  max-height: calc(100vh - 72px);
  overflow-y: auto;
  background: rgba(18,18,18,0.97);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.7);
  z-index: 9999;
  padding: 12px;
  display: none;
  flex-direction: column;
  gap: 10px;
  box-sizing: border-box;
}
#je-active-streams-panel.je-as-panel-open { display: flex; }

.je-as-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.je-as-panel-title {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255,255,255,0.85);
  letter-spacing: 0.3px;
}
.je-as-panel-close {
  background: none;
  border: none;
  color: rgba(255,255,255,0.4);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 0;
  display: flex;
  align-items: center;
}
.je-as-panel-close:hover { color: rgba(255,255,255,0.8); }
.je-as-panel-empty {
  font-size: 13px;
  color: rgba(255,255,255,0.35);
  text-align: center;
  padding: 20px 0;
}

/* Session card */
.je-as-card {
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.je-as-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.je-as-card-info { flex: 1; min-width: 0; }
.je-as-card-title {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255,255,255,0.9);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.je-as-card-subtitle {
  font-size: 11px;
  color: rgba(255,255,255,0.45);
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.je-as-state {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 4px;
  flex-shrink: 0;
  letter-spacing: 0.4px;
  text-transform: uppercase;
}
.je-as-state-playing { background: rgba(29,78,216,0.25); color: #93c5fd; }
.je-as-state-paused  { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.4); }

/* Progress */
.je-as-progress-row {
  display: flex;
  align-items: center;
  gap: 7px;
}
.je-as-progress-bar {
  flex: 1;
  height: 6px;
  background: rgba(255,255,255,0.1);
  border-radius: 3px;
  overflow: hidden;
}
.je-as-progress-fill {
  position: relative;
  z-index: 1;
  height: 100%;
  background: var(--je-as-accent, #00a4dc);
  border-radius: 3px;
  transition: width 0.4s;
}
.je-as-progress-time {
  font-size: 10px;
  color: rgba(255,255,255,0.35);
  white-space: nowrap;
}

/* Badges */
.je-as-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 2px;
}
.je-as-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.3px;
}
.je-as-badge-direct    { background: rgba(16,185,129,0.15); color: #6ee7b7; }
.je-as-badge-transcode { background: rgba(245,158,11,0.15); color: #fcd34d; }
.je-as-badge-neutral   { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.45); }
.je-as-badge-reason    { background: rgba(239,68,68,0.12); color: #fca5a5; font-style: italic; }

/* User row */
.je-as-user {
  font-size: 11px;
  color: rgba(255,255,255,0.35);
  display: flex;
  align-items: center;
  gap: 4px;
}
.je-as-user .material-icons { font-size: 13px; opacity: 0.5; }
.je-as-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

/* Panel open animation */
@keyframes je-as-fadein {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
}
#je-active-streams-panel.je-as-panel-open {
  animation: je-as-fadein 150ms ease forwards;
}

@media (max-width: 400px) {
  #je-active-streams-panel {
    right: 8px;
    left: 8px;
    width: auto;
  }
}

/* Poster thumbnail */
.je-as-card-with-poster {
  flex-direction: row !important;
  align-items: flex-start;
  gap: 10px !important;
}
.je-as-poster {
  width: 40px;
  height: 60px;
  border-radius: 4px;
  object-fit: cover;
  flex-shrink: 0;
  background: rgba(255,255,255,0.06);
}
.je-as-poster-placeholder {
  width: 40px;
  height: 60px;
  border-radius: 4px;
  background: rgba(255,255,255,0.06);
  flex-shrink: 0;
}
.je-as-card-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }

/* Clickable title */
.je-as-card-title-link {
  cursor: pointer;
  text-decoration: none;
  color: inherit;
}
.je-as-card-title-link:hover { text-decoration: underline; }

/* Transcode buffer behind the progress bar */
.je-as-progress-bar { position: relative; }
.je-as-transcode-fill {
  position: absolute;
  top: 0; left: 0;
  z-index: 0;
  height: 100%;
  background: rgba(245,158,11,0.8);
  border-radius: 3px;
  transition: width 0.4s;
}

/* Last updated footer */
.je-as-panel-footer {
  font-size: 10px;
  color: rgba(255,255,255,0.45);
  text-align: right;
  padding-top: 6px;
  border-top: 1px solid rgba(255,255,255,0.08);
  margin-top: 2px;
}

/* Refresh button */
.je-as-refresh-btn {
  background: none;
  border: none;
  color: rgba(255,255,255,0.4);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 0;
  display: flex;
  align-items: center;
  margin-right: 4px;
  transition: color 0.2s;
}
.je-as-refresh-btn:hover { color: rgba(255,255,255,0.8); }
.je-as-refresh-btn.je-as-refreshing { animation: je-as-spin 0.6s linear; }
@keyframes je-as-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

/* ── Broadcast button ──────────────────────────────────────────────────── */
.je-as-broadcast-btn {
  background: none;
  border: none;
  color: rgba(255,255,255,0.4);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 0;
  display: flex;
  align-items: center;
  margin-right: 4px;
  transition: color 0.2s;
}
.je-as-broadcast-btn:hover { color: var(--je-as-accent, #00a4dc); }
.je-as-broadcast-btn.je-as-broadcast-active { color: var(--je-as-accent, #00a4dc); }

/* ── Broadcast compose form ────────────────────────────────────────────── */
.je-as-broadcast-form {
  display: none;
  flex-direction: column;
  gap: 6px;
  padding: 10px 0 4px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  animation: je-as-fadein 150ms ease forwards;
}
.je-as-broadcast-form.je-as-broadcast-form-open {
  display: flex;
}
.je-as-broadcast-input,
.je-as-broadcast-textarea {
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 6px;
  color: #fff;
  padding: 8px 10px;
  font-size: 12px;
  font-family: inherit;
  outline: none;
  width: 100%;
  box-sizing: border-box;
  transition: border-color 0.2s;
}
.je-as-broadcast-input:focus,
.je-as-broadcast-textarea:focus {
  border-color: var(--je-as-accent, #00a4dc);
}
.je-as-broadcast-input::placeholder,
.je-as-broadcast-textarea::placeholder {
  color: rgba(255,255,255,0.3);
  font-style: italic;
}
.je-as-broadcast-textarea {
  resize: vertical;
  min-height: 72px;
}
.je-as-broadcast-field-label {
  font-size: 11px;
  font-weight: 600;
  color: rgba(255,255,255,0.65);
  letter-spacing: 0.3px;
  text-transform: uppercase;
  margin-bottom: 2px;
}

.je-as-broadcast-timeout-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.je-as-broadcast-timeout-label {
  font-size: 11px;
  color: rgba(255,255,255,0.45);
  white-space: nowrap;
}
.je-as-broadcast-timeout-input {
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 6px;
  color: #fff;
  padding: 6px 8px;
  font-size: 12px;
  font-family: inherit;
  outline: none;
  width: 72px;
  box-sizing: border-box;
  transition: border-color 0.2s;
}
.je-as-broadcast-timeout-input:focus {
  border-color: var(--je-as-accent, #00a4dc);
}
.je-as-broadcast-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.je-as-broadcast-send {
  background: var(--je-as-accent, #00a4dc);
  border: none;
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 14px;
  transition: opacity 0.2s;
}
.je-as-broadcast-send:hover { opacity: 0.85; }
.je-as-broadcast-send:disabled { opacity: 0.5; cursor: not-allowed; }
.je-as-broadcast-cancel {
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 6px;
  color: rgba(255,255,255,0.7);
  cursor: pointer;
  font-size: 12px;
  padding: 6px 12px;
  transition: background 0.2s;
}
.je-as-broadcast-cancel:hover { background: rgba(255,255,255,0.14); }
.je-as-broadcast-result {
  font-size: 11px;
  padding: 5px 8px;
  border-radius: 5px;
  display: none;
}
.je-as-broadcast-result.je-as-broadcast-ok {
  display: block;
  background: rgba(16,185,129,0.15);
  color: #6ee7b7;
}
.je-as-broadcast-result.je-as-broadcast-err {
  display: block;
  background: rgba(239,68,68,0.12);
  color: #fca5a5;
}
.je-as-broadcast-field-note {
  font-size: 10px;
  color: rgba(255,193,7,0.8);
  line-height: 1.4;
  padding: 3px 0 1px;
}`;

  // client/src/features/chrome/active-streams.ts
  var LOG = "🪼 Jellyfin Enhanced:";
  var PREFETCHED_SESSIONS_MAX_AGE_MS = 5e3;
  var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
  var str = (value) => typeof value === "string" ? value : void 0;
  var num = (value) => typeof value === "number" && Number.isFinite(value) ? value : void 0;
  var bool = (value) => typeof value === "boolean" ? value : void 0;
  function compact(value) {
    for (const key of Object.keys(value)) if (value[key] === void 0) delete value[key];
    return value;
  }
  function sub(value, decode) {
    return isRecord(value) ? compact(decode(value)) : void 0;
  }
  function decodeSession(value) {
    if (!isRecord(value)) return null;
    return compact({
      UserId: str(value.UserId),
      UserName: str(value.UserName),
      UserHasPrimaryImage: bool(value.UserHasPrimaryImage),
      Client: str(value.Client),
      DeviceName: str(value.DeviceName),
      RemoteEndPoint: str(value.RemoteEndPoint),
      NowPlayingItem: sub(value.NowPlayingItem, (item) => ({
        Id: str(item.Id),
        Name: str(item.Name),
        SeriesName: str(item.SeriesName),
        RunTimeTicks: num(item.RunTimeTicks),
        ProductionYear: num(item.ProductionYear),
        ParentIndexNumber: num(item.ParentIndexNumber),
        IndexNumber: num(item.IndexNumber),
        ImageTags: isRecord(item.ImageTags) ? Object.fromEntries(Object.entries(item.ImageTags).filter((entry) => typeof entry[1] === "string")) : void 0,
        SeriesId: str(item.SeriesId),
        SeriesPrimaryImageTag: str(item.SeriesPrimaryImageTag),
        MediaStreams: Array.isArray(item.MediaStreams) ? item.MediaStreams.filter(isRecord).map((stream) => compact({ Type: str(stream.Type), Codec: str(stream.Codec), BitRate: num(stream.BitRate) })) : void 0
      })),
      PlayState: sub(value.PlayState, (state) => ({ IsPaused: bool(state.IsPaused), PositionTicks: num(state.PositionTicks), PlayMethod: str(state.PlayMethod) })),
      TranscodingInfo: sub(value.TranscodingInfo, (info) => ({
        IsVideoDirect: bool(info.IsVideoDirect),
        VideoCodec: str(info.VideoCodec),
        AudioCodec: str(info.AudioCodec),
        Bitrate: num(info.Bitrate),
        CompletionPercentage: num(info.CompletionPercentage),
        TranscodeReasons: Array.isArray(info.TranscodeReasons) ? info.TranscodeReasons.filter((reason) => typeof reason === "string") : void 0,
        Width: num(info.Width),
        Height: num(info.Height),
        Framerate: num(info.Framerate)
      }))
    });
  }
  function decodeSessions(value) {
    if (!Array.isArray(value)) return null;
    return value.map(decodeSession).filter((session) => session !== null);
  }
  function decodeBroadcast(value) {
    if (!isRecord(value)) throw new Error("Invalid broadcast response");
    const sent = num(value.sent), skipped = num(value.skipped);
    if (sent === void 0 || skipped === void 0) throw new Error("Invalid broadcast response");
    const errors = Array.isArray(value.errors) ? value.errors.map(String) : [];
    return { sent, skipped, errors };
  }
  function ticksToTime(ticks) {
    if (!ticks) return "0:00";
    const total = Math.floor(ticks / 1e7);
    const h = Math.floor(total / 3600);
    const m = Math.floor(total % 3600 / 60);
    const s = total % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  var bitrate = (bits) => {
    const kbps = Math.round(bits / 1e3);
    return kbps >= 1e3 ? `${(kbps / 1e3).toFixed(1)} Mbps` : `${kbps} kbps`;
  };
  function sessionBadges(session) {
    const badges = [];
    const ts = session.TranscodingInfo;
    const ps = session.PlayState || {};
    if (ts && ts.IsVideoDirect === false) {
      badges.push({ label: "Transcoding", cls: "je-as-badge-transcode" });
      if (ts.VideoCodec) badges.push({ label: ts.VideoCodec.toUpperCase(), cls: "je-as-badge-neutral" });
      if (ts.AudioCodec) badges.push({ label: ts.AudioCodec.toUpperCase(), cls: "je-as-badge-neutral" });
      if (ts.Bitrate) badges.push({ label: bitrate(ts.Bitrate), cls: "je-as-badge-neutral" });
      if (ts.Width && ts.Height) badges.push({ label: `${ts.Width}×${ts.Height}`, cls: "je-as-badge-neutral" });
      if (ts.Framerate) badges.push({ label: `${Math.round(ts.Framerate)}fps`, cls: "je-as-badge-neutral" });
    } else {
      badges.push({ label: "Direct Play", cls: "je-as-badge-direct" });
      const stream = session.NowPlayingItem?.MediaStreams?.find((s) => s.Type === "Video");
      if (stream?.Codec) badges.push({ label: stream.Codec.toUpperCase(), cls: "je-as-badge-neutral" });
      if (stream?.BitRate) badges.push({ label: bitrate(stream.BitRate), cls: "je-as-badge-neutral" });
    }
    if (ps.PlayMethod === "Transcode" && ts?.TranscodeReasons?.length) {
      const streams2 = session.NowPlayingItem?.MediaStreams || [];
      for (const raw of ts.TranscodeReasons) {
        badges.push({ label: raw.replace(/([A-Z])/g, " $1").trim(), cls: "je-as-badge-reason" });
        const pair = raw === "AudioCodecNotSupported" ? [streams2.find((s) => s.Type === "Audio")?.Codec, ts.AudioCodec] : raw === "VideoCodecNotSupported" ? [streams2.find((s) => s.Type === "Video")?.Codec, ts.VideoCodec] : null;
        const [source, target] = pair ?? [];
        if (source && target && source.toLowerCase() !== target.toLowerCase()) {
          badges.push({ label: `${source.toUpperCase()} → ${target.toUpperCase()}`, cls: "je-as-badge-reason" });
        }
      }
    }
    return badges;
  }
  function counterState(sessions) {
    const playing = sessions.filter((s) => s.NowPlayingItem && !s.PlayState?.IsPaused);
    const paused = sessions.filter((s) => s.NowPlayingItem && s.PlayState?.IsPaused);
    const total = playing.length + paused.length;
    if (total === 0) return { icon: "play_circle", sup: "", active: false, title: "No active streams" };
    if (playing.length === 0) return { icon: "pause_circle", sup: `${total}`, active: true, title: `${total} stream${total > 1 ? "s" : ""} paused` };
    if (total === 1) return { icon: "person", sup: "1", active: true, title: "1 active stream" };
    const pausedNote = paused.length ? `, ${paused.length} paused` : "";
    return { icon: "group", sup: `${total}`, active: true, title: `${playing.length} playing${pausedNote}` };
  }
  function countTitle(template, count) {
    const parts = template.split("|");
    const singular = parts[0] || "{count} Active Stream";
    const plural = parts[1] || parts[0] || "{count} Active Streams";
    return (count === 1 ? singular : plural).replace("{count}", String(count));
  }
  function createActiveStreams(JE2, readClient) {
    const host = window;
    let panelOpen = false;
    let observer = null;
    let lifecycle = null;
    let outsideClickListener = null;
    let lastUpdated = null;
    let headerPanelTop = "";
    let broadcastFormOpen = false;
    let broadcastCollapseTimer = null;
    let generation = 0;
    let owner = null;
    let ownerIsAdmin = false;
    const t = (key, fallback) => JE2.t?.(key) || fallback;
    const currentIdentity = () => captureIdentity(JE2.session, readClient());
    const isAdmin = () => JE2.helpers?.isAdmin?.() === true;
    const isVisible = () => isAdmin() || JE2.pluginConfig?.ActiveStreamsAllUsers === true;
    const ownerCurrent = () => owner !== null && isSameIdentity(owner, currentIdentity());
    function accentColor() {
      try {
        return JE2.themer?.getThemeVariables?.()?.primaryAccent || "#00a4dc";
      } catch {
        return "#00a4dc";
      }
    }
    const applyThemeVars = () => {
      document.documentElement.style.setProperty("--je-as-accent", accentColor());
    };
    function injectStyles() {
      if (document.getElementById("je-active-streams-styles")) return;
      const style = document.createElement("style");
      style.id = "je-active-streams-styles";
      style.textContent = ACTIVE_STREAMS_CSS;
      document.head.appendChild(style);
    }
    async function fetchSessions(usePrefetched) {
      if (usePrefetched) {
        const prefetched = decodeSessions(JE2.takePrefetched?.("ActiveStreamSessions", PREFETCHED_SESSIONS_MAX_AGE_MS));
        if (prefetched) return prefetched;
      }
      try {
        return decodeSessions(await JE2.core.api.plugin("/active-streams/sessions"));
      } catch {
        return null;
      }
    }
    function el(tag, className, text) {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (text !== void 0) element.textContent = text;
      return element;
    }
    function materialIcon(name, size) {
      const icon = el("span", "material-icons", name);
      if (size) icon.style.fontSize = size;
      return icon;
    }
    function showItem(id) {
      try {
        if (host.Emby?.Page?.showItem) host.Emby.Page.showItem(id);
        else window.location.hash = `#!/details?id=${id}`;
      } catch {
        window.location.hash = `#!/details?id=${id}`;
      }
    }
    function buildSessionCard(session, item) {
      const client = readClient();
      const ps = session.PlayState || {};
      const title = item.SeriesName || item.Name || "Unknown";
      const subtitle = item.SeriesName ? `S${String(item.ParentIndexNumber || 0).padStart(2, "0")}E${String(item.IndexNumber || 0).padStart(2, "0")} · ${item.Name}` : item.ProductionYear ? String(item.ProductionYear) : "";
      const pos = ps.PositionTicks || 0;
      const dur = item.RunTimeTicks || 0;
      const pct = dur ? Math.min(100, pos / dur * 100).toFixed(1) : 0;
      const card = el("div", "je-as-card je-as-card-with-poster");
      const placeholder = () => el("div", "je-as-poster-placeholder");
      const useSeries = !!(item.SeriesId && item.SeriesPrimaryImageTag);
      const posterId = useSeries ? item.SeriesId : item.Id;
      const posterTag = useSeries ? item.SeriesPrimaryImageTag : item.ImageTags?.Primary;
      if (posterTag && posterId && client) {
        const poster = el("img", "je-as-poster");
        poster.alt = "";
        poster.loading = "lazy";
        poster.src = client.getImageUrl(posterId, { type: "Primary", tag: posterTag, height: 120, quality: 80 });
        poster.addEventListener("error", () => {
          poster.replaceWith(placeholder());
        });
        card.appendChild(poster);
      } else {
        card.appendChild(placeholder());
      }
      const main = el("div", "je-as-card-main");
      const top = el("div", "je-as-card-top");
      const info = el("div", "je-as-card-info");
      const titleEl = el("div", "je-as-card-title");
      const itemId = item.Id;
      if (itemId && client) {
        const link = el("a", "je-as-card-title-link", title);
        link.href = "#";
        link.addEventListener("click", (event) => {
          event.preventDefault();
          showItem(itemId);
        });
        titleEl.appendChild(link);
      } else {
        titleEl.textContent = title;
      }
      info.appendChild(titleEl);
      if (subtitle) info.appendChild(el("div", "je-as-card-subtitle", subtitle));
      const state = el(
        "span",
        `je-as-state ${ps.IsPaused ? "je-as-state-paused" : "je-as-state-playing"}`,
        ps.IsPaused ? t("downloads_status_paused", "Paused") : t("toast_playing", "Playing")
      );
      top.appendChild(info);
      top.appendChild(state);
      main.appendChild(top);
      const ts = session.TranscodingInfo;
      if (dur) {
        const progressRow = el("div", "je-as-progress-row");
        const bar = el("div", "je-as-progress-bar");
        if (ts && ts.CompletionPercentage != null) {
          const transcodeFill = el("div", "je-as-transcode-fill");
          transcodeFill.style.width = `${Math.min(100, ts.CompletionPercentage).toFixed(1)}%`;
          bar.appendChild(transcodeFill);
        }
        const fill = el("div", "je-as-progress-fill");
        fill.style.width = `${pct}%`;
        bar.appendChild(fill);
        progressRow.appendChild(bar);
        progressRow.appendChild(el("span", "je-as-progress-time", `${ticksToTime(pos)} / ${ticksToTime(dur)}`));
        main.appendChild(progressRow);
      }
      const badgesRow = el("div", "je-as-badges");
      for (const badge of sessionBadges(session)) badgesRow.appendChild(el("span", `je-as-badge ${badge.cls}`, badge.label));
      main.appendChild(badgesRow);
      const userRow = el("div", "je-as-user");
      if (session.UserId && session.UserHasPrimaryImage && client) {
        const img = el("img", "je-as-avatar");
        img.alt = "";
        img.src = client.getUrl(`Users/${session.UserId}/Images/Primary`) + "?height=20&quality=80";
        const fallback = materialIcon("person");
        fallback.style.display = "none";
        img.addEventListener("error", () => {
          img.style.display = "none";
          fallback.style.display = "inline";
        });
        userRow.appendChild(img);
        userRow.appendChild(fallback);
      } else {
        userRow.appendChild(materialIcon("person"));
      }
      userRow.appendChild(el("span", void 0, [session.UserName, session.Client, session.DeviceName].filter(Boolean).join(" · ")));
      main.appendChild(userRow);
      if (session.RemoteEndPoint) {
        const ipRow = el("div", "je-as-user");
        ipRow.appendChild(materialIcon("router"));
        ipRow.appendChild(el("span", void 0, session.RemoteEndPoint));
        main.appendChild(ipRow);
      }
      card.appendChild(main);
      return card;
    }
    function renderPanel(sessions) {
      const panel = document.getElementById("je-active-streams-panel");
      if (!panel) return;
      const active = (sessions || []).filter((s) => s.NowPlayingItem);
      const titleEl = panel.querySelector(".je-as-panel-title");
      if (titleEl) {
        titleEl.textContent = sessions === null ? t("active_streams_unavailable", "Sessions unavailable") : active.length ? countTitle(t("active_streams_count", "{count} Active Stream|{count} Active Streams"), active.length) : t("active_streams_none", "No Active Streams");
      }
      const body = panel.querySelector(".je-as-panel-body");
      if (!body) return;
      body.replaceChildren();
      if (sessions === null) {
        body.appendChild(el("div", "je-as-panel-error", t("active_streams_load_failed", "Could not load active streams. Try refreshing.")));
      } else if (!active.length) {
        body.appendChild(el("div", "je-as-panel-empty", t("active_streams_none", "No active streams")));
      } else {
        for (const session of active) if (session.NowPlayingItem) body.appendChild(buildSessionCard(session, session.NowPlayingItem));
      }
      let footer = panel.querySelector(".je-as-panel-footer");
      if (!footer) {
        footer = el("div", "je-as-panel-footer");
        panel.appendChild(footer);
      }
      if (sessions === null) footer.textContent = lastUpdated ? t("active_streams_last_success", "Last successful update: {time}").replace("{time}", lastUpdated.toLocaleTimeString()) : "";
      else if (lastUpdated) footer.textContent = `Updated ${lastUpdated.toLocaleTimeString()}`;
    }
    async function updateCounter(usePrefetched = false) {
      const startGeneration = generation;
      const sessions = await fetchSessions(usePrefetched);
      if (startGeneration !== generation || !ownerCurrent()) return;
      if (sessions !== null) lastUpdated = /* @__PURE__ */ new Date();
      const btn = document.getElementById("je-active-streams");
      if (!btn) return;
      const iconEl = btn.querySelector(".je-as-icon");
      const supEl = btn.querySelector(".je-as-sup");
      btn.classList.remove("je-as-active", "je-as-err");
      if (!sessions) {
        if (iconEl) iconEl.textContent = "cast";
        if (supEl) supEl.textContent = "";
        btn.classList.add("je-as-err");
        btn.title = "Failed to fetch sessions";
      } else {
        const state = counterState(sessions);
        if (iconEl) iconEl.textContent = state.icon;
        if (supEl) supEl.textContent = state.sup;
        if (state.active) btn.classList.add("je-as-active");
        btn.title = state.title;
      }
      if (panelOpen) renderPanel(sessions);
    }
    function resetForm(view) {
      view.result.className = "je-as-broadcast-result";
      view.result.textContent = "";
      view.text.value = "";
      view.header.value = "";
      view.timeout.value = "10";
    }
    function toggleBroadcastForm(view) {
      broadcastFormOpen = !broadcastFormOpen;
      view.button.classList.toggle("je-as-broadcast-active", broadcastFormOpen);
      view.form.classList.toggle("je-as-broadcast-form-open", broadcastFormOpen);
      if (broadcastFormOpen) {
        resetForm(view);
        view.text.focus();
      }
    }
    function collapseBroadcastForm(view) {
      broadcastFormOpen = false;
      view.button.classList.remove("je-as-broadcast-active");
      view.form.classList.remove("je-as-broadcast-form-open");
      resetForm(view);
    }
    async function sendBroadcast(header, text, timeoutMs, result, sendGeneration) {
      let message;
      try {
        const data = decodeBroadcast(await JE2.core.api.plugin("/active-streams/broadcast", {
          method: "POST",
          body: { header: header || null, text, timeoutMs },
          skipRetry: true
        }));
        const errNote = data.errors.length ? ` (${data.errors.length} error${data.errors.length > 1 ? "s" : ""})` : "";
        message = { ok: true, text: `Sent to ${data.sent} of ${data.sent + data.skipped} sessions${errNote}` };
      } catch (error) {
        const status = isRecord(error) ? error.status : void 0;
        const detail = error instanceof Error ? error.message : String(error);
        message = status ? { ok: false, text: `Error: ${(isRecord(error) ? str(error.responseText) : void 0) || detail}` } : { ok: false, text: `Failed: ${detail}` };
      }
      if (sendGeneration !== generation) return;
      result.className = `je-as-broadcast-result ${message.ok ? "je-as-broadcast-ok" : "je-as-broadcast-err"}`;
      result.textContent = message.text;
    }
    function injectBroadcastButton(panel) {
      if (panel.querySelector(".je-as-broadcast-btn")) return;
      const header = panel.querySelector(".je-as-panel-header");
      if (!header) return;
      const form = el("div", "je-as-broadcast-form");
      const headerInput = el("input", "je-as-broadcast-input");
      headerInput.type = "text";
      headerInput.placeholder = "e.g. Server Message";
      headerInput.maxLength = 200;
      const textArea = el("textarea", "je-as-broadcast-textarea");
      textArea.placeholder = "e.g. Server shutting down in 10 minutes";
      textArea.maxLength = 1e3;
      const timeoutRow = el("div", "je-as-broadcast-timeout-row");
      const timeoutInput = el("input", "je-as-broadcast-timeout-input");
      timeoutInput.type = "number";
      timeoutInput.value = "10";
      timeoutInput.min = "1";
      timeoutInput.max = "3600";
      timeoutRow.appendChild(el("span", "je-as-broadcast-timeout-label", "Timeout (s):"));
      timeoutRow.appendChild(timeoutInput);
      const result = el("div", "je-as-broadcast-result");
      const actions = el("div", "je-as-broadcast-actions");
      const sendBtn = el("button", "je-as-broadcast-send", "Send");
      const cancelBtn = el("button", "je-as-broadcast-cancel", "Cancel");
      actions.appendChild(cancelBtn);
      actions.appendChild(sendBtn);
      form.appendChild(el("div", "je-as-broadcast-field-label", "Title (optional)"));
      form.appendChild(headerInput);
      form.appendChild(el("div", "je-as-broadcast-field-label", "Message (required)"));
      form.appendChild(textArea);
      form.appendChild(el("div", "je-as-broadcast-field-note", "⚠ Title may not show on all clients (web UI). Message is always visible."));
      form.appendChild(timeoutRow);
      form.appendChild(result);
      form.appendChild(actions);
      const button = el("button", "je-as-broadcast-btn");
      button.setAttribute("aria-label", "Broadcast message to all sessions");
      button.title = "Broadcast message";
      button.appendChild(materialIcon("campaign", "18px"));
      header.insertBefore(button, header.querySelector(".je-as-panel-close"));
      panel.insertBefore(form, panel.querySelector(".je-as-panel-body"));
      const view = { button, form, result, text: textArea, header: headerInput, timeout: timeoutInput };
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleBroadcastForm(view);
      });
      cancelBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        collapseBroadcastForm(view);
      });
      sendBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        void (async () => {
          const text = textArea.value.trim();
          if (!text) {
            textArea.focus();
            return;
          }
          if (!ownerCurrent() || !ownerIsAdmin || !isAdmin()) {
            console.warn(`${LOG} Active Streams: broadcast refused, the signed-in account changed.`);
            destroy();
            return;
          }
          const sendGeneration = generation;
          const secs = parseFloat(timeoutInput.value) || 10;
          sendBtn.disabled = true;
          result.className = "je-as-broadcast-result";
          result.textContent = "";
          await sendBroadcast(headerInput.value.trim() || void 0, text, Math.round(secs * 1e3), result, sendGeneration);
          if (sendGeneration !== generation) return;
          sendBtn.disabled = false;
          if (broadcastCollapseTimer !== null) clearTimeout(broadcastCollapseTimer);
          broadcastCollapseTimer = setTimeout(() => {
            broadcastCollapseTimer = null;
            collapseBroadcastForm(view);
          }, 3e3);
        })();
      });
    }
    function togglePanel() {
      if (!ownerCurrent()) {
        destroy();
        return;
      }
      const panel = document.getElementById("je-active-streams-panel");
      if (!panel) return;
      panelOpen = !panelOpen;
      if (panelOpen) {
        const btn = document.getElementById("je-active-streams");
        panel.style.top = btn?.closest(".osdHeader, .videoOsd-appBar") ? btn.getBoundingClientRect().bottom + 2 + "px" : headerPanelTop;
      }
      panel.classList.toggle("je-as-panel-open", panelOpen);
      if (panelOpen) void updateCounter();
    }
    function injectPanel() {
      if (document.getElementById("je-active-streams-panel")) return;
      const panel = el("div");
      panel.id = "je-active-streams-panel";
      const header = el("div", "je-as-panel-header");
      const closeBtn = el("button", "je-as-panel-close");
      closeBtn.setAttribute("aria-label", "Close sessions panel");
      closeBtn.appendChild(materialIcon("close", "18px"));
      closeBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        panelOpen = false;
        panel.classList.remove("je-as-panel-open");
      });
      header.appendChild(el("span", "je-as-panel-title", "Sessions"));
      header.appendChild(closeBtn);
      panel.appendChild(header);
      panel.appendChild(el("div", "je-as-panel-body"));
      document.body.appendChild(panel);
      const headerBottom = JE2.helpers?.getHeaderBottom?.() ?? 0;
      if (headerBottom > 0) {
        panel.style.top = headerBottom + 2 + "px";
        headerPanelTop = panel.style.top;
      }
      const refreshBtn = el("button", "je-as-refresh-btn");
      refreshBtn.setAttribute("aria-label", "Refresh sessions");
      refreshBtn.title = "Refresh";
      refreshBtn.appendChild(materialIcon("refresh", "18px"));
      refreshBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        refreshBtn.classList.add("je-as-refreshing");
        refreshBtn.addEventListener("animationend", () => refreshBtn.classList.remove("je-as-refreshing"), { once: true });
        void updateCounter();
      });
      header.insertBefore(refreshBtn, closeBtn);
      if (ownerIsAdmin) injectBroadcastButton(panel);
      outsideClickListener = (event) => {
        const btn = document.getElementById("je-active-streams");
        const target = event.target;
        if (panelOpen && target instanceof Node && !panel.contains(target) && btn && !btn.contains(target)) {
          panelOpen = false;
          panel.classList.remove("je-as-panel-open");
        }
      };
      document.addEventListener("click", outsideClickListener);
    }
    function getOsdHeaderContainer() {
      const bar = document.querySelector(".videoOsd-appBar");
      if (bar) {
        const menuButtons = [...bar.querySelectorAll('[aria-controls="app-sync-play-menu"], [aria-controls="app-remote-play-menu"]')];
        const visible = menuButtons.find((element) => element.offsetParent !== null) || menuButtons[0];
        return visible?.parentElement || null;
      }
      return document.querySelector(".skinHeader.osdHeader .headerRight");
    }
    function syncPlacementClasses(btn) {
      const inOsd = !!btn.closest(".osdHeader, .videoOsd-appBar");
      btn.classList.toggle("je-as-in-osd", inOsd);
      btn.classList.toggle("headerButton", !inOsd);
      btn.classList.toggle("headerButtonRight", !inOsd);
    }
    function tryInjectHeader(attempts = 0, injectGeneration = generation) {
      if (injectGeneration !== generation) return;
      if (document.getElementById("je-active-streams") || attempts > 20) return;
      const headerRight = JE2.isVideoPage?.() ? getOsdHeaderContainer() : JE2.helpers?.getHeaderButtonTray?.() ?? null;
      if (!headerRight) {
        setTimeout(() => tryInjectHeader(attempts + 1, injectGeneration), 500);
        return;
      }
      if (document.getElementById("je-active-streams")) return;
      const btn = el("button", "headerButton headerButtonRight paper-icon-button-light");
      btn.id = "je-active-streams";
      btn.type = "button";
      btn.setAttribute("is", "paper-icon-button-light");
      btn.title = "No active streams";
      btn.dataset.headerLabel = JE2.t?.("activity_section_active_streams") ?? "";
      const icon = el("i", "material-icons je-as-icon", "play_circle");
      icon.setAttribute("aria-hidden", "true");
      const sup = el("span", "je-as-sup");
      sup.setAttribute("aria-hidden", "true");
      btn.appendChild(icon);
      btn.appendChild(sup);
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        togglePanel();
      });
      headerRight.insertBefore(btn, headerRight.firstChild);
      syncPlacementClasses(btn);
      injectPanel();
      applyThemeVars();
      void updateCounter(true);
    }
    function startObserver() {
      if (observer) return;
      const callback = () => {
        const btn = document.getElementById("je-active-streams");
        if (!btn) tryInjectHeader(0);
        else syncPlacementClasses(btn);
      };
      if (JE2.helpers?.onBodyMutation) {
        observer = JE2.helpers.onBodyMutation("active-streams", callback);
      } else {
        const native = new MutationObserver(callback);
        native.observe(document.body, { childList: true, subtree: true });
        observer = { unsubscribe: () => native.disconnect() };
      }
    }
    function initialize() {
      if (!JE2.pluginConfig?.ActiveStreamsEnabled) return;
      if (owner && ownerCurrent()) return;
      if (owner) destroy();
      if (!isVisible()) {
        console.log(`${LOG} Active Streams: skipping — not visible for this user.`);
        return;
      }
      console.log(`${LOG} Active Streams: initializing.`);
      owner = currentIdentity();
      ownerIsAdmin = isAdmin();
      injectStyles();
      startObserver();
      tryInjectHeader(0);
      lifecycle = JE2.core.lifecycle.register("active-streams");
      lifecycle.track(JE2.core.navigation.onNavigate(() => {
        applyThemeVars();
        if (document.getElementById("je-active-streams")) void updateCounter();
      }));
    }
    function destroy() {
      console.log(`${LOG} Active Streams: destroying.`);
      generation++;
      owner = null;
      ownerIsAdmin = false;
      observer?.unsubscribe();
      observer = null;
      if (lifecycle) {
        lifecycle.teardown();
        lifecycle = null;
      }
      if (outsideClickListener) {
        document.removeEventListener("click", outsideClickListener);
        outsideClickListener = null;
      }
      if (broadcastCollapseTimer !== null) {
        clearTimeout(broadcastCollapseTimer);
        broadcastCollapseTimer = null;
      }
      document.getElementById("je-active-streams")?.remove();
      document.getElementById("je-active-streams-panel")?.remove();
      document.getElementById("je-active-streams-styles")?.remove();
      panelOpen = false;
      broadcastFormOpen = false;
      lastUpdated = null;
    }
    function bindSession() {
      JE2.session?.onUserChange("active-streams", destroy);
      document.addEventListener("je:user-data-loaded", (event) => {
        const epoch = event instanceof CustomEvent && isRecord(event.detail) ? num(event.detail.epoch) : void 0;
        if (epoch !== void 0 && typeof JE2.session?.isCurrent === "function" && !JE2.session.isCurrent(epoch)) return;
        initialize();
      });
    }
    return { initialize, destroy, bindSession };
  }

  // client/src/features/chrome/active-streams-entry.ts
  var JE = chromeBridge();
  var streams = createActiveStreams(JE, () => hostClient());
  JE.activeStreams = { initialize: streams.initialize, destroy: streams.destroy };
  streams.bindSession();
})();
})();
//# sourceMappingURL=active-streams.js.map
