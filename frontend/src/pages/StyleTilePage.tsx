import React from "react";
import { Table, Button } from "react-bootstrap";
import { UserRound, Eye, Flag, MapPin, Video } from "lucide-react";
import DarkModeToggle from "../components/DarkModeToggle";
import GradeChip from "../components/GradeChip";
import "./StyleTilePage.css";

/**
 * Phase 0 proof-of-concept for the design system refresh. Not part of the
 * production nav -- exists purely so the new tokens/fonts/GradeChip can be
 * reviewed against real layouts before Phase 1 fans them out. Static mock
 * data only, no backend calls.
 *
 * Field shapes below are modelled on the real components they stand in for,
 * not invented: the shortlist card mirrors components/Kanban/PlayerKanbanCard.tsx
 * (player_name, squad_name, age, report_count, avg_performance_score.toFixed(1)),
 * and the report table mirrors pages/ScoutingPage.tsx's <Table> (Report Date,
 * Player, Age, Position, Fixture Date, Fixture, Scout, Type, Score, Actions).
 *
 * The real Type column (getReportTypeBadge + getScoutingTypeBadge in
 * ScoutingPage.tsx) is icon-driven, not text: "Player Assessment" renders no
 * report-type badge at all, "Flag" renders a flag icon (was a raw emoji),
 * and every row separately shows a live/video scouting-method icon (was
 * 🏟️/💻 emoji). Reproduced here with lucide icons instead of the emoji.
 */

const shortlistPlayers = [
  { name: "Jordan Whitfield", squadName: "Leyton Orient", age: 22, reportCount: 5, avgScore: 7.6 },
  { name: "Tunde Okonkwo", squadName: "Barnet", age: 20, reportCount: 3, avgScore: 6.3 },
];

// Dates formatted with toLocaleDateString("en-GB") -- matches the existing
// convention used throughout the app (PlayerReportModal.tsx, IntelReportModal.tsx,
// etc.), giving dd/mm/yyyy.
const mockReports = [
  { reportDate: new Date("2026-07-12"), player: "J. Whitfield", age: 22, position: "CB", fixtureDate: new Date("2026-07-10"), fixture: "Leyton Orient vs Barnet", scout: "M. Adeyemi", type: "Player Assessment", scoutingType: "Live", score: 8, isPotential: false },
  { reportDate: new Date("2026-07-10"), player: "T. Okonkwo", age: 20, position: "RW", fixtureDate: new Date("2026-07-09"), fixture: "Barnet vs Notts County", scout: "S. Bishop", type: "Player Assessment", scoutingType: "Video", score: 8, isPotential: true },
  { reportDate: new Date("2026-07-08"), player: "A. Marchetti", age: 24, position: "GK", fixtureDate: new Date("2026-07-06"), fixture: "Notts County vs Halifax Town", scout: "M. Adeyemi", type: "Player Assessment", scoutingType: "Live", score: 9, isPotential: false },
  { reportDate: new Date("2026-07-05"), player: "D. Larsson", age: 19, position: "CM", fixtureDate: new Date("2026-07-04"), fixture: "Halifax Town vs Boreham Wood", scout: "R. Fenwick", type: "Flag", scoutingType: "Live", score: 3, isPotential: false },
  { reportDate: new Date("2026-07-02"), player: "K. Osei", age: 18, position: "LB", fixtureDate: new Date("2026-06-30"), fixture: "Boreham Wood vs Dagenham & Red.", scout: "S. Bishop", type: "Player Assessment", scoutingType: "Video", score: 10, isPotential: true },
];

const TypeCell: React.FC<{ type: string; scoutingType: string }> = ({ type, scoutingType }) => (
  <div className="style-tile-type-icons">
    {type === "Flag" && <Flag size={15} aria-label="Flag" />}
    {scoutingType === "Live" ? (
      <MapPin size={15} aria-label="Live" />
    ) : (
      <Video size={15} aria-label="Video" />
    )}
  </div>
);

const StyleTilePage: React.FC = () => {
  return (
    <div className="style-tile-page">
      <header className="style-tile-header">
        <div>
          <div className="style-tile-eyebrow">Design system &mdash; Phase 0</div>
          <h1 className="style-tile-title">Style tile</h1>
        </div>
        <DarkModeToggle />
      </header>

      <section className="style-tile-section style-tile-section-wide">
        <h2 className="style-tile-section-title">Shortlist</h2>
        <div className="player-card-grid">
          {shortlistPlayers.map((p) => (
            <div className="player-card" key={p.name}>
              <div className="player-card-avatar">
                <UserRound size={26} />
              </div>
              <div className="player-card-body">
                <div className="player-card-name">{p.name}</div>
                <div className="player-card-meta">{p.squadName}</div>
                <div className="player-card-meta">Age: {p.age}</div>
                <div className="player-card-meta">Reports: {p.reportCount}</div>
              </div>
              <div className="player-card-scores">
                <div className="player-card-score-block">
                  <span className="player-card-score-label">Score</span>
                  <GradeChip score={p.avgScore} decimals={1} size="md" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="style-tile-section style-tile-section-wide">
        <h2 className="style-tile-section-title">Recent reports</h2>
        <div className="style-tile-table-wrap">
          <Table className="style-tile-table" borderless responsive>
            <thead>
              <tr>
                <th>Report Date</th>
                <th>Player</th>
                <th>Age</th>
                <th>Position</th>
                <th>Fixture Date</th>
                <th>Fixture</th>
                <th>Scout</th>
                <th>Type</th>
                <th>Score</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {mockReports.map((r) => (
                <tr key={`${r.player}-${r.reportDate.toISOString()}`}>
                  <td className="font-mono-tabular">{r.reportDate.toLocaleDateString("en-GB")}</td>
                  <td>{r.player}</td>
                  <td>{r.age}</td>
                  <td>{r.position}</td>
                  <td className="font-mono-tabular">{r.fixtureDate.toLocaleDateString("en-GB")}</td>
                  <td>{r.fixture}</td>
                  <td>{r.scout}</td>
                  <td>
                    <TypeCell type={r.type} scoutingType={r.scoutingType} />
                  </td>
                  <td>
                    <GradeChip score={r.score} isPotential={r.isPotential} size="sm" />
                  </td>
                  <td>
                    <Button size="sm" variant="outline-secondary" title="View report">
                      <Eye size={14} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </section>
    </div>
  );
};

export default StyleTilePage;
