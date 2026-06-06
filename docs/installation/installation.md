# Installation Guide

<!-- use a custom title -->
!!! info "Prerequisites"

    **Prerequisites:**

    - Jellyfin server version 10.11.x
    - Admin access to your Jellyfin server
    - Modern web browser (Chrome, Firefox, Edge, Safari)


## Standard Installation

### Step 1: Add Plugin Repository

1. In Jellyfin, navigate to **Dashboard** → **Plugins** → **Manage Repositories**
2. Click **➕** (Add button) to add a new repository
3. Give the repository a name (e.g., "Jellyfin Enhanced")
4. Set the **Repository URL** to the manifest:
   ```
   https://raw.githubusercontent.com/n00bcodr/jellyfin-plugins/main/10.11/manifest.json
   ```

5. Click **Save**

### Step 2: Install Plugin

1. Go to the **All** tab
2. Find **Jellyfin Enhanced** in the plugin list
3. Click **Install**
4. Wait for the installation to complete

### Step 3: Nothing Else to Install

!!! info "No companion plugin, no file permissions"

    Jellyfin Enhanced injects its script and applies custom branding **entirely in-process** — it never writes to Jellyfin's web folder, so it works out of the box on read-only and locked-down installs (Docker, read-only container images, package installs).

    The [File Transformation plugin](https://github.com/IAmParadox27/jellyfin-plugin-file-transformation) that earlier versions relied on is **no longer needed or used** by Jellyfin Enhanced — keep it only if another plugin requires it.

If you see a one-time `Could not scrub the legacy Jellyfin Enhanced script tag` warning in the logs after upgrading, it is harmless — see [troubleshooting](troubleshooting.md#permission-issues).

### Step 4: Restart Server

1. **Restart** your Jellyfin server to complete the installation *(This is required for the plugin to take effect)*

### Step 5: Verify Installation

After restart:

1. Refresh your browser *(`Ctrl+F5` or `Cmd+Shift+R`)*
2. Access the Jellyfin Enhanced settings panel. Options:
    - In the sidebar: **Jellyfin Enhanced**
    - Press `?`
3. If you see the panel, installation was successful!