# Evidence pack, round 17

State: commit 19a0f094 on `feat/media-tags-features` (fifty-five commits on top of dd6572be, the base of this work). Commits since fcf81283 (the last reviewed state):

1. **b4b3aa0f fix(tags): show review chips on season and episode cards from the tag cache** — season and episode cards had a user-review chip only on the batch path (which supplies the parent series); from the server cache (the default) and on native posters they had none. Both now key a season `tv:{series TMDB}:s{n}` and an episode `tv:{series TMDB}:s{n}:e{m}`, as the batch path does (web `resolveTmdbKey` reads the cache item's `SeriesProviderIds`; native `PosterTagReviewRatings.ReviewKey`/`RatingRules.ResolveUserReview`). The parity corpus now includes season and episode review averages (14 synthetic review keys, 0 differences).
2. **19a0f094 fix(tags): summarise the source across episodes and keep URL queries out of names** —
   - Series/season summaries carry `Categories.source` like the technical categories: a season with a WEB episode and a BluRay episode shows **BluRay** under Best quality, no source under Only what every episode has, and **BluRay** + **Mixed** under Best, marked when mixed; Latest uses the latest episode's source; Representative is unchanged. Editions and special formats stay with the representative episode (docs say so). Spoiler Guard title stripping drops the summarised source with the other naming facts.
   - Cached and batch version basenames (`Sources[].Path`) drop a remote address's query and fragment, so `Film.2020.WEB.H264.mkv?label=IMAX` (or `?mode=3d.hsbs`) no longer adds IMAX or 3D through the cache or batch projection (test builds the entry through the cache).
   - `fil` (Filipino) shows the Philippines flag like `tl`/`tgl` (web and native).
   - Docs: native version choice (first probed), admin preview body limit (8 MiB), policy table and Mixed rule.
   - Cache schema 45, resolver 35, naming 23.

Earlier work on this branch is summarised in `feature-inventory.md` section 8.

## Verification at 19a0f094 (this machine, niced and capped)
- Frontend 2352/2352; backend 2453/2453; parity `--offline` 0 differences, 296 profiles, 14 synthetic review keys, Status 240 web fixtures passed and 240 native/web identical (`parity-summary.txt`); jf12 Release build 0 warnings; test inventory current. The full browser set last ran at f5f8588f (399/399) and runs again in round 18.
- `translation-coverage.md`: 46/873 Media Tags strings per locale (unchanged).

## Lab
- Deploy of 19a0f094 (schema 45: the lab cache rebuilt), legacy viewer (settings saved before layouts): Movies AE = 0 against the dd6572be deploy and Home AE = 0 against the round-6 Home capture (1400×660+0+90 crop).
