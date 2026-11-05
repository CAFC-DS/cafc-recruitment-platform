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


def _blob(text):
    return json.loads(gzip.decompress(base64.b64decode(text)))


class ScoreIndex:
    """Every player-season-position row, stored column by column (about 25 MB for 160k rows rather than 175 MB
    as dicts): numbers in float arrays with NaN for missing, text as codes into a shared list."""
    NUMBERS = ("t", "min", "ch", "chLo", "chHi", "fc", "fcLo", "fcHi", "rel", "relN")
    TEXT = ("season", "league", "club", "position")

    def __init__(self):
        self.numbers = {k: array("d") for k in self.NUMBERS}
        self.text = {k: array("I") for k in self.TEXT}
        self.words, self.codes = [], {}
        self.by_player = {}

    def _code(self, word):
        if word not in self.codes:
            self.codes[word] = len(self.words)
            self.words.append(word)
        return self.codes[word]

    def add(self, player_id, values):
        self.by_player.setdefault(player_id, array("I")).append(len(self.numbers["t"]))
        for k in self.NUMBERS:
            self.numbers[k].append(math.nan if values[k] is None else float(values[k]))
        for k in self.TEXT:
            self.text[k].append(self._code(values[k]))

    def rows(self, player_id):
        out = []
        for i in self.by_player.get(player_id, ()):
            row = {k: (None if math.isnan(col[i]) else col[i]) for k, col in self.numbers.items()}
            for k in ("min", "relN"):
                row[k] = None if row[k] is None else int(row[k])
            row.update({k: self.words[col[i]] for k, col in self.text.items()})
            out.append(row)
        return out

    def __len__(self):
        return len(self.by_player)


def parse_page(html):
    """A ScoreIndex from a packaged scout page, keeping only the fields the profile shows."""
    blobs = dict(BLOB.findall(html))
    meta = _blob(blobs.pop("meta"))
    columns = {name: i for i, name in enumerate(meta["columns"])}
    missing = [k for k in ("id",) + KEEP if k not in columns]
    if missing:
        raise ValueError(f"data scores: page is missing columns {missing}")
    index = ScoreIndex()
    for position in meta["positions"]:  # one position at a time keeps the peak small
        if position not in blobs:  # listed but not packaged, like goalkeepers
            continue
        cols = _blob(blobs.pop(position))
        label = meta["positions"].get(position, {}).get("label", position)
        ids, kept = cols[columns["id"]], {k: cols[columns[k]] for k in KEEP}
        del cols
        for i, player_id in enumerate(ids):
            index.add(int(player_id), dict({k: c[i] for k, c in kept.items()}, position=label))
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
