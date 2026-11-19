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
        self.position_key = array("I")  # code of the d-meta position key ("striker"), for its categories
        self.cat_ch = array("f")  # MAX_CATS per row
        self.metric_ch = array("f")  # MAX_CATS * MAX_METRICS per row
        self.metric_value = array("f")
        self.positions = {}  # d-meta positions: label, categories, metrics (None on pages that predate them)

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
        self.position_key.append(self._code(values.get("position_key")))
        self.cat_ch.extend(_fixed(values.get("catCh"), MAX_CATS))
        for target, key in ((self.metric_ch, "mCh"), (self.metric_value, "mVal")):
            nested = values.get(key) or []
            for c in range(MAX_CATS):
                target.extend(_fixed(nested[c] if c < len(nested) else None, MAX_METRICS))

    def row_numbers(self, player_id):
        return list(self.by_player.get(player_id, ()))

    def technical(self, i):
        """Category and metric Championship scores for row i, labelled from d-meta."""
        key = self.words[self.position_key[i]]
        spec = self.positions.get(key) or {}
        metric_specs = spec.get("metrics")
        categories = []
        for c, cat in enumerate(spec.get("categories") or []):
            metrics = None
            if metric_specs is not None:
                metrics = []
                for m, info in enumerate(metric_specs[c] if c < len(metric_specs) else []):
                    if m >= MAX_METRICS:
                        break
                    j = (i * MAX_CATS + c) * MAX_METRICS + m
                    metrics.append(dict(info, ch=_num(self.metric_ch[j]), value=_num(self.metric_value[j], 3)))
            ch = _num(self.cat_ch[i * MAX_CATS + c]) if c < MAX_CATS else None
            categories.append({"key": cat, "label": category_label(cat), "ch": ch,
                               "band": band(ch), "band_name": band_name(band(ch)), "metrics": metrics})
        return key, categories

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
    technical = [k for k in TECHNICAL if k in columns]
    for position in meta["positions"]:  # one position at a time keeps the peak small
        if position not in blobs:  # listed but not packaged, like goalkeepers
            continue
        cols = _blob(blobs.pop(position))
        label = meta["positions"].get(position, {}).get("label", position)
        ids, kept = cols[columns["id"]], {k: cols[columns[k]] for k in KEEP + tuple(technical)}
        del cols
        metric_rows = _metric_breakdown(index, position, blobs.pop(f"metrics_{position}", None), len(ids))
        for i, player_id in enumerate(ids):
            values = dict({k: c[i] for k, c in kept.items()}, position=label, position_key=position)
            if metric_rows is not None:
                values["mCh"], values["mVal"] = metric_rows(i)
            index.add(int(player_id), values)
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
            key, categories = index.technical(i)
            row = {k: index.numbers[k][i] for k in ("t", "min", "ch")}
            row = {k: (None if math.isnan(v) else v) for k, v in row.items()}
            row["min"] = None if row["min"] is None else int(row["min"])
            row.update({k: index.words[index.text[k][i]] for k in ScoreIndex.TEXT})
            row.update(position_key=key, band=band(row["ch"]), band_name=band_name(band(row["ch"])),
                       categories=categories, has_metrics=any(c["metrics"] for c in categories))
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
