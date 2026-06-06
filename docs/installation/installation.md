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

### Step 3 (Optional): File Transformation Plugin

!!! info "Only needed for read-only web folders"

    Jellyfin Enhanced injects its script and applies custom branding **by itself** — no companion plugin is required for normal operation.

    Install the optional [File Transformation plugin](https://github.com/IAmParadox27/jellyfin-plugin-file-transformation) only if:

    - Jellyfin cannot write to its own web folder (a read-only `index.html`, e.g. a locked-down or read-only container image), **and**
    - you'd rather not fix the folder permissions (see [troubleshooting](troubleshooting.md))

    With File Transformation installed, Jellyfin Enhanced automatically uses it to inject the script at request time instead of writing to `index.html`.

If you see `Access to the path '.../index.html' is denied` in the logs, refer to the [troubleshooting steps](troubleshooting.md) — fix the permissions or install File Transformation, whichever you prefer.

### Step 4: Restart Server

1. **Restart** your Jellyfin server to complete the installation *(This is required for the plugin to take effect)*

### Step 5: Verify Installation

After restart:

1. Refresh your browser *(`Ctrl+F5` or `Cmd+Shift+R`)*
2. Access the Jellyfin Enhanced settings panel. Options:
    - In the sidebar: **Jellyfin Enhanced**
    - Press `?`
3. If you see the panel, installation was successful!