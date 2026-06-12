#!/usr/bin/env python3
"""Adversarial verification: seerr-direct vs JE-proxied results under parental policies.

For each (policy-config, endpoint): fetch seerr DIRECT with the admin API key,
independently compute the expected filtered list using Jellyfin's own parental
rating map (/Localization/ParentalRatings) + the user's policy + per-title
cert/keywords from seerr details, then assert the JE proxy returns exactly that
— same ids, same order, pagination fields untouched. The admin must always get
byte-comparable (id-identical) results to direct.
"""
import json, subprocess, sys, time, urllib.request

BASE = "http://192.168.0.84:8097"
SEERR = "http://192.168.0.84:5056"
TOKEN = "075fe294938e4f47b661d7129f969be4"
PID = "f69e946a4b3c4e9a8f0a8d7c1b2c4d9b"
SEERR_KEY = subprocess.run(["docker","exec","seerr-dev","sh","-c","cat /app/config/settings.json"],
    capture_output=True, text=True).stdout
SEERR_KEY = json.loads(SEERR_KEY)["main"]["apiKey"]

def http(url, method="GET", body=None, headers=None, timeout=90):
    r = urllib.request.Request(url, method=method,
        data=json.dumps(body).encode() if body is not None else None, headers=headers or {})
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        return resp.status, json.loads(resp.read() or b"null")

AH = {"X-Emby-Token": TOKEN, "Content-Type": "application/json"}
SH = {"X-Api-Key": SEERR_KEY}

def login(name):
    _, a = http(BASE + "/Users/AuthenticateByName", "POST", {"Username": name, "Pw": ""},
        {"Content-Type": "application/json",
         "X-Emby-Authorization": 'MediaBrowser Client="verify", Device="cli", DeviceId="je-verify", Version="1.0"'})
    return {"X-Emby-Token": a["AccessToken"]}

# ---- Faithful replica of LocalizationManager.GetRatingScore (10.11.10) ----
import glob, os, re
RATING_DICTS = {}
for f in glob.glob("/tmp/jf-ratings/*.json"):
    cc = os.path.basename(f)[:-5].lower()
    if cc.startswith("0-"): continue
    d = json.load(open(f))
    m = {}
    for entry in d.get("ratings", []):
        sc = entry.get("ratingScore") or {}
        for name in entry.get("ratingStrings", []):
            m[name.strip().lower()] = (sc.get("score"), sc.get("subScore"))
    RATING_DICTS[cc] = m
UNRATED = {"n/a", "unrated", "not rated", "nr"}
SERVER_DEFAULT_CC = "us"  # UICulture en-US

def get_rating_score(rating, country=None, _depth=0):
    if not rating or _depth > 3: return None
    r = rating.strip()
    if r.lower() in UNRATED: return None
    if re.fullmatch(r"\d+", r): return (int(r), None)
    r = re.sub(r"(?i)^rated\s*:?\s*", "", r).strip()
    rl = r.lower()
    cc = (country or "").lower()
    if cc and cc in RATING_DICTS and rl in RATING_DICTS[cc]: return RATING_DICTS[cc][rl]
    if not cc and rl in RATING_DICTS.get(SERVER_DEFAULT_CC, {}): return RATING_DICTS[SERVER_DEFAULT_CC][rl]
    if rl in RATING_DICTS.get("us", {}): return RATING_DICTS["us"][rl]
    for ccx in sorted(RATING_DICTS):
        if rl in RATING_DICTS[ccx]: return RATING_DICTS[ccx][rl]
    if ":" in r:
        right = r.split(":", 1)[1].strip()
        if right: return get_rating_score(right, None, _depth+1)
    if "-" in r:
        left, right = r.split("-", 1)
        if right.strip(): return get_rating_score(right.strip(), left.strip().lower(), _depth+1)
    return None

SERVER_COUNTRY = "AU"  # MetadataCountryCode — the plugin's cert-country preference

# ---- per-title cert/keywords from seerr (the ground truth JE also uses) ---
_detail_cache = {}
def title_info(media_type, tmdb_id, country=SERVER_COUNTRY):
    key = f"{media_type}:{tmdb_id}"
    if key in _detail_cache: return _detail_cache[key]
    try:
        _, d = http(f"{SEERR}/api/v1/{'movie' if media_type=='movie' else 'tv'}/{tmdb_id}", headers=SH, timeout=30)
    except Exception:
        _detail_cache[key] = (None, [])
        return _detail_cache[key]
    cert = None
    if media_type == "movie":
        countries = (d.get("releases") or {}).get("results") or []
        def from_c(iso):
            for c in countries:
                if c.get("iso_3166_1") == iso:
                    for rd in c.get("release_dates") or []:
                        if (rd.get("certification") or "").strip(): return rd["certification"].strip()
            return None
        cert = from_c(country) or from_c("US")
        if not cert:
            for c in countries:
                for rd in c.get("release_dates") or []:
                    if (rd.get("certification") or "").strip(): cert = rd["certification"].strip(); break
                if cert: break
    else:
        crs = (d.get("contentRatings") or {}).get("results") or []
        def tv_from(iso):
            for c in crs:
                if c.get("iso_3166_1") == iso and (c.get("rating") or "").strip(): return c["rating"].strip()
            return None
        cert = tv_from(country) or tv_from("US")
        if not cert:
            for c in crs:
                if (c.get("rating") or "").strip(): cert = c["rating"].strip(); break
    kws = [k.get("name","").lower() for k in (d.get("keywords") or []) if k.get("name")]
    _detail_cache[key] = (cert, kws)
    return _detail_cache[key]

def plausible_scores(cert):
    """All (score) values this cert can map to across rating dicts, ordered:
    server-default dict, us, then others. Empty = unrecognized (unrated)."""
    if not cert: return []
    r = cert.strip()
    if r.lower() in UNRATED: return []
    if re.fullmatch(r"\d+", r): return [int(r)]
    r = re.sub(r"(?i)^rated\s*:?\s*", "", r).strip().lower()
    out = []
    for cc in [SERVER_DEFAULT_CC, "us"] + sorted(RATING_DICTS):
        if r in RATING_DICTS.get(cc, {}):
            v = RATING_DICTS[cc][r][0]
            if v not in out: out.append(v)
    if not out and ":" in r:
        return plausible_scores(r.split(":",1)[1])
    if not out and "-" in r:
        left, right = r.split("-",1)
        cc = left.strip().lower()
        if cc in RATING_DICTS and right.strip() in RATING_DICTS[cc]:
            return [RATING_DICTS[cc][right.strip()][0]]
        return plausible_scores(right)
    return out

def expect_verdict(item, max_score, strict_unrated, blocked_tags, allowed_tags):
    """'allow' | 'block' | 'either' (rating-string ambiguous across countries)."""
    mt = item.get("mediaType")
    if mt not in ("movie","tv"): return "allow"
    tmdb = item.get("id") or item.get("tmdbId")
    adult = bool(item.get("adult"))
    if adult and max_score is not None: return "block"
    cert, kws = title_info(mt, tmdb) if tmdb else (None, [])
    if max_score is None:
        verdict = "allow"
    else:
        scores = plausible_scores(cert)
        if scores:
            verdicts = {("allow" if sc <= max_score else "block") for sc in scores}
            verdict = verdicts.pop() if len(verdicts) == 1 else "either"
        else:
            verdict = "block" if strict_unrated else "allow"
    if verdict != "block" and (blocked_tags or allowed_tags):
        tl = set(kws)
        if any(b.lower() in tl for b in blocked_tags): verdict = "block"
        elif allowed_tags and not any(a.lower() in tl for a in allowed_tags): verdict = "block"
    return verdict

def expect_allowed(item, max_score, strict_unrated, blocked_tags, allowed_tags):
    mt = item.get("mediaType")
    if mt not in ("movie","tv"): return True
    tmdb = item.get("id") or item.get("tmdbId")
    adult = bool(item.get("adult"))
    if adult and max_score is not None: return False
    cert, kws = title_info(mt, tmdb) if tmdb else (None, [])
    if max_score is None:
        allowed = True
    else:
        sc = get_rating_score(cert) if cert else None
        if sc is not None:
            score, _sub = sc
            # maxSub unset on KidTest -> equal scores allowed
            allowed = score <= max_score
        else:
            allowed = not strict_unrated
    if allowed and (blocked_tags or allowed_tags):
        tl = set(kws)
        if any(b.lower() in tl for b in blocked_tags): allowed = False
        elif allowed_tags and not any(a.lower() in tl for a in allowed_tags): allowed = False
    return allowed

def set_policy(uid, max_rating, blocked, allowed):
    _, users = http(BASE + "/Users", headers=AH)
    u = next(x for x in users if x["Id"] == uid)
    pol = u["Policy"]
    pol["MaxParentalRating"] = max_rating
    pol["BlockedTags"] = blocked
    pol["AllowedTags"] = allowed
    pol["IsAdministrator"] = False
    pol["EnableAllFolders"] = True
    code, _ = http(f"{BASE}/Users/{uid}/Policy", "POST", pol, AH)
    assert code in (200, 204), f"policy set failed {code}"

def set_strict(v):
    _, cfg = http(f"{BASE}/Plugins/{PID}/Configuration", headers=AH)
    cfg["JellyseerrParentalFilterHideUnrated"] = v
    assert cfg["MaintenanceModeEnabled"] is False
    code, _ = http(f"{BASE}/Plugins/{PID}/Configuration", "POST", cfg, AH)
    assert code in (200, 204)

ENDPOINTS = [
    ("search?query=deadpool&page=1", "/api/v1/search?query=deadpool&page=1"),
    ("search?query=bluey&page=1",    "/api/v1/search?query=bluey&page=1"),
    ("movie/105/similar?page=1",     "/api/v1/movie/105/similar?page=1"),
    ("movie/105/recommendations?page=1", "/api/v1/movie/105/recommendations?page=1"),
    ("tv/82728/recommendations?page=1",  "/api/v1/tv/82728/recommendations?page=1"),
]

def media_ids(payload):
    return [ (r.get("mediaType"), r.get("id") or r.get("tmdbId"))
             for r in payload.get("results", []) if r.get("mediaType") in ("movie","tv") ]

failures = []
def check(name, cond, detail=""):
    mark = "PASS" if cond else "FAIL"
    print(f"  [{mark}] {name}" + (f" — {detail}" if detail and not cond else ""))
    if not cond: failures.append((name, detail))

_, users = http(BASE + "/Users", headers=AH)
kid_id = next(u["Id"] for u in users if u["Name"] == "KidTest")
admin_hdr = login("TestAdmin")

SCENARIOS = [
    ("rating-only (PG), strict off",      10,  [],            [],          False),
    ("rating-only (PG), strict on",       10,  [],            [],          True),
    ("rating + blocked tag 'cartoon'",    10,  ["cartoon"],   [],          False),
    ("rating + allowed tags only 'cartoon'", 10, [],          ["cartoon"], False),
    ("tag-only user (no rating limit), blocked 'time travel'", None, ["time travel"], [], False),
]

for label, maxr, blocked, allowed, strict in SCENARIOS:
    print(f"\n=== scenario: {label}")
    set_policy(kid_id, maxr, blocked, allowed)
    set_strict(strict)
    kid_hdr = login("KidTest")
    time.sleep(0.5)
    for je_path, direct_path in ENDPOINTS:
        sc_d, direct = http(SEERR + direct_path, headers=SH, timeout=60)
        t0 = time.time()
        sc_a, admin = http(f"{BASE}/JellyfinEnhanced/jellyseerr/{je_path}", headers=admin_hdr, timeout=120)
        sc_k, kid   = http(f"{BASE}/JellyfinEnhanced/jellyseerr/{je_path}", headers=kid_hdr, timeout=120)
        dt = time.time() - t0
        check(f"{je_path} statuses 200", sc_d == sc_a == sc_k == 200, f"direct={sc_d} admin={sc_a} kid={sc_k}")
        d_ids, a_ids, k_ids = media_ids(direct), media_ids(admin), media_ids(kid)
        check(f"{je_path} admin == direct", a_ids == d_ids, f"admin={len(a_ids)} direct={len(d_ids)} diff={set(d_ids)^set(a_ids)}")
        def verdicts_for(payload):
            out = {}
            for t in media_ids(payload):
                item = next(r for r in payload["results"] if r.get("mediaType")==t[0] and (r.get("id") or r.get("tmdbId"))==t[1])
                out[t] = expect_verdict(item, maxr, strict, blocked, allowed)
            return out
        def verdict_ok(vmap, kid_ids, admin_ids):
            kid_set = set(kid_ids)
            missing_must = [t for t,v in vmap.items() if v=="allow" and t not in kid_set]
            present_forbidden = [t for t in kid_ids if vmap.get(t)=="block"]
            order_ok = kid_ids == [t for t in admin_ids if t in kid_set]
            return missing_must, present_forbidden, order_ok
        vmap = verdicts_for(admin)
        a_ids2 = media_ids(admin)
        missing, forbidden, order_ok = verdict_ok(vmap, k_ids, a_ids2)
        if missing or forbidden or not order_ok:
            time.sleep(1)
            sc_a, admin = http(f"{BASE}/JellyfinEnhanced/jellyseerr/{je_path}", headers=admin_hdr, timeout=120)
            sc_k, kid = http(f"{BASE}/JellyfinEnhanced/jellyseerr/{je_path}", headers=kid_hdr, timeout=120)
            k_ids = media_ids(kid)
            vmap = verdicts_for(admin)
            a_ids2 = media_ids(admin)
            missing, forbidden, order_ok = verdict_ok(vmap, k_ids, a_ids2)
        ok = not missing and not forbidden and order_ok
        check(f"{je_path} kid verdicts hold", ok,
              f"missing-must={len(missing)} forbidden-present={len(forbidden)} order_ok={order_ok}")
        if not ok:
            for t in missing + forbidden:
                cert, kws = title_info(t[0], t[1])
                title = next((r.get("title") or r.get("name") for r in admin["results"]
                              if r.get("mediaType")==t[0] and (r.get("id") or r.get("tmdbId"))==t[1]), "?")
                side = "MISSING-should-be-allowed" if t in missing else "PRESENT-should-be-blocked"
                print(f"      DIAG {side}: {t} {title!r} cert={cert!r} plausible={plausible_scores(cert)} kws={kws[:4]}")
        for f in ("page","totalPages","totalResults"):
            if f in direct:
                check(f"{je_path} kid keeps field {f}", kid.get(f) == direct.get(f), f"{kid.get(f)} vs {direct.get(f)}")
        print(f"    (both JE calls in {dt:.1f}s)")

print(f"\n{'='*60}\nRESULT: {'ALL PASS' if not failures else f'{len(failures)} FAILURES'}")
for n, d in failures: print(f"  FAIL {n}: {d[:200]}")
sys.exit(1 if failures else 0)
