import React, { useState, useEffect } from "react";
import { Row, Col, Spinner, Card, Button, ButtonGroup, Table, OverlayTrigger, Tooltip } from "react-bootstrap";
import axiosInstance from "../../axiosInstance";
import SimpleStatsCard from "./SimpleStatsCard";
import SimpleLineChart from "./SimpleLineChart";
import SimpleBarChart from "./SimpleBarChart";

interface MatchTeamAnalytics {
  total_reports: number;
  unique_competitions: number;
  unique_fixtures: number;
  live_reports: number;
  video_reports: number;
  match_timeline: {
    labels: string[];
    datasets: Array<{
      label: string;
      data: number[];
      backgroundColor: string;
    }>;
  };
  team_coverage: Array<{
    team_name: string;
    total_reports: number;
    live_reports: number;
    video_reports: number;
  }>;
  competition_coverage: Array<{
    competition_name: string;
    report_count: number;
    live_reports: number;
    video_reports: number;
  }>;
  team_report_coverage: Array<{
    team_name: string;
    report_count: number;
    live_reports: number;
    video_reports: number;
  }>;
  formation_stats: Array<{
    formation: string;
    count: number;
  }>;
}

const MatchTeamAnalyticsTab: React.FC = () => {
  const [data, setData] = useState<MatchTeamAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [monthFilter, setMonthFilter] = useState<number>(6);

  useEffect(() => {
    fetchData();
  }, [monthFilter]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (monthFilter) params.months = monthFilter;

      const response = await axiosInstance.get("/analytics/matches-teams", { params });
      setData(response.data);
    } catch (error) {
      console.error("Error fetching match/team analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  if (!data) {
    return <div className="text-center py-5">No data available</div>;
  }

  // Prepare timeline data
  const timelineLabels = data.match_timeline?.labels || [];
  const timelineDatasets = (data.match_timeline?.datasets || []).map((ds) => ({
    label: ds.label || "",
    data: ds.data || [],
    borderColor: ds.label === "Live" ? "#28a745" : "#17a2b8",
    backgroundColor: ds.label === "Live" ? "rgba(40, 167, 69, 0.1)" : "rgba(23, 162, 184, 0.1)"
  }));

  // Prepare formation data
  const formationLabels = (data.formation_stats || []).map((f) => f.formation || "Unknown");
  const formationData = (data.formation_stats || []).map((f) => f.count || 0);

  return (
    <div>
      {/* Filters Section at Top */}
      <Row className="mb-4">
        <Col>
          <Card className="shadow-sm">
            <Card.Body className="py-3">
              <div className="d-flex align-items-center justify-content-between flex-wrap" style={{ gap: "1rem" }}>
                <div className="d-flex align-items-center" style={{ gap: "1rem" }}>
                  <span className="text-muted" style={{ fontSize: "0.9rem", fontWeight: 500 }}>
                    Filters:
                  </span>
                  <div className="d-flex align-items-center" style={{ gap: "0.5rem" }}>
                    <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>Time Period:</span>
                    <ButtonGroup size="sm">
                      <Button
                        variant={monthFilter === 3 ? 'dark' : 'outline-secondary'}
                        onClick={() => setMonthFilter(3)}
                        style={{ minWidth: "45px" }}
                      >
                        3M
                      </Button>
                      <Button
                        variant={monthFilter === 6 ? 'dark' : 'outline-secondary'}
                        onClick={() => setMonthFilter(6)}
                        style={{ minWidth: "45px" }}
                      >
                        6M
                      </Button>
                      <Button
                        variant={monthFilter === 9 ? 'dark' : 'outline-secondary'}
                        onClick={() => setMonthFilter(9)}
                        style={{ minWidth: "45px" }}
                      >
                        9M
                      </Button>
                      <Button
                        variant={monthFilter === 12 ? 'dark' : 'outline-secondary'}
                        onClick={() => setMonthFilter(12)}
                        style={{ minWidth: "45px" }}
                      >
                        12M
                      </Button>
                    </ButtonGroup>
                  </div>
                </div>
                <OverlayTrigger
                  placement="left"
                  overlay={
                    <Tooltip id="filters-tooltip">
                      Filters apply to all sections: Summary Stats, Timeline, Competition Reports, and Formation Stats
                    </Tooltip>
                  }
                >
                  <span
                    className="badge bg-light text-dark"
                    style={{ cursor: 'help', fontSize: "0.75rem", padding: "0.4rem 0.6rem" }}
                  >
                    ℹ️ Filter Info
                  </span>
                </OverlayTrigger>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Summary Stats */}
      <Row className="mb-4">
        <Col md={3}>
          <SimpleStatsCard
            title="Total Reports"
            value={data.total_reports ?? 0}
          />
        </Col>
        <Col md={3}>
          <SimpleStatsCard
            title="Unique Competitions"
            value={data.unique_competitions ?? 0}
          />
        </Col>
        <Col md={3}>
          <SimpleStatsCard
            title="Live Reports"
            value={data.live_reports ?? 0}
          />
        </Col>
        <Col md={3}>
          <SimpleStatsCard
            title="Video Reports"
            value={data.video_reports ?? 0}
          />
        </Col>
      </Row>

      {/* Monthly Timeline */}
      <Row className="mb-4">
        <Col>
          <SimpleLineChart
            title="Monthly Match Reports Timeline"
            labels={timelineLabels}
            datasets={timelineDatasets}
            height={400}
          />
        </Col>
      </Row>

      {/* Competition and Team Coverage - Side by Side */}
      <Row className="mb-4">
        <Col md={6}>
          <Card className="shadow-sm" style={{ border: '1px solid #e5e7eb', borderRadius: '8px' }}>
            <Card.Header style={{ backgroundColor: '#212529', borderBottom: '2px solid #b91c1c', padding: '1rem 1.25rem' }}>
              <h5 className="mb-0" style={{ color: '#ffffff', fontWeight: 600 }}>Reports by Competition</h5>
            </Card.Header>
            <Card.Body className="p-0">
              <div className="table-responsive" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                <Table hover striped className="table-compact table-sm mb-0" style={{ textAlign: 'center' }}>
                  <thead className="table-dark" style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                    <tr>
                      <th>Competition</th>
                      <th>Total Reports</th>
                      <th>Live</th>
                      <th>Video</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.competition_coverage || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center text-muted py-4">
                          No competition data available
                        </td>
                      </tr>
                    ) : (
                      (data.competition_coverage || []).map((comp, idx) => (
                        <tr key={idx}>
                          <td><strong>{comp.competition_name}</strong></td>
                          <td>
                            <span className="badge bg-dark">{comp.report_count}</span>
                          </td>
                          <td>
                            <span className="badge bg-success">{comp.live_reports}</span>
                          </td>
                          <td>
                            <span className="badge bg-info">{comp.video_reports}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </Table>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col md={6}>
          <Card className="shadow-sm" style={{ border: '1px solid #e5e7eb', borderRadius: '8px' }}>
            <Card.Header style={{ backgroundColor: '#212529', borderBottom: '2px solid #b91c1c', padding: '1rem 1.25rem' }}>
              <h5 className="mb-0" style={{ color: '#ffffff', fontWeight: 600 }}>Reports by Team</h5>
            </Card.Header>
            <Card.Body className="p-0">
              <div className="table-responsive" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                <Table hover striped className="table-compact table-sm mb-0" style={{ textAlign: 'center' }}>
                  <thead className="table-dark" style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                    <tr>
                      <th>Team</th>
                      <th>Total Reports</th>
                      <th>Live</th>
                      <th>Video</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.team_report_coverage || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center text-muted py-4">
                          No team data available
                        </td>
                      </tr>
                    ) : (
                      (data.team_report_coverage || []).map((team, idx) => (
                        <tr key={idx}>
                          <td><strong>{team.team_name}</strong></td>
                          <td>
                            <span className="badge bg-dark">{team.report_count}</span>
                          </td>
                          <td>
                            <span className="badge bg-success">{team.live_reports}</span>
                          </td>
                          <td>
                            <span className="badge bg-info">{team.video_reports}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </Table>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default MatchTeamAnalyticsTab;
