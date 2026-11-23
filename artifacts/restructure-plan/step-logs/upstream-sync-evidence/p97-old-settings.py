"""p111: give a saved plugin configuration the service-account settings an installation on the old Reclaimerr integration has."""
import json
import sys

config = json.load(open(sys.argv[1]))
config['ReclaimerrEnabled'] = True
config['LeavingSoonMaintainerrEnabled'] = False
config['ReclaimerrUrl'] = 'http://reclaimerr:8000'
config['ReclaimerrToken'] = 'lab-token'
config['ReclaimerrUsername'] = 'jellyfin-enhanced'
config['ReclaimerrPassword'] = 'lab-password'
config['ReclaimerrUserMap'] = 'Sam = sam_user'
config['ReclaimerrActAsUser'] = True
json.dump(config, open(sys.argv[2], 'w'))
