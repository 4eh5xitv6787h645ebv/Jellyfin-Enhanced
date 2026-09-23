/** Feature settings and its private editor state. */
function createSeerrPermissionAudit({ lifecycle }) {
    let requestGeneration = 0;
    let initialized = false;
    function initialize() {
        if (initialized) return;
        initialized = true;
        // Permission Audit — admin scans every Jellyfin user for missing Seerr
        // permissions required by the features the admin has currently enabled.
        // GETs /JellyfinEnhanced/jellyseerr/permission-audit which returns
        // [{ jellyfinUsername, linked, issues:[...] }]. We render a summary
        // line + a table of users with gaps (warnings/unlinked first, then
        // a collapsed "OK" group). Errors surface inline in the result div
        // and are also logged to console.error so the admin can debug.
        (function wirePermissionAudit() {
            var btn = document.getElementById('btnPermissionAudit');
            if (!btn) return;
            // Resilient label setter (mirrors the validate-mapping fix): some
            // emby-button markup wraps text in a <span>, some places it bare.
            function setBtnLabel(text) {
                var span = btn.querySelector('span');
                if (span) span.textContent = text;
                else btn.textContent = text;
            }
            lifecycle.listen(btn, 'click', async function () {
                if (lifecycle.disposed) return;
                const generation = ++requestGeneration;
                const isCurrent = () => !lifecycle.disposed && generation === requestGeneration;
                var resultDiv = document.getElementById('permissionAuditResult');
                btn.disabled = true;
                setBtnLabel('Running…');
                resultDiv.style.display = 'none';
                resultDiv.innerHTML = '';
                try {
                    var data = await ApiClient.ajax({
                        type: 'GET',
                        url: ApiClient.getUrl('/JellyfinEnhanced/jellyseerr/permission-audit'),
                        dataType: 'json',
                    });
                    if (!isCurrent()) return;
                    var withIssues = data.filter(function (u) {
                        return u.linked && u.issues && u.issues.length > 0;
                    });
                    var ok = data.filter(function (u) {
                        return u.linked && (!u.issues || u.issues.length === 0);
                    });
                    var unlinked = data.filter(function (u) {
                        return !u.linked;
                    });

                    // Summary panel with a title line and chip-based counts
                    var summaryEl = document.createElement('div');
                    summaryEl.className = 'je-audit-summary';
                    var summaryTitle = document.createElement('div');
                    summaryTitle.className = 'je-audit-summary-title';
                    if (withIssues.length === 0 && unlinked.length === 0) {
                        summaryTitle.textContent =
                            '✅ All ' + ok.length + ' linked user(s) have the required permissions.';
                        summaryEl.appendChild(summaryTitle);
                    } else {
                        summaryTitle.textContent = 'Audit complete, review the users below.';
                        summaryEl.appendChild(summaryTitle);
                        var chips = document.createElement('div');
                        chips.className = 'je-audit-summary-chips';
                        function chip(kind, icon, count, label) {
                            if (!count) return;
                            var c = document.createElement('span');
                            c.className = 'je-audit-chip je-audit-chip-' + kind;
                            var i = document.createElement('i');
                            i.className = 'material-icons';
                            i.setAttribute('aria-hidden', 'true');
                            i.textContent = icon;
                            c.appendChild(i);
                            c.appendChild(document.createTextNode(count + ' ' + label));
                            chips.appendChild(c);
                        }
                        chip('warn', 'warning', withIssues.length, withIssues.length === 1 ? 'with gaps' : 'with gaps');
                        chip('unlinked', 'link_off', unlinked.length, 'not linked');
                        chip('ok', 'check_circle', ok.length, 'OK');
                        summaryEl.appendChild(chips);
                    }
                    resultDiv.appendChild(summaryEl);

                    // Build one card per user with issues or unlinked status
                    if (withIssues.length > 0 || unlinked.length > 0) {
                        var cards = document.createElement('div');
                        cards.className = 'je-audit-cards';
                        function buildCard(u) {
                            var card = document.createElement('div');
                            card.className =
                                'je-audit-card ' + (u.linked ? 'je-audit-card-warn' : 'je-audit-card-unlinked');
                            var header = document.createElement('div');
                            header.className = 'je-audit-card-header';
                            var userEl = document.createElement('span');
                            userEl.className = 'je-audit-card-user';
                            var userIcon = document.createElement('i');
                            userIcon.className = 'material-icons';
                            userIcon.setAttribute('aria-hidden', 'true');
                            userIcon.textContent = u.linked ? 'person' : 'person_off';
                            userEl.appendChild(userIcon);
                            userEl.appendChild(document.createTextNode(u.jellyfinUsername));
                            header.appendChild(userEl);
                            var statusChip = document.createElement('span');
                            statusChip.className =
                                'je-audit-chip ' + (u.linked ? 'je-audit-chip-warn' : 'je-audit-chip-unlinked');
                            var statusIcon = document.createElement('i');
                            statusIcon.className = 'material-icons';
                            statusIcon.setAttribute('aria-hidden', 'true');
                            statusIcon.textContent = u.linked ? 'warning' : 'link_off';
                            statusChip.appendChild(statusIcon);
                            statusChip.appendChild(
                                document.createTextNode(u.linked ? 'Permissions Missing' : 'Not linked'),
                            );
                            header.appendChild(statusChip);
                            card.appendChild(header);
                            if (u.issues && u.issues.length > 0) {
                                var ul = document.createElement('ul');
                                ul.className = 'je-audit-card-issues';
                                u.issues.forEach(function (issue) {
                                    var li = document.createElement('li');
                                    li.textContent = issue;
                                    ul.appendChild(li);
                                });
                                card.appendChild(ul);
                            }
                            return card;
                        }
                        withIssues.forEach(function (u) {
                            cards.appendChild(buildCard(u));
                        });
                        unlinked.forEach(function (u) {
                            cards.appendChild(buildCard(u));
                        });
                        resultDiv.appendChild(cards);
                    }

                    // Collapsed list of OK users rendered as name pills so many names
                    // wrap naturally instead of pushing the table layout wide
                    if (ok.length > 0 && (withIssues.length > 0 || unlinked.length > 0)) {
                        var details = document.createElement('details');
                        details.className = 'je-audit-ok-section';
                        var summary = document.createElement('summary');
                        summary.textContent = 'Show ' + ok.length + ' user(s) with no issues';
                        details.appendChild(summary);
                        var nameList = document.createElement('ul');
                        nameList.className = 'je-audit-ok-names';
                        ok.forEach(function (u) {
                            var li = document.createElement('li');
                            li.textContent = u.jellyfinUsername;
                            nameList.appendChild(li);
                        });
                        details.appendChild(nameList);
                        resultDiv.appendChild(details);
                    }
                    resultDiv.style.display = 'block';
                } catch (err) {
                    if (!isCurrent()) return;
                    // Build the error node with createElement + textContent so any
                    // server-supplied message can't smuggle HTML into the page.
                    var errEl = document.createElement('div');
                    errEl.className = 'je-audit-error';
                    errEl.textContent = 'Audit failed: ' + ((err && err.message) || 'Check server logs.');
                    resultDiv.appendChild(errEl);
                    resultDiv.style.display = 'block';
                    console.error('[JE] Permission ', err);
                } finally {
                    if (isCurrent()) {
                        btn.disabled = false;
                        setBtnLabel('Run Audit');
                    }
                }
            });
        })();
    }
    return { initialize, dispose: () => lifecycle.dispose() };
}
