// /js/arr/requests-page.js
// Requests Page - Shows active downloads from Sonarr/Radarr and requests from Jellyseerr
(function () {
  "use strict";

  const JE = window.JellyfinEnhanced;

  // State management
  const state = {
    downloads: [],
    requests: [],
    requestsPage: 1,
    requestsTotalPages: 1,
    requestsFilter: "all",
    isLoading: false,
    pollTimer: null,
    pageVisible: false,
    previousPage: null,
    locationSignature: null,
    locationTimer: null,
    // Cache for requests data - keyed by filter+page
    requestsCache: {},
    requestsCacheTime: {},
    // Token for "last intent wins" - prevents stale async responses from overwriting newer data
    tabSwitchToken: 0,
  };

  // Cache settings
  const CACHE_TTL_MS = 30000; // 30 seconds cache validity

  // Render coalescing - ensures only one render per animation frame to avoid stutter
  let renderQueued = false;
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      renderPage();
    });
  }

  // Status color mapping - using theme-aware colors
  const getStatusColors = () => {
    const themeVars = JE.themer?.getThemeVariables() || {};
    const primaryAccent = themeVars.primaryAccent || '#00a4dc';
    return {
      Downloading: primaryAccent,
      Importing: "#4caf50",
      Queued: "rgba(128,128,128,0.6)",
      Paused: "#ff9800",
      Delayed: "#ff9800",
      Warning: "#ff9800",
      Failed: "#f44336",
      Unknown: "rgba(128,128,128,0.5)",
      Pending: "#ff9800",
      Processing: primaryAccent,
      Available: "#4caf50",
      Approved: "#4caf50",
      Declined: "#f44336",
    };
  };

  const SONARR_ICON_URL = "https://cdn.jsdelivr.net/gh/selfhst/icons/svg/sonarr.svg";
  const RADARR_ICON_URL = "https://cdn.jsdelivr.net/gh/selfhst/icons/svg/radarr-light-hybrid-light.svg";

  const logPrefix = '🪼 Jellyfin Enhanced: Requests Page:';

  // CSS Styles - minimal styling to fit Jellyfin's theme
  const CSS_STYLES = `
        .je-downloads-page {
            padding: 2em;
            max-width: 85vw;
            margin: 0 auto;
            position: relative;
            z-index: 1;
        }
        .je-downloads-section {
            margin-bottom: 2em;
        }
        .je-downloads-section h2 {
            font-size: 1.5em;
            margin-bottom: 1em;
        }
        .je-downloads-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 1.1em;
        }
        .je-download-card, .je-request-card {
            background: rgba(128,128,128,0.1);
            border-radius: 0.25em;
            overflow: hidden;
        }
        .je-download-card-content {
          display: flex;
          gap: 1em;
          padding: 1.15em;
        }
        .je-download-poster, .je-request-poster {
            border-radius: 0.5em;
            object-fit: cover;
            flex-shrink: 0;
        }
        .je-download-poster {
          width: 72px;
          height: 108px;
        }
        .je-request-poster {
            width: 80px;
            height: 120px;
            max-height: 120px;
        }
        .je-download-poster.placeholder, .je-request-poster.placeholder {
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(128,128,128,0.15);
            opacity: 0.5;
        }
        .je-download-info, .je-request-info {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 0.3em;
        }
        .je-download-title, .je-request-title {
            font-weight: 600;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .je-download-subtitle, .je-request-year {
            font-size: 0.85em;
            opacity: 0.7;
        }
        .je-download-meta {
            display: flex;
            gap: 0.5em;
            flex-wrap: wrap;
            margin-top: auto;
        }
        .je-download-badge, .je-request-status {
          font-size: 0.95em;
          padding: 0.35em 0.7em;
          border-radius: 999px;
          text-transform: uppercase;
          font-weight: 700;
          color: #fff;
        }
        .je-arr-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.25em;
          padding: 0;
          background: transparent;
        }
        .je-arr-badge img {
          width: 18px;
          height: 18px;
          object-fit: contain;
          filter: drop-shadow(0 1px 2px rgba(0,0,0,0.35));
        }
        .je-download-progress-container {
            padding: 0 1em 1em;
        }
        .je-download-progress {
            height: 4px;
            background: rgba(128,128,128,0.2);
            border-radius: 2px;
            overflow: hidden;
        }
        .je-download-progress-bar {
            height: 100%;
            transition: width 0.3s ease;
        }
        .je-download-stats {
          display: flex;
          justify-content: space-between;
          font-size: 1em;
          opacity: 0.95;
          margin-top: 0.6em;
        }
        .je-requests-tabs {
            display: flex;
            gap: 0.5em;
            margin-bottom: 1em;
            flex-wrap: wrap;
        }
        .je-requests-tab.emby-button {
            background: transparent;
            border: 1px solid rgba(255,255,255,0.3);
            color: inherit;
            padding: 0.5em 1em;
            border-radius: 4px;
            cursor: pointer;
            opacity: 0.7;
            transition: all 0.2s;
        }
        .je-requests-tab.emby-button:hover {
            opacity: 1;
            background: rgba(255,255,255,0.1);
        }
        .je-requests-tab.emby-button.active {
            opacity: 1;
        }
        .je-request-card {
            display: flex;
            gap: 1em;
            padding: 1em;
            overflow: visible;
        }
        .je-request-info {
            overflow: hidden;
            min-width: 0;
        }
        .je-request-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 0.5em;
            margin-bottom: 0.5em;
            min-width: 0;
        }
        .je-request-header > div:first-child {
            min-width: 0;
            flex: 1;
            overflow: hidden;
        }
        .je-request-title {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            display: block;
        }
        .je-request-status {
            flex-shrink: 0;
        }
        .je-request-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5em;
          font-size: 0.85em;
          opacity: 0.8;
          margin-top: 0.5em;
        }
        .je-request-meta-left { display: inline-flex; align-items: center; gap: 0.5em; min-width: 0; }
        .je-request-avatar {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            object-fit: cover;
        }
        .je-request-actions {
            margin-top: 1em;
        }
        .je-request-watch-btn {
          color: inherit;
          border: none;
          padding: 0.45em;
          border-radius: 50%;
          cursor: pointer;
          width: 36px;
          height: 36px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        }
        .je-request-watch-btn:hover { opacity: 0.9; }
        .je-request-watch-btn .material-icons { font-size: 20px; }
        .je-pagination {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 1em;
            margin-top: 1.5em;
        }
        .je-pagination .emby-button {
            background: transparent;
            border: 1px solid rgba(255,255,255,0.3);
            color: inherit;
            padding: 0.5em 1em;
            border-radius: 4px;
            cursor: pointer;
            opacity: 0.7;
            transition: all 0.2s;
        }
        .je-pagination .emby-button:hover:not(:disabled) {
            opacity: 1;
            background: rgba(255,255,255,0.1);
        }
        .je-pagination .emby-button:disabled { opacity: 0.3; cursor: not-allowed; }
        .je-empty-state {
            text-align: center;
            padding: 3em;
            opacity: 0.5;
        }
        .je-loading {
            display: flex;
            justify-content: center;
            padding: 2em;
        }
        .je-requests-status-chip {
          display: inline-flex;
          align-items: center;
          padding: 0.3rem 0.6rem;
          margin-top: 0.7rem;
          border-radius: 999px;
          font-weight: 700;
          letter-spacing: 0.02em;
          font-size: 0.72rem;
          text-transform: uppercase;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.12);
        }
        .je-requests-status-chip.je-chip-available { background: rgba(34, 197, 94, 0.25); color: #f0f9ff; border-color: rgba(34, 197, 94, 0.5); }
        .je-requests-status-chip.je-chip-partial { background: rgba(234, 179, 8, 0.25); color: #f0f9ff; border-color: rgba(234, 179, 8, 0.5); }
        .je-requests-status-chip.je-chip-processing { background: rgba(59, 130, 246, 0.25); color: #f0f9ff; border-color: rgba(59, 130, 246, 0.5); }
        .je-requests-status-chip.je-chip-requested { background: rgba(168, 85, 247, 0.25); color: #f0f9ff; border-color: rgba(168, 85, 247, 0.5); }
        .je-requests-status-chip.je-chip-rejected { background: rgba(248, 113, 113, 0.25); color: #f0f9ff; border-color: rgba(248, 113, 113, 0.5); }
        .je-coming-soon-badge {
            position: absolute;
            bottom: 8px;
            left: 8px;
            background: linear-gradient(135deg, rgba(76, 175, 80, 0.9), rgba(56, 142, 60, 0.9));
            color: #fff;
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 0.8em;
            font-weight: 500;
            backdrop-filter: blur(4px);
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        .je-request-poster-container {
            position: relative;
            flex-shrink: 0;
        }
    `;

  /**
   * Inject CSS styles
   */
  function injectStyles() {
    if (document.getElementById("je-downloads-styles")) return;
    const style = document.createElement("style");
    style.id = "je-downloads-styles";
    style.textContent = CSS_STYLES;
    document.head.appendChild(style);

    // Inject dynamic theme colors
    injectThemeColors();
  }

  /**
   * Inject dynamic theme colors
   */
  function injectThemeColors() {
    const existingThemeStyle = document.getElementById("je-downloads-theme-colors");
    if (existingThemeStyle) {
      existingThemeStyle.remove();
    }

    const themeVars = JE.themer?.getThemeVariables() || {};
    const primaryAccent = themeVars.primaryAccent || '#00a4dc';

    const themeStyle = document.createElement("style");
    themeStyle.id = "je-downloads-theme-colors";
    themeStyle.textContent = `
      .je-requests-tab.emby-button.active {
        background: ${primaryAccent} !important;
        border-color: ${primaryAccent} !important;
      }
      .je-request-watch-btn {
        background: ${primaryAccent} !important;
      }
    `;
    document.head.appendChild(themeStyle);
  }

  /**
   * Get API authentication headers
   */
  function getAuthHeaders() {
    const token = ApiClient.accessToken ? ApiClient.accessToken() : "";
    return {
      "X-MediaBrowser-Token": token,
      "Content-Type": "application/json",
    };
  }

  /**
   * Fetch download queue from backend
   */
  async function fetchDownloads() {
    try {
      const response = await fetch(
        ApiClient.getUrl("/JellyfinEnhanced/arr/queue"),
        { headers: getAuthHeaders() },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      state.downloads = data.items || [];
      return data;
    } catch (error) {
      console.error(`${logPrefix} Failed to fetch downloads:`, error);
      state.downloads = [];
      return null;
    }
  }

  /**
   * Apply client-side filters to raw requests data
   */
  function applyRequestsFilters(requests, filter) {
    let filtered = [...requests];

    // Client-side filtering for "Coming Soon" tab
    if (filter === "coming-soon") {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const currentYear = now.getFullYear();
      filtered = filtered.filter(req => {
        const releaseDate = req.releaseDate || req.firstAirDate;
        let isFutureRelease = false;

        if (releaseDate) {
          const date = new Date(releaseDate);
          if (!isNaN(date.getTime())) {
            date.setHours(0, 0, 0, 0);
            isFutureRelease = date > now;
          }
        } else if (req.year && req.year >= currentYear) {
          // Include current year releases when only year is available (likely still upcoming)
          isFutureRelease = true;
        }

        if (!isFutureRelease) return false;

        const status = (req.mediaStatus || '').toLowerCase();
        const isApprovedOrProcessing = status === 'processing' || status === 'approved' ||
                                        status === 'pending' || req.status === 2 || req.status === 3;
        return isApprovedOrProcessing;
      });
      // Sort by release date (nearest first)
      filtered.sort((a, b) => {
        const getDate = (req) => {
          if (req.releaseDate || req.firstAirDate) {
            return new Date(req.releaseDate || req.firstAirDate);
          }
          return req.year ? new Date(req.year, 0, 1) : new Date(0);
        };
        return getDate(a) - getDate(b);
      });
    }

    // Client-side filtering for "Processing" tab - exclude "Partially Available"
    if (filter === "processing") {
      filtered = filtered.filter(req => {
        const status = (req.mediaStatus || '').toLowerCase();
        return status !== 'partially available';
      });
    }

    return filtered;
  }

  /**
   * Get cache key for current filter/page
   */
  function getRequestsCacheKey(filter, page) {
    const isComingSoon = filter === "coming-soon";
    // Coming-soon uses "all" data with client-side filter
    const apiFilter = isComingSoon ? "" : (filter !== "all" ? filter : "");
    const apiPage = isComingSoon ? 0 : page;
    return `${apiFilter}:${apiPage}`;
  }

  /**
   * Check if cache is valid
   */
  function isCacheValid(cacheKey) {
    const cacheTime = state.requestsCacheTime[cacheKey];
    if (!cacheTime) return false;
    return (Date.now() - cacheTime) < CACHE_TTL_MS;
  }

  /**
   * Fetch requests from backend
   */
  async function fetchRequests(forceRefresh = false) {
    const currentFilter = state.requestsFilter;
    const currentPage = state.requestsPage;
    const cacheKey = getRequestsCacheKey(currentFilter, currentPage);
    const isComingSoon = currentFilter === "coming-soon";

    // Check cache first (unless forcing refresh)
    if (!forceRefresh && isCacheValid(cacheKey) && state.requestsCache[cacheKey]) {
      const cached = state.requestsCache[cacheKey];
      state.requests = applyRequestsFilters(cached.requests, currentFilter);
      state.requestsTotalPages = isComingSoon ? 1 : (cached.totalPages || 1);
      return cached;
    }

    try {
      const skip = (currentPage - 1) * 20;
      const filter = isComingSoon ? "" : (currentFilter !== "all" ? currentFilter : "");

      const url = ApiClient.getUrl("/JellyfinEnhanced/arr/requests", {
        take: isComingSoon ? 100 : 20,
        skip: isComingSoon ? 0 : skip,
        filter: filter,
      });

      const response = await fetch(url, {
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      const rawRequests = data.requests || [];

      // Store in cache
      state.requestsCache[cacheKey] = {
        requests: rawRequests,
        totalPages: data.totalPages || 1,
      };
      state.requestsCacheTime[cacheKey] = Date.now();

      // Apply filters and update state
      state.requests = applyRequestsFilters(rawRequests, currentFilter);
      state.requestsTotalPages = isComingSoon ? 1 : (data.totalPages || 1);

      return data;
    } catch (error) {
      console.error(`${logPrefix} Failed to fetch requests:`, error);
      state.requests = [];
      return null;
    }
  }

  /**
   * Clear requests cache
   */
  function clearRequestsCache() {
    state.requestsCache = {};
    state.requestsCacheTime = {};
  }

  /**
   * Load all data
   */
  async function loadAllData(clearCache = false) {
    if (clearCache) {
      clearRequestsCache();
    }

    state.isLoading = true;
    renderPage();

    await Promise.all([fetchDownloads(), fetchRequests(clearCache)]);

    state.isLoading = false;
    renderPage();
  }

  /**
   * Format bytes to human readable
   */
  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  /**
   * Format time remaining
   */
  function formatTimeRemaining(timeStr) {
    if (!timeStr) return "";

    // Handle HH:MM:SS format
    const match = timeStr.match(/^(\d+):(\d+):(\d+)$/);
    if (match) {
      const hours = parseInt(match[1]);
      const minutes = parseInt(match[2]);

      if (hours > 0) return `${hours}h ${minutes}m`;
      return `${minutes}m`;
    }

    // Handle day format like 1.02:30:45
    const dayMatch = timeStr.match(/^(\d+)\.(\d+):(\d+):(\d+)$/);
    if (dayMatch) {
      const days = parseInt(dayMatch[1]);
      const hours = parseInt(dayMatch[2]);
      if (days > 0) return `${days}d ${hours}h`;
      return `${hours}h`;
    }

    return timeStr;
  }

  /**
   * Format relative date
   */
  function formatRelativeDate(dateStr) {
    if (!dateStr) return "";

    const date = new Date(dateStr);

    // Check if date parsing failed
    if (isNaN(date.getTime())) {
      return "";
    }

    const now = new Date();
    const diff = now - date;

    // Handle negative diff (future dates) or invalid dates
    if (diff < 0) return "";

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 30) return `${days}d ago`;

    // For older dates, show the actual date
    return date.toLocaleDateString();
  }

  /**
   * Format relative release date for future dates
   * Returns null for past dates or invalid dates
   */
  function formatRelativeReleaseDate(dateString) {
    if (!dateString) return null;

    const targetDate = new Date(dateString);
    if (isNaN(targetDate.getTime())) return null;

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    targetDate.setHours(0, 0, 0, 0);

    const diffMs = targetDate.getTime() - now.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return null;
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'tomorrow';
    if (diffDays <= 7) return 'in ' + diffDays + ' days';
    if (diffDays <= 14) return 'in 2 weeks';
    if (diffDays <= 30) {
      const weeks = Math.floor(diffDays / 7);
      return 'in ' + weeks + ' week' + (weeks > 1 ? 's' : '');
    }

    // For dates more than 30 days out, show "on 28th February" format
    const day = targetDate.getDate();
    // Handle ordinal suffixes: 11th, 12th, 13th are special cases (teen numbers always use 'th')
    let suffix = 'th';
    if (day < 11 || day > 13) {
      const lastDigit = day % 10;
      if (lastDigit === 1) suffix = 'st';
      else if (lastDigit === 2) suffix = 'nd';
      else if (lastDigit === 3) suffix = 'rd';
    }
    const month = targetDate.toLocaleDateString('en-US', { month: 'long' });
    return 'on ' + day + suffix + ' ' + month;
  }

  /**
   * Format downloaded/total stats with clamping
   */
  function formatDownloadStats(totalSize, sizeRemaining) {
    if (!totalSize || totalSize <= 0) return "";
    const remaining = Math.max(0, Math.min(totalSize, sizeRemaining || 0));
    const downloaded = Math.max(0, Math.min(totalSize, totalSize - remaining));
    return `${formatBytes(downloaded)} / ${formatBytes(totalSize)}`;
  }

  /**
   * Jellyseerr like chips
   */
  function resolveRequestStatus(status) {
    const normalized = (status || "").toLowerCase();
    const labelAvailable = JE.t?.("jellyseerr_btn_available") || "Available";
    const labelPartial = JE.t?.("jellyseerr_btn_partially_available") || "Partially Available";
    const labelProcessing = JE.t?.("jellyseerr_btn_processing") || "Processing";
    const labelPending = JE.t?.("jellyseerr_btn_pending") || "Pending Approval";
    const labelRequested = JE.t?.("jellyseerr_btn_requested") || "Requested";
    const labelRejected = JE.t?.("jellyseerr_btn_rejected") || "Rejected";

    switch (normalized) {
      case "available":
        return { label: labelAvailable, className: "je-chip-available" };
      case "partially available":
        return { label: labelPartial, className: "je-chip-partial" };
      case "processing":
        return { label: labelProcessing, className: "je-chip-processing" };
      case "approved":
        return { label: labelRequested, className: "je-chip-requested" };
      case "pending":
        return { label: labelPending, className: "je-chip-requested" };
      case "declined":
        return { label: labelRejected, className: "je-chip-rejected" };
      default:
        return { label: status || labelRequested, className: "je-chip-requested" };
    }
  }

  /**
   * Render a download card
   */
  function renderDownloadCard(item) {
    const STATUS_COLORS = getStatusColors();
    const statusColor = STATUS_COLORS[item.status] || STATUS_COLORS.Unknown;
    const sourceIcon = item.source === "sonarr" ? SONARR_ICON_URL : RADARR_ICON_URL;
    const sourceLabel = item.source === "sonarr" ? "Sonarr" : "Radarr";

    const posterHtml = item.posterUrl
      ? `<img class="je-download-poster" src="${item.posterUrl}" alt="" loading="lazy" onerror="this.style.display='none'">`
      : `<div class="je-download-poster placeholder"></div>`;

    const progressHtml = `
      <div class="je-download-progress-container">
        <div class="je-download-progress">
          <div class="je-download-progress-bar" style="width: ${item.progress || 0}%; background: ${statusColor}"></div>
        </div>
        <div class="je-download-stats">
          <span>${item.progress || 0}%</span>
          ${item.timeRemaining ? `<span>ETA: ${formatTimeRemaining(item.timeRemaining)}</span>` : ""}
          ${item.totalSize ? `<span>${formatDownloadStats(item.totalSize, item.sizeRemaining)}</span>` : ""}
        </div>
      </div>
    `;

    return `
      <div class="je-download-card">
        <div class="je-download-card-content">
          ${posterHtml}
          <div class="je-download-info">
            <div class="je-download-title" title="${item.title || ""}">${item.title || "Unknown"}</div>
            ${item.subtitle ? `<div class="je-download-subtitle" title="${item.subtitle}">${item.subtitle}</div>` : ""}
            <div class="je-download-meta">
                <span class="je-download-badge je-arr-badge" title="${sourceLabel}"><img src="${sourceIcon}" alt="${sourceLabel}" loading="lazy"></span>
              <span class="je-download-badge" style="background: ${statusColor}">${item.status}</span>
            </div>
          </div>
        </div>
        ${progressHtml}
      </div>
    `;
  }

  /**
   * Render a request card
   */
  function renderRequestCard(item, showReleaseBadge = false) {
    const status = resolveRequestStatus(item.mediaStatus);

    let posterHtml = "";
    if (item.posterUrl) {
      posterHtml = `<img class="je-request-poster" src="${item.posterUrl}" alt="" loading="lazy">`;
    } else {
      posterHtml = `<div class="je-request-poster placeholder"></div>`;
    }

    // Add release date badge for Coming Soon view
    let releaseBadgeHtml = "";
    if (showReleaseBadge) {
      const releaseDate = item.releaseDate || item.firstAirDate;
      let badgeText = formatRelativeReleaseDate(releaseDate);
      // Fall back to showing just the year if no full date available
      if (!badgeText && item.year && item.year >= new Date().getFullYear()) {
        badgeText = String(item.year);
      }
      if (badgeText) {
        releaseBadgeHtml = `<div class="je-coming-soon-badge">${badgeText}</div>`;
      }
    }

    // Wrap poster in a container for badge positioning
    const posterContainerHtml = `<div class="je-request-poster-container">${posterHtml}${releaseBadgeHtml}</div>`;

    let avatarHtml = "";
    if (item.requestedByAvatar) {
      avatarHtml = `<img class="je-request-avatar" src="${item.requestedByAvatar}" alt="" onerror="this.style.display='none'">`;
    }

    let watchButton = "";
    if (item.jellyfinMediaId && (item.mediaStatus === "Available" || item.mediaStatus === "Partially Available")) {
      const playLabel = JE.t?.("jellyseerr_btn_available") || "Available";
      const playIcon = '<span class="material-icons">play_arrow</span>';
      watchButton = `<button class="je-request-watch-btn" title="${playLabel}" aria-label="${playLabel}" data-media-id="${item.jellyfinMediaId}">${playIcon}</button>`;
    }

    return `
            <div class="je-request-card">
                ${posterContainerHtml}
                <div class="je-request-info">
                    <div class="je-request-header">
                      <div>
                        <div class="je-request-title-row">
                          <div class="je-request-title">${item.title || "Unknown"}</div>
                          ${item.year ? `<span class="je-request-year">(${item.year})</span>` : ""}
                        </div>
                        <span class="je-requests-status-chip ${status.className}">${status.label}</span>
                      </div>
                    </div>
                    <div class="je-request-meta">
                      <div class="je-request-meta-left">
                        ${avatarHtml}
                        <span>${item.requestedBy || "Unknown"}</span>
                        ${item.createdAt ? `<span>&#8226;</span><span>${formatRelativeDate(item.createdAt)}</span>` : ""}
                      </div>
                    </div>
                    ${watchButton ? `<div class="je-request-actions">${watchButton}</div>` : ""}
                </div>
            </div>
        `;
  }

  /**
   * Group downloads by season pack (same show + season + same progress indicates season pack)
   * Returns array of items where season packs are collapsed into single entries
   */
  function groupDownloads(downloads) {
    const grouped = [];
    const seasonPackMap = new Map(); // key: "title|season|progress" -> episodes[]

    for (const item of downloads) {
      // Only group sonarr items with season numbers
      if (item.source === "sonarr" && item.seasonNumber != null) {
        // Group by show title + season + progress (same progress = likely season pack)
        const key = `${item.title}|${item.seasonNumber}|${item.progress}`;

        if (!seasonPackMap.has(key)) {
          seasonPackMap.set(key, []);
        }
        seasonPackMap.get(key).push(item);
      } else {
        // Movies or items without season info - add directly
        grouped.push({ type: "single", item });
      }
    }

    // Process season groups
    for (const [key, episodes] of seasonPackMap) {
      if (episodes.length >= 3) {
        // 3+ episodes with same progress = season pack, collapse them
        const first = episodes[0];
        const episodeNums = episodes
          .map((e) => e.episodeNumber)
          .sort((a, b) => a - b);
        const minEp = episodeNums[0];
        const maxEp = episodeNums[episodeNums.length - 1];

        grouped.push({
          type: "seasonPack",
          item: first,
          episodes: episodes,
          episodeRange: `E${String(minEp).padStart(2, "0")}-E${String(maxEp).padStart(2, "0")}`,
          episodeCount: episodes.length,
        });
      } else {
        // Few episodes - show individually
        for (const ep of episodes) {
          grouped.push({ type: "single", item: ep });
        }
      }
    }

    return grouped;
  }

  /**
   * Render a season pack card (collapsed view of multiple episodes)
   */
  function renderSeasonPackCard(group) {
    const STATUS_COLORS = getStatusColors();
    const item = group.item;
    const statusColor = STATUS_COLORS[item.status] || STATUS_COLORS.Unknown;

    const posterHtml = item.posterUrl
      ? `<img class="je-download-poster" src="${item.posterUrl}" alt="" loading="lazy" onerror="this.style.display='none'">`
      : `<div class="je-download-poster placeholder"></div>`;

    // Calculate total size for the pack
    // Check if all episodes have identical sizes (season pack download)
    const firstSize = group.episodes[0]?.totalSize || 0;
    const firstRemaining = group.episodes[0]?.sizeRemaining || 0;
    const isSeasonPackDownload = group.episodes.every(
      (ep) => ep.totalSize === firstSize && ep.sizeRemaining === firstRemaining
    );

    // If it's a season pack download (same size for all), use the size once
    // Otherwise, sum individual episode sizes
    const totalSize = isSeasonPackDownload
      ? firstSize
      : group.episodes.reduce((sum, ep) => sum + (ep.totalSize || 0), 0);
    const sizeRemaining = isSeasonPackDownload
      ? firstRemaining
      : group.episodes.reduce((sum, ep) => sum + (ep.sizeRemaining || 0), 0);

    const progressHtml = `
      <div class="je-download-progress-container">
        <div class="je-download-progress">
          <div class="je-download-progress-bar" style="width: ${item.progress || 0}%; background: ${statusColor}"></div>
        </div>
        <div class="je-download-stats">
          <span>${item.progress || 0}%</span>
          ${item.timeRemaining ? `<span>ETA: ${formatTimeRemaining(item.timeRemaining)}</span>` : ""}
          ${totalSize ? `<span>${formatDownloadStats(totalSize, sizeRemaining)}</span>` : ""}
        </div>
      </div>
    `;

    return `
      <div class="je-download-card je-season-pack">
        <div class="je-download-card-content">
          ${posterHtml}
          <div class="je-download-info">
            <div class="je-download-title" title="${item.title || ""}">${item.title || "Unknown"}</div>
            <div class="je-download-subtitle">Season ${item.seasonNumber} (${group.episodeCount} episodes)</div>
            <div class="je-download-meta">
              <span class="je-download-badge je-arr-badge" title="Sonarr"><img src="${SONARR_ICON_URL}" alt="Sonarr" loading="lazy"></span>
              <span class="je-download-badge" style="background: ${statusColor}">${item.status}</span>
              <span class="je-download-badge" style="background: rgba(128,128,128,0.4)">${group.episodeRange}</span>
            </div>
          </div>
        </div>
        ${progressHtml}
      </div>
    `;
  }

  /**
   * Render the full page
   */
  function renderPage() {
    const container = document.getElementById("je-downloads-container");
    if (!container) return;

    let html = "";

    // Active Downloads Section
    html += `<div class="je-downloads-section" style="margin-top: 2em;">`;
    const labelActiveDownloads = (JE.t && JE.t('jellyseerr_active_downloads')) || 'Active Downloads';
    html += `<h2 style="margin-top: 0.5em;">${labelActiveDownloads}</h2>`;

    if (state.isLoading && state.downloads.length === 0) {
      html += `<div class="je-loading">Loading...</div>`;
    } else if (state.downloads.length === 0) {
      const labelNoActiveDownloads = (JE.t && JE.t('requests_no_active_downloads')) || 'No active downloads';
      html += `
        <div class="je-empty-state">
          <div>${labelNoActiveDownloads}</div>
        </div>
      `;
    } else {
      // Group downloads (collapse season packs)
      const groupedDownloads = groupDownloads(state.downloads);

      html += `<div class="je-downloads-grid">`;
      for (const group of groupedDownloads) {
        if (group.type === "seasonPack") {
          html += renderSeasonPackCard(group);
        } else {
          html += renderDownloadCard(group.item);
        }
      }
      html += `</div>`;
    }
    html += `</div>`;

    // Requests Section
    if (JE.pluginConfig?.JellyseerrEnabled) {
      html += `<div class="je-downloads-section">`;
      const labelRequests = (JE.t && JE.t('requests_requests')) || 'Requests';
      html += `<h2>${labelRequests}</h2>`;

        // Filter tabs
        const labelAll = (JE.t && JE.t('jellyseerr_discover_all')) || 'All';
        const labelPending = (JE.t && JE.t('jellyseerr_btn_pending')) || 'Pending Approval';
        const labelProcessing = (JE.t && JE.t('jellyseerr_btn_processing')) || 'Processing';
        const labelAvailable = (JE.t && JE.t('jellyseerr_btn_available')) || 'Available';
        const labelComingSoon = (JE.t && JE.t('requests_coming_soon')) || 'Coming Soon';

        html += `
            <div class="je-requests-tabs">
              <button is="emby-button" type="button" class="je-requests-tab emby-button ${state.requestsFilter === "all" ? "active" : ""}" onclick="window.JellyfinEnhanced.downloadsPage.filterRequests('all')">${labelAll}</button>
              <button is="emby-button" type="button" class="je-requests-tab emby-button ${state.requestsFilter === "pending" ? "active" : ""}" onclick="window.JellyfinEnhanced.downloadsPage.filterRequests('pending')">${labelPending}</button>
              <button is="emby-button" type="button" class="je-requests-tab emby-button ${state.requestsFilter === "processing" ? "active" : ""}" onclick="window.JellyfinEnhanced.downloadsPage.filterRequests('processing')">${labelProcessing}</button>
              <button is="emby-button" type="button" class="je-requests-tab emby-button ${state.requestsFilter === "coming-soon" ? "active" : ""}" onclick="window.JellyfinEnhanced.downloadsPage.filterRequests('coming-soon')">${labelComingSoon}</button>
              <button is="emby-button" type="button" class="je-requests-tab emby-button ${state.requestsFilter === "available" ? "active" : ""}" onclick="window.JellyfinEnhanced.downloadsPage.filterRequests('available')">${labelAvailable}</button>
              ${state.isLoading ? '<span style="margin-left:0.5em;opacity:0.6;font-size:0.9em;">Loading...</span>' : ''}
            </div>
          `;

      // No-blanking: only show full loading state if there's no content to display
      if (state.requests.length === 0 && state.isLoading) {
        html += `<div class="je-loading">Loading...</div>`;
      } else if (state.requests.length === 0) {
        let emptyMessage = 'No requests found';
        if (state.requestsFilter === 'coming-soon') {
          const translated = JE.t && JE.t('requests_coming_soon_empty');
          emptyMessage = (translated && translated !== 'requests_coming_soon_empty')
            ? translated
            : 'No upcoming releases in your requests';
        }
        html += `
                    <div class="je-empty-state">
                        <div>${emptyMessage}</div>
                    </div>
                `;
      } else {
        const showReleaseBadge = state.requestsFilter === 'coming-soon';
        html += `<div class="je-downloads-grid">`;
        state.requests.forEach((item) => {
          html += renderRequestCard(item, showReleaseBadge);
        });
        html += `</div>`;

        // Pagination
        if (state.requestsTotalPages > 1) {
          html += `
                        <div class="je-pagination">
                            <button is="emby-button" type="button" class="emby-button" onclick="window.JellyfinEnhanced.downloadsPage.prevPage()" ${state.requestsPage <= 1 ? "disabled" : ""}>Previous</button>
                            <span>Page ${state.requestsPage} of ${state.requestsTotalPages}</span>
                            <button is="emby-button" type="button" class="emby-button" onclick="window.JellyfinEnhanced.downloadsPage.nextPage()" ${state.requestsPage >= state.requestsTotalPages ? "disabled" : ""}>Next</button>
                        </div>
                    `;
        }
      }
      html += `</div>`;
    }

    container.innerHTML = html;
  }

  /**
   * Create the downloads page container with proper Jellyfin page structure
   */
  function createPageContainer() {
    let page = document.getElementById("je-downloads-page");
    if (!page) {
      page = document.createElement("div");
      page.id = "je-downloads-page";
      // Use Jellyfin's page classes for proper integration
      page.className = "page type-interior mainAnimatedPage hide";
      // Data attributes for header/back button integration
      page.setAttribute("data-title", "Requests");
      page.setAttribute("data-backbutton", "true");
      page.setAttribute("data-url", "#/downloads");
      page.setAttribute("data-type", "custom");
      page.innerHTML = `
        <div data-role="content">
          <div class="content-primary je-downloads-page">
            <div id="je-downloads-container" style="padding-top: 5em;"></div>
          </div>
        </div>
      `;

      const mainContent = document.querySelector(".mainAnimatedPages");
      if (mainContent) {
        mainContent.appendChild(page);
      } else {
        document.body.appendChild(page);
      }
    }
    return page;
  }

  /**
   * Show the downloads page with proper Jellyfin integration
   */
  function showPage() {
    if (state.pageVisible) return;

    state.pageVisible = true;

    // Ensure page exists first
    const page = createPageContainer();
    if (!page) {
      console.error(`${logPrefix} Failed to create page container`);
      state.pageVisible = false;
      return;
    }

    if (window.location.hash !== "#/downloads") {
      history.pushState({ page: "downloads" }, "Requests", "#/downloads");
    }

    // Hide other Jellyfin pages - but track which one was active so we can restore it
    const activePage = document.querySelector(
      ".mainAnimatedPage:not(.hide):not(#je-downloads-page)",
    );
    if (activePage) {
      state.previousPage = activePage;
      activePage.classList.add("hide");
      // Dispatch viewhide for the page we're leaving
      activePage.dispatchEvent(
        new CustomEvent("viewhide", {
          bubbles: true,
          detail: { type: "interior" },
        }),
      );
    }

    // Show our page
    page.classList.remove("hide");

    // Dispatch viewshow event so Jellyfin's libraryMenu updates header/back button
    page.dispatchEvent(
      new CustomEvent("viewshow", {
        bubbles: true,
        detail: {
          type: "custom",
          isRestored: false,
          options: {},
        },
      }),
    );

    // Also dispatch pageshow for other integrations
    page.dispatchEvent(
      new CustomEvent("pageshow", {
        bubbles: true,
        detail: {
          type: "custom",
          isRestored: false,
        },
      }),
    );

    // Only load data once (guard against showPage retries)
    if (!state.isLoading) {
      loadAllData();
      startPolling();
    }
  }

  /**
   * Hide the downloads page and clean up header state
   */
  function hidePage() {
    if (!state.pageVisible) return;

    const page = document.getElementById("je-downloads-page");
    if (page) {
      page.classList.add("hide");

      // Dispatch viewhide event so Jellyfin knows we're leaving
      page.dispatchEvent(
        new CustomEvent("viewhide", {
          bubbles: true,
          detail: { type: "custom" },
        }),
      );
    }

    // Restore the previous page if Jellyfin's router hasn't already shown another page
    // This handles the case where user clicks browser back button
    // But NOT when clicking header tabs (Jellyfin handles those via viewshow events)
    if (
      state.previousPage &&
      !document.querySelector(
        ".mainAnimatedPage:not(.hide):not(#je-downloads-page)",
      )
    ) {
      state.previousPage.classList.remove("hide");
      // Dispatch viewshow so the page re-initializes properly
      state.previousPage.dispatchEvent(
        new CustomEvent("viewshow", {
          bubbles: true,
          detail: { type: "interior", isRestored: true },
        }),
      );
    }

    state.pageVisible = false;
    state.previousPage = null;
    stopPolling();
    stopLocationWatcher();
  }

  /**
   * Start polling for updates
   */
  function startPolling() {
    stopPolling();
    const config = JE.pluginConfig || {};
    const interval = (config.DownloadsPollIntervalSeconds || 30) * 1000;

    state.pollTimer = setInterval(() => {
      if (state.pageVisible && !state.isLoading) {
        loadAllData();
      }
    }, interval);
  }

  /**
   * Stop polling
   */
  function stopPolling() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  /**
   * Filter requests - optimized for fast tab switching
   * Uses token-based "last intent wins" to prevent stale async responses from overwriting newer data
   */
  function filterRequests(filter) {
    if (state.requestsFilter === filter) return; // Already on this tab

    // Increment token - any in-flight async with older token will be discarded
    const token = ++state.tabSwitchToken;

    state.requestsFilter = filter;
    state.requestsPage = 1;

    const cacheKey = getRequestsCacheKey(filter, 1);

    // Check if we have valid cached data
    if (isCacheValid(cacheKey) && state.requestsCache[cacheKey]) {
      // Use cached data immediately - no loading state needed
      const cached = state.requestsCache[cacheKey];
      state.requests = applyRequestsFilters(cached.requests, filter);
      state.requestsTotalPages = filter === "coming-soon" ? 1 : (cached.totalPages || 1);
      state.isLoading = false;
      scheduleRender();
      // Refresh in background for freshness - guarded by token
      fetchRequests(true).then(() => {
        if (token !== state.tabSwitchToken) return; // Stale response, discard
        scheduleRender();
      });
    } else {
      // No cache - show loading indicator but keep previous content visible (no blanking)
      state.isLoading = true;
      scheduleRender(); // Shows tab as active + loading indicator, keeps previous list
      fetchRequests().then(() => {
        if (token !== state.tabSwitchToken) return; // Stale response, discard
        state.isLoading = false;
        scheduleRender();
      });
    }
  }

  /**
   * Next page
   */
  function nextPage() {
    if (state.requestsPage < state.requestsTotalPages) {
      state.requestsPage++;
      fetchRequests().then(() => renderPage());
    }
  }

  /**
   * Previous page
   */
  function prevPage() {
    if (state.requestsPage > 1) {
      state.requestsPage--;
      fetchRequests().then(() => renderPage());
    }
  }

  /**
   * Inject navigation item into sidebar
   */
  function injectNavigation() {
    const config = JE.pluginConfig || {};
    if (!config.DownloadsPageEnabled) return;

    // Check if already exists
    if (document.querySelector(".je-nav-downloads-item")) {
      return;
    }

    const jellyfinEnhancedSection = document.querySelector('.jellyfinEnhancedSection');

    if (jellyfinEnhancedSection) {
      const navItem = document.createElement("a");
      navItem.setAttribute('is', 'emby-linkbutton');
      navItem.className =
        "navMenuOption lnkMediaFolder emby-button je-nav-downloads-item";
      navItem.href = "#";
      const labelRequests = (JE.t && JE.t('requests_requests')) || 'Requests';
      navItem.innerHTML = `
        <span class="navMenuOptionIcon material-icons">download</span>
        <span class="sectionName navMenuOptionText">${labelRequests}</span>
      `;
      navItem.addEventListener("click", (e) => {
        e.preventDefault();
        showPage();
      });

      jellyfinEnhancedSection.appendChild(navItem);
      console.log(`${logPrefix} Navigation item injected`);
    } else {
      console.log(`${logPrefix} jellyfinEnhancedSection not found, will wait for it`);
    }
  }

  /**
   * Setup navigation watcher - observes only when link is missing
   */
  function setupNavigationWatcher() {
    const config = JE.pluginConfig || {};
    if (!config.DownloadsPageEnabled) return;

    // Use MutationObserver to watch for sidebar changes, but disconnect after re-injection
    const observer = new MutationObserver(() => {
      if (!document.querySelector('.je-nav-downloads-item')) {
        const jellyfinEnhancedSection = document.querySelector('.jellyfinEnhancedSection');
        if (jellyfinEnhancedSection) {
          console.log(`${logPrefix} Sidebar rebuilt, re-injecting navigation`);
          injectNavigation();
        }
      }
    });

    // Observe the main drawer
    const navDrawer = document.querySelector('.mainDrawer, .navDrawer, body');
    if (navDrawer) {
      observer.observe(navDrawer, { childList: true, subtree: true });
      console.log(`${logPrefix} Navigation watcher setup`);
    }
  }

  /**
   * Handle URL hash changes
   */
  function handleNavigation() {
    const hash = window.location.hash;
    const path = window.location.pathname;
    if (hash === "#/downloads" || path === "/downloads") {
      console.log(`${logPrefix} handleNavigation matched downloads (hash=${hash} path=${path})`);
      // Show page to win races against Jellyfin's router rendering 404
      showPage();
    } else if (state.pageVisible) {
      console.log(`${logPrefix} handleNavigation hiding page (hash=${hash} path=${path})`);
      hidePage();
    }
  }

  /**
   * Initialize the downloads page module
   */
  function initialize() {
    console.log(`${logPrefix} Initializing downloads page module`);

    const config = JE.pluginConfig || {};
    if (!config.DownloadsPageEnabled) {
      console.log(`${logPrefix} Downloads page is disabled`);
      return;
    }

    injectStyles();
    createPageContainer();

    // Inject navigation and set up one-time re-injection on sidebar rebuild
    injectNavigation();
    setupNavigationWatcher();

    // Intercept router changes before Jellyfin handles them
    window.addEventListener("hashchange", interceptNavigation, true);
    window.addEventListener("popstate", interceptNavigation, true);

    // Listen for hash changes - handles browser back/forward and direct URL changes
    window.addEventListener("hashchange", handleNavigation);
    window.addEventListener("popstate", handleNavigation);

    startLocationWatcher();

    // Listen for Jellyfin's viewshow events - hide our page when other pages show
    document.addEventListener("viewshow", (e) => {
      const targetPage = e.target;
      if (
        state.pageVisible &&
        targetPage &&
        targetPage.id !== "je-downloads-page"
      ) {
        hidePage();
      }
    });

    // Listen for clicks on header navigation buttons (Home, Favorites, etc.)
    // These buttons use Jellyfin's internal router and may not change the hash immediately
    document.addEventListener(
      "click",
      (e) => {
        if (!state.pageVisible) return;

        // Handle play button clicks
        const playBtn = e.target.closest(".je-request-watch-btn");
        if (playBtn) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          const mediaId = playBtn.getAttribute("data-media-id");
          if (mediaId && window.Emby?.Page?.showItem) {
            window.Emby.Page.showItem(mediaId);
          }
          return;
        }

        const btn = e.target.closest(
          ".headerTabs button, .navMenuOption, .headerButton",
        );
        if (btn && !btn.classList.contains("je-nav-downloads-item")) {
          // Hide our page immediately - don't try to manage other pages
          // Jellyfin's router will handle showing the correct page
          hidePage();
        }
      },
      true,
    );

    // Check current URL on init
    handleNavigation();

    console.log(`${logPrefix} Downloads page module initialized`);
  }

  /**
   * Intercept hash/popstate changes for our route before Jellyfin router
   */
  function interceptNavigation(e) {
    const url = e?.newURL ? new URL(e.newURL) : window.location;
    const hash = url.hash;
    const path = url.pathname;
    const matches = hash === "#/downloads" || path === "/downloads";
    if (matches) {
      if (e?.stopImmediatePropagation) e.stopImmediatePropagation();
      if (e?.preventDefault) e.preventDefault();
      showPage();
    }
  }

  // Poll location because Jellyfin's router uses pushState (no popstate/hashchange fired for pushState)
  function startLocationWatcher() {
    if (state.locationTimer) return;
    state.locationSignature = `${window.location.pathname}${window.location.hash}`;
    state.locationTimer = setInterval(() => {
      const signature = `${window.location.pathname}${window.location.hash}`;
      if (signature !== state.locationSignature) {
        state.locationSignature = signature;
        handleNavigation();
      }
    }, 150);
  }

  function stopLocationWatcher() {
    if (state.locationTimer) {
      clearInterval(state.locationTimer);
      state.locationTimer = null;
    }
  }

  // Export to JE namespace
  JE.downloadsPage = {
    initialize,
    showPage,
    hidePage,
    refresh: () => loadAllData(true), // Clear cache on manual refresh
    filterRequests,
    nextPage,
    prevPage,
  };

  JE.initializeDownloadsPage = initialize;
})();
