#!/usr/bin/env python3
"""Port 29 (upstream 53ebf043): make the lab answer like a Maintainerr whose collections list embeds two members each.

  JE12=<path to je12> python3 p29-maintainerr-paging.setup.py <scratch dir>     (run in the checkout whose lab is up)

The lab's Sonarr mock gets Maintainerr's two routes as `je12 mock sonarr rule` answers, built from the lab's own
item ids, and the plugin's Leaving soon source is pointed at it (the mock wants the same X-Api-Key Sonarr's does):

  GET /api/collections                          three collections, each with only its first two members embedded:
                                                 7 "Leaving Soon" (movies, 30 days): every movie of the lab
                                                 8 "Paused" (inactive): two more members, never to be asked for
                                                 9 "Old episodes" (episodes, 14 days): the first 620 episodes
  GET /api/collections/media/7/content/1?size=500   all of 7 in one page ({totalSize, items})
  GET /api/collections/media/9/content/1?size=500   the first 500 of 9
  GET /api/collections/media/9/content/2?size=500   the other 120
  any other page                                    the mock's own answer for a route it has no rule for

Nothing leaves the lab: the mock opens no connection, and the address is the lab's own Sonarr mock.
Prints what it set up (no key).
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


def rows(collection, items, metadata):
    out = []
    for number, item in enumerate(items, 1):
        row = {'id': collection * 10000 + number, 'collectionId': collection, 'mediaServerId': item['Id'],
               'tmdbId': int(item.get('ProviderIds', {}).get('Tmdb') or 0) or None, 'addDate': ADDED, 'image_path': None, 'isManual': False}
        if metadata:
            row['mediaData'] = {'id': item['Id'], 'title': item['Name'], 'type': item['Type'].lower()}
        out.append(row)
    return out


def main(scratch):
    scratch = Path(scratch)
    scratch.mkdir(parents=True, exist_ok=True)
    movies = api('GET', '/Items?Recursive=true&IncludeItemTypes=Movie&SortBy=SortName&SortOrder=Ascending&Fields=ProviderIds&Limit=1000')['Items']
    episodes = api('GET', '/Items?Recursive=true&IncludeItemTypes=Episode&SortBy=SeriesSortName,ParentIndexNumber,IndexNumber&Fields=ProviderIds&Limit=622')['Items']
    paused, episodes = episodes[620:], episodes[:620]

    def collection(number, title, active, days, kind, members):
        return {'id': number, 'title': title, 'description': '', 'isActive': active, 'arrAction': 0, 'visibleOnHome': True,
                'deleteAfterDays': days, 'type': kind, 'manualCollection': False, 'addDate': ADDED, 'media': rows(number, members[:2], False)}

    answers = {
        '/api/collections': [collection(7, 'Leaving Soon', True, 30, 'movie', movies), collection(8, 'Paused', False, 30, 'episode', paused),
                             collection(9, 'Old episodes', True, 14, 'episode', episodes)],
        r'^/api/collections/media/7/content/1\?size=500$': {'totalSize': len(movies), 'items': rows(7, movies, True)},
        r'^/api/collections/media/9/content/1\?size=500$': {'totalSize': len(episodes), 'items': rows(9, episodes[:500], True)},
        r'^/api/collections/media/9/content/2\?size=500$': {'totalSize': len(episodes), 'items': rows(9, episodes[500:], True)},
    }
    je12('mock', 'sonarr', 'clear')
    for number, (path, answer) in enumerate(answers.items()):
        file = scratch / f'p29-rule-{number}.json'
        file.write_text(json.dumps(answer))
        je12('mock', 'sonarr', 'rule', 'GET', path, f'@{file}')

    configuration = api('GET', f'/Plugins/{PLUGIN}/Configuration')
    configuration['LeavingSoonMaintainerrUrl'] = configuration['SonarrUrl']
    configuration['LeavingSoonMaintainerrApiKey'] = configuration['SonarrApiKey']
    configuration['LeavingSoonCollections'] = ''
    file = scratch / 'p29-configuration.json'
    file.write_text(json.dumps(configuration))
    je12('api', 'admin', 'POST', f'/Plugins/{PLUGIN}/Configuration', f'@{file}')
    file.unlink()
    print(json.dumps({'maintainerrAt': configuration['SonarrUrl'], 'collection7Movies': len(movies), 'collection9Episodes': len(episodes),
                      'collection8PausedMembers': len(paused), 'embeddedPerCollection': 2,
                      'firstTwoMovies': [movie['Name'] for movie in movies[:2]], 'members': len(movies) + len(episodes)}))


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__.strip())
    main(sys.argv[1])
