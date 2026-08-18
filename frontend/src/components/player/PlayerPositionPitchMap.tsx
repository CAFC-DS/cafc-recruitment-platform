import React, { useEffect, useMemo, useState } from "react";
import { Form, Spinner } from "react-bootstrap";
import axiosInstance from "../../axiosInstance";
import "./PlayerPositionPitchMap.css";

interface PositionHistoryResponse {
  available: boolean;
  message: string | null;
  filters: {
    competition?: string;
    season?: string;
    available?: Array<{ competition: string; season: string }>;
  };
  positions: Array<{ position: string; match_count: number; minutes: number; share_pct: number }>;
}

const coordinates: Record<string, { x: number; y: number }> = {
  GOALKEEPER: { x: 50, y: 128 },
  CENTRAL_DEFENDER: { x: 50, y: 111 },
  LEFT_WINGBACK_DEFENDER: { x: 19, y: 102 },
  RIGHT_WINGBACK_DEFENDER: { x: 81, y: 102 },
  DEFENSE_MIDFIELD: { x: 50, y: 88 },
  CENTRAL_MIDFIELD: { x: 50, y: 69 },
  ATTACKING_MIDFIELD: { x: 50, y: 48 },
  LEFT_WINGER: { x: 20, y: 38 },
  RIGHT_WINGER: { x: 80, y: 38 },
  CENTER_FORWARD: { x: 50, y: 17 },
};

const shortLabels: Record<string, string> = {
  GOALKEEPER: "GK", CENTRAL_DEFENDER: "CB", LEFT_WINGBACK_DEFENDER: "LWB",
  RIGHT_WINGBACK_DEFENDER: "RWB", DEFENSE_MIDFIELD: "DM", CENTRAL_MIDFIELD: "CM",
  ATTACKING_MIDFIELD: "AM", LEFT_WINGER: "LW", RIGHT_WINGER: "RW", CENTER_FORWARD: "CF",
};

const PlayerPositionPitchMap: React.FC<{ playerId: string }> = ({ playerId }) => {
  const [data, setData] = useState<PositionHistoryResponse | null>(null);
  const [competition, setCompetition] = useState("");
  const [season, setSeason] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (competition) params.set("competition", competition);
    if (season) params.set("season", season);
    setLoading(true);
    axiosInstance.get<PositionHistoryResponse>(`/players/${playerId}/position-history?${params}`)
      .then(({ data: response }) => {
        if (cancelled) return;
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

  if (!loading && (!data?.available || !data.positions.length)) return null;

  return (
    <aside className="header-position-map" aria-label="Positions played">
      <div className="header-position-map-title"><span>Positions played</span>{loading && <Spinner animation="border" size="sm" />}</div>
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
          </defs>
          <rect x="0" y="0" width="100" height="140" rx="3" fill="url(#position-pitch-grass)" />
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
          {(data?.positions || []).map((item) => {
            const point = coordinates[item.position];
            if (!point) return null;
            const radius = 5.5 + Math.min(3.5, item.share_pct / 25);
            return <g key={item.position} className="pitch-position-marker">
              <circle cx={point.x} cy={point.y} r={radius + 1.8} className="pitch-marker-halo" />
              <circle cx={point.x} cy={point.y} r={radius} className="pitch-marker-dot" />
              <text x={point.x} y={point.y + 1.35}>{shortLabels[item.position] || "•"}</text>
              <title>{`${shortLabels[item.position] || item.position}: ${item.share_pct}% · ${item.minutes} minutes`}</title>
            </g>;
          })}
        </svg>
        <div className="header-position-map-legend">
          {(data?.positions || []).slice(0, 5).map((item) => <div key={item.position} title={`${item.match_count} matches · ${item.minutes} minutes`}><span>{shortLabels[item.position] || item.position}</span><b>{item.share_pct}%</b></div>)}
        </div>
      </div>
    </aside>
  );
};

export default PlayerPositionPitchMap;
