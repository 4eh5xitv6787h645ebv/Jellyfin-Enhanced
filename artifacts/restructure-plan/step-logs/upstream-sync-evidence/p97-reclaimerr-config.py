"""Turn Reclaimerr on in a saved plugin configuration (see p97-reclaimerr-config.sh): an address that does not exist in the lab."""
import json
import sys

config = json.load(open(sys.argv[1]))
config['ReclaimerrEnabled'] = True
config['LeavingSoonMaintainerrEnabled'] = False
config['LeavingSoonMaintainerrActions'] = True
config['LeavingSoonPageEnabled'] = True
config['ReclaimerrUrl'] = 'http://reclaimerr:8000'
config['ReclaimerrToken'] = 'lab-token'
json.dump(config, open(sys.argv[2], 'w'))
