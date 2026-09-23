// Session card and panel presentation. Lifecycle and fetching live in the entry point.
(function (JE) {
    'use strict';

    JE.internals = JE.internals || {};
    const internal = JE.internals.activeStreams = JE.internals.activeStreams || {};

    const model = internal.model;

    // ── Session card builder ─────────────────────────────────────────────────
    const buildSessionCard = (session) => {
        const item = session.NowPlayingItem;
        const ps = session.PlayState || {};
        const isPaused = ps.IsPaused;

        const title = item.SeriesName || item.Name || 'Unknown';
        const subtitle = item.SeriesName
            ? `S${String(item.ParentIndexNumber || 0).padStart(2, '0')}E${String(item.IndexNumber || 0).padStart(2, '0')} \u00b7 ${item.Name}`
            : (item.ProductionYear ? String(item.ProductionYear) : '');

        const pos = ps.PositionTicks || 0;
        const dur = item.RunTimeTicks || 0;
        const pct = dur ? Math.min(100, (pos / dur) * 100).toFixed(1) : 0;

        const card = document.createElement('div');
        card.className = 'je-as-card je-as-card-with-poster';

        // ── Poster thumbnail ─────────────────────────────────────────────────
        // For episodes, prefer the series poster over the episode thumbnail.
        const seriesTag = item.SeriesPrimaryImageTag;
        const seriesId  = item.SeriesId;
        const primaryTag = item.ImageTags?.Primary;
        const posterId  = (seriesId && seriesTag) ? seriesId : item.Id;
        const posterTag = (seriesId && seriesTag) ? seriesTag : primaryTag;
        if (posterTag && posterId && typeof ApiClient !== 'undefined') {
            const poster = document.createElement('img');
            poster.className = 'je-as-poster';
            poster.alt = '';
            poster.loading = 'lazy';
            poster.src = ApiClient.getImageUrl(posterId, { type: 'Primary', tag: posterTag, height: 120, quality: 80 });
            poster.addEventListener('error', () => { poster.replaceWith(placeholder()); });
            card.appendChild(poster);
        } else {
            card.appendChild(placeholder());
        }

        function placeholder() {
            const ph = document.createElement('div');
            ph.className = 'je-as-poster-placeholder';
            return ph;
        }

        // ── Main content column ──────────────────────────────────────────────
        const main = document.createElement('div');
        main.className = 'je-as-card-main';

        // Top row
        const top = document.createElement('div');
        top.className = 'je-as-card-top';

        const info = document.createElement('div');
        info.className = 'je-as-card-info';

        const titleEl = document.createElement('div');
        titleEl.className = 'je-as-card-title';

        // Make title clickable if we have an item ID
        if (item.Id && typeof ApiClient !== 'undefined') {
            const link = document.createElement('a');
            link.className = 'je-as-card-title-link';
            link.textContent = title;
            link.href = '#';
            link.addEventListener('click', (e) => {
                e.preventDefault();
                try {
                    if (typeof Emby !== 'undefined' && Emby.Page?.showItem) {
                        Emby.Page.showItem(item.Id);
                    } else {
                        window.location.hash = `#!/details?id=${item.Id}`;
                    }
                } catch (_) {
                    window.location.hash = `#!/details?id=${item.Id}`;
                }
            });
            titleEl.appendChild(link);
        } else {
            titleEl.textContent = title;
        }
        info.appendChild(titleEl);

        if (subtitle) {
            const subEl = document.createElement('div');
            subEl.className = 'je-as-card-subtitle';
            subEl.textContent = subtitle;
            info.appendChild(subEl);
        }

        const stateEl = document.createElement('span');
        stateEl.className = `je-as-state ${isPaused ? 'je-as-state-paused' : 'je-as-state-playing'}`;
        stateEl.textContent = isPaused
            ? (JE.t?.('downloads_status_paused') || 'Paused')
            : (JE.t?.('toast_playing') || 'Playing');

        top.appendChild(info);
        top.appendChild(stateEl);
        main.appendChild(top);

        // Progress row
        const ts = session.TranscodingInfo;
        if (dur) {
            const progressRow = document.createElement('div');
            progressRow.className = 'je-as-progress-row';

            const bar = document.createElement('div');
            bar.className = 'je-as-progress-bar';

            // Transcoding buffer — amber layer behind playback position
            if (ts && ts.CompletionPercentage != null) {
                const transcodeFill = document.createElement('div');
                transcodeFill.className = 'je-as-transcode-fill';
                transcodeFill.style.width = `${Math.min(100, ts.CompletionPercentage).toFixed(1)}%`;
                bar.appendChild(transcodeFill);
            }

            const fill = document.createElement('div');
            fill.className = 'je-as-progress-fill';
            fill.style.width = `${pct}%`;
            bar.appendChild(fill);

            const timeEl = document.createElement('span');
            timeEl.className = 'je-as-progress-time';
            timeEl.textContent = `${model.ticksToTime(pos)} / ${model.ticksToTime(dur)}`;

            progressRow.appendChild(bar);
            progressRow.appendChild(timeEl);
            main.appendChild(progressRow);
        }

        // Badges
        const badgesRow = document.createElement('div');
        badgesRow.className = 'je-as-badges';
        model.getBadges(session).forEach(badge => {
            const span = document.createElement('span');
            span.className = `je-as-badge ${badge.cls}`;
            span.textContent = badge.label;
            badgesRow.appendChild(span);
        });
        main.appendChild(badgesRow);

        // User row
        const userRow = document.createElement('div');
        userRow.className = 'je-as-user';

        if (session.UserId && session.UserHasPrimaryImage && typeof ApiClient !== 'undefined') {
            const img = document.createElement('img');
            img.className = 'je-as-avatar';
            img.alt = '';
            img.src = ApiClient.getUrl(`Users/${session.UserId}/Images/Primary`) + '?height=20&quality=80';

            const fallback = document.createElement('span');
            fallback.className = 'material-icons';
            fallback.textContent = 'person';
            fallback.style.display = 'none';

            img.addEventListener('error', () => {
                img.style.display = 'none';
                fallback.style.display = 'inline';
            });

            userRow.appendChild(img);
            userRow.appendChild(fallback);
        } else {
            const icon = document.createElement('span');
            icon.className = 'material-icons';
            icon.textContent = 'person';
            userRow.appendChild(icon);
        }

        const clientParts = [session.UserName, session.Client, session.DeviceName].filter(Boolean);
        const userLabel = document.createElement('span');
        userLabel.textContent = clientParts.join(' \u00b7 ');
        userRow.appendChild(userLabel);

        main.appendChild(userRow);

        // RemoteEndPoint — null for non-admins (stripped server-side)
        if (session.RemoteEndPoint) {
            const ipRow = document.createElement('div');
            ipRow.className = 'je-as-user';
            const ipIcon = document.createElement('span');
            ipIcon.className = 'material-icons';
            ipIcon.textContent = 'router';
            const ipLabel = document.createElement('span');
            ipLabel.textContent = session.RemoteEndPoint;
            ipRow.appendChild(ipIcon);
            ipRow.appendChild(ipLabel);
            main.appendChild(ipRow);
        }

        card.appendChild(main);
        return card;
    };

    // ── Panel renderer ───────────────────────────────────────────────────────
    const renderPanel = (sessions, lastUpdated) => {
        const panel = document.getElementById('je-active-streams-panel');
        if (!panel) return;

        const active = (sessions || []).filter(s => s.NowPlayingItem);

        const titleEl = panel.querySelector('.je-as-panel-title');
        if (titleEl) {
            if (active.length) {
                const tpl = JE.t?.('active_streams_count') || '{count} Active Stream|{count} Active Streams';
                const parts = tpl.split('|');
                const singular = parts[0] || '{count} Active Stream';
                const plural = parts[1] || parts[0] || '{count} Active Streams';
                titleEl.textContent = (active.length === 1 ? singular : plural).replace('{count}', active.length);
            } else {
                titleEl.textContent = JE.t?.('active_streams_none') || 'No Active Streams';
            }
        }

        const body = panel.querySelector('.je-as-panel-body');
        if (!body) return;

        while (body.firstChild) body.removeChild(body.firstChild);

        if (!active.length) {
            const empty = document.createElement('div');
            empty.className = 'je-as-panel-empty';
            empty.textContent = JE.t?.('active_streams_none') || 'No active streams';
            body.appendChild(empty);
        } else {
            active.forEach(session => body.appendChild(buildSessionCard(session)));
        }

        // Last-updated footer
        let footer = panel.querySelector('.je-as-panel-footer');
        if (!footer) {
            footer = document.createElement('div');
            footer.className = 'je-as-panel-footer';
            panel.appendChild(footer);
        }
        if (lastUpdated) {
            footer.textContent = `Updated ${lastUpdated.toLocaleTimeString()}`;
        }
    };

    internal.view = { buildSessionCard, renderPanel };
})(window.JellyfinEnhanced);
