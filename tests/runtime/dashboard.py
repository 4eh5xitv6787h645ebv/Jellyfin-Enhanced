"""Real-browser dashboard lifecycle and configuration differential checks."""
import copy
import json
from pathlib import Path
import time
import uuid

CONTROL_STATE = """() => Array.from(document.querySelectorAll('#JellyfinEnhancedForm input, #JellyfinEnhancedForm select, #JellyfinEnhancedForm textarea')).map((control, index) => ({
    index, id: control.id, name: control.name, tag: control.tagName.toLowerCase(),
    type: control.type, value: control.value,
    checked: ['checkbox', 'radio'].includes(control.type) ? control.checked : null,
    disabled: control.disabled,
    selectedValues: control.tagName === 'SELECT' ? Array.from(control.selectedOptions).map(option => option.value) : null
}))"""


def seeded_configuration(defaults):
    config = copy.deepcopy(defaults)
    config.update({
        "ToastDuration": 4321, "HelpPanelAutocloseDelay": 7654,
        "AnalyticsEnabled": False, "SpoilerBlurEnabled": True,
        "MetadataIconsEnabled": True, "ShowArrLinksAsText": True,
        "ShowLetterboxdLinkAsText": True, "SourceTagOrder": 1,
        "ResolutionTagOrder": 2, "SpoilerStripSeriesOverview": None,
        "SpoilerStripOverview": False, "SpoilerBlurIntensity": 150,
        "WatchProgressDefaultMode": "time", "WatchProgressTimeFormat": "minutes",
    })
    for key in config:
        if key.startswith("HiddenContentDefault"):
            config[key] = False
        if key.endswith("CustomTabJeOwned"):
            config[key] = True
    for shortcut in config["Shortcuts"]:
        if shortcut["Name"] == "OpenSearch":
            shortcut["Key"] = ""
    # Credentials/URLs remain their unconfigured defaults. In particular this
    # fixture never enables analytics, Seerr, Arr, TMDB or MDBList integrations.
    return config


def stable_controls(page):
    """Wait beyond delayed load hydration and require one stable second."""
    deadline = time.monotonic() + 15
    stable_since = time.monotonic()
    previous = page.evaluate(CONTROL_STATE)
    while time.monotonic() < deadline:
        page.wait_for_timeout(200)
        current = page.evaluate(CONTROL_STATE)
        if current != previous:
            previous, stable_since = current, time.monotonic()
        elif time.monotonic() - stable_since >= 1:
            return current
    raise AssertionError("Dashboard controls did not settle within 15 seconds")


def normalize(value, replacements, startup_translation_timestamp):
    if isinstance(value, str):
        for actual, label in replacements.items():
            value = value.replace(actual, label)
        return value
    if isinstance(value, list):
        return [normalize(item, replacements, startup_translation_timestamp) for item in value]
    if isinstance(value, dict):
        return {key: ("<startup-translation-cache-timestamp>" if key == "ClearTranslationCacheTimestamp" and item == startup_translation_timestamp
                      else normalize(item, replacements, startup_translation_timestamp)) for key, item in value.items()}
    return value


def differences(expected, actual, path="$", result=None):
    result = [] if result is None else result
    if type(expected) is not type(actual):
        result.append({"path": path, "expected": expected, "actual": actual})
    elif isinstance(expected, dict):
        for key in sorted(expected.keys() | actual.keys()):
            if key not in expected or key not in actual:
                result.append({"path": f"{path}.{key}", "expected": expected.get(key, "<absent>"), "actual": actual.get(key, "<absent>")})
            else:
                differences(expected[key], actual[key], f"{path}.{key}", result)
    elif isinstance(expected, list):
        if len(expected) != len(actual):
            result.append({"path": path + ".length", "expected": len(expected), "actual": len(actual)})
        for index, (left, right) in enumerate(zip(expected, actual)):
            differences(left, right, f"{path}[{index}]", result)
    elif expected != actual:
        result.append({"path": path, "expected": expected, "actual": actual})
    return result


def dashboard_checks(server, page, output, errors, plugin_id, fixture, baseline=None):
    config_path = f"/Plugins/{plugin_id}/Configuration"
    marker = {"nested": ["future-setting", {"enabled": True}]}
    posted = []
    snapshots = {"defaults": None, "seeded": []}
    replacements = {server.url: "<fixture-server-url>"}
    for name, user_id in fixture["users"].items():
        replacements[user_id] = f"<fixture-{name}-id>"
        replacements[str(uuid.UUID(user_id))] = f"<fixture-{name}-id>"
    defaults = fixture["default_config"]
    seeded = seeded_configuration(defaults)

    def configuration_route(route):
        # The server's typed schema may ignore unknown fields; the browser must
        # preserve this future field in its outgoing payload.
        if route.request.method == "GET":
            response = route.fetch()
            config = response.json()
            config["RuntimeUnknownFixture"] = marker
            route.fulfill(response=response, json=config)
        else:
            if route.request.method == "POST":
                posted.append(route.request.post_data_json)
            route.continue_()

    page.route("**" + config_path + "*", configuration_route)

    def visit(expected_toast):
        page.goto(server.url + "/web/#/configurationpage?name=Jellyfin%20Enhanced", wait_until="domcontentloaded")
        page.locator("#JellyfinEnhancedPage").wait_for(state="visible", timeout=60000)
        try:
            page.wait_for_function("value => document.querySelector('#ToastDuration')?.value === String(value)", arg=expected_toast, timeout=30000)
            return stable_controls(page)
        except Exception:
            (output / "browser-errors.json").write_text(json.dumps(errors, indent=2) + "\n")
            (output / "browser.html").write_text(page.content())
            page.screenshot(path=str(output / "failure.png"))
            raise

    def leave():
        page.goto(server.url + "/web/#/home", wait_until="domcontentloaded")
        page.locator("#JellyfinEnhancedPage").wait_for(state="hidden")

    def save(toast):
        count_before = len(posted)
        with page.expect_response(lambda response: config_path in response.url and response.request.method == "POST") as saved:
            page.evaluate("""value => {
                const input = document.querySelector('#ToastDuration');
                input.value = String(value);
                input.dispatchEvent(new Event('input', {bubbles: true}));
                const form = document.querySelector('#JellyfinEnhancedForm');
                form.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));
                form.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));
            }""", toast)
        assert saved.value.status == 204
        page.wait_for_function("Array.from(document.querySelectorAll('.je-save-dock-btn')).every(button => !button.disabled) && !document.querySelector('.je-save-dock.je-dirty')")
        assert len(posted) == count_before + 1, "Dashboard submitted more than once"
        assert posted[-1]["RuntimeUnknownFixture"] == marker, "Dashboard discarded an unknown configuration field"
        assert server.request(config_path)["ToastDuration"] == toast
        return posted[-1]

    # Capture and save genuine server defaults before the non-default fixture.
    server.request(config_path, defaults, expected=204)
    controls = visit(defaults["ToastDuration"])
    snapshots["defaults"] = {"controls": controls, "savePayload": save(defaults["ToastDuration"])}
    leave()
    server.request(config_path, seeded, expected=204)
    expected_toast = seeded["ToastDuration"]
    for iteration in range(3):
        if iteration:
            leave()
        controls = visit(expected_toast)
        expected_toast += 1
        snapshots["seeded"].append({"controls": controls, "savePayload": save(expected_toast)})
    assert len(posted) == 4, "Expected one default save and three seeded saves"
    normalized = normalize(snapshots, replacements, defaults["ClearTranslationCacheTimestamp"])
    (output / "dashboard-snapshots.json").write_text(json.dumps(normalized, indent=2, sort_keys=True) + "\n")
    (output / "dashboard-fixture.json").write_text(json.dumps({
        "defaults": defaults, "seeded": seeded,
        "normalization": ["Replace the two exact fixture user IDs (both GUID formats) and fixture localhost URL with stable labels.",
                          "Replace ClearTranslationCacheTimestamp only when equal to the startup task value in defaults; changed values remain visible.",
                          "No other configuration fields, timestamps, options, or control state are discarded."],
        "fixtureUserIds": fixture["users"],
    }, indent=2, sort_keys=True) + "\n")
    (output / "dashboard-checks.json").write_text(json.dumps({
        "defaultVisits": 1, "seededVisits": 3, "submittedRequests": len(posted),
        "defaultControls": len(normalized["defaults"]["controls"]),
        "seededControls": [len(snapshot["controls"]) for snapshot in normalized["seeded"]],
        "finalToastDuration": expected_toast, "unknownFieldPreservedInEachPayload": True,
    }, indent=2) + "\n")
    server.check("dashboard reentry, guarded repeated submits and unknown-field preservation")
    if baseline:
        diff = differences(json.loads(Path(baseline).read_text()), normalized)
        (output / "dashboard-diff.json").write_text(json.dumps(diff, indent=2) + "\n")
        assert not diff, f"Dashboard differs from baseline at {len(diff)} values; see dashboard-diff.json: {[item['path'] for item in diff[:10]]}"
        server.check("all dashboard default/seeded controls and complete save payloads match baseline")
    return expected_toast
