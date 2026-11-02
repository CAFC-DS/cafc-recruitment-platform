import React, { useEffect, useMemo, useRef, useState } from "react";
import { Form, Spinner } from "react-bootstrap";
import axiosInstance from "../../axiosInstance";
import "./PlayerPositionPitchMap.css";

type PositionSide = "CENTRE_LEFT" | "CENTRE" | "CENTRE_RIGHT" | null;

interface PositionEntry {
  position: string;
  side: PositionSide;
  match_count: number;
  starts: number;
  minutes: number;
  share_pct: number;
}

interface PositionHistoryResponse {
  available: boolean;
  message: string | null;
  filters: {
    competition?: string;
    season?: string;
    available?: Array<{ competition: string; season: string }>;
  };
  positions: PositionEntry[];
  minutes_source?: "lineups" | "mixed" | "estimated";
  heatmap?: {
    across_bins: number;
    along_bins: number;
    total: number;
    cells: Array<{ across: number; along: number; count: number }>;
  } | null;
}

// SVG pitch is 100 x 140 with the player's team attacking upwards, so the
// player's left is on the left of the image.
const coordinates: Record<string, { x: number; y: number }> = {
  GOALKEEPER: { x: 50, y: 128 },
  "CENTRAL_DEFENDER:CENTRE_LEFT": { x: 35, y: 111 },
  "CENTRAL_DEFENDER:CENTRE": { x: 50, y: 111 },
  "CENTRAL_DEFENDER:CENTRE_RIGHT": { x: 65, y: 111 },
  LEFT_WINGBACK_DEFENDER: { x: 15, y: 102 },
  RIGHT_WINGBACK_DEFENDER: { x: 85, y: 102 },
  "DEFENSE_MIDFIELD:CENTRE_LEFT": { x: 37, y: 89 },
  "DEFENSE_MIDFIELD:CENTRE": { x: 50, y: 89 },
  "DEFENSE_MIDFIELD:CENTRE_RIGHT": { x: 63, y: 89 },
  "CENTRAL_MIDFIELD:CENTRE_LEFT": { x: 33, y: 69 },
  "CENTRAL_MIDFIELD:CENTRE": { x: 50, y: 69 },
  "CENTRAL_MIDFIELD:CENTRE_RIGHT": { x: 67, y: 69 },
  "ATTACKING_MIDFIELD:CENTRE_LEFT": { x: 35, y: 48 },
  "ATTACKING_MIDFIELD:CENTRE": { x: 50, y: 48 },
  "ATTACKING_MIDFIELD:CENTRE_RIGHT": { x: 65, y: 48 },
  LEFT_WINGER: { x: 17, y: 38 },
  RIGHT_WINGER: { x: 83, y: 38 },
  "CENTER_FORWARD:CENTRE_LEFT": { x: 39, y: 18 },
  "CENTER_FORWARD:CENTRE": { x: 50, y: 17 },
  "CENTER_FORWARD:CENTRE_RIGHT": { x: 61, y: 18 },
};

const baseLabels: Record<string, string> = {
  GOALKEEPER: "GK", CENTRAL_DEFENDER: "CB", LEFT_WINGBACK_DEFENDER: "LWB",
  RIGHT_WINGBACK_DEFENDER: "RWB", DEFENSE_MIDFIELD: "DM", CENTRAL_MIDFIELD: "CM",
  ATTACKING_MIDFIELD: "AM", LEFT_WINGER: "LW", RIGHT_WINGER: "RW", CENTER_FORWARD: "CF",
};

const slotKey = (item: PositionEntry) => (item.side ? `${item.position}:${item.side}` : item.position);

const slotLabel = (item: PositionEntry) => {
  const base = baseLabels[item.position] || item.position;
  if (item.side === "CENTRE_LEFT") return `L${base}`;
  if (item.side === "CENTRE_RIGHT") return `R${base}`;
  return base;
};

const slotTooltip = (item: PositionEntry) => {
  const subs = item.match_count - item.starts;
  return `${slotLabel(item)}: ${item.share_pct}% · ${item.minutes} min · ${item.match_count} apps (${item.starts} starts${subs ? `, ${subs} from bench` : ""})`;
};

// Heat ramp: pale yellow (few touches) to deep red (most touches).
const heatColour = (intensity: number) => {
  const from = [253, 224, 71];
  const to = [220, 38, 38];
  const mix = from.map((channel, index) => Math.round(channel + (to[index] - channel) * intensity));
  return `rgb(${mix.join(",")})`;
};

type MapView = "positions" | "heatmap";

const PlayerPositionPitchMap: React.FC<{ playerId: string }> = ({ playerId }) => {
  const [data, setData] = useState<PositionHistoryResponse | null>(null);
  const [competition, setCompetition] = useState("");
  const [season, setSeason] = useState("");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<MapView>("positions");

  const resolvedRequest = useRef("");

  useEffect(() => {
    const requestKey = JSON.stringify([playerId, competition, season]);
    if (resolvedRequest.current === requestKey) return;
    resolvedRequest.current = "";
    let cancelled = false;
    const params = new URLSearchParams();
    if (competition) params.set("competition", competition);
    if (season) params.set("season", season);
    setLoading(true);
    axiosInstance.get<PositionHistoryResponse>(`/players/${playerId}/position-history?${params}`)
      .then(({ data: response }) => {
        if (cancelled) return;
        setLoading(false);
        // Reflect server-selected defaults without issuing the same query twice.
        resolvedRequest.current = JSON.stringify([playerId, response.filters.competition || "", response.filters.season || ""]);
        setData(response);
        setCompetition(response.filters.competition || "");
        setSeason(response.filters.season || "");
      })
      .catch(() => !cancelled && setData(null))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [playerId, competition, season]);

  const competitions = useMemo(() => Array.from(new Set((data?.filters.available || []).map((item) => item.competition))), [data]);
  const seasons = useMemo(() => (data?.filters.available || []).filter((item) => item.competition === competition).map((item) => item.season), [data, competition]);

  const heatCells = useMemo(() => {
    const heatmap = data?.heatmap;
    if (!heatmap?.cells.length) return [];
    const max = Math.max(...heatmap.cells.map((cell) => cell.count));
    const cellWidth = 96 / heatmap.across_bins;
    const cellHeight = 136 / heatmap.along_bins;
    return heatmap.cells.map((cell) => {
      const intensity = Math.pow(cell.count / max, 0.65);
      // Fade out the faintest cells so the grass shows through away from hot zones.
      const visibility = Math.max(0, (intensity - 0.2) / 0.8);
      return {
        key: `${cell.across}-${cell.along}`,
        // across bin 0 is the player's right touchline; along bin 0 is their own goal line.
        x: 2 + (heatmap.across_bins - 1 - cell.across) * cellWidth,
        y: 2 + (heatmap.along_bins - 1 - cell.along) * cellHeight,
        width: cellWidth,
        height: cellHeight,
        fill: heatColour(intensity),
        opacity: visibility * 0.9,
      };
    });
  }, [data]);

  if (!loading && (!data?.available || !data.positions.length)) return null;

  const showHeatmap = view === "heatmap" && heatCells.length > 0;

  return (
    <aside className="header-position-map" aria-label="Positions played">
      <div className="header-position-map-title">
        <span>{showHeatmap ? "Touch heatmap" : "Positions played"}</span>
        <div className="header-position-map-title-actions">
          {loading && <Spinner animation="border" size="sm" />}
          {heatCells.length > 0 && (
            <div className="header-position-map-toggle" role="group" aria-label="Pitch map view">
              <button type="button" className={view === "positions" ? "active" : ""} aria-pressed={view === "positions"} onClick={() => setView("positions")}>Positions</button>
              <button type="button" className={view === "heatmap" ? "active" : ""} aria-pressed={view === "heatmap"} onClick={() => setView("heatmap")}>Heatmap</button>
            </div>
          )}
        </div>
      </div>
      <div className="header-position-map-filters">
        <Form.Select aria-label="Position map competition" value={competition} onChange={(event) => { setCompetition(event.target.value); setSeason(""); }} disabled={loading}>
          {competitions.map((value) => <option key={value}>{value}</option>)}
        </Form.Select>
        <Form.Select aria-label="Position map season" value={season} onChange={(event) => setSeason(event.target.value)} disabled={loading}>
          {seasons.map((value) => <option key={value}>{value}</option>)}
        </Form.Select>
      </div>
      <div className="header-position-map-body">
        <svg viewBox="0 0 100 140" role="img" aria-label={`Pitch map for ${competition} ${season}`}>
          <defs>
            <linearGradient id="position-pitch-grass" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" className="pitch-grass-a" />
              <stop offset="25%" className="pitch-grass-b" />
              <stop offset="50%" className="pitch-grass-a" />
              <stop offset="75%" className="pitch-grass-b" />
              <stop offset="100%" className="pitch-grass-a" />
            </linearGradient>
            <clipPath id="position-pitch-clip"><rect x="2" y="2" width="96" height="136" /></clipPath>
            <filter id="position-pitch-heat-blur" x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation="3.2" />
            </filter>
          </defs>
          <rect x="0" y="0" width="100" height="140" rx="3" fill="url(#position-pitch-grass)" />
          {showHeatmap && (
            <g clipPath="url(#position-pitch-clip)">
              <g filter="url(#position-pitch-heat-blur)">
                {heatCells.map((cell) => (
                  <rect key={cell.key} x={cell.x} y={cell.y} width={cell.width} height={cell.height} fill={cell.fill} opacity={cell.opacity} />
                ))}
              </g>
            </g>
          )}
          <rect x="2" y="2" width="96" height="136" rx="1" className="pitch-line" />
          <line x1="2" y1="70" x2="98" y2="70" className="pitch-line" />
          <circle cx="50" cy="70" r="12" className="pitch-line" />
          <circle cx="50" cy="70" r=".8" className="pitch-line-fill" />
          <rect x="25" y="2" width="50" height="21" className="pitch-line" />
          <rect x="37" y="2" width="26" height="10" className="pitch-line" />
          <rect x="25" y="117" width="50" height="21" className="pitch-line" />
          <rect x="37" y="128" width="26" height="10" className="pitch-line" />
          <path d="M42 23 A12 12 0 0 0 58 23" className="pitch-line" />
          <path d="M42 117 A12 12 0 0 1 58 117" className="pitch-line" />
          <circle cx="50" cy="16" r=".8" className="pitch-line-fill" />
          <circle cx="50" cy="124" r=".8" className="pitch-line-fill" />
          <rect x="43" y="0" width="14" height="2" className="pitch-goal" />
          <rect x="43" y="138" width="14" height="2" className="pitch-goal" />
          {!showHeatmap && (data?.positions || []).map((item) => {
            const point = coordinates[slotKey(item)];
            if (!point) return null;
            const radius = 5 + Math.min(3.5, item.share_pct / 25);
            return <g key={slotKey(item)} className="pitch-position-marker">
              <circle cx={point.x} cy={point.y} r={radius + 1.6} className="pitch-marker-halo" />
              <circle cx={point.x} cy={point.y} r={radius} className="pitch-marker-dot" />
              <text x={point.x} y={point.y + 1.35} className={slotLabel(item).length > 2 ? "pitch-marker-label-long" : undefined}>{slotLabel(item)}</text>
              <title>{slotTooltip(item)}</title>
            </g>;
          })}
        </svg>
        <div className="header-position-map-legend">
          {(data?.positions || []).slice(0, 5).map((item) => <div key={slotKey(item)} title={slotTooltip(item)}><span>{slotLabel(item)}</span><b>{item.share_pct}%</b></div>)}
        </div>
      </div>
      {(showHeatmap || (data?.minutes_source && data.minutes_source !== "lineups")) && (
        <div className="header-position-map-note">
          {showHeatmap
            ? `${data?.heatmap?.total.toLocaleString()} on-ball actions · attacking upwards`
            : "Minutes partly estimated from event data where lineups are missing"}
        </div>
      )}
    </aside>
  );
};

export default PlayerPositionPitchMap;
