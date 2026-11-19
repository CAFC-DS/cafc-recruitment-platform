import React, { useCallback, useEffect, useMemo, useState } from "react";
import axiosInstance from "../../axiosInstance";
import { useTheme } from "../../contexts/ThemeContext";
import "./TechnicalDataSection.css";

/** Technical data tab: the categories behind a player's Data Score and the metrics behind each category,
 * all on the Championship scale (100 = Championship average at the position, 10 = one standard deviation).
 * Data comes from the data-scoring app's weekly page via GET /players/{id}/technical-data (admin and senior manager). */

/** One metric behind a category (data-scoring build_metric_breakdown.py). ch is its reading on the category's
 * Championship scale, so the category score is the average of its metrics' ch; value is the real figure. */
export interface TechnicalMetric {
  key: string;
  label: string;
  percent: boolean;
  lower_better: boolean;
  ch: number | null;
  value: number | null;
}

export interface TechnicalCategory {
  key: string;
  label: string;
  ch: number | null;
  band: number | null;
  band_name: string | null;
  metrics: TechnicalMetric[] | null;
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
  band_name: string | null;
  categories: TechnicalCategory[];
  has_metrics: boolean;
}

export interface TechnicalDataResponse {
  available: boolean;
  message: string | null;
  run: { run_id: string; built_at: string | null } | null;
  rows: TechnicalRow[];
}

const SMALL_SAMPLE = 900;
const PALETTE = {
  light: ["#3d6bb3", "#2f8a7e", "#b7862c", "#b0503b", "#7b5aa6"],
  dark: ["#7ea3e0", "#5fb8aa", "#d8ae5c", "#df866f", "#a68bd0"],
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round = (v: number | null) => (v == null ? "—" : String(Math.round(v)));
const seasonLabel = (s: string) => (/^\d{2}\/\d{2}$/.test(s) ? `20${s}` : s);

/** "Touches in box" -> ["Touches in", "box"]: short lines for the space under a bar. */
const wrapLabel = (text: string, max = 10) =>
  text.split(" ").reduce<string[]>((lines, word) => {
    const last = lines[lines.length - 1];
    if (last && `${last} ${word}`.length <= max) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
    return lines;
  }, []);

/** The real value, formatted as the scout app shows it (dashboard/scout/scout.js showMetricValue). */
export const formatValue = (m: TechnicalMetric) => {
  const v = m.value;
  if (v == null) return null;
  if (m.percent) return `${Math.round(v * 100)}%`;
  if (m.key === "r_pass_over_expected") return `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(1)} pts`;
  return v.toFixed(Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2);
};

/** Labels carry their unit ("Shots per 90", "Interceptions per 1,000 opponent touches"). Under a narrow bar the unit
 * is dropped; the tooltip keeps the full label. */
export const shortLabel = (label: string) =>
  label.replace(/ per 90$/, "").replace(/ per 1,000 [a-z ]+$/, "").replace(/ \(share\)$/, "");

interface Tip { x: number; y: number; metric: TechnicalMetric; league: string }

const CategoryRadar: React.FC<{ row: TechnicalRow; focus: number | null; onFocus: (i: number) => void }> = ({ row, focus, onFocus }) => {
  const cats = row.categories;
  const n = cats.length;
  const cx = 190, cy = 160, R = 100, LO = 70, HI = 130;
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const rr = (v: number) => (R * (clamp(v, LO, HI) - LO)) / (HI - LO);
  const pt = (i: number, v: number) => [cx + rr(v) * Math.cos(ang(i)), cy + rr(v) * Math.sin(ang(i))];
  const ring = (v: number) => cats.map((_, i) => pt(i, v).map((c) => c.toFixed(1)).join(",")).join(" ");
  const scored = cats.every((c) => c.ch != null);
  const shape = cats.map((c, i) => pt(i, c.ch ?? LO).map((v) => v.toFixed(1)).join(",")).join(" ");
  return (
    <svg className="td-radar" viewBox="-45 0 470 320" role="img" aria-label={`Category Championship scores: ${cats.map((c) => `${c.label} ${round(c.ch)}`).join(", ")}`}>
      {[80, 90, 110, 120, 130].map((v) => <polygon key={v} points={ring(v)} className="td-grid" />)}
      {cats.map((_, i) => {
        const [x, y] = pt(i, HI);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} className="td-grid" />;
      })}
      <polygon points={ring(100)} className="td-average" />
      {[100, 120].map((v) => <text key={v} x={cx + 5} y={cy - rr(v) - 3} className="td-tick">{v}</text>)}
      {scored && <polygon points={shape} className="td-shape" />}
      {cats.map((c, i) => {
        if (c.ch == null) return null;
        const [x, y] = pt(i, c.ch);
        return <circle key={c.key} cx={x} cy={y} r={3.5} className="td-point" />;
      })}
      {cats.map((c, i) => {
        const a = ang(i);
        const lx = cx + (R + 14) * Math.cos(a), ly = cy + (R + 14) * Math.sin(a);
        const anchor = Math.cos(a) > 0.2 ? "start" : Math.cos(a) < -0.2 ? "end" : "middle";
        const y0 = Math.sin(a) < -0.5 ? ly - 20 : Math.sin(a) > 0.5 ? ly + 12 : ly - 4;
        return (
          <g key={c.key} data-focus={i} className={`td-axis${focus !== null && focus !== i ? " is-faded" : ""}`} onClick={() => onFocus(i)}>
            <text textAnchor={anchor} className="td-axis-label">
              <tspan x={lx} y={y0}>{c.label}</tspan>
              <tspan x={lx} dy={15} className="td-axis-score">{round(c.ch)}</tspan>
            </text>
          </g>
        );
      })}
    </svg>
  );
};

const MetricBars: React.FC<{ row: TechnicalRow; colours: string[]; focus: number | null; onTip: (tip: Tip | null) => void }> = ({ row, colours, focus, onTip }) => {
  const H = 436, L = 34, R = 6, T = 60, B = 86, LO = 60, HI = 140;
  const SLOT = 58; // room per bar so a wrapped label (11px, ~10 characters a line) never meets its neighbour
  const gapG = 34, gapB = 16, CHAR = 7;
  const ph = H - T - B;
  const y = (v: number) => T + ph * (1 - (clamp(v, LO, HI) - LO) / (HI - LO));
  const groups = row.categories.map((c) => c.metrics ?? []);
  const n = groups.reduce((a, g) => a + g.length, 0);
  // A heading wider than its bars wraps to name / score; the group is then made at least as wide as the heading.
  const heads = row.categories.map((c) => {
    const oneLine = (c.label.length + 4) * CHAR;
    return { oneLine, twoLine: Math.max(c.label.length, 3) * CHAR };
  });
  const W = Math.max(760, L + R + n * SLOT + gapG * Math.max(0, groups.length - 1));
  const bw = Math.min(46, SLOT - gapB);
  const barsWidth = (k: number) => k * bw + Math.max(0, k - 1) * gapB;
  const layout = groups.map((g, i) => {
    const bars = barsWidth(g.length);
    const wrap = heads[i].oneLine > bars;
    return { wrap, width: Math.max(bars, wrap ? heads[i].twoLine : 0) };
  });
  const total = layout.reduce((a, g) => a + g.width, 0) + gapG * Math.max(0, groups.length - 1);
  let x = L + Math.max(0, (W - L - R - total) / 2);
  const parts: React.ReactNode[] = [];
  groups.forEach((metrics, i) => {
    const x0 = x, { wrap, width } = layout[i];
    let bx = x0 + (width - barsWidth(metrics.length)) / 2;
    const cls = focus !== null && focus !== i ? "is-faded" : "";
    metrics.forEach((m) => {
      if (m.ch != null) {
        const up = m.ch >= 100;
        parts.push(
          <rect key={`${m.key}-${i}-bar`} className={cls} x={bx} y={y(Math.max(m.ch, 100))} width={bw} height={Math.max(1, Math.abs(y(m.ch) - y(100)))} fill={colours[i]}
            onMouseMove={(e) => onTip({ x: e.clientX, y: e.clientY, metric: m, league: row.league })} onMouseLeave={() => onTip(null)} />,
          <text key={`${m.key}-${i}-v`} className={`td-bar-value ${cls}`} x={bx + bw / 2} y={up ? y(m.ch) - 6 : y(m.ch) + 15} textAnchor="middle">{Math.round(m.ch)}</text>,
        );
      }
      parts.push(
        <text key={`${m.key}-${i}-l`} className={`td-bar-label ${cls}`} textAnchor="middle">
          {wrapLabel(shortLabel(m.label), 10).map((line, k) => <tspan key={k} x={bx + bw / 2} y={y(LO) + 18 + k * 14}>{line}</tspan>)}
        </text>,
      );
      bx += bw + gapB;
    });
    const cat = row.categories[i];
    parts.push(
      <g key={`${cat.key}-head`} className={cls}>
        <line x1={x0} x2={x0 + width} y1={T - 22} y2={T - 22} stroke={colours[i]} strokeWidth={2} />
        {wrap ? (
          <text className="td-group-label"><tspan x={x0} y={T - 44}>{cat.label}</tspan><tspan x={x0} y={T - 29} className="td-group-score">{round(cat.ch)}</tspan></text>
        ) : (
          <text x={x0} y={T - 30} className="td-group-label">{cat.label} <tspan className="td-group-score">{round(cat.ch)}</tspan></text>
        )}
      </g>,
    );
    x = x0 + width + gapG;
  });
  return (
    <svg className="td-bars" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Metric Championship scores grouped by category">
      {[60, 80, 120, 140].map((v) => <line key={v} x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="td-grid" />)}
      {[60, 80, 100, 120, 140].map((v) => <text key={v} x={L - 8} y={y(v) + 4} textAnchor="end" className="td-tick">{v}</text>)}
      {parts}
      <line x1={L} x2={W - R} y1={y(100)} y2={y(100)} className="td-baseline" />
    </svg>
  );
};

const TechnicalDataSection: React.FC<{ playerId: string }> = ({ playerId }) => {
  const { theme } = useTheme();
  const [data, setData] = useState<TechnicalDataResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState(0);
  const [focus, setFocus] = useState<number | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setFailed(false);
    axiosInstance.get<TechnicalDataResponse>(`/players/${playerId}/technical-data`)
      .then(({ data: response }) => { if (!cancelled) { setData(response); setSelected(0); setFocus(null); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [playerId, attempt]);

  const colours = PALETTE[theme.isDark ? "dark" : "light"];
  const row = data?.available ? data.rows[selected] : undefined;
  const toggleFocus = useCallback((i: number) => setFocus((f) => (f === i ? null : i)), []);
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

  const categoryTable = (
    <table className="td-table">
      <thead><tr><th>Category</th><th>Score</th><th>Level</th></tr></thead>
      <tbody>
        {row.categories.map((c, i) => (
          <tr key={c.key} data-focus={i} tabIndex={0} className={focus !== null && focus !== i ? "is-dim" : ""}
            onClick={() => toggleFocus(i)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleFocus(i); } }}>
            <td><span className="td-swatch" style={{ background: colours[i] }} />{c.label}</td>
            <td>{round(c.ch)}</td>
            <td>{c.band_name ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="td-shell" onClick={(e) => { if (focus !== null && !(e.target as Element).closest("[data-focus], select")) setFocus(null); }}>
      <div className="td-context">
        <p>
          <b>{row.position}</b> · {row.club} ({row.league}) · {row.min == null ? "—" : row.min.toLocaleString()} minutes
          {row.min != null && row.min < SMALL_SAMPLE && <span className="td-warn"> · small sample, under {SMALL_SAMPLE} minutes</span>}
        </p>
        {options.length > 1 && (
          <label className="td-season">
            Season
            <select value={selected} onChange={(e) => { setSelected(Number(e.target.value)); setFocus(null); }}>
              {options.map((o) => <option key={o.i} value={o.i}>{o.label}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="td-body">
        <section>
          <h2>Category scores</h2>
          <p className="td-sub">Championship scale. The dashed ring is 100, the Championship average.</p>
          <CategoryRadar row={row} focus={focus} onFocus={toggleFocus} />
          <div className="td-key"><span><i className="td-key-cur" />{seasonLabel(row.season)}</span><span><i className="td-key-avg" />Championship average</span></div>
          {row.has_metrics && categoryTable}
        </section>

        <section>
          {row.has_metrics ? (
            <>
              <h2>What makes up each score</h2>
              <p className="td-sub">Each bar is a metric's Championship score. Bars above the line are better than the Championship average.</p>
              <div className="td-plot"><MetricBars row={row} colours={colours} focus={focus} onTip={setTip} /></div>
              <p className="td-foot">Metrics are per 90 unless marked. The figure beside each category name is its Championship score, the average of its metrics' scores. 100 is the Championship average for the position; 10 points is one standard deviation. Hover a bar for the real value.</p>
            </>
          ) : (
            <>
              <h2>Level by category</h2>
              <p className="td-sub">Levels use the same bands as the Data Score.</p>
              {categoryTable}
              <p className="td-foot td-pending">The metrics behind each category arrive with the next weekly data refresh.</p>
            </>
          )}
        </section>
      </div>

      {tip && (
        <div className="td-tip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 250), top: tip.y + 14 }}>
          <b>{tip.metric.label}</b>
          Championship score {round(tip.metric.ch)}
          {formatValue(tip.metric) && <><br />{formatValue(tip.metric)} in {tip.league}</>}
          {tip.metric.lower_better && <><br />Lower is better, so a low value scores high</>}
        </div>
      )}
    </div>
  );
};

export default TechnicalDataSection;
