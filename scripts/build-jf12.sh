#!/usr/bin/env bash
set -euo pipefail

# Builds the Jellyfin 12 (.NET 10) release artifact for Jellyfin Enhanced and
# emits the plugin meta.json + a zip ready to attach to a GitHub release, plus the
# MD5 checksum that manifest.json needs.
#
# Jellyfin 12 runs on .NET 10. The Jellyfin.Controller/Model 12.0.0-rc1 NuGet
# packages (net10.0) supply the rest transitively, so this needs only the SDK —
# no vendored server DLLs. This artifact targets the JF12 line only; the
# net9 / 10.11 build is produced separately (do not ship one DLL for both runtimes).
#
# Usage: scripts/build-jf12.sh
# Requires: .NET SDK 10, zip.

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
PROJ_DIR="$ROOT/Jellyfin.Plugin.JellyfinEnhanced"
PROJ="$PROJ_DIR/JellyfinEnhanced.csproj"

# Read version + Jellyfin NuGet version straight from the csproj (single source of truth).
VERSION="$(grep -oE '<AssemblyVersion>[^<]+' "$PROJ" | head -1 | sed 's/<AssemblyVersion>//')"
JF_VERSION="$(grep -oE '<JellyfinVersion>[^<]+' "$PROJ" | head -1 | sed 's/<JellyfinVersion>//')"
TARGET_ABI="12.0.0.0"
GUID="f69e946a-4b3c-4e9a-8f0a-8d7c1b2c4d9b"

OUT_DIR="$ROOT/dist"
STAGE="$OUT_DIR/Jellyfin.Plugin.JellyfinEnhanced_${JF_VERSION}"
ZIP="$OUT_DIR/Jellyfin.Plugin.JellyfinEnhanced_${JF_VERSION}.zip"

echo "Building Jellyfin Enhanced ${VERSION} for Jellyfin ${JF_VERSION} (net10.0, targetAbi ${TARGET_ABI})..."
rm -rf "$STAGE" "$ZIP"
mkdir -p "$STAGE"

dotnet build "$PROJ" -c Release --nologo

BIN="$PROJ_DIR/bin/Release/net10.0"
cp "$BIN/Jellyfin.Plugin.JellyfinEnhanced.dll" "$STAGE/"
[ -f "$BIN/Jellyfin.Plugin.JellyfinEnhanced.deps.json" ] && cp "$BIN/Jellyfin.Plugin.JellyfinEnhanced.deps.json" "$STAGE/"

TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%S.0000000Z 2>/dev/null || echo '1970-01-01T00:00:00.0000000Z')"
cat > "$STAGE/meta.json" <<EOF
{
  "category": "General",
  "changelog": "Jellyfin 12 (.NET 10) compatibility; client script + custom branding now injected by the plugin itself (File Transformation no longer required).",
  "description": "A combination of the Jellyfin Enhanced and Jellyfin Elsewhere userscripts.",
  "guid": "${GUID}",
  "name": "Jellyfin Enhanced",
  "overview": "Jellyfin Enhanced and Jellyfin Elsewhere for a better Jellyfin experience.",
  "owner": "n00bcodr",
  "targetAbi": "${TARGET_ABI}",
  "timestamp": "${TIMESTAMP}",
  "version": "${VERSION}",
  "status": "Active",
  "autoUpdate": false,
  "assemblies": [
    "Jellyfin.Plugin.JellyfinEnhanced.dll"
  ]
}
EOF

if command -v zip >/dev/null 2>&1; then
  ( cd "$STAGE" && zip -q -r "$ZIP" . )
else
  # Fallback when the zip CLI isn't installed (e.g. minimal CI images).
  python3 - "$STAGE" "$ZIP" <<'PY'
import os, sys, zipfile
stage, zippath = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(zippath, "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(stage):
        for f in sorted(files):
            full = os.path.join(root, f)
            z.write(full, os.path.relpath(full, stage))
PY
fi

MD5="$(md5sum "$ZIP" | cut -d' ' -f1 | tr '[:lower:]' '[:upper:]')"

echo
echo "Built: $ZIP"
echo "Version:   $VERSION"
echo "targetAbi: $TARGET_ABI"
echo "checksum (MD5, for manifest.json): $MD5"
