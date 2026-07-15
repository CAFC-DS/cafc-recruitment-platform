import React from "react";
import { Table } from "react-bootstrap";
import { UserRound } from "lucide-react";
import DarkModeToggle from "../components/DarkModeToggle";
import GradeChip from "../components/GradeChip";
import { getFlagColor } from "../utils/colorUtils";
import "./StyleTilePage.css";

/**
 * Phase 0 proof-of-concept for the design system refresh. Not part of the
 * production nav -- exists purely so the new tokens/fonts/GradeChip can be
 * reviewed against real layouts before Phase 1 fans them out. Static mock
 * data only, no backend calls.
 */

const players = [
  { name: "Jordan Whitfield", position: "Centre-back", age: 22, club: "Leyton Orient", overall: 8, potential: 9, flag: "positive" },
  { name: "Tunde Okonkwo", position: "Right-winger", age: 20, club: "Barnet", overall: 6, potential: 8, flag: "neutral" },
];

const mockReports = [
  { player: "J. Whitfield", position: "CB", club: "Leyton Orient", scout: "M. Adeyemi", score: 8, date: "12 Jul" },
  { player: "T. Okonkwo", position: "RW", club: "Barnet", scout: "S. Bishop", score: 6, date: "10 Jul" },
  { player: "A. Marchetti", position: "GK", club: "Notts County", scout: "M. Adeyemi", score: 9, date: "08 Jul" },
  { player: "D. Larsson", position: "CM", club: "Halifax Town", scout: "R. Fenwick", score: 3, date: "05 Jul" },
  { player: "K. Osei", position: "LB", club: "Boreham Wood", scout: "S. Bishop", score: 10, date: "02 Jul" },
  { player: "R. Coetzee", position: "CB", club: "Dagenham & Red.", scout: "R. Fenwick", score: 5, date: "30 Jun" },
  { player: "M. Delacroix", position: "ST", club: "Ebbsfleet Utd", scout: "M. Adeyemi", score: 7, date: "27 Jun" },
  { player: "H. Ibrahimovic", position: "CM", club: "Chelmsford City", scout: "S. Bishop", score: 4, date: "24 Jun" },
];

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
          {players.map((p) => (
            <div className="player-card" key={p.name}>
              <div className="player-card-avatar">
                <UserRound size={26} />
              </div>
              <div className="player-card-body">
                <div className="player-card-name">
                  {p.name}
                  <span
                    className="player-card-flag"
                    style={{ backgroundColor: getFlagColor(p.flag) }}
                    title={`Flag: ${p.flag}`}
                  />
                </div>
                <div className="player-card-meta">
                  {p.position} &middot; {p.age} &middot; {p.club}
                </div>
              </div>
              <div className="player-card-scores">
                <div className="player-card-score-block">
                  <span className="player-card-score-label">Overall</span>
                  <GradeChip score={p.overall} size="md" />
                </div>
                <div className="player-card-score-block">
                  <span className="player-card-score-label">Potential</span>
                  <GradeChip score={p.potential} size="md" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="style-tile-section style-tile-section-wide">
        <h2 className="style-tile-section-title">Recent reports</h2>
        <div className="style-tile-table-wrap">
          <Table className="style-tile-table" borderless>
            <thead>
              <tr>
                <th>Player</th>
                <th>Position</th>
                <th>Club</th>
                <th>Scout</th>
                <th>Score</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {mockReports.map((r) => (
                <tr key={r.player}>
                  <td>{r.player}</td>
                  <td>{r.position}</td>
                  <td>{r.club}</td>
                  <td>{r.scout}</td>
                  <td>
                    <GradeChip score={r.score} size="sm" />
                  </td>
                  <td className="font-mono-tabular">{r.date}</td>
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
