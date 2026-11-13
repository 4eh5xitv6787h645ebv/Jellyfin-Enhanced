#!/bin/sh
# p42: the Seerr mock's answers for the provider checks. Every movie/tv detail carries watchProviders for US, GB and
# DE (p42-watch-providers.json, public TMDB provider names and logo paths); Seerr's own settings name GB as the
# global streaming region and DE as every user's own. Run from the checkout whose lab is up; $JE12 is je12.
set -e
"$JE12" mock seerr rule GET '^/api/v1/(movie|tv)/[0-9]+(\?.*)?$' @"$(dirname "$0")/p42-watch-providers.json" --merge
"$JE12" mock seerr rule GET /api/v1/settings/main '{"streamingRegion":"GB"}' --merge
"$JE12" mock seerr rule GET '^/api/v1/user/[0-9]+/settings/main(\?.*)?$' '{"streamingRegion":"DE"}' --merge
