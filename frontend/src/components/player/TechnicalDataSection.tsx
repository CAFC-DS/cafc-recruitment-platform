import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import axiosInstance from "../../axiosInstance";
import { DataScoreBox } from "./PlayerDataScore";
import TechnicalDataExtras, { RoleFit, SimilarPlayer, TechnicalOutlook, TechnicalScores } from "./TechnicalDataExtras";
import "./TechnicalDataSection.css";

/** Technical data tab: the categories behind a player's Data Score and the metrics behind each category, all on the
 * Championship scale (100 = Championship average at the position, 10 = one standard deviation), each set against
 * boxes for his own league's regulars and the Championship's. Data comes from the data-scoring app's weekly page via
 * GET /players/{id}/technical-data (admin and senior manager). */

/** 10th, 25th, 50th, 75th and 90th percentile of a reading among a league's regulars. */
export type Box = [number, number, number, number, number];
/** A league's regulars on one category or metric: their box, their average, and the share of them this player beats
 * (null when he has no reading). The whole entry is null when the league has too few regulars. */
export interface Reference { q: Box; mean: number; beats: number | null }

/** One metric behind a category (data-scoring build_metric_breakdown.py). ch is its reading on the category's
 * Championship scale, so the category score is the average of its metrics' ch; value is the real figure. */
export interface TechnicalMetric {
  key: string;
  label: string;
  percent: boolean;
  lower_better: boolean;
  ch: number | null;
  value: number | null;
  own?: Reference | null;
  champ?: Reference | null;
  champ_value?: number | null;
}

export interface TechnicalCategory {
  key: string;
  label: string;
  ch: number | null;
  band: number | null;
  band_name: string | null;
  metrics: TechnicalMetric[] | null;
  own?: Reference | null;
  champ?: Reference | null;
}

/** Which regulars a box is drawn from. season is one season or a span ("2025–2026"): a league-season with under
 * min_regulars is combined with the seasons before it (up to pool_seasons). in_progress names this season when it was
 * set aside as still under way; missing means even pool_seasons seasons fell short, so there is no box. */
export interface ReferenceGroup {
  league?: string;
  season: string;
  seasons?: string[];
  n: number;
  pooled?: boolean;
  same_season?: boolean;
  in_progress?: string | null;
  missing?: boolean;
}

export interface TechnicalReference {
  own: (ReferenceGroup & { league: string }) | null;
  champ: ReferenceGroup | null;
  min_regulars?: number;
  pool_seasons?: number;
}

export interface TechnicalRow {
  season: string;
  league: string;
  club: string;
  position: string;
  position_key: string;
  min: number | null;
  t: number | null;
  ch: number | null;
  band?: number | null;
  band_name: string | null;
  categories: TechnicalCategory[];
  reference?: TechnicalReference;
  has_metrics: boolean;
  scores?: TechnicalScores;
  outlook?: TechnicalOutlook;
  role_fit?: RoleFit | null;
  similar?: SimilarPlayer[];
}

export interface TechnicalDataResponse {
  available: boolean;
  message: string | null;
  run: { run_id: string; built_at: string | null } | null;
  rows: TechnicalRow[];
}

const SMALL_SAMPLE = 900;
const LO = 70, HI = 130; // the strips' fixed axis; the scout app's ruler is 80-125
// The scout app's CH bands (dashboard/scout/scout.js BANDS), the same cut-offs the backend uses.
const BANDS: [number, string][] = [[116, "Elite"], [108, "Strong starter"], [103, "Starter"], [98, "Average"], [92, "Squad level"], [-Infinity, "Below Championship level"]];
export const bandOf = (v: number | null | undefined) => (v == null ? null : 5 - BANDS.findIndex(([cut]) => Math.floor(v + 0.5) >= cut));

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round = (v: number | null | undefined) => (v == null ? "—" : String(Math.round(v)));
const seasonLabel = (s: string) => s.split("–").map((x) => (/^\d{2}\/\d{2}$/.test(x) ? `20${x}` : x)).join("–");

/** A real figure, formatted as the scout app shows it (dashboard/scout/scout.js showMetricValue). */
const formatNumber = (m: Pick<TechnicalMetric, "key" | "percent">, v: number | null | undefined) => {
  if (v == null) return null;
  if (m.percent) return `${Math.round(v * 100)}%`;
  if (m.key === "r_pass_over_expected") return `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(1)} pts`;
  return v.toFixed(Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2);
};
export const formatValue = (m: TechnicalMetric) => formatNumber(m, m.value);

/** Labels carry their unit ("Shots per 90", "Interceptions per 1,000 opponent touches"); the unit moves to the line
 * underneath so the name stays short. */
export const shortLabel = (label: string) =>
  label.replace(/ per 90$/, "").replace(/ per 1,000 [a-z ]+$/, "").replace(/ \(share\)$/, "");
const unitOf = (label: string) => {
  const per = label.match(/ (per 90|per 1,000 [a-z ]+)$/);
  return per ? per[1] : null;
};

/** One sentence for the top of the panel: where he is above and below the Championship, and, for a category below
 * it, whether he is still ahead of his own league there. */
export const verdict = (row: TechnicalRow) => {
  const scored = row.categories.filter((c) => c.ch != null) as (TechnicalCategory & { ch: number })[];
  if (!scored.length) return null;
  const by = [...scored].sort((a, b) => b.ch - a.ch);
  const top = by.filter((c) => c.ch >= 103).slice(0, 2);
  const low = by.filter((c) => c.ch < 98).reverse().slice(0, 2);
  const list = (cs: typeof scored) => cs.map((c, i) => (
    <React.Fragment key={c.key}>{i > 0 && " and "}<b>{c.label.toLowerCase()}</b> ({Math.round(c.ch)})</React.Fragment>
  ));
  const ahead = low.filter((c) => c.own && c.ch > c.own.mean);
  const own = row.reference?.own;
  return (
    <>
      {top.length ? <>Above Championship level in {list(top)}.</> : <>No category clearly above Championship level.</>}
      {low.length > 0 && <> Below it in {list(low)}{!own || !ahead.length ? "."
        : ahead.length === low.length ? <>, though still above most {own.league} {row.position.toLowerCase()}s there.</>
          : <>; still above most {own.league} {row.position.toLowerCase()}s in {list(ahead)}.</>}</>}
    </>
  );
};

/** Pizza chart: one slice per category, its length the Championship score (60 at the hub, 120 at the rim) with the
 * number printed in it; the dotted arc is 100 and the amber arc his league's average. Slices are read one by one, so
 * nothing depends on area or axis order as a radar's shape does. */
const CategoryRadar: React.FC<{ row: TechnicalRow; open: number | null; onOpen: (i: number) => void }> = ({ row, open, onOpen }) => {
  const cats = row.categories;
  const n = cats.length;
  const cx = 300, cy = 270, R0 = 30, R = 172, LO = 60, HI = 120, GAP = 0.03;
  const rr = (v: number) => R0 + ((R - R0) * (clamp(v, LO, HI) - LO)) / (HI - LO);
  const at = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  const wedge = (r0: number, r1: number, a0: number, a1: number) =>
    `M${at(r1, a0)} A${r1},${r1} 0 0 1 ${at(r1, a1)} L${at(r0, a1)} A${r0},${r0} 0 0 0 ${at(r0, a0)} Z`;
  const arc = (r: number, a0: number, a1: number) => `M${at(r, a0)} A${r},${r} 0 0 1 ${at(r, a1)}`;
  const slice = (2 * Math.PI) / n;
  return (
    <svg className="td-radar td-pizza" viewBox="-50 30 700 482" role="img"
      aria-label={`Category Championship scores: ${cats.map((c) => `${c.label} ${round(c.ch)}`).join(", ")}`}>
      {cats.map((c, i) => {
        const a0 = -Math.PI / 2 - slice / 2 + i * slice + GAP, a1 = a0 + slice - 2 * GAP, mid = (a0 + a1) / 2;
        const usable = !!c.metrics?.length;
        const dim = open !== null && open !== i;
        const vr = c.ch == null ? R0 + 34 : Math.max(R0 + 34, rr(c.ch) - 30);
        // the heading sits outside the slice, level, split over two lines when long
        const words = c.label.toUpperCase().split(" ");
        const lines = words.length > 1 && c.label.length > 9 ? [words.slice(0, Math.ceil(words.length / 2)).join(" "), words.slice(Math.ceil(words.length / 2)).join(" ")] : [words.join(" ")];
        const cos = Math.cos(mid), sin = Math.sin(mid);
        const lr = R + 16, lx = cx + lr * cos, ly = cy + lr * sin;
        const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
        const lineH = 21;
        const firstY = sin < -0.5 ? ly - (lines.length - 1) * lineH - 6 : sin > 0.5 ? ly + 18 : ly - ((lines.length - 1) * lineH) / 2 + 7;
        return (
          <g key={c.key} data-open={i} className={`td-slice${dim ? " is-dim" : ""}${open === i ? " is-open" : ""}${usable ? " is-usable" : ""}`}
            onClick={usable ? () => onOpen(i) : undefined}>
            <path d={wedge(R0, R, a0, a1)} className="td-slice-bg" />
            {c.ch != null && <path d={wedge(R0, rr(c.ch), a0, a1)} className={`td-slice-fill${c.ch < 100 ? " is-below" : ""}`} />}
            <path d={arc(rr(100), a0, a1)} className="td-slice-hundred" />
            {c.own && <path d={arc(rr(c.own.mean), a0, a1)} className="td-r-own" />}
            <text x={cx + vr * Math.cos(mid)} y={cy + vr * Math.sin(mid) + 7} textAnchor="middle" className="td-slice-value">{round(c.ch)}</text>
            <g className={`td-r-label${dim ? " is-dim" : ""}${usable ? " is-usable" : ""}`}>
              <text textAnchor={anchor} className="td-r-name">
                {lines.map((line, k) => <tspan key={k} x={lx} y={firstY + k * lineH}>{line}</tspan>)}
              </text>
            </g>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={R0 - 6} className="td-pizza-hub" />
    </svg>
  );
};

const refTip = (who: string, r: Reference) =>
  `${who}: average ${Math.round(r.mean)}, median ${Math.round(r.q[2])}, middle half ${Math.round(r.q[1])}–${Math.round(r.q[3])}, ` +
  `10th–90th percentile ${Math.round(r.q[0])}–${Math.round(r.q[4])}${r.beats == null ? "" : `; he beats ${r.beats}%`}`;

/** His league's box above the Championship's on one axis, each with its average (diamond), and the player's mark across
 * both. Drawn at a fixed aspect ratio so the diamonds and labels keep their shape. */
/** The element's width in CSS pixels, so a chart can draw at 1 unit = 1 pixel (fixed text size at any width). */
const useWidth = (fallback: number): [React.RefObject<SVGSVGElement | null>, number] => {
  const ref = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => { const w = el.getBoundingClientRect().width; if (w > 0) setWidth(Math.round(w)); };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
};

export const BoxStrip: React.FC<{ value: number | null; own: Reference | null | undefined; champ: Reference | null | undefined; ownLabel: string | null; label: string }> = ({ value, own, champ, ownLabel, label }) => {
  const [svgRef, W] = useWidth(600);
  const two = !!own && !!champ;
  const H = two ? 52 : 32;
  const X = (v: number) => ((clamp(v, LO, HI) - LO) / (HI - LO)) * W;
  const lanes: [Reference, number, "own" | "champ"][] = [];
  if (own) lanes.push([own, two ? 15 : 16, "own"]);
  if (champ) lanes.push([champ, two ? 37 : 16, "champ"]);
  const mid = two ? 26 : 16;
  const tips = [own && ownLabel ? refTip(ownLabel, own) : null, champ ? refTip("Championship", champ) : null].filter(Boolean);
  return (
    <svg ref={svgRef} className="td-strip" viewBox={`0 0 ${W} ${H}`} height={H} role="img"
      aria-label={`${label}: ${round(value)}${tips.length ? `. ${tips.join(". ")}` : ""}`}>
      <title>{[`${label}: ${round(value)}`, ...tips].join("\n")}</title>
      {[80, 90, 110, 120].map((t) => <line key={t} x1={X(t)} x2={X(t)} y1={4} y2={H - 4} className="td-s-grid" />)}
      <line x1={X(100)} x2={X(100)} y1={4} y2={H - 4} className="td-s-average" />
      {lanes.map(([r, y, kind]) => {
        const q = r.q, mx = X(r.mean);
        return (
          <g key={kind} className={`td-s-${kind}`}>
            <line x1={X(q[0])} x2={X(q[4])} y1={y} y2={y} className="td-s-whisker" />
            <rect x={X(q[1])} y={y - 7} width={Math.max(2, X(q[3]) - X(q[1]))} height={14} rx={2} className="td-s-box" />
            <line x1={X(q[2])} x2={X(q[2])} y1={y - 7} y2={y + 7} className="td-s-median" />
            <path d={`M${mx} ${y - 5.5} L${mx + 5.5} ${y} L${mx} ${y + 5.5} L${mx - 5.5} ${y} Z`} className="td-s-mean" />
          </g>
        );
      })}
      {value != null && (
        <g className="td-s-player">
          <line x1={X(value)} x2={X(value)} y1={3} y2={H - 3} />
          <circle cx={X(value)} cy={mid} r={5} />
        </g>
      )}
    </svg>
  );
};

/** "League Two" -> "L2", "Eredivisie" -> "Eredivisie": a short name for the league's average label. */
export const leagueTag = (league: string | null) => {
  if (!league) return "League";
  const m = league.match(/^League (One|Two)$/);
  if (m) return m[1] === "One" ? "L1" : "L2";
  return league.length > 14 ? `${league.slice(0, 13)}…` : league;
};

/** His gap to one group's average, with the average and the share of the group he beats underneath. */
const VsCell: React.FC<{ value: number | null; r: Reference | null | undefined }> = ({ value, r }) => {
  if (!r) return <span className="td-vs" />;
  const gap = value == null ? null : Math.round(value - r.mean);
  return (
    <span className="td-vs">
      <b className={gap != null && gap < 0 ? "is-below" : ""}>{gap == null ? "—" : `${gap > 0 ? "+" : gap < 0 ? "−" : "±"}${Math.abs(gap)}`}</b>
      <small>avg {Math.round(r.mean)}{r.beats != null && ` · beats ${r.beats}%`}</small>
    </span>
  );
};

const Chevron: React.FC = () => (
  <svg className="td-chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <path d="M4 2.5 7.5 6 4 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Axis: React.FC = () => (
  <div className="td-axis" aria-hidden="true">
    {[70, 80, 90, 100, 110, 120, 130].map((t) => (
      <span key={t} className={t === 100 ? "is-mid" : ""} style={{ left: `${((t - LO) / (HI - LO)) * 100}%` }}>{t}</span>
    ))}
  </div>
);

/** Plain-language notes for any box that is not simply "this league, this season": seasons combined because one had
 * too few regulars, a season set aside as still under way, or no box at all. Nothing when everything is standard. */
export const referenceNotes = (ref: TechnicalReference, position: string) => {
  const min = ref.min_regulars ?? 20;
  const pos = `${position.toLowerCase()}s`;
  const out: string[] = [];
  const say = (g: ReferenceGroup | null, name: string) => {
    if (!g) return;
    const span = seasonLabel(g.season);
    if (g.missing) {
      out.push(`No ${name} box: only ${g.n} ${pos} played 900+ minutes over ${span}, and a box needs ${min}.`);
    } else if (g.pooled) {
      const list = (g.seasons ?? []).map(seasonLabel);
      const joined = list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}` : span;
      out.push(`${name} box combines ${joined}: no single season had ${min} ${pos} with 900+ minutes (${g.n} across them).`);
    }
    if (g.in_progress) {
      out.push(`${name} box uses ${span}: ${seasonLabel(g.in_progress)} is still under way and has too few regulars so far.`);
    }
  };
  say(ref.own, ref.own?.league ?? "League");
  say(ref.champ, "Championship");
  return out;
};

const TechnicalDataSection: React.FC<{ playerId: string }> = ({ playerId }) => {
  const [data, setData] = useState<TechnicalDataResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState(0);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setFailed(false);
    axiosInstance.get<TechnicalDataResponse>(`/players/${playerId}/technical-data`)
      .then(({ data: response }) => { if (!cancelled) { setData(response); setSelected(0); setOpen(null); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [playerId, attempt]);

  const row = data?.available ? data.rows[selected] : undefined;
  const toggle = useCallback((i: number) => setOpen((o) => (o === i ? null : i)), []);
  const options = useMemo(() => {
    const rows = data?.rows ?? [];
    const seasons = rows.map((r) => r.season);
    return rows.map((r, i) => {
      const repeated = seasons.filter((s) => s === r.season).length > 1;
      return { i, label: `${seasonLabel(r.season)} · ${r.club}${repeated ? ` (${r.position})` : ""}` };
    });
  }, [data]);

  if (failed) {
    return (
      <div className="td-shell td-state" role="alert">
        <p>Technical data could not be loaded.</p>
        <button type="button" className="td-retry" onClick={() => setAttempt((a) => a + 1)}>Try again</button>
      </div>
    );
  }
  if (!data) return <div className="td-shell td-state" role="status">Loading technical data…</div>;
  if (!data.available || !row) return <div className="td-shell td-state"><p>{data.message || "No technical data for this player."}</p></div>;

  const ref = row.reference ?? { own: null, champ: null };
  const ownRef = ref.own && !ref.own.missing ? ref.own : null;
  const champRef = ref.champ && !ref.champ.missing ? ref.champ : null;
  const ownLabel = ownRef?.league ?? null;
  const notes = referenceNotes(ref, row.position);
  const said = verdict(row);

  return (
    <div className="td-shell">
    <div className="td-match">
      <div className="td-panel">
        <div className="td-panel-inner">
          <div className="td-head">
            <div>
              <h2>{row.position}</h2>
              <p>{row.club} · {row.league}</p>
            </div>
            {options.length > 1 && (
              <label className="td-season">
                <span className="visually-hidden">Season</span>
                <select aria-label="Season" value={selected} onChange={(e) => { setSelected(Number(e.target.value)); setOpen(null); }}>
                  {options.map((o) => <option key={o.i} value={o.i}>{o.label}</option>)}
                </select>
              </label>
            )}
          </div>
          <p className="td-mins">
            {row.min == null ? "—" : row.min.toLocaleString()} minutes in {seasonLabel(row.season)}
            {row.min != null && row.min < SMALL_SAMPLE && <span className="td-warn" title={`Under ${SMALL_SAMPLE} minutes, so read these scores with care.`}> · small sample</span>}
          </p>
          <dl className="td-scores">
            <div title={`CH index for ${seasonLabel(row.season)}${row.scores?.ch_lo != null && row.scores?.ch_hi != null ? `, likely ${round(row.scores.ch_lo)}–${round(row.scores.ch_hi)}` : ""}`}>
              <dt>CH index</dt><dd>{round(row.ch)}</dd><span className="td-band-line">{row.band_name === "Below Championship level" ? "Below CH level" : row.band_name ?? ""}</span>
            </div>
            <div title="CH index this season if he played in an average team in his league"><dt>Avg team</dt><dd>{round(row.scores?.team)}</dd></div>
            <div title={`All his seasons, weighted by how reliable each is and adjusted for age${row.scores?.career_seasons ? ` (${row.scores.career_seasons} seasons)` : ""}`}><dt>Career</dt><dd>{round(row.scores?.career)}</dd></div>
            <div title={`Expected CH index next season in an average Championship team${row.scores?.forecast_lo != null && row.scores?.forecast_hi != null ? `, likely ${round(row.scores.forecast_lo)}–${round(row.scores.forecast_hi)}` : ""}`}>
              <dt>Forecast</dt><dd>{round(row.scores?.forecast)}</dd>
              {row.scores?.forecast_lo != null && row.scores?.forecast_hi != null && <span className="td-band-line">{round(row.scores.forecast_lo)}–{round(row.scores.forecast_hi)}</span>}
            </div>
          </dl>
          {said && <p className="td-verdict">{said}</p>}
          <CategoryRadar row={row} open={open} onOpen={toggle} />
          <div className="td-legend">
            <span><i className="td-l-player" />Slice: his score</span>
            <span><i className="td-l-average" />100 Championship average</span>
            {ownLabel && row.categories.every((c) => c.own) && <span><i className="td-l-own" />{leagueTag(ownLabel)} average</span>}
          </div>
        </div>
      </div>

      <div className="td-list">
        {notes.length > 0 && (
          <div className="td-notes" role="note">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M7 6.2v3.8M7 4.1v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            <ul>{notes.map((n) => <li key={n}>{n}</li>)}</ul>
          </div>
        )}
        <div className="td-cols">
          <span>Category</span>
          <span className="td-num">Score</span>
          <Axis />
          <span className="td-vs-head">{ownRef && <><span><i className="td-k-own" />vs {leagueTag(ownRef.league)}</span><small>{seasonLabel(ownRef.season)} · {ownRef.n}</small></>}</span>
          <span className="td-vs-head">{champRef && <><span><i className="td-k-champ" />vs Championship</span><small>{seasonLabel(champRef.season)} · {champRef.n}</small></>}</span>
          <span />
        </div>
        {row.categories.map((c, i) => {
          const usable = !!c.metrics?.length;
          const isOpen = open === i && usable;
          return (
            <div key={c.key} className={`td-cat${isOpen ? " is-open" : ""}${open !== null && !isOpen ? " is-dim" : ""}`}>
              <div className={`td-row${usable ? " is-usable" : ""}`} data-open={i}
                role={usable ? "button" : undefined} tabIndex={usable ? 0 : undefined} aria-expanded={usable ? isOpen : undefined}
                onClick={usable ? () => toggle(i) : undefined}
                onKeyDown={usable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(i); } } : undefined}>
                <div className="td-name"><b>{c.label}</b><small>{c.band_name ?? "No score"}</small></div>
                <span className="td-num"><DataScoreBox value={c.ch} band={c.band ?? bandOf(c.ch)} /></span>
                <BoxStrip value={c.ch} own={c.own} champ={c.champ} ownLabel={ownLabel} label={c.label} />
                <VsCell value={c.ch} r={c.own} />
                <VsCell value={c.ch} r={c.champ} />
                {usable ? <Chevron /> : <span />}
              </div>
              {isOpen && (
                <div className="td-metrics">
                  {c.metrics!.map((m) => {
                    const unit = unitOf(m.label);
                    const champValue = formatNumber(m, m.champ_value);
                    return (
                      <div key={m.key} className="td-row td-metric">
                        <div className="td-name">
                          {shortLabel(m.label)}
                          <small>
                            {formatValue(m) ?? "—"}{champValue && <> · CH median {champValue}</>}
                            {unit && ` · ${unit}`}{m.lower_better && " · lower is better"}
                          </small>
                        </div>
                        <span className="td-num"><DataScoreBox value={m.ch} band={bandOf(m.ch)} size="sm" /></span>
                        <BoxStrip value={m.ch} own={m.own} champ={m.champ} ownLabel={ownLabel} label={m.label} />
                        <VsCell value={m.ch} r={m.own} />
                        <VsCell value={m.ch} r={m.champ} />
                        <span />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        <p className="td-foot">
          Box: middle half of the position's regulars (900+ minutes), line: 10th–90th percentile, diamond: average
          {ownRef && ` · ${ownRef.league} ${seasonLabel(ownRef.season)} (${ownRef.n} regulars)`}
          {champRef && ` · Championship ${seasonLabel(champRef.season)} (${champRef.n} regulars)`}. 100 is the Championship average; 10 points is one standard deviation.
          {!row.has_metrics && " The metrics behind each category arrive with the next weekly data refresh."}
        </p>
      </div>
    </div>
    <TechnicalDataExtras rows={data.rows} row={row} />
    </div>
  );
};

export default TechnicalDataSection;
