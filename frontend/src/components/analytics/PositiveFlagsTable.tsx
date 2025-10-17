import React from "react";
import { Card, Table } from "react-bootstrap";
import { useNavigate } from "react-router-dom";

export interface PositiveFlaggedPlayer {
  player_name: string;
  position: string | null;
  flag_count: number;
  most_recent_flag: string | null;
  player_id: number;
  data_source: string;
}

interface PositiveFlagsTableProps {
  data: PositiveFlaggedPlayer[];
  color?: string;
}

const PositiveFlagsTable: React.FC<PositiveFlagsTableProps> = ({
  data,
  color = "#22c55e",
}) => {
  const navigate = useNavigate();

  const handlePlayerClick = (player: PositiveFlaggedPlayer) => {
    // Navigate to player profile based on data source
    if (player.data_source === "internal") {
      navigate(`/player-profile/${player.player_id}`);
    } else {
      navigate(`/player/${player.player_id}`);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "N/A";
    try {
      return new Date(dateStr).toLocaleDateString("en-US");
    } catch {
      return dateStr;
    }
  };

  return (
    <Card
      className="shadow-sm"
      style={{
        borderRadius: "12px",
        border: `2px solid ${color}`,
      }}
    >
      <Card.Header
        style={{
          backgroundColor: "#f8f9fa",
          color: "#2c3e50",
          borderBottom: "2px solid #dee2e6",
        }}
      >
        <h6 className="mb-0 fw-bold">✅ Positive Flagged Players</h6>
      </Card.Header>
      <Card.Body style={{ maxHeight: "500px", overflowY: "auto", padding: "0" }}>
        {data.length > 0 ? (
          <Table hover responsive className="mb-0">
            <thead
              style={{
                backgroundColor: color,
                color: "white",
                position: "sticky",
                top: 0,
                zIndex: 1,
              }}
            >
              <tr>
                <th style={{ padding: "1rem 0.75rem" }}>#</th>
                <th style={{ padding: "1rem 0.75rem" }}>Player Name</th>
                <th style={{ padding: "1rem 0.75rem" }}>Position</th>
                <th style={{ padding: "1rem 0.75rem" }}>Flag Count</th>
                <th style={{ padding: "1rem 0.75rem" }}>Most Recent Flag</th>
              </tr>
            </thead>
            <tbody>
              {data.map((player, index) => (
                <tr
                  key={index}
                  style={{
                    transition: "background-color 0.2s",
                    cursor: "pointer",
                  }}
                  onClick={() => handlePlayerClick(player)}
                >
                  <td style={{ padding: "1rem 0.75rem" }}>{index + 1}</td>
                  <td style={{ padding: "1rem 0.75rem" }}>
                    <strong>{player.player_name}</strong>
                  </td>
                  <td style={{ padding: "1rem 0.75rem" }}>
                    {player.position ? (
                      <span className="badge bg-secondary">{player.position}</span>
                    ) : (
                      <span className="text-muted">N/A</span>
                    )}
                  </td>
                  <td style={{ padding: "1rem 0.75rem" }}>
                    <span
                      className="badge"
                      style={{
                        backgroundColor: color,
                        fontSize: "0.9rem",
                        padding: "0.4rem 0.6rem",
                      }}
                    >
                      {player.flag_count}
                    </span>
                  </td>
                  <td style={{ padding: "1rem 0.75rem" }}>
                    {formatDate(player.most_recent_flag)}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="text-center py-4">
            <p className="text-muted mb-0">No positive flags found</p>
          </div>
        )}
      </Card.Body>
    </Card>
  );
};

export default PositiveFlagsTable;
