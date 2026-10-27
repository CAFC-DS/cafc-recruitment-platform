import React, { useState } from "react";
import { Button, ButtonGroup } from "react-bootstrap";
import boundaries from "./countries.json";
import { COLORS, Country, number, STAGES } from "./types";
const aliases: Record<string, string> = {
  "United States": "United States of America",
  USA: "United States of America",
  "Czech Republic": "Czechia",
  "Republic of Ireland": "Ireland",
  Türkiye: "Turkey",
  "South Korea": "South Korea",
  "Russian Federation": "Russia",
  Serbia: "Republic of Serbia",
  "Hong Kong": "Hong Kong S.A.R.",
};
/** Home nations and states too small for an outline in the boundary file. */
const points: Record<string, [number, number]> = {
  England: [-1.5, 52.5],
  Scotland: [-4, 57],
  Wales: [-3.7, 52.2],
  "Northern Ireland": [-6.5, 54.7],
  Malta: [14.4, 35.9],
  Andorra: [1.6, 42.5],
  Gibraltar: [-5.35, 36.14],
  "San Marino": [12.46, 43.94],
  "Faroe Islands": [-6.9, 62],
  Singapore: [103.8, 1.35],
  Bahrain: [50.55, 26.07],
};
const LIST_LIMIT = 12;
export default function PlayerMap({
  countries,
  onSelect,
}: {
  countries: Country[];
  /** stages is null when the map shows covered players rather than the shortlist. */
  onSelect: (name: string, stages: string[] | null) => void;
}) {
  const [region, setRegion] = useState("europe");
  const [show, setShow] = useState<"covered" | "shortlist">("covered");
  const [stages, setStages] = useState(STAGES.slice(2));
  const [showAll, setShowAll] = useState(false);
  const covered = show === "covered";
  const pick = (name: string) => onSelect(name, covered ? null : stages);
  const located = countries.map((c) => {
    const boundary = boundaries.find(
      (b) => b.name === (aliases[c.name] || c.name),
    );
    const coords =
      points[c.name] || (boundary ? [boundary.lon, boundary.lat] : null);
    return {
      ...c,
      coords,
      count: covered
        ? c.covered
        : stages.reduce((s, stage) => s + (c.stages[stage] || 0), 0),
    };
  });
  const missing = located
    .filter((c) => !c.coords)
    .reduce((s, c) => s + c.count, 0);
  const total = located.reduce((s, c) => s + c.count, 0);
  const listed = located
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);
  return (
    <>
      <div className="ra-map-tools">
        <ButtonGroup size="sm" aria-label="Players shown">
          <Button
            variant={covered ? "dark" : "outline-secondary"}
            aria-pressed={covered}
            onClick={() => setShow("covered")}
          >
            Covered players
          </Button>
          <Button
            variant={!covered ? "dark" : "outline-secondary"}
            aria-pressed={!covered}
            onClick={() => setShow("shortlist")}
          >
            Shortlist (Stages 3–5)
          </Button>
        </ButtonGroup>
        <fieldset hidden={covered}>
          <legend className="visually-hidden">Map stages</legend>
          {STAGES.slice(2).map((s) => (
            <label key={s}>
              <input
                type="checkbox"
                checked={stages.includes(s)}
                onChange={() =>
                  setStages((v) =>
                    v.includes(s) ? v.filter((x) => x !== s) : [...v, s],
                  )
                }
              />
              <span className="ra-dot" style={{ background: COLORS[s] }} />
              {s}
            </label>
          ))}
        </fieldset>
        <label>
          Map area{" "}
          <select value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="europe">Europe</option>
            <option value="world">World</option>
          </select>
        </label>
      </div>
      <div className="ra-map-frame">
        <svg
          viewBox={region === "europe" ? "492 60 240 130" : "0 0 1080 540"}
          role="group"
          aria-label={`${covered ? "Covered players" : "Shortlisted players"} by playing country. Country markers are approximate country centres, not club coordinates.`}
        >
          <rect
            x="0"
            y="0"
            width="1080"
            height="540"
            fill="var(--ra-map-water)"
          />
          {boundaries.map((b) => (
            <path
              key={b.name}
              aria-hidden="true"
              d={b.path}
              fill="var(--ra-map-land)"
              stroke="var(--ra-map-border)"
              strokeWidth="0.3"
            >
              <title>{b.name}</title>
            </path>
          ))}
          {located
            .filter((c) => c.coords && c.count > 0)
            .sort((a, b) => b.count - a.count)
            .map((c) => {
              const [lon, lat] = c.coords!;
              const x = (lon + 180) * 3,
                y = (90 - lat) * 3;
              const r =
                region === "europe"
                  ? Math.min(4.5, 1.6 + Math.sqrt(c.count) * 0.32)
                  : Math.min(13, 4 + Math.sqrt(c.count));
              const dominant = [...stages].sort(
                (a, b) => (c.stages[b] || 0) - (c.stages[a] || 0),
              )[0];
              return (
                <g
                  key={c.name}
                  role="button"
                  tabIndex={0}
                  onClick={() => pick(c.name)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      pick(c.name);
                    }
                  }}
                  aria-label={`${c.name}: ${number(c.count)} players. View players.`}
                  className="ra-map-marker"
                >
                  <title>
                    {c.name}: {c.count} players
                    {covered
                      ? ` covered of ${c.total} known`
                      : ` · ${stages.map((s) => `${s}: ${c.stages[s] || 0}`).join(" · ")}`}
                  </title>
                  <circle
                    cx={x}
                    cy={y}
                    r={r}
                    fill={covered ? "var(--ra-accent)" : COLORS[dominant]}
                    stroke="white"
                    strokeWidth={region === "europe" ? 0.5 : 1}
                  />
                  <text
                    x={x}
                    y={y}
                    dominantBaseline="central"
                    textAnchor="middle"
                    fill="white"
                    fontSize={region === "europe" ? 2.5 : 8}
                    fontWeight="700"
                  >
                    {c.count}
                  </text>
                </g>
              );
            })}
        </svg>
      </div>
      <p className="ra-note">
        {number(total)} players
        {missing ? ` · ${number(missing)} without a known playing country` : ""}
      </p>
      {!total && (
        <p className="ra-empty">
          {covered
            ? "No covered players for these dates and filters."
            : "No players in the selected stages and filters."}
        </p>
      )}
      <div className="ra-map-country-list" aria-label="Countries on the map">
        {listed.slice(0, showAll ? undefined : LIST_LIMIT).map((c) => (
          <button key={c.name} onClick={() => pick(c.name)}>
            <span>{c.name}</span>
            <strong>{number(c.count)}</strong>
            <small>
              {covered
                ? `of ${number(c.total)} known`
                : stages
                    .map(
                      (s) => `${s.replace("Stage ", "S")}: ${c.stages[s] || 0}`,
                    )
                    .join(" · ")}
            </small>
          </button>
        ))}
      </div>
      {listed.length > LIST_LIMIT && (
        <button
          type="button"
          className="ra-text-action ra-map-more"
          onClick={() => setShowAll(!showAll)}
          aria-expanded={showAll}
        >
          {showAll
            ? "Show fewer countries"
            : `Show all ${listed.length} countries`}
        </button>
      )}
      <p className="ra-attribution">
        Boundaries:{" "}
        <a
          href="https://github.com/datasets/geo-countries"
          target="_blank"
          rel="noreferrer"
        >
          Natural Earth / geo-countries
        </a>
        .
      </p>
    </>
  );
}
