#!/usr/bin/env python3
"""Ports 64 and 65 (upstream 06837783, 8f902bf7): a Maintainerr whose collections need the picked version and seasons.

  JE12=<path to je12> python3 p64-65-maintainerr.setup.py <scratch dir>   (in the checkout whose lab is up)

The lab has no Maintainerr, so (as for ports 29, 32 and 44) the lab's Sonarr mock gets Maintainerr's routes as
`je12 mock sonarr rule` answers, and the plugin's Maintainerr source points at it. Nothing is a member, so every
build starts from the same state and Mark is always offered:

  GET  /api/collections            9 "Leaving Soon (Movies 4K)"  manual, movie,  Movies library, Radarr server 2
                                   7 "Leaving Soon (Movies)"     manual, movie,  Movies library, Radarr server 1
                                  11 "Leaving Soon (Seasons 4K)" manual, season, Shows library,  Sonarr server 2
                                  10 "Leaving Soon (Seasons)"    manual, season, Shows library,  Sonarr server 1
                                   8 "Leaving Soon (Shows)"      manual, show,   Shows library,  Sonarr server 1
  GET  /api/collections/media/N/content/1   no member
  GET  /api/settings/radarr        1 "Radarr" = the lab's Sonarr mock, 2 "Radarr 4K" = the lab's Radarr mock
  GET  /api/settings/sonarr        1 "Sonarr" = the lab's Sonarr mock, 2 "Sonarr 4K" = the lab's Radarr mock
  POST /api/collections/media/add  201 {}

and the two *arr mocks answer the probes:

  movie Abominable (TMDB 431580): server 1 (Sonarr mock) has the lab's own file of it (the 1080p one, the version
      the detail page shows); server 2 (Radarr mock) has another file, a 2160p one. Both hold the movie.
  series The Adventures of Paddington (TVDB 372577): server 1 (Sonarr mock) has it, server 2 (Radarr mock) does not.

So the movie goes to "Leaving Soon (Movies)" only when the version decides, and Season 1 of Paddington to
"Leaving Soon (Seasons)" only when a season is asked about by its series' TVDB id. Prints what it set up (names and
ids of lab items, never a key or a library file name). Nothing leaves the lab.
"""
import json
import os
from pathlib import Path
import subprocess
import sys

JE12 = os.environ['JE12']
PLUGIN = 'f69e946a4b3c4e9a8f0a8d7c1b2c4d9b'
MOVIE = '06de48d758074756c732c7de70aa79f8'      # Abominable (2019), TMDB 431580
SEASON = '058a5285363ed578e80bd1cd0eef8426'     # The Adventures of Paddington, Season 1 (series TVDB 372577)


def je12(*args):
    done = subprocess.run([JE12, *args], capture_output=True, text=True)
    if done.returncode:
        sys.exit(f"je12 {' '.join(args[:4])} failed: {done.stdout[-400:]}{done.stderr[-400:]}")
    return done.stdout


def api(method, path, body=None):
    out = je12('api', 'admin', method, path, *([body] if body else []), '--full')
    text = out.split('\n', 1)[1] if '\n' in out else ''
    return json.loads(text) if text.strip() else None


def rule(scratch, service, method, path, answer, status=None):
    file = scratch / 'p64-65-rule.json'
    file.write_text(json.dumps(answer))
    je12('mock', service, 'rule', method, path, f'@{file}', *(['--status', status] if status else []))
    file.unlink()


def main(scratch):
    scratch = Path(scratch)
    scratch.mkdir(parents=True, exist_ok=True)
    je12('mock', 'reset')
    configuration = api('GET', f'/Plugins/{PLUGIN}/Configuration')
    sonarr, sonarr_key = configuration['SonarrUrl'].rstrip('/'), configuration['SonarrApiKey']
    radarr, radarr_key = configuration['RadarrUrl'].rstrip('/'), configuration['RadarrApiKey']
    folders = {f.get('CollectionType'): f['Id'] for f in api('GET', '/Library/MediaFolders')['Items']}
    movie = api('GET', f'/Items?Ids={MOVIE}&Fields=ProviderIds,MediaSources')['Items'][0]
    season = api('GET', f'/Items?Ids={SEASON}')['Items'][0]
    series = api('GET', f"/Items?Ids={season['SeriesId']}&Fields=ProviderIds")['Items'][0]
    tmdb, tvdb = movie['ProviderIds']['Tmdb'], series['ProviderIds']['Tvdb']
    own_file = movie['MediaSources'][0]['Path'].split('/')[-1]

    def collection(cid, title, folder, kind, radarr_id=None, sonarr_id=None):
        return {'id': cid, 'title': title, 'libraryId': folder, 'type': kind, 'isActive': True, 'manualCollection': True,
                'deleteAfterDays': 30, 'radarrSettingsId': radarr_id, 'sonarrSettingsId': sonarr_id, 'media': []}

    collections = [
        collection(9, 'Leaving Soon (Movies 4K)', folders['movies'], 'movie', radarr_id=2),
        collection(7, 'Leaving Soon (Movies)', folders['movies'], 'movie', radarr_id=1),
        collection(11, 'Leaving Soon (Seasons 4K)', folders['tvshows'], 'season', sonarr_id=2),
        collection(10, 'Leaving Soon (Seasons)', folders['tvshows'], 'season', sonarr_id=1),
        collection(8, 'Leaving Soon (Shows)', folders['tvshows'], 'show', sonarr_id=1),
    ]
    rule(scratch, 'sonarr', 'GET', '/api/collections', collections)
    rule(scratch, 'sonarr', 'GET', r'^/api/collections/media/\d+/content/1\?', {'totalSize': 0, 'items': []})
    rule(scratch, 'sonarr', 'GET', '/api/settings/radarr', [
        {'id': 1, 'serverName': 'Radarr', 'url': sonarr, 'apiKey': sonarr_key},
        {'id': 2, 'serverName': 'Radarr 4K', 'url': radarr, 'apiKey': radarr_key}])
    rule(scratch, 'sonarr', 'GET', '/api/settings/sonarr', [
        {'id': 1, 'serverName': 'Sonarr', 'url': sonarr, 'apiKey': sonarr_key},
        {'id': 2, 'serverName': 'Sonarr 4K', 'url': radarr, 'apiKey': radarr_key}])
    rule(scratch, 'sonarr', 'POST', '/api/collections/media/add', {}, '201')
    # The probes. Radarr server 1 (Sonarr mock) has the lab's own file; server 2 (Radarr mock) a 2160p one.
    rule(scratch, 'sonarr', 'GET', rf'^/api/v3/movie\?tmdbId={tmdb}$', [{'tmdbId': int(tmdb), 'title': movie['Name'], 'movieFile': {'path': f'/data/movies/{own_file}'}}])
    rule(scratch, 'radarr', 'GET', rf'^/api/v3/movie\?tmdbId={tmdb}$', [{'tmdbId': int(tmdb), 'title': movie['Name'], 'movieFile': {'path': '/data/movies-4k/Abominable (2019) {tmdb-431580} [Bluray-2160p][HDR10][EAC3 7.1][x265].mkv'}}])
    # Sonarr server 1 (Sonarr mock) has the series; server 2 (Radarr mock) does not.
    rule(scratch, 'sonarr', 'GET', rf'^/api/v3/series\?tvdbId={tvdb}$', [{'tvdbId': int(tvdb), 'title': series['Name']}])
    rule(scratch, 'radarr', 'GET', rf'^/api/v3/series\?tvdbId={tvdb}$', [])

    configuration['LeavingSoonMaintainerrUrl'] = sonarr
    configuration['LeavingSoonMaintainerrApiKey'] = sonarr_key
    configuration['LeavingSoonCollections'] = ''
    configuration['StatusTagsLeaving'] = True
    configuration['LeavingSoonMaintainerrActions'] = True
    configuration['LeavingSoonHomeRow'] = True
    file = scratch / 'p64-65-configuration.json'
    file.write_text(json.dumps(configuration))
    je12('api', 'admin', 'POST', f'/Plugins/{PLUGIN}/Configuration', f'@{file}')
    file.unlink()
    status = api('POST', '/JellyfinEnhanced/admin/leaving-soon/refresh')
    print(json.dumps({'movie': {'id': MOVIE, 'name': movie['Name'], 'tmdb': tmdb, 'versions': len(movie['MediaSources'])},
                      'season': {'id': SEASON, 'name': season['Name'], 'series': series['Name'], 'tvdb': tvdb},
                      'status': {k: status.get(k) for k in ('Configured', 'Maintainerr', 'Actions', 'Items', 'LastError')}}))


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__.strip())
    main(sys.argv[1])
