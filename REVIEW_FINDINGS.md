# Review Findings — `features/multiarrv3` (176a3ff)

Branch: `features/multiarrv3` (copy of PR #559 — multi-instance Sonarr/Radarr support).
Base: `main`.
Scope: 15 files, +2282/-682.

## Reviewers

1. **bughunter** — remote ultrareview cloud pass
2. **code-reviewer** — `pr-review-toolkit:code-reviewer`
3. **silent-failure-hunter** — `pr-review-toolkit:silent-failure-hunter`
4. **security-reviewer** — OWASP / secrets / SSRF audit
5. **codex** — `codex review --base main` (GPT-5.4, reasoning=high)

## Summary

| Severity | Count | Issues |
|---|---|---|
| CRITICAL | 5 | #26, #27, #28, #29, #30 |
| HIGH | 14 | #31, #32, #33, #34, #35, #36, #37, #38, #39, #40, #41, #42, #43, #44 |
| MEDIUM | 16 | #45, #46, #47, #48, #49, #50, #51, #52, #53, #54, #56, #57, #58, #59, #60, #61 |
| LOW | 5 | #62, #63, #64, #65, #66 |
| **Total filed** | **40** | |

F41 (admin-supplied tag labels, informational only) dropped — reviewer marked "no action required".

## High-confidence overlaps (independent corroboration)

- **F2 (IPv4-mapped IPv6 SSRF bypass, #27)** — flagged by `bughunter` + `security-reviewer`.
- **F6 (Blocklist missing CIDR ranges, #31)** — flagged by `security-reviewer` + `code-reviewer`.
- **ArrUrlGuard defects** (F2 + F3 + F4 + F6) flagged across 3 reviewers — highest-priority area.

---

## CRITICAL

### F1. Instance identity leaks in non-admin `arr/queue` filter — [#26](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/26)
- **File:** `Controllers/JellyfinEnhancedController.cs:3877`
- **Reviewers:** codex
- **Description:** `arr/queue` reduces allowed requests to `(tmdbId, mediaType)` before fan-out across every Sonarr/Radarr instance. A non-admin who requested title X on one server also receives queue entries for title X from *other* instances. Leaks other users' downloads whenever the same TMDB exists on more than one instance.

### F2. SSRF bypass via IPv4-mapped IPv6 addresses — [#27](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/27)
- **File:** `Helpers/ArrUrlGuard.cs:24-34, 40-46, 48-52`
- **Reviewers:** bughunter, security-reviewer **(2 reviewers)**
- **Description:** `[::ffff:169.254.169.254]` parses as IPv6 and never matches the 4-byte v4 HashSet entry; guard allows, HttpClient connects to the mapped v4 destination and reaches metadata endpoint.

### F3. `ArrUrlGuard` fails open on DNS `SocketException` — [#28](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/28)
- **File:** `Helpers/ArrUrlGuard.cs:76-80, 112-115`
- **Reviewers:** silent-failure-hunter
- **Description:** Catches `SocketException` and returns `true`. DNS rebinding/split-horizon can resolve to blocked IP at HTTP-request time. No log line.

### F4. SSRF via redirect follow + DNS rebinding TOCTOU — [#29](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/29)
- **File:** `Helpers/ArrUrlGuard.cs:94-122`; all consumers
- **Reviewers:** security-reviewer
- **Description:** Default HttpClient has `AllowAutoRedirect=true` and performs a fresh DNS lookup. 302→metadata is followed without guard re-check.

### F5. `ArrTagsSyncTask` + service empty-dict silently wipes Jellyfin tags — [#30](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/30)
- **File:** `ScheduledTasks/ArrTagsSyncTask.cs:239-253`, `Services/RadarrService.cs:72-93`, `Services/SonarrService.cs:72-93`
- **Reviewers:** silent-failure-hunter
- **Description:** Non-2xx from arr → empty dict → sync treats as "zero tagged items" → `ClearOldTags=true` destructively strips every `Requested by:` tag library-wide on a transient outage.

---

## HIGH

### F6. Blocklist missing private/link-local CIDR ranges — [#31](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/31)
- **File:** `Helpers/ArrUrlGuard.cs:24-34`
- **Reviewers:** security-reviewer, code-reviewer **(2 reviewers)**

### F7. Calendar event-id collisions across Sonarr instances — [#32](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/32)
- **File:** `Controllers/JellyfinEnhancedController.cs:4630, 4727`; `js/arr/calendar-page.js:1476, 1585, 2906, 2935`
- **Reviewers:** code-reviewer

### F8. Display name used as Sonarr grouping key in downloads — [#33](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/33)
- **File:** `js/arr/requests-page.js:1502`
- **Reviewers:** codex

### F9. `arr/requests` returns success-shaped empty response on error — [#34](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/34)
- **File:** `Controllers/JellyfinEnhancedController.cs:4087-4091, 4299-4303`
- **Reviewers:** silent-failure-hunter

### F10. `arr/queue` returns empty items with no flag across four early-return paths — [#35](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/35)
- **File:** `Controllers/JellyfinEnhancedController.cs:3854-3875`
- **Reviewers:** silent-failure-hunter

### F11. `FetchAndMapAsync` flattens exceptions to short strings — [#36](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/36)
- **File:** `Controllers/JellyfinEnhancedController.cs:3613-3633`
- **Reviewers:** silent-failure-hunter

### F12. Calendar user-data endpoint swallows exceptions, returns 200 — [#37](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/37)
- **File:** `Controllers/JellyfinEnhancedController.cs:4855-4860`
- **Reviewers:** silent-failure-hunter

### F13. Calendar `IsAccessible` defaults to `true` (fail-open) — [#38](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/38)
- **File:** `Controllers/JellyfinEnhancedController.cs:4492-4502, 4585`
- **Reviewers:** silent-failure-hunter

### F14. `ArrTagsSyncTask` reports green when instances fail — [#39](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/39)
- **File:** `ScheduledTasks/ArrTagsSyncTask.cs:103-107, 155-159`
- **Reviewers:** silent-failure-hunter

### F15. `EnrichWithTmdbData` swallows all exceptions → "Unknown" titles — [#40](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/40)
- **File:** `Controllers/JellyfinEnhancedController.cs:5004-5008`
- **Reviewers:** silent-failure-hunter

### F16. `GetCalendarEvents` unguarded DB batch call — [#41](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/41)
- **File:** `Controllers/JellyfinEnhancedController.cs:4446`
- **Reviewers:** silent-failure-hunter

### F17. Seerr connectivity probe bare catch — [#42](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/42)
- **File:** `Controllers/JellyfinEnhancedController.cs:600-603`
- **Reviewers:** silent-failure-hunter

### F18. `public-config` bare catch breaks "Open in Seerr" deep links — [#43](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/43)
- **File:** `Controllers/JellyfinEnhancedController.cs:1818-1828`
- **Reviewers:** silent-failure-hunter

### F19. `IdentifyUrl` probe-failure cascade with zero logging — [#44](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/44)
- **File:** `Controllers/JellyfinEnhancedController.cs:3389-3390, 3407-3408, 3421-3422`
- **Reviewers:** silent-failure-hunter

---

## MEDIUM

### F20. URL mapping validation breaks for descriptive instance names — [#45](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/45)
- **File:** `Configuration/configPage.html:4215-4230`
- **Reviewers:** bughunter

### F21. `arr/identify-url` as admin-authenticated internal web scanner — [#46](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/46)
- **File:** `Controllers/JellyfinEnhancedController.cs:3345-3464`
- **Reviewers:** security-reviewer

### F22. Admin endpoints lack CSRF protection — [#47](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/47)
- **File:** `Controllers/JellyfinEnhancedController.cs` (many)
- **Reviewers:** security-reviewer

### F23. `tmdb/validate` not admin-gated + unencoded key — [#48](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/48)
- **File:** `Controllers/JellyfinEnhancedController.cs:1712-1744`
- **Reviewers:** security-reviewer

### F24. Instance names echoed to non-admin users — [#49](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/49)
- **File:** `Controllers/JellyfinEnhancedController.cs:3905, 3911, 4427, 4433, 3536, 3548, 3718, 3720`
- **Reviewers:** security-reviewer

### F25. Legacy fields overwritten with disabled instance data — [#50](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/50)
- **File:** `Configuration/configPage.html:2764-2786`
- **Reviewers:** code-reviewer

### F26. arr-links global-failure dedup silences console — [#51](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/51)
- **File:** `js/arr/arr-links.js:413-416, 456-459`
- **Reviewers:** silent-failure-hunter

### F27. `calendar-page.js` fetchUserData silently resets map — [#52](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/52)
- **File:** `js/arr/calendar-page.js:1481-1484, 1524-1525`
- **Reviewers:** silent-failure-hunter

### F28. `localStorage` helpers swallow quota/security errors — [#53](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/53)
- **File:** `js/arr/calendar-page.js:1138-1152`
- **Reviewers:** silent-failure-hunter

### F29. `resolveProtectedAvatarUrl` returns `""` on failure — [#54](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/54)
- **File:** `js/arr/requests-page.js:700-704`
- **Reviewers:** silent-failure-hunter

### F30. `fetchIssueMediaDetails` caches `null` on transient failure — [#56](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/56)
- **File:** `js/arr/requests-page.js:877-880`
- **Reviewers:** silent-failure-hunter

### F31. `ValidateArrService` catch-all conflates TLS/URL errors — [#57](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/57)
- **File:** `Controllers/JellyfinEnhancedController.cs:3334-3338`
- **Reviewers:** silent-failure-hunter

### F32. `private-config` returns `{}` for non-admins — [#58](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/58)
- **File:** `Controllers/JellyfinEnhancedController.cs:1769-1772`
- **Reviewers:** silent-failure-hunter

### F33. arr-links retry helper swallows `getCurrentUser` failures — [#59](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/59)
- **File:** `js/arr/arr-links.js:25-27`
- **Reviewers:** silent-failure-hunter

### F34. `errors[]` distinguishes "all disabled" vs "corrupt" only via magic strings — [#60](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/60)
- **File:** `Controllers/JellyfinEnhancedController.cs:3527-3537, 3700-3709`
- **Reviewers:** silent-failure-hunter

### F35. active-streams exception coalesces to generic 500 — [#61](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/61)
- **File:** `Controllers/JellyfinEnhancedController.cs:3829-3833`
- **Reviewers:** silent-failure-hunter

---

## LOW

### F36. No rate limiting on validation/identify endpoints — [#62](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/62)
- **File:** `Controllers/JellyfinEnhancedController.cs:3278, 3288, 3345, 610, 1712`
- **Reviewers:** security-reviewer

### F37. TMDB API key not URL-encoded — [#63](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/63)
- **File:** `Controllers/JellyfinEnhancedController.cs:1724`
- **Reviewers:** security-reviewer

### F38. No input length caps on admin-configurable JSON blobs — [#64](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/64)
- **File:** `Configuration/PluginConfiguration.cs:340-346`
- **Reviewers:** security-reviewer

### F39. `AlsoInInstances` populated but never surfaced in UI — [#65](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/65)
- **File:** `Controllers/JellyfinEnhancedController.cs:4552-4569`; `js/arr/calendar-page.js`
- **Reviewers:** code-reviewer

### F40. `slugCache` not invalidated on serverAddress change — [#66](https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced/issues/66)
- **File:** `js/arr/arr-links.js:78, 411, 454`
- **Reviewers:** code-reviewer
