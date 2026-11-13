#!/usr/bin/env python3
"""Port 44 (upstream 481a10ee): make the lab answer like a Maintainerr with two manual collections.

  JE12=<path to je12> python3 p44-maintainerr.setup.py <scratch dir> on|off   (in the checkout whose lab is up)

The lab has no Maintainerr, so (as for ports 29 and 32) the lab's Sonarr mock gets Maintainerr's routes as
`je12 mock sonarr rule` answers, built from the lab's own ids, and the plugin's Maintainerr source points at it (the
mock wants the same X-Api-Key Sonarr's does):

  GET  /api/collections                       7 "Leaving Soon (Movies)": manual, movies, on the Movies library, 30 days,
                                                 one member (the first movie by name)
                                              8 "Leaving Soon (Shows)": manual, shows, on the Shows library, no member
  GET  /api/collections/media/7/content/1     that member;  .../8/content/1: none
  POST /api/collections/media/add             201 {}       (mark and keep)
  POST /api/collections/media/postpone        200 {}

`je12 mock reset` first (the log then holds only this run). The rules are fixed, so a refresh after an action reads the same list: the evidence is the request each build sends
(the mock's log) and what the page shows. `off` removes the rules and the source. The source is set with the
configuration API (a full save, as the Services tab's Save does), then read once with Refresh. Prints what it set up
(names and ids of lab items, never the key). Nothing leaves the lab.
"""
import json
import os
from pathlib import Path
import subprocess
import sys

JE12 = os.environ['JE12']
PLUGIN = 'f69e946a4b3c4e9a8f0a8d7c1b2c4d9b'
ADDED = '2026-11-01T10:00:00.000Z'


def je12(*args):
    done = subprocess.run([JE12, *args], capture_output=True, text=True)
    if done.returncode:
        sys.exit(f"je12 {' '.join(args[:4])} failed: {done.stdout[-400:]}{done.stderr[-400:]}")
    return done.stdout


def api(method, path, body=None):
    out = je12('api', 'admin', method, path, *([body] if body else []), '--full')
    text = out.split('\n', 1)[1] if '\n' in out else ''
    return json.loads(text) if text.strip() else None


def source(scratch, on):
    configuration = api('GET', f'/Plugins/{PLUGIN}/Configuration')
    configuration['LeavingSoonMaintainerrUrl'] = configuration['SonarrUrl'] if on else ''
    configuration['LeavingSoonMaintainerrApiKey'] = configuration['SonarrApiKey'] if on else ''
    configuration['LeavingSoonCollections'] = ''
    configuration['StatusTagsLeaving'] = True
    configuration['LeavingSoonMaintainerrActions'] = True
    configuration['LeavingSoonHomeRow'] = True
    file = scratch / 'p44-configuration.json'
    file.write_text(json.dumps(configuration))
    je12('api', 'admin', 'POST', f'/Plugins/{PLUGIN}/Configuration', f'@{file}')
    file.unlink()


def main(scratch, mode):
    scratch = Path(scratch)
    scratch.mkdir(parents=True, exist_ok=True)
    je12('mock', 'reset')
    if mode == 'off':
        source(scratch, False)
        print(json.dumps({'mode': mode, 'status': api('POST', '/JellyfinEnhanced/admin/leaving-soon/refresh')}))
        return
    folders = {f.get('CollectionType'): f['Id'] for f in api('GET', '/Library/MediaFolders')['Items']}
    movies = api('GET', '/Items?Recursive=true&IncludeItemTypes=Movie&SortBy=SortName&SortOrder=Ascending&Limit=3')['Items']
    marked, unmarked = movies[0], movies[1]

    def row(collection, item):
        return {'id': collection * 100 + 1, 'collectionId': collection, 'mediaServerId': item['Id'], 'tmdbId': None, 'addDate': ADDED, 'isManual': True}

    collections = [
        {'id': 7, 'title': 'Leaving Soon (Movies)', 'libraryId': folders['movies'], 'type': 'movie', 'isActive': True, 'manualCollection': True,
         'deleteAfterDays': 30, 'radarrSettingsId': 1, 'sonarrSettingsId': None, 'media': [row(7, marked)]},
        {'id': 8, 'title': 'Leaving Soon (Shows)', 'libraryId': folders['tvshows'], 'type': 'show', 'isActive': True, 'manualCollection': True,
         'deleteAfterDays': 30, 'radarrSettingsId': None, 'sonarrSettingsId': 1, 'media': []},
    ]
    rules = [
        ('GET', '/api/collections', collections, None),
        ('GET', r'^/api/collections/media/7/content/1\?', {'totalSize': 1, 'items': [row(7, marked)]}, None),
        ('GET', r'^/api/collections/media/8/content/1\?', {'totalSize': 0, 'items': []}, None),
        ('POST', '/api/collections/media/add', {}, '201'),
        ('POST', '/api/collections/media/postpone', {}, None),
    ]
    for number, (method, path, answer, status) in enumerate(rules):
        file = scratch / f'p44-rule-{number}.json'
        file.write_text(json.dumps(answer))
        je12('mock', 'sonarr', 'rule', method, path, f'@{file}', *(['--status', status] if status else []))
        file.unlink()
    source(scratch, True)
    status = api('POST', '/JellyfinEnhanced/admin/leaving-soon/refresh')
    print(json.dumps({'mode': mode, 'marked': {'id': marked['Id'], 'name': marked['Name']}, 'unmarked': {'id': unmarked['Id'], 'name': unmarked['Name']},
                      'status': {k: status.get(k) for k in ('Configured', 'Maintainerr', 'Actions', 'HomeRow', 'Items', 'Dated', 'LastError')}}))


if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[2] not in ('on', 'off'):
        sys.exit(__doc__.strip())
    main(sys.argv[1], sys.argv[2])
