"""Weekly data scores (CH index) from the data-scoring app's Railway bucket, keyed by Impect player ID.

The weekly scout refresh publishes one self-contained page, published/<run_id>/cafc_scout.html, and points
published/latest.json at it. The scores sit inside that page as gzip + base64 blobs (data-scoring
python/package_scout.py): d-meta holds the column names and positions, d-<position> holds that position's rows column
by column. Other blobs (league_view, physical, ...) belong to the scout app and are ignored.
Temporary until the scores land in Snowflake.

Variables: DATA_SCORES_BUCKET, DATA_SCORES_ENDPOINT, DATA_SCORES_ACCESS_KEY_ID, DATA_SCORES_SECRET_ACCESS_KEY,
DATA_SCORES_REGION (the bucket's Credentials tab). DATA_SCORES_FILE reads a local cafc_scout.html instead (development).
"""
import base64
import gzip
import json
import logging
import math
import os
import re
import threading
import time
from array import array
from pathlib import Path

logger = logging.getLogger(__name__)

CHECK_SECONDS = 30 * 60  # how often latest.json is re-read; a weekly refresh shows up within this
RETRY_SECONDS = 5 * 60  # after a failed read, so a broken bucket never stalls every profile request
BLOB = re.compile(r'<script type="application/octet-stream" id="d-(\w+)">([^<]+)</script>')
KEEP = ("season", "t", "league", "club", "min", "ch", "chLo", "chHi", "fc", "fcLo", "fcHi", "rel", "relN")
# Technical data tab: each category's Championship score (catCh, in d-meta positions[pos].categories order) and, from
# the d-metrics_<position> blob (data-scoring python/build_metric_breakdown.py, published from 22 Nov 2026), each
# metric's real value and its reading on the category's scale; a category score is exactly the average of its readings.
# Both optional, so an older page still loads. Stored fixed-width as float32: 5 categories x 4 metrics at most.
TECHNICAL = ("catCh",)
MAX_CATS, MAX_METRICS = 5, 4
# Outlook, role fit and similar players on the technical tab: optional columns, so an older page still loads.
# team = CH index in an average team (teamRel: his team against his league's average); pCh / pPl = chance of becoming a
# regular starter in the Championship / Premier League; pSucc = chance of holding a place after stepping up (leagues
# below the Championship only); avail = share of his league's minutes played over availN seasons; fit = similarity to
# each of the position's style profiles (d-meta profiles), best = the closest.
OPTIONAL_NUMBERS = ("team", "teamRel", "pCh", "pPl", "pSucc", "avail", "availN", "best")
OPTIONAL_TEXT = ("name",)
MAX_PROFILES = 6
SIMILAR_COUNT = 6
RECENT_SEASONS = 3  # similar players over a career stretch: each player's last three seasons at the position
# Similar players come only from leagues with SkillCorner game intelligence data, so every name offered can be followed
# up in SkillCorner. Names as the scout page spells them ("Fortuna Liga" is the Czech First League). A player counts
# when the league of his latest season is on this list; the player being viewed can be from any league.
SIMILAR_LEAGUES = frozenset((
    "Championship", "League One", "Bundesliga (Austria)", "Jupiler Pro League", "1.HNL (Croatia)", "Fortuna Liga",
    "Superligaen", "Ligue 2", "Eredivisie", "Liga Portugal", "Scottish Premiership", "Super League (Switzerland)",
    "Eliteserien", "Allsvenskan", "MLS",
))
# Reference boxes on the technical tab, as the scout app's league view draws them: the 10th/25th/50th/75th/90th
# percentiles of each category and metric reading among a league's regulars (900+ minutes at the position) in a season.
# A group with fewer than 20 regulars is not kept; its seasons fall back to the league's latest season that has 20.
QUANTILES = (0.10, 0.25, 0.50, 0.75, 0.90)
REGULAR_MINUTES, MIN_REGULARS = 900, 20
POOL_SEASONS = 3  # a league-season under MIN_REGULARS is combined with the seasons before it, up to three in all
CHAMPIONSHIP = "Championship"

# The scout app's CH bands (data-scoring dashboard/scout/scout.js BANDS): fixed cut-offs at the Championship's
# 20th/40th/60th/80th/95th percentiles. Index 5 is elite, 0 is below Championship level.
BANDS = [(116, "Elite"), (108, "Strong starter"), (103, "Starter"), (98, "Average"), (92, "Squad level"),
         (-math.inf, "Below Championship level")]


def band(value):
    """Band index for a CH score, rounding halves up as the scout app's Math.round does."""
    if value is None:
        return None
    rounded = math.floor(value + 0.5)
    return 5 - next(i for i, (cut, _) in enumerate(BANDS) if rounded >= cut)


def band_name(index):
    return None if index is None else BANDS[5 - index][1]


def _headline_order(row):
    """Latest season first, then the position with the most minutes."""
    return -(row["t"] or 0), -(row["min"] or 0)


def category_label(key):
    """"shot_threat" -> "Shot threat"."""
    return key.replace("_", " ").capitalize()


def _fixed(values, width):
    """A list padded or cut to width, None as NaN, for a fixed-width float32 column."""
    values = list(values or [])[:width]
    return [math.nan if v is None else float(v) for v in values] + [math.nan] * (width - len(values))


def _num(value, dp=1):
    """float32 back to a plain number, rounded so float32 noise (0.5199999) does not leak out."""
    return None if math.isnan(value) else round(float(value), dp)


def _quantiles(values):
    """QUANTILES of the non-NaN values (linear interpolation), or None when fewer than MIN_REGULARS remain."""
    values = sorted(v for v in values if not math.isnan(v))
    if len(values) < MIN_REGULARS:
        return None
    last = len(values) - 1
    out = []
    for q in QUANTILES:
        at = q * last
        lo = math.floor(at)
        hi = min(lo + 1, last)
        out.append(values[lo] + (values[hi] - values[lo]) * (at - lo))
    return out


def _median(values):
    q = _quantiles(values)
    return None if q is None else q[2]


def _blob(text):
    return json.loads(gzip.decompress(base64.b64decode(text)))


class ScoreIndex:
    """Every player-season-position row, stored column by column (about 25 MB for 160k rows rather than 175 MB
    as dicts): numbers in float arrays with NaN for missing, text as codes into a shared list."""
    NUMBERS = ("t", "min", "ch", "chLo", "chHi", "fc", "fcLo", "fcHi", "rel", "relN") + OPTIONAL_NUMBERS
    TEXT = ("season", "league", "club", "position") + OPTIONAL_TEXT

    def __init__(self):
        self.numbers = {k: array("d") for k in self.NUMBERS}
        self.text = {k: array("I") for k in self.TEXT}
        self.words, self.codes = [], {}
        self.by_player = {}
        self.position_key = array("I")  # code of the d-meta position key ("striker"), for its categories
        self.cat_ch = array("f")  # MAX_CATS per row
        self.metric_ch = array("f")  # MAX_CATS * MAX_METRICS per row
        self.metric_value = array("f")
        self.positions = {}  # d-meta positions: label, categories, metrics (None on pages that predate them)
        # (position_key code, league code) -> [(t, season code, n, row numbers of its regulars)], oldest season first.
        self.reference = {}
        self.in_progress = {}  # (position, league) -> the season set aside as still in progress
        self.player_of = array("q")  # Impect ID per row
        self.fit = array("f")  # MAX_PROFILES per row
        self.profiles = {}  # d-meta profiles: position key -> [{name, desc}]
        self.similar_pool = {}  # position_key code -> rows of each regular's latest season, for similar players
        self.recent_pool = {}  # position_key code -> [(player, profile over his last RECENT_SEASONS seasons)]

    def _code(self, word):
        if word not in self.codes:
            self.codes[word] = len(self.words)
            self.words.append(word)
        return self.codes[word]

    def add(self, player_id, values):
        self.by_player.setdefault(player_id, array("I")).append(len(self.numbers["t"]))
        self.player_of.append(player_id)
        for k in self.NUMBERS:
            v = values.get(k)
            self.numbers[k].append(math.nan if v is None else float(v))
        for k in self.TEXT:
            self.text[k].append(self._code(values.get(k) or ""))
        self.fit.extend(_fixed(values.get("fit"), MAX_PROFILES))
        self.position_key.append(self._code(values.get("position_key")))
        self.cat_ch.extend(_fixed(values.get("catCh"), MAX_CATS))
        for target, key in ((self.metric_ch, "mCh"), (self.metric_value, "mVal")):
            nested = values.get(key) or []
            for c in range(MAX_CATS):
                target.extend(_fixed(nested[c] if c < len(nested) else None, MAX_METRICS))

    def build_reference(self, start, end):
        """Reference groups for rows start..end (one position, added together): the row numbers of each league's
        regulars in each season. Their figures are worked out when a profile asks, so a refresh stays quick."""
        groups = {}
        mins, t = self.numbers["min"], self.numbers["t"]
        for i in range(start, end):
            if mins[i] >= REGULAR_MINUTES:  # NaN compares False
                key = (self.position_key[i], self.text["league"][i], self.text["season"][i])
                groups.setdefault(key, array("I")).append(i)
        latest = {}  # player -> his latest regular row with every category scored
        for i in range(start, end):
            if mins[i] >= REGULAR_MINUTES and not any(math.isnan(self.cat_ch[i * MAX_CATS + c]) for c in range(MAX_CATS)
                                                         if c < len(self.positions.get(self.words[self.position_key[i]], {}).get("categories") or [])):
                j = latest.get(self.player_of[i])
                if j is None or t[i] > t[j]:
                    latest[self.player_of[i]] = i
        # similar players are current players: someone whose latest season is older than last season is left out
        recent = max((t[i] for i in range(start, end) if not math.isnan(t[i])), default=math.nan) - 1
        latest = {p: i for p, i in latest.items() if t[i] >= recent and self._similar_league(i)}
        if latest:
            self.similar_pool[self.position_key[start]] = array("I", sorted(latest.values()))
        rows_of = {}
        for i in range(start, end):
            rows_of.setdefault(self.player_of[i], []).append(i)
        pool = []
        for player, rows in rows_of.items():
            profile = self._profile(rows)
            if (profile is not None and profile["minutes"] >= REGULAR_MINUTES and t[profile["last"]] >= recent
                    and self._similar_league(profile["last"])):
                pool.append((player, profile))
        if pool:
            self.recent_pool[self.position_key[start]] = pool
        for (position, league, season), rows in groups.items():  # every season, however small: small ones get pooled
            self.reference.setdefault((position, league), []).append((max(t[i] for i in rows), season, len(rows), rows))
        for key, entries in self.reference.items():
            if key[0] != self.position_key[start]:
                continue
            entries.sort(key=lambda e: e[0])
            # A season still in progress has only its early regulars (half the previous season's or fewer), who are
            # not a fair picture of the league: set it aside, so its rows use the seasons before it.
            if len(entries) > 1 and entries[-1][2] * 2 <= entries[-2][2]:
                self.in_progress[key] = entries.pop()

    def _reference_group(self, position, league, season_t):
        """The league's regulars for this season; when it has under MIN_REGULARS, combined with the seasons before it
        (up to POOL_SEASONS in all). A season still in progress is skipped for the last complete one. Returns
        {seasons, n, rows, in_progress} or, when even POOL_SEASONS seasons fall short, {seasons, n, rows: None}."""
        entries = self.reference.get((position, league))
        if not entries:
            return None
        earlier = [e for e in entries if e[0] <= season_t]  # NaN season_t: nothing matches, the latest are used
        base = earlier or entries
        taken, n = [], 0
        for e in reversed(base):
            if taken and e[0] <= taken[0][0] - POOL_SEASONS:  # only the three seasons up to the newest one used
                break
            taken.append(e)
            n += e[2]
            if n >= MIN_REGULARS or len(taken) == POOL_SEASONS:
                break
        taken.reverse()
        skipped = self.in_progress.get((position, league))
        result = {"seasons": [self.words[e[1]] for e in taken], "n": n,
                  "in_progress": None if skipped is None or skipped[0] != season_t else self.words[skipped[1]],
                  "rows": None}
        if n >= MIN_REGULARS:
            rows = array("I")
            for e in taken:
                rows.extend(e[3])
            result["rows"] = rows
        return result

    def _categories(self, i):
        return len(self.positions.get(self.words[self.position_key[i]], {}).get("categories") or [])

    def _profile(self, rows):
        """Minutes-weighted category scores over the most recent RECENT_SEASONS seasons among rows (one player, one
        position), counting only rows with every category scored; None when there are none."""
        if not rows:
            return None
        n = min(self._categories(rows[0]), MAX_CATS)
        t, mins = self.numbers["t"], self.numbers["min"]
        usable = [i for i in rows if n and mins[i] > 0 and not any(math.isnan(self.cat_ch[i * MAX_CATS + c]) for c in range(n))]
        if not usable:
            return None
        newest = max(t[i] for i in usable)  # the last three seasons by date, so a gap year is not filled from further back
        usable = [i for i in usable if t[i] > newest - RECENT_SEASONS]
        if not usable:
            return None
        total = sum(mins[i] for i in usable)
        vec = [sum(self.cat_ch[i * MAX_CATS + c] * mins[i] for i in usable) / total for c in range(n)]
        chs = [(self.numbers["ch"][i], mins[i]) for i in usable if not math.isnan(self.numbers["ch"][i])]
        ch = sum(v * w for v, w in chs) / sum(w for _, w in chs) if chs else math.nan
        first = min(usable, key=lambda i: t[i])
        last = max(usable, key=lambda i: (t[i], mins[i]))
        return {"vec": vec, "minutes": total, "ch": ch, "first": first, "last": last, "rows": len(usable)}

    def _similar_league(self, i):
        return self.words[self.text["league"][i]] in SIMILAR_LEAGUES

    def _span(self, profile):
        a, b = self.words[self.text["season"][profile["first"]]], self.words[self.text["season"][profile["last"]]]
        return a if a == b else f"{a}–{b}"

    def similar_recent(self, i, count=SIMILAR_COUNT):
        """Similar players over a stretch: his minutes-weighted category scores over his last three seasons at this
        position up to row i's season, against every player's own last three seasons. Steadier than one season."""
        me, pos, t = self.player_of[i], self.position_key[i], self.numbers["t"]
        mine = self._profile([j for j in self.by_player.get(me, ()) if self.position_key[j] == pos and t[j] <= t[i]])
        if mine is None:
            return None, []
        scored = []
        for player, profile in self.recent_pool.get(pos, ()):
            if player == me:
                continue
            d = math.sqrt(sum((a - b) ** 2 for a, b in zip(profile["vec"], mine["vec"])) / len(mine["vec"]))
            scored.append((d, player, profile))
        scored.sort(key=lambda e: e[0])
        out = []
        for d, player, p in scored[:count]:
            last = p["last"]
            out.append({"impect_id": player, "name": self.words[self.text["name"][last]] or None,
                        "club": self.words[self.text["club"][last]], "league": self.words[self.text["league"][last]],
                        "season": self._span(p), "minutes": int(p["minutes"]), "ch": _num(p["ch"]),
                        "categories": [round(v, 1) for v in p["vec"]], "distance": round(d, 1)})
        basis = {"seasons": self._span(mine), "minutes": int(mine["minutes"]), "ch": _num(mine["ch"]),
                 "categories": [round(v, 1) for v in mine["vec"]]}
        return basis, out

    def similar(self, i, count=SIMILAR_COUNT):
        """The regulars at row i's position whose category scores are closest to row i's (one row per player, his
        latest season), nearest first. Distance on the Championship scale, so it matches level as well as style."""
        n = len(self.positions.get(self.words[self.position_key[i]], {}).get("categories") or [])
        mine = [self.cat_ch[i * MAX_CATS + c] for c in range(min(n, MAX_CATS))]
        if not mine or any(math.isnan(v) for v in mine):
            return []
        me = self.player_of[i]
        scored = []
        for j in self.similar_pool.get(self.position_key[i], ()):
            if self.player_of[j] == me:
                continue
            d = math.sqrt(sum((self.cat_ch[j * MAX_CATS + c] - v) ** 2 for c, v in enumerate(mine)) / len(mine))
            scored.append((d, j))
        scored.sort()
        out = []
        for d, j in scored[:count]:
            out.append({"impect_id": self.player_of[j], "name": self.words[self.text["name"][j]] or None,
                        "club": self.words[self.text["club"][j]], "league": self.words[self.text["league"][j]],
                        "season": self.words[self.text["season"][j]], "ch": _num(self.numbers["ch"][j]),
                        "categories": [_num(self.cat_ch[j * MAX_CATS + c]) for c in range(len(mine))],
                        "distance": round(d, 1)})
        return out

    def outlook(self, i):
        """Headline scores, outlook and role fit for row i."""
        num = lambda k, dp=1: _num(self.numbers[k][i], dp)
        key = self.words[self.position_key[i]]
        profiles = self.profiles.get(key) or []
        fits = [_num(self.fit[i * MAX_PROFILES + p]) for p in range(min(len(profiles), MAX_PROFILES))]
        best = num("best", 0)
        return {
            "scores": {"ch": num("ch"), "ch_lo": num("chLo"), "ch_hi": num("chHi"), "team": num("team"), "team_rel": num("teamRel"),
                       "career": num("rel"), "career_seasons": None if num("relN", 0) is None else int(num("relN", 0)),
                       "forecast": num("fc"), "forecast_lo": num("fcLo"), "forecast_hi": num("fcHi")},
            "outlook": {"starter_championship": num("pCh", 2), "starter_premier_league": num("pPl", 2),
                        "step_up_success": num("pSucc", 2), "availability": num("avail", 2),
                        "availability_seasons": None if num("availN", 0) is None else int(num("availN", 0))},
            "role_fit": None if not profiles or all(f is None for f in fits) else {
                "best": None if best is None else int(best),
                "profiles": [dict(p, fit=f) for p, f in zip(profiles, fits)]},
        }

    def row_numbers(self, player_id):
        return list(self.by_player.get(player_id, ()))

    def technical(self, i):
        """Category and metric Championship scores for row i, labelled from d-meta, with the reference boxes of the
        player's own league (None when he plays in the Championship) and of the Championship."""
        key = self.words[self.position_key[i]]
        spec = self.positions.get(key) or {}
        metric_specs = spec.get("metrics")
        league = self.words[self.text["league"][i]]
        season_t = self.numbers["t"][i]
        champ_code = self.codes.get(CHAMPIONSHIP)
        own_found = None if league == CHAMPIONSHIP else self._reference_group(self.position_key[i], self.text["league"][i], season_t)
        champ_found = None if champ_code is None else self._reference_group(self.position_key[i], champ_code, season_t)
        own = own_found if own_found and own_found["rows"] is not None else None
        champ = champ_found if champ_found and champ_found["rows"] is not None else None
        def stats(group, column, at):
            """The group's box, average and the share of it the player beats for one category or metric column."""
            if group is None:
                return None
            player = column[i * at[0] + at[1]]  # compared as stored, so he never counts as beating himself
            player = None if math.isnan(player) else player
            values = [v for v in (column[k * at[0] + at[1]] for k in group["rows"]) if not math.isnan(v)]
            q = _quantiles(values)
            if q is None:
                return None
            beats = None if player is None else round(100 * sum(v < player for v in values) / len(values))
            return {"q": [round(float(v), 1) for v in q], "mean": round(sum(values) / len(values), 1), "beats": beats}

        categories = []
        for c, cat in enumerate(spec.get("categories") or []):
            metrics = None
            if metric_specs is not None:
                metrics = []
                for m, info in enumerate(metric_specs[c] if c < len(metric_specs) else []):
                    if m >= MAX_METRICS:
                        break
                    j = (i * MAX_CATS + c) * MAX_METRICS + m
                    r = c * MAX_METRICS + m
                    reading = _num(self.metric_ch[j])
                    at, width = (MAX_CATS * MAX_METRICS, r), MAX_CATS * MAX_METRICS
                    champ_value = None if champ is None else _median([self.metric_value[k * width + r] for k in champ["rows"]])
                    metrics.append(dict(info, ch=reading, value=_num(self.metric_value[j], 3),
                                        own=stats(own, self.metric_ch, at), champ=stats(champ, self.metric_ch, at),
                                        champ_value=None if champ_value is None else round(champ_value, 3)))
            ch = _num(self.cat_ch[i * MAX_CATS + c]) if c < MAX_CATS else None
            categories.append({"key": cat, "label": category_label(cat), "ch": ch,
                               "band": band(ch), "band_name": band_name(band(ch)), "metrics": metrics,
                               "own": stats(own, self.cat_ch, (MAX_CATS, c)) if c < MAX_CATS else None,
                               "champ": stats(champ, self.cat_ch, (MAX_CATS, c)) if c < MAX_CATS else None})
        row_season = self.words[self.text["season"][i]]

        def describe(found, name):
            """Which seasons a box covers and why, so the tab can say so: pooled when one season had too few
            regulars, in_progress when this season was set aside, missing when even three seasons fell short."""
            if found is None:
                return None
            seasons = found["seasons"]
            span = seasons[0] if len(seasons) == 1 else f"{seasons[0]}–{seasons[-1]}"
            return {"league": name, "season": span, "seasons": seasons, "n": found["n"],
                    "pooled": len(seasons) > 1, "same_season": seasons == [row_season],
                    "in_progress": found["in_progress"], "missing": found["rows"] is None}

        reference = {"own": describe(own_found, league), "champ": describe(champ_found, CHAMPIONSHIP),
                     "min_regulars": MIN_REGULARS, "pool_seasons": POOL_SEASONS}
        return key, categories, reference

    def rows(self, player_id):
        out = []
        for i in self.by_player.get(player_id, ()):
            # the Data Score's fields only; the optional outlook columns belong to the technical tab
            row = {k: (None if math.isnan(self.numbers[k][i]) else self.numbers[k][i]) for k in KEEP if k in self.numbers}
            for k in ("min", "relN"):
                row[k] = None if row[k] is None else int(row[k])
            row.update({k: self.words[self.text[k][i]] for k in ("season", "league", "club", "position")})
            out.append(row)
        return out

    def __len__(self):
        return len(self.by_player)


def _metric_breakdown(index, position, blob, row_count):
    """Read d-metrics_<position>: {categories: [{key, metrics: [{key, label, percent, lower_better}]}],
    rows: [[value, reading, value, reading, ...]]}, one row per position row in the same order. Records the metric
    labels on index.positions and returns row i -> (readings, values) per d-meta category, or None when the blob is
    missing or does not line up (the tab then shows categories only)."""
    if blob is None:
        return None
    try:
        data = _blob(blob)
        rows, by_key = data["rows"], {c["key"]: c["metrics"] for c in data["categories"]}
        if len(rows) != row_count:
            raise ValueError(f"{len(rows)} metric rows for {row_count} position rows")
        cats = index.positions[position]["categories"]
        offset, at = {}, 0
        for c in data["categories"]:
            offset[c["key"]] = at
            at += 2 * len(c["metrics"])
        index.positions[position]["metrics"] = [
            [{"key": m["key"], "label": m.get("label", m["key"]), "percent": bool(m.get("percent")),
              "lower_better": bool(m.get("lower_better"))} for m in by_key.get(cat, [])] for cat in cats]
    except (KeyError, TypeError, ValueError) as e:
        logger.error("data scores: ignoring metrics_%s: %s: %s", position, type(e).__name__, e)
        return None

    def row(i):
        cell, readings, values = rows[i], [], []
        for cat in cats:
            start, n = offset.get(cat), len(by_key.get(cat, []))
            if start is None:
                readings.append(None); values.append(None)
                continue
            values.append([cell[start + 2 * m] for m in range(n)])
            readings.append([cell[start + 2 * m + 1] for m in range(n)])
        return readings, values
    return row


def parse_page(html):
    """A ScoreIndex from a packaged scout page, keeping only the fields the profile shows."""
    blobs = dict(BLOB.findall(html))
    meta = _blob(blobs.pop("meta"))
    columns = {name: i for i, name in enumerate(meta["columns"])}
    missing = [k for k in ("id",) + KEEP if k not in columns]
    if missing:
        raise ValueError(f"data scores: page is missing columns {missing}")
    index = ScoreIndex()
    index.positions = {key: {"label": spec.get("label", key), "categories": spec.get("categories") or [],
                             "metrics": None} for key, spec in meta["positions"].items()}
    technical = [k for k in TECHNICAL + OPTIONAL_NUMBERS + OPTIONAL_TEXT + ("fit",) if k in columns]
    index.profiles = {k: [{"name": p.get("name", ""), "desc": p.get("desc", "")} for p in v]
                      for k, v in (meta.get("profiles") or {}).items()}
    for position in meta["positions"]:  # one position at a time keeps the peak small
        if position not in blobs:  # listed but not packaged, like goalkeepers
            continue
        cols = _blob(blobs.pop(position))
        label = meta["positions"].get(position, {}).get("label", position)
        ids, kept = cols[columns["id"]], {k: cols[columns[k]] for k in KEEP + tuple(technical)}
        del cols
        metric_rows = _metric_breakdown(index, position, blobs.pop(f"metrics_{position}", None), len(ids))
        start = len(index.numbers["t"])
        for i, player_id in enumerate(ids):
            values = dict({k: c[i] for k, c in kept.items()}, position=label, position_key=position)
            if metric_rows is not None:
                values["mCh"], values["mVal"] = metric_rows(i)
            index.add(int(player_id), values)
        index.build_reference(start, len(index.numbers["t"]))
    return index


class DataScores:
    def __init__(self, env=os.environ):
        self.env = env
        self.lock = threading.Lock()
        self.run = None  # {'run_id', 'built_at'} of the copy in self.index
        self.index = None
        self.next_check = -math.inf

    def _latest(self):
        """(run_id, built_at, html loader) for the newest published page."""
        local = self.env.get("DATA_SCORES_FILE")
        if local:
            path = Path(local)
            stamp = time.strftime("%Y-%m-%d", time.localtime(path.stat().st_mtime))
            return f"local-{path.stat().st_mtime_ns}", stamp, path.read_text
        s3, bucket = self._client()
        latest = json.loads(s3.get_object(Bucket=bucket, Key="published/latest.json")["Body"].read())
        key = f"published/{latest['run_id']}/cafc_scout.html"
        return latest["run_id"], latest.get("built_at"), lambda: s3.get_object(Bucket=bucket, Key=key)["Body"].read().decode()

    def _client(self):
        import boto3
        bucket = self.env.get("DATA_SCORES_BUCKET")
        if not bucket:
            raise RuntimeError("data scores: DATA_SCORES_BUCKET is not set")
        from botocore.config import Config
        return boto3.client(
            "s3", endpoint_url=self.env.get("DATA_SCORES_ENDPOINT"), region_name=self.env.get("DATA_SCORES_REGION"),
            aws_access_key_id=self.env.get("DATA_SCORES_ACCESS_KEY_ID"),
            aws_secret_access_key=self.env.get("DATA_SCORES_SECRET_ACCESS_KEY"),
            config=Config(connect_timeout=5, read_timeout=30, retries={"max_attempts": 2},
                          s3={"addressing_style": self.env.get("DATA_SCORES_S3_ADDRESSING_STYLE", "auto")}),
        ), bucket

    def current(self):
        """(run, index) for the newest copy, or the last good copy if the bucket cannot be read."""
        with self.lock:
            if time.monotonic() >= self.next_check:
                try:
                    run_id, built_at, load = self._latest()
                    if self.run is None or self.run["run_id"] != run_id:
                        self.index = parse_page(load())
                        self.run = {"run_id": run_id, "built_at": built_at}
                        # print, because production only logs errors: this line confirms the read worked.
                        print(f"data scores: loaded run {run_id} ({len(self.index)} players)", flush=True)
                    self.next_check = time.monotonic() + CHECK_SECONDS
                except Exception as e:  # keep serving the last good copy
                    logger.error("data scores: refresh failed: %s: %s", type(e).__name__, e)
                    self.next_check = time.monotonic() + RETRY_SECONDS
            return self.run, self.index

    def for_player(self, impect_id):
        run, index = self.current()
        if index is None:
            return {"available": False, "message": "Data scores are unavailable right now.", "run": None, "headline": None, "rows": []}
        rows = [dict(r, band=band(r["ch"]), band_name=band_name(band(r["ch"])),
                     fc_band=band(r["fc"]), fc_band_name=band_name(band(r["fc"])),
                     rel_band=band(r["rel"]), rel_band_name=band_name(band(r["rel"])))
                for r in index.rows(int(impect_id))]
        rows.sort(key=_headline_order)
        if not rows:
            return {"available": False, "message": "No data score for this player.", "run": run, "headline": None, "rows": []}
        return {"available": True, "message": None, "run": run, "headline": rows[0], "rows": rows}

    def technical_for_player(self, impect_id):
        """Every scored season x position for the technical data tab, headline first, with category and metric
        Championship scores. metrics is None for every category until data-scoring packages them."""
        run, index = self.current()
        if index is None:
            return {"available": False, "message": "Data scores are unavailable right now.", "run": None, "rows": []}
        rows = []
        for i in index.row_numbers(int(impect_id)):
            key, categories, reference = index.technical(i)
            row = {k: index.numbers[k][i] for k in ("t", "min", "ch")}
            row = {k: (None if math.isnan(v) else v) for k, v in row.items()}
            row["min"] = None if row["min"] is None else int(row["min"])
            row.update({k: index.words[index.text[k][i]] for k in ScoreIndex.TEXT})
            row.update(position_key=key, band=band(row["ch"]), band_name=band_name(band(row["ch"])),
                       categories=categories, reference=reference, has_metrics=any(c["metrics"] for c in categories),
                       similar=index.similar(i), **index.outlook(i))
            row["similar_recent_basis"], row["similar_recent"] = index.similar_recent(i)
            rows.append(row)
        rows.sort(key=_headline_order)
        if not rows:
            return {"available": False, "message": "No data score for this player.", "run": run, "rows": []}
        return {"available": True, "message": None, "run": run, "rows": rows}

    def list_score(self, impect_id):
        """One player's score for a list row: career, else that season's CH index, else None."""
        if impect_id is None:
            return None
        _, index = self.current()
        rows = index.rows(int(impect_id)) if index is not None else []
        if not rows:
            return None
        head = min(rows, key=_headline_order)
        kind = "career" if head["rel"] is not None else "ch_index"
        value = head["rel"] if kind == "career" else head["ch"]
        if value is None:
            return None
        return {"kind": kind, "value": value, "band": band(value), "band_name": band_name(band(value)),
                "position": head["position"], "season": head["season"], "seasons": head["relN"], "min": head["min"]}


data_scores = DataScores()
