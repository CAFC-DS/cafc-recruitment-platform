import React, { useEffect, useState } from "react";
import { OverlayTrigger, Popover } from "react-bootstrap";
import axiosInstance from "../../axiosInstance";
import { useTheme } from "../../contexts/ThemeContext";
import { getDataScoreBandStyle } from "../../utils/colorUtils";
import "./PlayerDataScore.css";

interface DataScoreRow {
  season: string;
  league: string;
  club: string;
  position: string;
  min: number | null;
  ch: number | null;
  chLo: number | null;
  chHi: number | null;
  fc: number | null;
  fcLo: number | null;
  fcHi: number | null;
  band: number | null;
  band_name: string | null;
  fc_band: number | null;
  fc_band_name: string | null;
}

interface DataScoreResponse {
  available: boolean;
  message: string | null;
  run: { run_id: string; built_at: string | null } | null;
  headline: DataScoreRow | null;
  rows: DataScoreRow[];
}

const fmt = (v: number | null) => (v == null ? "—" : String(Math.round(v)));

/** A CH score in its band colour, as the scout app draws it. */
const DataScoreBox: React.FC<{ value: number | null; band: number | null; size?: "sm" | "md" }> = ({ value, band, size = "md" }) => {
  const { theme } = useTheme();
  return (
    <span className={`data-score-box data-score-box-${size}`} style={getDataScoreBandStyle(band, theme.isDark)}>
      {fmt(value)}
    </span>
  );
};

/** The data-scoring app's CH index for the profile header (weekly, from its Railway bucket). */
const PlayerDataScore: React.FC<{ playerId: string }> = ({ playerId }) => {
  const [data, setData] = useState<DataScoreResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    axiosInstance.get<DataScoreResponse>(`/players/${playerId}/data-scores`)
      .then(({ data: response }) => { if (!cancelled) setData(response); })
      .catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [playerId]);

  const head = data?.available ? data.headline : null;
  if (!head) return null;

  const popover = (
    <Popover id="data-score-popover" className="data-score-popover">
      <Popover.Body>
        <div className="data-score-popover-note">
          CH index: 100 is the Championship benchmark. Forecast is next season in an average Championship team.
        </div>
        <table className="data-score-table">
          <thead>
            <tr><th>Season</th><th>Position</th><th>Club</th><th className="num">Min</th><th>CH</th><th>Forecast</th></tr>
          </thead>
          <tbody>
            {data!.rows.map((r, i) => (
              <tr key={i}>
                <td>{r.season}</td>
                <td>{r.position}</td>
                <td title={r.league}>{r.club}</td>
                <td className="num">{r.min ?? "—"}</td>
                <td title={r.band_name ? `${r.band_name}; 80% range ${fmt(r.chLo)}–${fmt(r.chHi)}` : undefined}>
                  <DataScoreBox value={r.ch} band={r.band} size="sm" />
                </td>
                <td title={r.fc_band_name ? `${r.fc_band_name}; likely ${fmt(r.fcLo)}–${fmt(r.fcHi)}` : undefined}>
                  <DataScoreBox value={r.fc} band={r.fc_band} size="sm" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data!.run?.built_at && <div className="data-score-popover-meta">Weekly refresh {data!.run.built_at.slice(0, 10)}</div>}
      </Popover.Body>
    </Popover>
  );

  return (
    <div className="info-row">
      <span className="info-label">Data Score</span>
      <div className="d-flex align-items-center gap-2 flex-wrap">
        <DataScoreBox value={head.ch} band={head.band} />
        <span className="data-score-band">{head.band_name ?? "No current score"}</span>
        <span className="data-score-context">
          {head.position} · {head.season}{head.min != null ? ` · ${head.min} min` : ""}
        </span>
        <OverlayTrigger placement="right" trigger={["hover", "focus"]} overlay={popover}>
          <span className="info-icon" tabIndex={0} aria-label="Data score detail">ⓘ</span>
        </OverlayTrigger>
      </div>
    </div>
  );
};

export default PlayerDataScore;
