#!/usr/bin/env python3
"""Port 76 (upstream 6c922d10): a Maintainerr with two leaving titles, for GET leaving-soon/items.

  JE12=<path to je12> python3 p76-maintainerr.setup.py <scratch dir> on|off   (in the checkout whose lab is up)

The lab has no Maintainerr, so (as for ports 29, 32, 44 and 64-65) the lab's Sonarr mock gets Maintainerr's routes as
`je12 mock sonarr rule` answers and the plugin's Maintainerr source points at it:

  GET /api/collections                    7 "Leaving Soon (Movies)": manual, movie, Movies library, 30 days,
                                             member Abominable (2019), added 2026-11-01
                                          8 "Leaving Soon (Shows)": manual, show, Shows library, 30 days,
                                             member The Adventures of Paddington, added 2026-10-25 (leaves first)
  GET /api/collections/media/N/content/1  those members

`off` resets the mock and clears the source again (no Maintainerr URL or key), so smoke and later checks see the lab
as before. The source is set with the configuration API (a full save, as the page's Save does) and read once with
Refresh. Prints what it set up (names and ids of lab items, never a key). Nothing leaves the lab.
"""
import json
import os
from pathlib import Path
import subprocess
import sys

JE12 = os.environ['JE12']
PLUGIN = 'f69e946a4b3c4e9a8f0a8d7c1b2c4d9b'
MOVIE = '06de48d758074756c732c7de70aa79f8'      # Abominable (2019)
SEASON = '058a5285363ed578e80bd1cd0eef8426'     # The Adventures of Paddington, Season 1


def je12(*args):
    done = subprocess.run([JE12, *args], capture_output=True, text=True)
    if done.returncode:
        sys.exit(f"je12 {' '.join(args[:4])} failed: {done.stdout[-400:]}{done.stderr[-400:]}")
    return done.stdout


def api(method, path, body=None):
    out = je12('api', 'admin', method, path, *([body] if body else []), '--full')
    text = out.split('\n', 1)[1] if '\n' in out else ''
    return json.loads(text) if text.strip() else None


def rule(scratch, method, path, answer):
    file = scratch / 'p76-rule.json'
    file.write_text(json.dumps(answer))
    je12('mock', 'sonarr', 'rule', method, path, f'@{file}')
    file.unlink()


def save(scratch, configuration):
    file = scratch / 'p76-configuration.json'
    file.write_text(json.dumps(configuration))
    je12('api', 'admin', 'POST', f'/Plugins/{PLUGIN}/Configuration', f'@{file}')
    file.unlink()


def main(scratch, mode):
    scratch = Path(scratch)
    scratch.mkdir(parents=True, exist_ok=True)
    je12('mock', 'reset')
    configuration = api('GET', f'/Plugins/{PLUGIN}/Configuration')
    if mode == 'off':
        configuration['LeavingSoonMaintainerrUrl'] = ''
        configuration['LeavingSoonMaintainerrApiKey'] = ''
        save(scratch, configuration)
        print('source cleared')
        return
    folders = {f.get('CollectionType'): f['Id'] for f in api('GET', '/Library/MediaFolders')['Items']}
    movie = api('GET', f'/Items?Ids={MOVIE}')['Items'][0]
    series = api('GET', f"/Items?Ids={api('GET', f'/Items?Ids={SEASON}')['Items'][0]['SeriesId']}")['Items'][0]
    members = {7: [(movie['Id'], '2026-11-01T10:00:00.000Z')], 8: [(series['Id'], '2026-10-25T10:00:00.000Z')]}

    def collection(cid, title, folder, kind):
        return {'id': cid, 'title': title, 'libraryId': folder, 'type': kind, 'isActive': True, 'manualCollection': True,
                'deleteAfterDays': 30, 'radarrSettingsId': None, 'sonarrSettingsId': None,
                'media': [{'mediaServerId': m, 'addDate': d} for m, d in members[cid]]}

    rule(scratch, 'GET', '/api/collections', [collection(7, 'Leaving Soon (Movies)', folders['movies'], 'movie'),
                                              collection(8, 'Leaving Soon (Shows)', folders['tvshows'], 'show')])
    for cid, items in members.items():
        rule(scratch, 'GET', rf'^/api/collections/media/{cid}/content/1\?',
             {'totalSize': len(items), 'items': [{'mediaServerId': m, 'addDate': d} for m, d in items]})
    configuration['LeavingSoonMaintainerrUrl'] = configuration['SonarrUrl'].rstrip('/')
    configuration['LeavingSoonMaintainerrApiKey'] = configuration['SonarrApiKey']
    configuration['LeavingSoonMaintainerrEnabled'] = True
    configuration['ReclaimerrEnabled'] = False
    configuration['LeavingSoonCollections'] = ''
    save(scratch, configuration)
    status = api('POST', '/JellyfinEnhanced/admin/leaving-soon/refresh')
    print(json.dumps({'movie': {'id': movie['Id'], 'name': movie['Name']}, 'series': {'id': series['Id'], 'name': series['Name']},
                      'status': {k: status.get(k) for k in ('Configured', 'Maintainerr', 'Items', 'LastError')} if status else None}))


if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[2] not in ('on', 'off'):
        sys.exit(__doc__.strip())
    main(sys.argv[1], sys.argv[2])
