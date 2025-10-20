import React, { useState, useMemo } from "react";
import { Card, Table, Form, InputGroup, Button } from "react-bootstrap";

interface TeamCoverageData {
  team_name: string;
  total_times_covered: number;
  total_reports: number;
  scout_breakdown: {
    [scoutName: string]: {
      times_seen: number;
      report_count: number;
      live_matches: number;
      video_matches: number;
    };
  };
}

interface TeamCoverageTableProps {
  data: TeamCoverageData[];
}

const TeamCoverageTable: React.FC<TeamCoverageTableProps> = ({ data }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedScouts, setSelectedScouts] = useState<string[]>([]);

  // Ensure data is always an array
  const safeData = data || [];

  // Get all unique scouts
  const allScouts = useMemo(() => {
    const scoutSet = new Set<string>();
    safeData.forEach((team) => {
      if (team && team.scout_breakdown) {
        Object.keys(team.scout_breakdown).forEach((scout) => scoutSet.add(scout));
      }
    });
    return Array.from(scoutSet).sort();
  }, [safeData]);

  // Filter teams based on search and selected scouts
  const filteredTeams = useMemo(() => {
    return safeData.filter((team) => {
      if (!team || !team.team_name) return false;

      // Search filter
      const matchesSearch = team.team_name
        .toLowerCase()
        .includes(searchTerm.toLowerCase());

      // Scout filter
      const matchesScouts =
        selectedScouts.length === 0 ||
        (team.scout_breakdown && selectedScouts.some((scout) => scout in team.scout_breakdown));

      return matchesSearch && matchesScouts;
    });
  }, [safeData, searchTerm, selectedScouts]);

  const toggleScout = (scout: string) => {
    setSelectedScouts((prev) =>
      prev.includes(scout)
        ? prev.filter((s) => s !== scout)
        : [...prev, scout]
    );
  };

  const handleSelectAll = () => {
    setSelectedScouts(allScouts);
  };

  const handleClearAll = () => {
    setSelectedScouts([]);
  };

  return (
    <Card className="shadow-sm" style={{ border: "1px solid #e5e7eb", borderRadius: "8px" }}>
      <Card.Header
        style={{
          backgroundColor: "#212529",
          borderBottom: "2px solid #b91c1c",
          padding: "1rem 1.25rem",
        }}
      >
        <h5 className="mb-0" style={{ color: "#ffffff", fontWeight: 600 }}>
          Team Coverage
        </h5>
      </Card.Header>

      {/* Search and Filter Section */}
      <Card.Body className="pb-2">
        <InputGroup className="mb-3">
          <InputGroup.Text>
            <i className="bi bi-search"></i>
          </InputGroup.Text>
          <Form.Control
            type="text"
            placeholder="Search teams..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </InputGroup>

        <div className="d-flex align-items-center justify-content-between flex-wrap mb-2" style={{ gap: "0.5rem" }}>
          <div className="d-flex align-items-center" style={{ gap: "0.5rem" }}>
            <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>Scout Filter:</span>
            <Button size="sm" variant="outline-dark" onClick={handleSelectAll}>
              Select All
            </Button>
            <Button size="sm" variant="outline-secondary" onClick={handleClearAll}>
              Clear
            </Button>
          </div>
          <div className="d-flex flex-wrap" style={{ gap: "0.5rem" }}>
            {allScouts.map((scout) => (
              <Button
                key={scout}
                size="sm"
                variant={selectedScouts.includes(scout) ? "primary" : "outline-secondary"}
                onClick={() => toggleScout(scout)}
                style={{ fontSize: "0.75rem" }}
              >
                {scout}
              </Button>
            ))}
          </div>
        </div>
      </Card.Body>

      <Card.Body className="p-0">
        <div className="table-responsive" style={{ maxHeight: "600px", overflowY: "auto" }}>
          <Table hover striped className="table-compact table-sm mb-0">
            <thead
              className="table-dark"
              style={{ position: "sticky", top: 0, zIndex: 10 }}
            >
              <tr>
                <th style={{ minWidth: "150px" }}>Team</th>
                <th style={{ textAlign: "center", minWidth: "80px" }}>Times Seen</th>
                {allScouts.map((scout) => (
                  <th key={scout} style={{ textAlign: "center", minWidth: "80px" }}>
                    {scout}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredTeams.length === 0 ? (
                <tr>
                  <td
                    colSpan={2 + allScouts.length}
                    className="text-center text-muted py-4"
                  >
                    No teams found
                  </td>
                </tr>
              ) : (
                filteredTeams.map((team, idx) => (
                  <tr key={idx}>
                    <td>
                      <strong>{team.team_name}</strong>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className="badge bg-primary">
                        {team.total_times_covered}
                      </span>
                    </td>
                    {allScouts.map((scout) => {
                      const scoutData = team.scout_breakdown[scout];
                      return (
                        <td
                          key={scout}
                          style={{
                            textAlign: "center",
                            backgroundColor: scoutData ? "rgba(13, 110, 253, 0.05)" : "transparent",
                            padding: "0.5rem 0.25rem",
                          }}
                        >
                          {scoutData ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", alignItems: "center" }}>
                              <div style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
                                <span
                                  className="badge bg-success"
                                  style={{ fontSize: "0.7rem", minWidth: "20px" }}
                                  title={`Seen live ${scoutData.live_matches} time(s)`}
                                >
                                  {scoutData.live_matches}
                                </span>
                                <span style={{ fontSize: "0.7rem", color: "#666" }}>L</span>
                              </div>
                              <div style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
                                <span
                                  className="badge bg-info"
                                  style={{ fontSize: "0.7rem", minWidth: "20px" }}
                                  title={`Seen video ${scoutData.video_matches} time(s)`}
                                >
                                  {scoutData.video_matches}
                                </span>
                                <span style={{ fontSize: "0.7rem", color: "#666" }}>V</span>
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: "#999" }}>-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </div>
      </Card.Body>

      {/* Summary Footer */}
      <Card.Footer style={{ backgroundColor: "#f8f9fa", fontSize: "0.85rem" }}>
        Showing {filteredTeams.length} of {safeData.length} teams
        {selectedScouts.length > 0 && (
          <span className="ms-2 text-muted">
            (filtered by {selectedScouts.length} scout{selectedScouts.length !== 1 && "s"})
          </span>
        )}
      </Card.Footer>
    </Card>
  );
};

export default TeamCoverageTable;
