import React from "react";
import { Table } from "react-bootstrap";
import { UserRound, ShieldHalf } from "lucide-react";
import DarkModeToggle from "../components/DarkModeToggle";
import GradeChip from "../components/GradeChip";
import "./StyleTilePage.css";

/**
 * Phase 0 proof-of-concept for the design system refresh. Not part of the
 * production nav -- exists purely so the new tokens/fonts/GradeChip can be
 * reviewed against real layouts before Phase 1 fans them out. Static mock
 * data only, no backend calls.
 */

const mockReports = [
  { player: "J. Whitfield", position: "CB", scout: "M. Adeyemi", score: 8, date: "12 Jul" },
  { player: "T. Okonkwo", position: "RW", scout: "S. Bishop", score: 6, date: "10 Jul" },
  { player: "A. Marchetti", position: "GK", scout: "M. Adeyemi", score: 9, date: "08 Jul" },
  { player: "D. Larsson", position: "CM", scout: "R. Fenwick", score: 3, date: "05 Jul" },
  { player: "K. Osei", position: "LB", scout: "S. Bishop", score: 10, date: "02 Jul" },
];

const StyleTilePage: React.FC = () => {
  return (
    <div className="style-tile-page">
      <header className="style-tile-header">
        <div>
          <div className="style-tile-eyebrow">Design system &mdash; Phase 0</div>
          <h1 className="font-display style-tile-title">Style tile</h1>
        </div>
        <DarkModeToggle />
      </header>

      <section className="style-tile-section">
        <h2 className="style-tile-section-title">Player card</h2>
        <div className="player-card">
          <div className="player-card-avatar">
            <UserRound size={28} />
          </div>
          <div className="player-card-body">
            <div className="player-card-name">Jordan Whitfield</div>
            <div className="player-card-meta">
              <ShieldHalf size={14} />
              Centre-back &middot; 22 &middot; Leyton Orient
            </div>
          </div>
          <div className="player-card-scores">
            <div className="player-card-score-block">
              <span className="player-card-score-label">Overall</span>
              <GradeChip score={8} size="lg" />
            </div>
            <div className="player-card-score-block">
              <span className="player-card-score-label">Potential</span>
              <GradeChip score={9} size="lg" />
            </div>
          </div>
        </div>
      </section>

      <section className="style-tile-section">
        <h2 className="style-tile-section-title">Recent reports</h2>
        <div className="style-tile-table-wrap">
          <Table className="style-tile-table" borderless>
            <thead>
              <tr>
                <th>Player</th>
                <th>Position</th>
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
