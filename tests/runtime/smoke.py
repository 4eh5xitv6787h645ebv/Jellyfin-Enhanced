#!/usr/bin/env python3
"""Run the built plugin in a disposable Jellyfin container, never an existing server."""
import argparse
import copy
from dashboard import dashboard_checks
import hashlib
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

IMAGES = {
    "jf10": "jellyfin/jellyfin:10.11.11@sha256:aefb67e6a7ff1debdd154a78a7bbb780fd0c873d8639210a7f6a2016ad2b35db",
    "jf12": "jellyfin/jellyfin:12.0@sha256:baba630419915985442f315f08b0cf46d9f4c8a0cc4bd38e94a6d35751dd5ef5",
}
PLUGIN_ID = "f69e946a-4b3c-4e9a-8f0a-8d7c1b2c4d9b"
DLL_NAME = "Jellyfin.Plugin.JellyfinEnhanced.dll"


def docker(*args):
    return subprocess.check_output(["docker", *args], text=True).strip()


class Server:
    def __init__(self, url):
        self.url = url
        self.token = None
        self.checks = []

    def request(self, path, data=None, token=True, expected=200, method=None):
        headers = {"Authorization": 'MediaBrowser Client="JE runtime tests", Device="Disposable test", DeviceId="je-runtime", Version="1"'}
        if token and self.token:
            access_token = self.token if token is True else token
            headers["Authorization"] += f', Token="{access_token}"'
        body = None if data is None else json.dumps(data).encode()
        if body is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(self.url + path, body, headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                status, content = response.status, response.read()
        except urllib.error.HTTPError as error:
            status, content = error.code, error.read()
        assert status == expected, f"{request.get_method()} {path}: expected {expected}, got {status}: {content[:500]!r}"
        if not content:
            return None
        try:
            return json.loads(content)
        except (ValueError, UnicodeDecodeError):
            return content

    def ready(self):
        deadline = time.monotonic() + 180
        while time.monotonic() < deadline:
            try:
                self.request("/JellyfinEnhanced/version", token=False)
                return self.request("/System/Info/Public", token=False)
            except (OSError, AssertionError):
                time.sleep(1)
        raise AssertionError("Jellyfin did not start within 180 seconds")

    def check(self, name):
        self.checks.append(name)
        print(f"PASS {name}", flush=True)


def api_checks(server, target, module_manifest=None):
    server.request("/Startup/Configuration", {"UICulture": "en-US", "MetadataCountryCode": "US", "PreferredMetadataLanguage": "en"}, expected=204)
    server.request("/Startup/User")
    server.request("/Startup/User", {"Name": "runtime-admin", "Password": "runtime-only-password"}, expected=204)
    server.request("/Startup/RemoteAccess", {"EnableRemoteAccess": False, "EnableAutomaticPortMapping": False}, expected=204)
    server.request("/Startup/Complete", {}, expected=204)
    auth = server.request("/Users/AuthenticateByName", {"Username": "runtime-admin", "Pw": "runtime-only-password"})
    server.token = auth["AccessToken"]
    admin_id = auth["User"]["Id"]
    server.check("fresh-server setup and administrator authentication")

    plugins = server.request("/Plugins")
    plugin = next(p for p in plugins if uuid.UUID(p["Id"]) == uuid.UUID(PLUGIN_ID))
    assert plugin["Status"] == "Active", plugin
    compat = server.request("/JellyfinEnhanced/host-compat")
    assert compat["builtFor"] == target and compat["mismatch"] is False, compat
    server.check("plugin active with matching host target")

    index = server.request("/web/index.html", token=False)
    assert b"JellyfinEnhanced/script" in index
    for path in ("script", "js/enhanced/icons.js", "Configuration/configPage.css", "locales/en-US.json", "fonts/materialsymbolsrounded.woff2", "version"):
        assert server.request("/JellyfinEnhanced/" + path, token=False)
    bootstrap = server.request("/JellyfinEnhanced/script", token=False).decode()
    component_list = re.search(r"const (?:allComponentScripts|components)\s*=\s*\[(.*?)\];", bootstrap, re.S)
    assert component_list, "Bootstrap component registration was not found"
    component_paths = re.findall(r"['\"]([^'\"]+\.js)['\"]", component_list.group(1))
    assert component_paths
    if module_manifest:
        expected_paths = [component["path"] for component in json.loads(module_manifest.read_text())["components"]]
        assert component_paths == expected_paths, "Live bootstrap differs from module manifest"
    for component in component_paths:
        body = server.request("/JellyfinEnhanced/js/" + component, token=False)
        assert isinstance(body, bytes) and body.strip(), component
        assert not body.lstrip().startswith(b"<!DOCTYPE"), component
    server.check(f"all {len(component_paths)} registered frontend components served")
    assert "en-US" in server.request("/JellyfinEnhanced/locales")
    page = server.request("/web/ConfigurationPage?name=Jellyfin%20Enhanced")
    assert b'JellyfinEnhancedPage' in page
    for page_name in ("calendarPage", "downloadsPage", "bookmarksPage", "hiddenContentPage", "recommendationsPage", "activityPage"):
        assert server.request("/JellyfinEnhanced/" + page_name)
    server.request("/JellyfinEnhanced/js/missing-runtime-fixture.js", expected=404)
    server.check("web injection, public assets, locales, and all registered pages")

    for path in ("host-compat", "private-config", "locales", f"user-settings/{admin_id}/settings.json"):
        server.request("/JellyfinEnhanced/" + path, token=False, expected=401)
    server.request("/JellyfinEnhanced/public-config", token=False)
    ordinary = server.request("/Users/New", {"Name": "runtime-viewer"})
    user_id = ordinary["Id"]
    user_auth = server.request("/Users/AuthenticateByName", {"Username": "runtime-viewer", "Pw": ""})
    viewer_token = user_auth["AccessToken"]
    assert server.request("/JellyfinEnhanced/private-config", token=viewer_token) == {}
    server.request(f"/JellyfinEnhanced/user-settings/{admin_id}/settings.json", token=viewer_token, expected=403)
    server.request("/JellyfinEnhanced/usage/preview", {}, token=viewer_token, expected=403)
    server.check("anonymous, viewer, administrator and cross-user authorization")

    settings_path = f"/JellyfinEnhanced/user-settings/{user_id}/settings.json"
    settings = server.request(settings_path, token=viewer_token)
    settings["AutoPauseEnabled"] = not settings["AutoPauseEnabled"]
    server.request(settings_path, settings, token=viewer_token)
    assert server.request(settings_path, token=viewer_token)["AutoPauseEnabled"] == settings["AutoPauseEnabled"]
    config_path = f"/Plugins/{PLUGIN_ID}/Configuration"
    config = server.request(config_path)
    default_config = copy.deepcopy(config)
    config["ToastDuration"] = 4321
    config["AnalyticsEnabled"] = False
    config["SpoilerBlurEnabled"] = True
    server.request(config_path, config, expected=204)
    assert server.request(config_path)["ToastDuration"] == 4321
    server.check("user preferences and plugin configuration round-trip")
    spoiler_state_path, spoiler_prefs = spoiler_guard_checks(server, admin_id, user_id, viewer_token)
    return {"settings_path": settings_path, "expected_setting": settings["AutoPauseEnabled"],
            "spoiler_state_path": spoiler_state_path, "spoiler_prefs": spoiler_prefs,
            "default_config": default_config, "users": {"admin": admin_id, "viewer": user_id}}


def spoiler_guard_checks(server, admin_id, user_id, viewer_token):
    """Exercise per-user storage and nullable overrides with Spoiler Guard enabled."""
    prefs_path = "/JellyfinEnhanced/spoiler-blur/user-prefs"
    state_path = f"/JellyfinEnhanced/user-settings/{user_id}/spoilerblur.json"
    admin_state_path = f"/JellyfinEnhanced/user-settings/{admin_id}/spoilerblur.json"
    for path in (prefs_path, state_path, "/JellyfinEnhanced/spoiler-blur/series"):
        server.request(path, token=False, expected=401)
    server.request(prefs_path, {"HideReviews": False}, token=False, expected=401)
    server.request(admin_state_path, token=viewer_token, expected=403)
    server.request(admin_state_path, {"Prefs": {"HideReviews": False}}, token=viewer_token, expected=403)
    initial = server.request(prefs_path, token=viewer_token)
    assert initial.get("HideReviews") is None and initial["SkipDisableConfirm"] is False
    assert server.request("/JellyfinEnhanced/spoiler-blur/health", token=viewer_token)["healthy"] is True

    # false = explicit opt-out, null = inherit; preserve both through the real
    # JSON/file serialization boundary rather than treating either as missing.
    prefs = {"HideSeriesDescriptions": False, "HideEpisodeDescriptions": True,
             "HideReviews": False, "HideRatings": None,
             "UseAdvancedCategories": False, "SkipDisableConfirm": True}
    saved = server.request(prefs_path, prefs, token=viewer_token)
    assert saved["success"] is True
    loaded = server.request(prefs_path, token=viewer_token)
    assert all(loaded.get(key) == value for key, value in prefs.items()), loaded
    prefs["HideReviews"] = None
    server.request(prefs_path, prefs, token=viewer_token)
    state = server.request(state_path)  # An administrator can inspect another user.
    assert all(state["Prefs"].get(key) == value for key, value in prefs.items()), state
    own_state = server.request("/JellyfinEnhanced/spoiler-blur/series", token=viewer_token)
    assert own_state == state
    admin_prefs = server.request(prefs_path)
    assert admin_prefs.get("HideSeriesDescriptions") is None
    assert admin_prefs["SkipDisableConfirm"] is False
    server.check("enabled Spoiler Guard nullable preferences, self/admin access and user isolation")
    return state_path, prefs


def browser_checks(server, output, fixture, dashboard_baseline=None):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, args=["--no-sandbox"])
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = context.new_page()
        errors = []
        failed_assets = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("response", lambda response: failed_assets.append(response.url) if "/JellyfinEnhanced/" in response.url and response.status >= 500 else None)
        page.goto(server.url + "/web/#/login", wait_until="domcontentloaded")
        page.locator("#txtManualName, #txtManualUsername").fill("runtime-admin", timeout=60000)
        page.locator("#txtManualPassword").fill("runtime-only-password")
        page.get_by_role("button", name="Sign In", exact=True).click()
        page.wait_for_function("location.hash.includes('/home') && window.ApiClient && ApiClient.getCurrentUserId() && window.JellyfinEnhanced", timeout=60000)
        page.wait_for_function("window.JellyfinEnhanced.initialized === true", timeout=60000)
        # Exercise the real keyboard listener and panel cleanup twice. This runs
        # the split UI modules and detects missing dependencies or stale panels.
        for _ in range(2):
            page.locator("body").click(position={"x": 1, "y": 1})
            page.keyboard.press("?")
            page.locator("#jellyfin-enhanced-panel").wait_for(state="visible")
            assert page.locator("#jellyfin-enhanced-panel").count() == 1
            page.locator("#closeSettingsPanel").click()
            page.locator("#jellyfin-enhanced-panel").wait_for(state="detached")
        server.check("frontend bootstrap completion and repeated keyboard panel open/close")
        final_toast = dashboard_checks(server, page, output, errors, PLUGIN_ID, fixture, dashboard_baseline)
        page.screenshot(path=str(output / "configuration.png"), full_page=False)
        assert not failed_assets, failed_assets
        (output / "browser-errors.json").write_text(json.dumps(errors, indent=2) + "\n")
        unexpected_errors = [error for error in errors if error != "CancelledError"]
        assert not unexpected_errors, unexpected_errors
        server.check("browser login, injected frontend, and live configuration form hydration and save")
        browser.close()
        return final_toast


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", required=True, choices=IMAGES)
    parser.add_argument("--artifact", type=Path, required=True, help="Built plugin DLL (this script does not build)")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--module-manifest", type=Path, help="Also compare the served bootstrap registration with this manifest")
    parser.add_argument("--dashboard-baseline", type=Path, help="Compare browser controls and saved payloads with this dashboard-snapshots.json")
    parser.add_argument("--browser", action="store_true", help="Also run Playwright Chromium checks")
    args = parser.parse_args()
    if args.dashboard_baseline and not args.browser:
        parser.error("--dashboard-baseline requires --browser")
    if args.dashboard_baseline:
        args.dashboard_baseline = args.dashboard_baseline.resolve(strict=True)
        if args.dashboard_baseline == (args.output / "dashboard-snapshots.json").resolve():
            parser.error("--dashboard-baseline must be outside the output snapshot path; refusing to overwrite baseline evidence")
    artifact = args.artifact.resolve(strict=True)
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    name = "je-runtime-" + uuid.uuid4().hex[:12]
    image = IMAGES[args.target]
    report = {"target": args.target, "image": image, "artifact_sha256": hashlib.sha256(artifact.read_bytes()).hexdigest(), "checks": []}
    with tempfile.TemporaryDirectory(prefix="je-runtime-") as temporary:
        fixture = Path(temporary)
        plugins = fixture / "config/plugins/JellyfinEnhanced"
        plugins.mkdir(parents=True)
        shutil.copy2(artifact, plugins / DLL_NAME)
        (fixture / "cache").mkdir()
        try:
            docker("run", "--detach", "--name", name, "--user", f"{os.getuid()}:{os.getgid()}", "--publish", "127.0.0.1::8096", "--mount", f"type=bind,src={fixture / 'config'},dst=/config", "--mount", f"type=bind,src={fixture / 'cache'},dst=/cache", image)
            port = docker("port", name, "8096/tcp").rsplit(":", 1)[1]
            server = Server("http://127.0.0.1:" + port)
            report["checks"] = server.checks
            report["server"] = server.ready()
            fixture_state = api_checks(server, args.target, args.module_manifest)
            expected_toast = browser_checks(server, output, fixture_state, args.dashboard_baseline) if args.browser else 4321
            docker("restart", name)
            # Docker can allocate a new ephemeral host port after restart.
            server.url = "http://127.0.0.1:" + docker("port", name, "8096/tcp").rsplit(":", 1)[1]
            server.ready()
            assert server.request(fixture_state["settings_path"])["AutoPauseEnabled"] == fixture_state["expected_setting"]
            assert server.request(f"/Plugins/{PLUGIN_ID}/Configuration")["ToastDuration"] == expected_toast
            server.check("user and plugin settings persist across actual server restart")
            assert server.request(f"/Plugins/{PLUGIN_ID}/Configuration")["SpoilerBlurEnabled"] is True
            persisted_prefs = server.request(fixture_state["spoiler_state_path"])["Prefs"]
            assert all(persisted_prefs.get(key) == value for key, value in fixture_state["spoiler_prefs"].items()), persisted_prefs
            server.check("Spoiler Guard feature flag and nullable preferences persist across restart")
            report["checks"] = server.checks
            report["status"] = "passed"
        except Exception as error:
            report["status"] = "failed"
            report["error"] = str(error)
            raise
        finally:
            try:
                (output / "server.log").write_text(docker("logs", name))
            finally:
                docker("rm", "--force", name)
                (output / "report.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
