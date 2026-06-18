# Seerr Permission Audit

## Overview

The Permission Audit is an administrator-only tool that checks every Jellyfin user's Seerr account and reports which Seerr permissions each user has. It helps you quickly find users who are not linked to Seerr or who are missing permissions required for plugin features (requests, 4K requests, advanced options, issue reporting, etc.).

  ![Permissions Audit](../images/seerr-permissions-audit.png)


## Where to find it

Open the plugin configuration and navigate to the **Seerr** tab. Click the **Run Audit** button in the **Permission Audit** section.

## How it works

- The audit iterates all Jellyfin users and attempts to resolve a linked Seerr user for each (read-only — it never creates Seerr users as a side effect, even if auto-import is enabled).
- For each linked user it checks **only** the permissions that the features you currently have enabled actually need. If a feature is turned off in the plugin, its permission is not checked and not flagged.
- **Admins are never flagged** — a Seerr account with the `ADMIN` permission inherits every other permission, so it always reports as OK.
- Results are returned as a per-user report with three possible outcomes: "Permissions Missing", "Not linked", or collapsed "OK" users.

## What each feature requires

The audit only complains about a permission when the matching plugin feature is enabled. This is how features map to Seerr permissions:

| Plugin feature (and where it lives) | Required Seerr permission(s) | Audit message when missing |
|---|---|---|
| Making requests (any Seerr request button) | `REQUEST` **or** `REQUEST_MOVIE` **or** `REQUEST_TV` | Cannot make requests (missing REQUEST / REQUEST_MOVIE / REQUEST_TV) |
| **Enable 4K Requests** (movies) | `REQUEST_4K` **or** `REQUEST_4K_MOVIE` | Cannot request 4K movies (missing REQUEST_4K / REQUEST_4K_MOVIE) |
| **Enable 4K TV Requests** | `REQUEST_4K` **or** `REQUEST_4K_TV` | Cannot request 4K TV (missing REQUEST_4K / REQUEST_4K_TV) |
| **Show Advanced Request Options** | `REQUEST_ADVANCED` (only checked for users who can already request) | Cannot use advanced request options (missing REQUEST_ADVANCED) |
| **Requests Page** (Pages tab) | `REQUEST_VIEW` **or** `MANAGE_REQUESTS` | Can only see own requests on Requests page (missing REQUEST_VIEW / MANAGE_REQUESTS) (Can be ignored if on purpose) |
| **Show "Report Issue" Button** | `CREATE_ISSUES` **or** `MANAGE_ISSUES` | Cannot report issues (missing CREATE_ISSUES or MANAGE_ISSUES) |
| **Show Open Issue Indicator** | `VIEW_ISSUES` **or** `MANAGE_ISSUES` | Cannot view issues from others or count indicator (missing VIEW_ISSUES or MANAGE_ISSUES) |

Notes:

- The "make requests" check always runs (requesting is the core feature). All other checks run only if their feature is enabled.
- `MANAGE_REQUESTS` implies `REQUEST_VIEW`; `MANAGE_ISSUES` implies both `CREATE_ISSUES` and `VIEW_ISSUES` — so granting the broader permission satisfies the audit.

## REQUEST_VIEW vs MANAGE_REQUESTS

These two are related but distinct in Seerr:

- **`REQUEST_VIEW`** lets a user **see everyone's requests** on the Requests page (read-only visibility of other users' requests). Without it, a user only sees their **own** requests.
- **`MANAGE_REQUESTS`** is the broader admin-style permission to **approve, decline, and manage** requests. It includes the ability to view all requests, so a user with `MANAGE_REQUESTS` also satisfies the `REQUEST_VIEW` check.

The audit treats either permission as sufficient for the Requests Page check, because both result in the user seeing all requests.

## Interpreting results

- **Not linked**: The Jellyfin user has no corresponding Seerr account. Note that a transient Seerr outage or a connection failure can also produce this result (the plugin logs the underlying cause to the server log). Users you have added to the **Blocked Users** import list also report as not linked, since they are never looked up. Use the **Import Users Now** action or check Seerr manually.
- **Permissions Missing**: A linked user lacks one or more permissions required by the features you have enabled. The audit lists the specific missing permissions.
- **OK**: The user is linked and has every permission your enabled features need (admins always land here). OK users are shown in a collapsible section.

## Which warnings are safe to ignore

- **`REQUEST_VIEW` / `MANAGE_REQUESTS` (Requests Page)** — the message itself ends with "(Can be ignored if on purpose)". If you intentionally want regular users to see **only their own** requests on the Requests page, this warning is expected and safe to ignore. Grant `REQUEST_VIEW` (or `MANAGE_REQUESTS`) only to users who should see everyone's requests.
- **4K warnings** — if you only want a subset of users to request 4K, it is normal for the rest to be flagged. Only grant `REQUEST_4K` (or the movie/TV-specific variants) to the users who should have 4K access.
- **`REQUEST_ADVANCED`** — if you deliberately keep advanced request options (server/quality/path selection) limited to trusted users, the warning for everyone else is expected.

A warning is **not** safe to ignore when a user *should* have access to a feature but the permission is genuinely missing — fix it in Seerr under **Users → (user) → Permissions**.

## Quick steps

1. Ensure Seerr integration is configured and reachable (Seerr URLs + API key) — the audit returns an error if Seerr is not enabled or configured.
2. Open plugin configuration → **Seerr** tab → **Permission Audit**.
3. Click **Run Audit** and wait for results (may take time for large user lists).
4. Review users flagged "Permissions Missing" or "Not linked" and address them in Seerr.

## Troubleshooting & notes

- The audit bypasses the cache to ensure fresh permission checks. If you have many users, the audit may be slow.
- If Seerr is unreachable the audit may report users as "Not linked"; verify Seerr availability via the plugin's Seerr status check.
- If users should be linked but appear as not linked, try the **Import Users Now** action first.

---