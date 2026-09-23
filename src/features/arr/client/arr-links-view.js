// Arr link styles and presentation; data retrieval lives in arr-links-data.js.
(function (JE) {
    'use strict';

    JE.arrLinks = JE.arrLinks || {};
    JE.arrLinks.createView = function () {
        // Safe fallback for helpers.js Stage-3 load-order races.
        const extLink = JE.helpers?.createExternalLink || ((u, o) => {
            const a = document.createElement('a');
            a.setAttribute('is', 'emby-linkbutton');
            a.href = u;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            if (o?.text) a.textContent = o.text;
            if (o?.title) a.title = o.title;
            if (o?.className) a.className = o.className;
            return a;
        });

        const SONARR_ICON_URL = JE.cdn.selfhst('svg/sonarr.svg');
        const RADARR_ICON_URL = JE.cdn.selfhst('svg/radarr-light-hybrid-light.svg');
        const BAZARR_ICON_URL = JE.cdn.selfhst('svg/bazarr.svg');

        const styleId = 'arr-links-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                /* Status colors on the link button border */
                .arr-link--complete { border-left: 3px solid #52b54b !important; }
                .arr-link--partial  { border-left: 3px solid #e5a00d !important; }
                .arr-link--missing  { border-left: 3px solid #666 !important; opacity: 0.7; }

                /* Icon image inside the button */
                .arr-link-img {
                    width: 25px;
                    height: 25px;
                    display: block;
                    object-fit: contain;
                }

                /* Status badge (text-mode only) */
                .arr-badge {
                    font-size: 0.75em;
                    padding: 1px 5px;
                    border-radius: 3px;
                    margin-left: 6px;
                    vertical-align: middle;
                    font-weight: 600;
                }
                .arr-badge--complete { background: rgba(82,181,75,0.2); color: #52b54b; }
                .arr-badge--partial  { background: rgba(229,160,13,0.2); color: #e5a00d; }
                .arr-badge--missing  { background: rgba(102,102,102,0.2); color: #999; }

                /* Dropdown wrapper — sits inline with sibling link buttons */
                .arr-dropdown {
                    position: relative;
                    display: inline-block;
                }

                /* Dropdown menu — colours injected as CSS vars at render time */
                .arr-dropdown-menu {
                    display: none;
                    position: absolute;
                    top: calc(100% + 6px);
                    left: 0;
                    z-index: 9999;
                    min-width: 240px;
                    background: var(--arr-menu-bg, rgba(20,20,28,0.98));
                    color: var(--arr-menu-text, #fff);
                    border: 1px solid var(--arr-menu-border, rgba(255,255,255,0.2));
                    border-radius: 8px;
                    box-shadow: 0 12px 32px rgba(0,0,0,0.6);
                    padding: 4px 0;
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                }
                .arr-dropdown.open .arr-dropdown-menu { display: block; }

                .arr-dropdown-item {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 9px 14px;
                    color: var(--arr-menu-text, #fff);
                    text-decoration: none;
                    font-size: 0.9em;
                    white-space: nowrap;
                    transition: background 0.12s;
                }
                .arr-dropdown-item:hover {
                    background: var(--arr-menu-hover, rgba(255,255,255,0.1));
                    color: var(--arr-menu-text, #fff);
                }
                .arr-dropdown-item-name { flex: 1; font-weight: 500; }
                .arr-dropdown-item-stats {
                    color: var(--arr-menu-muted, rgba(255,255,255,0.55));
                    font-size: 0.85em;
                }
                .arr-dropdown-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    flex-shrink: 0;
                }
                .arr-dropdown-dot--complete { background: #52b54b; }
                .arr-dropdown-dot--partial  { background: #e5a00d; }
                .arr-dropdown-dot--missing  { background: #888; }

                /* Progress bar */
                .arr-progress {
                    display: block;
                    height: 2px;
                    margin-top: 2px;
                    border-radius: 1px;
                    background: rgba(255,255,255,0.1);
                    overflow: hidden;
                }
                .arr-progress-fill { height: 100%; border-radius: 1px; transition: width 0.3s; }
                .arr-progress-fill--complete { background: #52b54b; }
                .arr-progress-fill--partial  { background: #e5a00d; }
                .arr-progress-fill--missing  { background: #666; }
            `;
            document.head.appendChild(style);
        }

        function formatBytes(bytes) {
            if (!bytes || bytes <= 0) return '';
            if (bytes < 1073741824) return (bytes / 1048576).toFixed(0) + ' MB';
            return (bytes / 1073741824).toFixed(1) + ' GB';
        }

        function getStatus(episodeFileCount, episodeCount) {
            if (episodeFileCount === 0) return 'missing';
            if (episodeFileCount >= episodeCount) return 'complete';
            return 'partial';
        }

        // Map iconClass → icon URL for <img>-based rendering
        const ICON_URLS = {
            'arr-link-sonarr': SONARR_ICON_URL,
            'arr-link-radarr': RADARR_ICON_URL,
            'arr-link-bazarr': BAZARR_ICON_URL,
        };

        function appendIcon(target, iconClass, label) {
            const iconUrl = ICON_URLS[iconClass];
            if (!iconUrl) return;
            const img = document.createElement('img');
            img.src = iconUrl;
            img.alt = label;
            img.className = 'arr-link-img';
            const iconSize = JE.helpers.getExternalLinkIconSize();
            img.style.width = `${iconSize}px`;
            img.style.height = `${iconSize}px`;
            target.appendChild(img);
        }

        function createLinkButton(text, url, iconClass, status, badge, tooltip) {
            const statusClass = status ? ` arr-link--${status}` : '';
            const button = extLink(url, {
                title: tooltip || text,
                className: `button-link emby-button arr-link${statusClass}`,
            });
            if (JE.pluginConfig.ShowArrLinksAsText) {
                button.textContent = text;
                // Badge in text-mode so users have visible status without hovering
                if (badge) {
                    const badgeEl = document.createElement('span');
                    badgeEl.className = `arr-badge arr-badge--${status || 'missing'}`;
                    badgeEl.textContent = badge;
                    button.appendChild(badgeEl);
                }
            } else {
                // Use <img> so the icon sits inline exactly like Jellyfin's own external link icons
                appendIcon(button, iconClass, text);
            }
            return button;
        }

        function createDropdown(label, iconClass, items) {
            const wrapper = document.createElement('span');
            wrapper.className = 'arr-dropdown';

            // Inject theme-aware CSS variables onto the menu at creation time
            // so the dropdown colours match whatever theme is active
            const themeVars = JE.themer?.getThemeVariables?.() || {};
            const secondaryBg   = themeVars.secondaryBg   || 'rgba(20,20,28,0.98)';
            const textColor = themeVars.textColor  || '#fff';
            // Derive a slightly lighter surface from panelBg for the menu
            wrapper.style.setProperty('--arr-menu-bg',     secondaryBg);
            wrapper.style.setProperty('--arr-menu-text',   textColor);
            wrapper.style.setProperty('--arr-menu-border', 'rgba(255,255,255,0.2)');
            wrapper.style.setProperty('--arr-menu-hover',  'rgba(255,255,255,0.1)');
            wrapper.style.setProperty('--arr-menu-muted',  'rgba(255,255,255,0.55)');

            // Toggle button — <img> icon + ▾ arrow as a text node
            const toggle = document.createElement('a');
            toggle.setAttribute('is', 'emby-linkbutton');
            toggle.className = 'button-link emby-button arr-link';
            toggle.href = '#';
            toggle.title = `${label} (${items.length} instances)`;

            if (JE.pluginConfig.ShowArrLinksAsText) {
                toggle.textContent = label;
            } else {
                appendIcon(toggle, iconClass, label);
            }
            // Visible ▾ arrow appended as a text node — no pseudo-element needed
            const arrow = document.createElement('span');
            arrow.textContent = '▾';
            arrow.style.cssText = 'font-size:0.8em; opacity:0.8; margin-left:2px; line-height:1; vertical-align:middle; color: white;';
            toggle.appendChild(arrow);

            toggle.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                document.querySelectorAll('.arr-dropdown.open').forEach(d => {
                    if (d !== wrapper) d.classList.remove('open');
                });
                wrapper.classList.toggle('open');
            });

            // Menu
            const menu = document.createElement('div');
            menu.className = 'arr-dropdown-menu';

            items.forEach(function(item) {
                const link = extLink(item.url, {
                    title: item.tip || item.name,
                    className: 'arr-dropdown-item',
                });

                const dot = document.createElement('span');
                dot.className = `arr-dropdown-dot arr-dropdown-dot--${item.status || 'missing'}`;
                link.appendChild(dot);

                const nameSpan = document.createElement('span');
                nameSpan.className = 'arr-dropdown-item-name';
                nameSpan.textContent = item.name;
                link.appendChild(nameSpan);

                if (item.badge) {
                    const badgeSpan = document.createElement('span');
                    badgeSpan.className = `arr-badge arr-badge--${item.status || 'missing'}`;
                    badgeSpan.textContent = item.badge;
                    link.appendChild(badgeSpan);
                }

                if (item.size) {
                    const sizeSpan = document.createElement('span');
                    sizeSpan.className = 'arr-dropdown-item-stats';
                    sizeSpan.textContent = item.size;
                    link.appendChild(sizeSpan);
                }

                menu.appendChild(link);
            });

            wrapper.appendChild(toggle);
            wrapper.appendChild(menu);

            return wrapper;
        }

        // Single delegated listener for closing all arr dropdowns on outside click.
        // Guarded so a user-switch re-initialization doesn't stack duplicates.
        if (!JE._arrDropdownCloserInstalled) {
            JE._arrDropdownCloserInstalled = true;
            document.addEventListener('click', function(e) {
                if (!e.target.closest('.arr-dropdown')) {
                    document.querySelectorAll('.arr-dropdown.open').forEach(d => d.classList.remove('open'));
                }
            });
        }

        return { createLinkButton, createDropdown, formatBytes, getStatus };
    };
})(window.JellyfinEnhanced);
