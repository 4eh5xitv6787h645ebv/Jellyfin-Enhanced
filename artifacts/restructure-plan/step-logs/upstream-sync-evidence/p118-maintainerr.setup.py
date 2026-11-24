#!/usr/bin/env python3
"""Port 118 (upstream 49ee210d): what Maintainerr returned, in the "no manual collection" refusal of Mark for removal.

  JE12=<path to je12> python3 p118-maintainerr.setup.py <scratch dir> two|empty|off   (in the checkout whose lab is up)

The lab has no Maintainerr, so (as for ports 29, 44, 64-65 and 76) the lab's Sonarr mock answers Maintainerr's
collections route and the plugin's Maintainerr source, with its item-menu actions on, points at it:

  two    GET /api/collections  3 "Rule list": active, not manual, movie, Movies library
                               4 "Old": manual, inactive, movie, Movies library
  empty  GET /api/collections  []
  off    resets the mock and clears the source and the actions switch again, so smoke sees the lab as before.

Then `je12 api admin POST /JellyfinEnhanced/maintainerr/mark '{"itemId":"<Abominable>"}' --expect 400` shows the
refusal. The source is set with the configuration API (a full save, as the page's Save does). Prints only what it set
up (never a key). Nothing leaves the lab.
"""
import json
import os
from pathlib import Path
import subprocess
import sys

JE12 = os.environ['JE12']
PLUGIN = 'f69e946a4b3c4e9a8f0a8d7c1b2c4d9b'


def je12(*args):
    done = subprocess.run([JE12, *args], capture_output=True, text=True)
    if done.returncode:
        sys.exit(f"je12 {' '.join(args[:4])} failed: {done.stdout[-400:]}{done.stderr[-400:]}")
    return done.stdout


def api(method, path, body=None):
    out = je12('api', 'admin', method, path, *([body] if body else []), '--full')
    text = out.split('\n', 1)[1] if '\n' in out else ''
    return json.loads(text) if text.strip() else None


def write(scratch, name, value):
    file = scratch / name
    file.write_text(json.dumps(value))
    return file


def main(scratch, mode):
    scratch = Path(scratch)
    scratch.mkdir(parents=True, exist_ok=True)
    je12('mock', 'reset')
    configuration = api('GET', f'/Plugins/{PLUGIN}/Configuration')
    if mode == 'off':
        configuration['LeavingSoonMaintainerrUrl'] = ''
        configuration['LeavingSoonMaintainerrApiKey'] = ''
        configuration['LeavingSoonMaintainerrActions'] = False
    else:
        movies = {f.get('CollectionType'): f['Id'] for f in api('GET', '/Library/MediaFolders')['Items']}['movies']

        def collection(cid, title, active, manual):
            return {'id': cid, 'title': title, 'libraryId': movies, 'type': 'movie', 'isActive': active, 'manualCollection': manual,
                    'deleteAfterDays': 30, 'radarrSettingsId': None, 'sonarrSettingsId': None, 'media': []}

        answer = [collection(3, 'Rule list', True, False), collection(4, 'Old', False, True)] if mode == 'two' else []
        rule = write(scratch, 'p118-rule.json', answer)
        je12('mock', 'sonarr', 'rule', 'GET', '/api/collections', f'@{rule}')
        rule.unlink()
        configuration['LeavingSoonMaintainerrUrl'] = configuration['SonarrUrl'].rstrip('/')
        configuration['LeavingSoonMaintainerrApiKey'] = configuration['SonarrApiKey']
        configuration['LeavingSoonMaintainerrEnabled'] = True
        configuration['LeavingSoonMaintainerrActions'] = True
        configuration['ReclaimerrEnabled'] = False
    saved = write(scratch, 'p118-configuration.json', configuration)
    je12('api', 'admin', 'POST', f'/Plugins/{PLUGIN}/Configuration', f'@{saved}')
    saved.unlink()
    print(json.dumps({'mode': mode, 'collections': {'two': ['Rule list (active, not manual)', 'Old (manual, inactive)'], 'empty': [], 'off': None}[mode]}))


if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[2] not in ('two', 'empty', 'off'):
        sys.exit(__doc__.strip())
    main(sys.argv[1], sys.argv[2])
