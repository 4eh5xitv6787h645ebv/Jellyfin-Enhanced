/** Pause-screen authenticated metadata and image cache. No DOM ownership. */
(function (JE) {
  'use strict';

  class PauseScreenData {
    constructor() {
      this.userId = null;
      this.token = null;
      this.imgBlobCache = new Map();
      this.imgProbeCache = new Map();
      this.itemCache = new Map();
    }

    setCredentials(credentials) {
      this.userId = credentials?.userId || null;
      this.token = credentials?.token || null;
    }

    invalidateMetadata() {
      this.itemCache.clear();
      this.imgProbeCache.clear();
    }

    clear() {
      for (const url of this.imgBlobCache.values()) URL.revokeObjectURL(url);
      this.imgBlobCache.clear();
      this.invalidateMetadata();
    }

    async getItemRecord(itemId, signal) {
      let record = this.itemCache.get(itemId);
      if (!record) {
        const itemResp = await this.fetchWithRetry(ApiClient.getUrl(`/Items/${itemId}`), {
          headers: { "Authorization": 'MediaBrowser Token="' + this.token + '"', "X-Emby-Token": this.token, "Accept": "application/json" },
          signal
        });
        record = { item: itemResp, domain: ApiClient.serverAddress() };
        this.itemCache.set(itemId, record);
      }
      return record;
    }

    getCredentials() {
      const creds = localStorage.getItem("jellyfin_credentials");
      if (!creds) return null;
      try {
        const parsed = JSON.parse(creds);
        const servers = Array.isArray(parsed.Servers) ? parsed.Servers : [];
        // Prefer the ACTIVE server's entry — with multiple stored servers
        // Servers[0] may hold another server's user id/token.
        let activeServerId = null;
        try {
          activeServerId = (typeof ApiClient.serverId === 'function' ? ApiClient.serverId() : ApiClient.serverId) || null;
        } catch { activeServerId = null; }
        // Fail closed: when the active server is known but has no stored
        // entry, do NOT fall back to another server's token/user id.
        const server = activeServerId
          ? servers.find(s => s.Id === activeServerId)
          : servers[0];
        return server ? { token: server.AccessToken, userId: server.UserId } : null;
      } catch {
        return null;
      }
    }

    async fetchWithRetry(url, options, maxRetries = 2) {
      for (let i = 0; i <= maxRetries; i++) {
        try {
          const response = await fetch(url, options);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return await response.json();
        } catch (error) {
          if (i === maxRetries) throw error;
          await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
      }
    }

    // ------- Image helpers (blob cache) -------
    async firstAvailableBlobURL(urls) {
      for (const url of urls) {
        if (!url) continue;
        const ok = await this.probeImage(url);
        if (!ok) continue;
        const blobURL = await this.toBlobURL(url);
        if (blobURL) return blobURL;
      }
      return null;
    }
    async probeImage(url, timeoutMs = 2500) {
      if (this.imgProbeCache.has(url)) return this.imgProbeCache.get(url);
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), timeoutMs);
        const res = await fetch(url, {
          method: "HEAD",
          headers: { "Authorization": 'MediaBrowser Token="' + this.token + '"', "X-Emby-Token": this.token },
          signal: ctl.signal
        });
        clearTimeout(t);
        const ok = res.ok;
        this.imgProbeCache.set(url, ok);
        return ok;
      } catch {
        this.imgProbeCache.set(url, false);
        return false;
      }
    }
    async toBlobURL(url, timeoutMs = 5000) {
      if (this.imgBlobCache.has(url)) return this.imgBlobCache.get(url);
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), timeoutMs);
        const res = await fetch(url, {
          headers: { "Authorization": 'MediaBrowser Token="' + this.token + '"', "X-Emby-Token": this.token },
          signal: ctl.signal
        });
        clearTimeout(t);
        if (!res.ok) return null;
        const blob = await res.blob();
        const obj = URL.createObjectURL(blob);
        this.imgBlobCache.set(url, obj);
        return obj;
      } catch {
        return null;
      }
    }

    getLogoUrls(item, domain, itemId) {
      const urls = [];
      if (item.ImageTags?.Logo) {
        urls.push(`${domain}/Items/${itemId}/Images/Logo?tag=${item.ImageTags.Logo}`);
      }
      if (item.ParentId) urls.push(`${domain}/Items/${item.ParentId}/Images/Logo`);
      if (item.SeriesId) urls.push(`${domain}/Items/${item.SeriesId}/Images/Logo`);
      return urls;
    }

    getDiscUrls(item, domain, itemId) {
      const urls = [`${domain}/Items/${itemId}/Images/Disc`];
      if (item.ParentId) urls.push(`${domain}/Items/${item.ParentId}/Images/Disc`);
      if (item.SeriesId) urls.push(`${domain}/Items/${item.SeriesId}/Images/Disc`);
      return urls;
    }

    getBackdropUrls(item, domain, itemId) {
      const urls = [
        `${domain}/Items/${itemId}/Images/Backdrop`,
      ];
      if (item.ParentId) urls.push(`${domain}/Items/${item.ParentId}/Images/Backdrop`);
      if (item.SeriesId) urls.push(`${domain}/Items/${item.SeriesId}/Images/Backdrop`);
      return urls;
    }

  }

  JE.internals = JE.internals || {};
  JE.internals.player = JE.internals.player || {};
  JE.internals.player.PauseScreenData = PauseScreenData;
})(window.JellyfinEnhanced);
