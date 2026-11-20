import React, { useState } from "react";
import { Link } from "react-router-dom";
import { DataScoreBox } from "./PlayerDataScore";

/** The technical tab's second band: outlook, role fit, the season-by-season line and similar players, all from the
 * data-scoring app's weekly page (the same columns the scout app shows). */

export interface TechnicalScores {
  ch: number | null; ch_lo: number | null; ch_hi: number | null;
  team: number | null; team_rel: number | null;
  career: number | null; career_seasons: number | null;
  forecast: number | null; forecast_lo: number | null; forecast_hi: number | null;
}

export interface TechnicalOutlook {
  starter_championship: number | null;
  starter_premier_league: number | null;
  step_up_success: number | null;
  availability: number | null;
  availability_seasons: number | null;
}

export interface RoleFit { best: number | null; profiles: { name: string; desc: string; fit: number | null }[] }

export interface SimilarPlayer {
  impect_id: number;
  profile_id?: string | null;
  name: string | null;
  club: string;
  league: string;
  season: string;
  ch: number | null;
  categories: (number | null)[];
  distance: number;
  minutes?: number;
}

export interface SimilarBasis { seasons: string; minutes: number; ch: number | null; categories: (number | null)[] }

/** The fields of a technical row these sections read (TechnicalRow carries them all). */
export interface ExtrasRow {
  season: string;
  league: string;
  position: string;
  min: number | null;
  t: number | null;
  ch: number | null;
  categories: { key: string; label: string; ch: number | null }[];
  scores?: TechnicalScores;
  outlook?: TechnicalOutlook;
  role_fit?: RoleFit | null;
  similar?: SimilarPlayer[];
  similar_recent?: SimilarPlayer[];
  similar_recent_basis?: SimilarBasis | null;
}

const round = (v: number | null | undefined) => (v == null ? "—" : String(Math.round(v)));
const seasonLabel = (s: string) => s.split("–").map((x) => (/^\d{2}\/\d{2}$/.test(x) ? `20${x}` : x)).join("–");
const BANDS: [number, number][] = [[116, 5], [108, 4], [103, 3], [98, 2], [92, 1], [-Infinity, 0]];
const bandOf = (v: number | null | undefined) => (v == null ? null : BANDS.find(([cut]) => Math.floor(v + 0.5) >= cut)![1]);

/** "About 3 in 10" with ten pips, the scout app's way of putting a chance. */
const Chance: React.FC<{ label: string; value: number | null | undefined; note: string }> = ({ label, value, note }) => {
  const tens = value == null ? null : Math.round(value * 10);
  return (
    <div className="tx-chance">
      <div className="tx-chance-head"><span>{label}</span><b>{tens == null ? "—" : `${tens} in 10`}</b></div>
      <div className="tx-pips" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => <i key={i} className={tens != null && i < tens ? "is-on" : ""} />)}
      </div>
      <small>{note}</small>
    </div>
  );
};

export const Outlook: React.FC<{ row: ExtrasRow }> = ({ row }) => {
  const o = row.outlook, s = row.scores;
  if (!o || !s) return null;
  const teamNote = s.team_rel != null && Math.abs(s.team_rel) >= 5
    ? `His team was ${Math.abs(Math.round(s.team_rel))} points ${s.team_rel > 0 ? "stronger" : "weaker"} than the ${row.league} average; in an average team his CH index would be ${round(s.team)}.`
    : null;
  return (
    <section className="tx-card" aria-labelledby="tx-outlook">
      <h3 id="tx-outlook">Outlook</h3>
      {s.forecast != null && (
        <p className="tx-lead">
          Forecast <b>{round(s.forecast)}</b> next season in an average Championship team
          {s.forecast_lo != null && s.forecast_hi != null && <> (likely {round(s.forecast_lo)}–{round(s.forecast_hi)})</>}.
        </p>
      )}
      <Chance label="Championship starter" value={o.starter_championship} note="Similar players who joined a Championship club and played half its minutes or more." />
      <Chance label="Premier League starter" value={o.starter_premier_league} note="The same, for a Premier League club." />
      {o.step_up_success != null && (
        <Chance label="Stepping up" value={o.step_up_success} note="Similar players who moved to a stronger league, held a place and performed at its standard." />
      )}
      <dl className="tx-facts">
        {o.availability != null && (
          <><dt>Availability</dt><dd>{Math.round(o.availability * 100)}% of league minutes{o.availability_seasons ? `, last ${o.availability_seasons} season${o.availability_seasons > 1 ? "s" : ""}` : ""}</dd></>
        )}
        {teamNote && <><dt>Team context</dt><dd>{teamNote}</dd></>}
      </dl>
    </section>
  );
};

export const RoleFitCard: React.FC<{ row: ExtrasRow }> = ({ row }) => {
  const fit = row.role_fit;
  if (!fit) return null;
  const best = fit.best != null ? fit.profiles[fit.best] : null;
  return (
    <section className="tx-card" aria-labelledby="tx-fit">
      <h3 id="tx-fit">Role fit</h3>
      {best && <p className="tx-lead">Closest to a <b>{best.name.toLowerCase()}</b>: {best.desc.replace(/\.$/, "").toLowerCase()}.</p>}
      <ul className="tx-fits">
        {fit.profiles.map((p, i) => (
          <li key={p.name} className={i === fit.best ? "is-best" : ""} title={p.desc}>
            <span>{p.name}</span>
            <span className="tx-fitbar"><i style={{ width: `${Math.max(0, Math.min(100, p.fit ?? 0))}%` }} /></span>
            <b>{p.fit == null ? "—" : `${Math.round(p.fit)}%`}</b>
          </li>
        ))}
      </ul>
      <p className="tx-note">Fit is style, not quality: how closely the shape of his strengths matches each type of {row.position.toLowerCase()}. Fits within a few points of each other mean no clear type.</p>
    </section>
  );
};

/** One point per season (his most-played position that season), the forecast as a dashed step to next season, on the
 * CH scale with the band zones behind. */
export const SeasonLine: React.FC<{ rows: ExtrasRow[]; selected: ExtrasRow }> = ({ rows, selected }) => {
  const bySeason = new Map<string, ExtrasRow>();
  rows.forEach((r) => {
    if (r.ch == null) return;
    const have = bySeason.get(r.season);
    if (!have || (r.min ?? 0) > (have.min ?? 0)) bySeason.set(r.season, r);
  });
  const pts = Array.from(bySeason.values()).sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
  if (!pts.length) return null;
  const last = pts[pts.length - 1];
  const fc = last.scores?.forecast ?? null;
  // Scale fitted to his seasons (at least 85-110, always with 100 in view), in steps of 5.
  const vals = [...pts.map((p) => p.ch as number), ...(fc != null ? [fc] : [])];
  const LO = Math.floor(Math.min(85, ...vals.map((v) => v - 4)) / 5) * 5;
  const HI = Math.ceil(Math.max(110, ...vals.map((v) => v + 6)) / 5) * 5;
  const W = 520, H = 210, L = 34, R = 18, T = 24, B = 30;
  const n = pts.length + (fc != null ? 1 : 0);
  const x = (i: number) => L + (W - L - R) * (n === 1 ? 0.5 : i / (n - 1));
  const y = (v: number) => T + ((HI - Math.max(LO, Math.min(HI, v))) / (HI - LO)) * (H - T - B);
  const zones = ([[98, 103, 2], [103, 108, 3], [108, 116, 4], [116, HI, 5]] as [number, number, number][]).filter(([a]) => a < HI);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.ch as number).toFixed(1)}`).join(" ");
  return (
    <section className="tx-card" aria-labelledby="tx-history">
      <h3 id="tx-history">Season by season</h3>
      <svg className="tx-history" viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`CH index by season: ${pts.map((p) => `${p.season} ${round(p.ch)}`).join(", ")}${fc != null ? `, forecast ${round(fc)}` : ""}`}>
        {zones.map(([a, b, k]) => <rect key={k} x={L} width={W - L - R} y={y(b)} height={y(a) - y(b)} className={`tx-zone tx-zone-${k}`} />)}
        <line x1={L} x2={W - R} y1={y(100)} y2={y(100)} className="tx-hundred" />
        {Array.from({ length: Math.floor((HI - LO) / 10) + 1 }, (_, k) => Math.ceil(LO / 10) * 10 + k * 10).filter((v) => v <= HI).map((v) => (
          <text key={v} x={L - 8} y={y(v) + 4} textAnchor="end" className="tx-axis">{v}</text>
        ))}
        <path d={line} className="tx-line" />
        {fc != null && <line x1={x(pts.length - 1)} y1={y(last.ch as number)} x2={x(pts.length)} y2={y(fc)} className="tx-line is-forecast" />}
        {pts.map((p, i) => (
          <g key={p.season}>
            <circle cx={x(i)} cy={y(p.ch as number)} r={p === selected || p.season === selected.season ? 6 : 4.5} className="tx-point" />
            <text x={x(i)} y={y(p.ch as number) - 11} textAnchor="middle" className="tx-value">{round(p.ch)}</text>
            <text x={x(i)} y={H - 8} textAnchor="middle" className={`tx-axis${p.season === selected.season ? " is-current" : ""}`}>{p.season}</text>
          </g>
        ))}
        {fc != null && (
          <g>
            <circle cx={x(pts.length)} cy={y(fc)} r={5} className="tx-point is-forecast" />
            <text x={x(pts.length)} y={y(fc) - 11} textAnchor="middle" className="tx-value">{round(fc)}</text>
            <text x={x(pts.length)} y={H - 8} textAnchor="middle" className="tx-axis">Next</text>
          </g>
        )}
      </svg>
      <p className="tx-note">CH index each season at his most-played position; the dashed step is the forecast. Shading marks the average-to-elite bands; the line is 100.</p>
    </section>
  );
};

const closeness = (d: number) => (d < 2.5 ? "Very close" : d < 4 ? "Close" : "Similar");

export const SimilarPlayers: React.FC<{ row: ExtrasRow }> = ({ row }) => {
  const hasRecent = !!row.similar_recent?.length && !!row.similar_recent_basis;
  const [mode, setMode] = useState<"recent" | "season">("recent");
  const useRecent = hasRecent && mode === "recent";
  const list = (useRecent ? row.similar_recent : row.similar) ?? [];
  if (!list.length && !hasRecent) return null;
  const basis = row.similar_recent_basis;
  const mine = useRecent && basis
    ? { ch: basis.ch, cats: basis.categories, label: `${seasonLabel(basis.seasons)} · ${basis.minutes.toLocaleString()} minutes` }
    : { ch: row.ch, cats: row.categories.map((c) => c.ch), label: `${seasonLabel(row.season)} · ${row.league}` };
  return (
    <section className="tx-similar" aria-labelledby="tx-similar">
      <div className="tx-similar-head">
        <h3 id="tx-similar">Similar players</h3>
        {hasRecent && (
          <div className="tx-seg" role="group" aria-label="Compare over">
            <button type="button" aria-pressed={mode === "recent"} onClick={() => setMode("recent")}>Last 3 seasons</button>
            <button type="button" aria-pressed={mode === "season"} onClick={() => setMode("season")}>This season</button>
          </div>
        )}
        <p className="tx-note">
          {useRecent
            ? "Current players at the position whose category scores over their last three seasons, weighted by minutes, are closest to his: the same type of player at a similar level."
            : `Current players whose latest season is closest to his ${seasonLabel(row.season)} season: a match on current form.`}
        </p>
      </div>
      <div className="tx-table-wrap">
        <table className="tx-table">
          <thead>
            <tr>
              <th>Player</th>
              <th className="num">CH index</th>
              {row.categories.map((c) => <th key={c.key} className="num">{c.label}</th>)}
              <th>Match</th>
            </tr>
          </thead>
          <tbody>
            <tr className="tx-self">
              <td><b>This player</b><small>{mine.label}</small></td>
              <td className="num"><DataScoreBox value={mine.ch} band={bandOf(mine.ch)} size="sm" /></td>
              {row.categories.map((c, i) => <td key={c.key} className="num">{round(mine.cats[i])}</td>)}
              <td />
            </tr>
            {list.map((p) => (
              <tr key={p.impect_id}>
                <td>
                  {p.profile_id ? <Link to={`/player/${p.profile_id}?tab=technical`}>{p.name ?? "Unnamed player"}</Link> : <b>{p.name ?? "Unnamed player"}</b>}
                  <small>{p.club} · {p.league} · {seasonLabel(p.season)}</small>
                </td>
                <td className="num"><DataScoreBox value={p.ch} band={bandOf(p.ch)} size="sm" /></td>
                {row.categories.map((c, i) => {
                  const theirs = p.categories[i] ?? null;
                  const own = mine.cats[i] ?? null;
                  const diff = theirs != null && own != null ? Math.round(theirs - own) : null;
                  return (
                    <td key={c.key} className="num">
                      {round(theirs)}
                      <span className={`tx-diff${diff != null && diff < 0 ? " is-below" : ""}`}>{diff == null || diff === 0 ? "" : `${diff > 0 ? "+" : "−"}${Math.abs(diff)}`}</span>
                    </td>
                  );
                })}
                <td><span className={`tx-match tx-match-${p.distance < 2.5 ? "very" : p.distance < 4 ? "close" : "similar"}`}>{closeness(p.distance)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

const TechnicalDataExtras: React.FC<{ rows: ExtrasRow[]; row: ExtrasRow }> = ({ rows, row }) => {
  const hasCards = !!(row.outlook && row.scores) || !!row.role_fit || rows.some((r) => r.ch != null);
  return (
    <>
      {hasCards && (
        <div className="tx-band">
          <Outlook row={row} />
          <RoleFitCard row={row} />
          <SeasonLine rows={rows} selected={row} />
        </div>
      )}
      <SimilarPlayers row={row} />
    </>
  );
};

export default TechnicalDataExtras;
