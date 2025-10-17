import React, { useState, useEffect } from "react";
import { Row, Col, Spinner, Card, Button, ButtonGroup } from "react-bootstrap";
import axiosInstance from "../../axiosInstance";
import SimpleStatsCard from "./SimpleStatsCard";
import SimpleLineChart from "./SimpleLineChart";
import SimpleBarChart from "./SimpleBarChart";
import SimpleTable from "./SimpleTable";

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
            title="Unique Fixtures"
            value={data.unique_fixtures ?? 0}
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
          />
        </Col>
      </Row>

      {/* Month Filter Section */}
      <Row className="mb-4">
        <Col>
          <Card>
            <Card.Body className="py-3">
              <div className="d-flex justify-content-center align-items-center">
                <span className="me-3 fw-semibold">Time Period:</span>
                <ButtonGroup size="sm">
                  <Button
                    variant={monthFilter === 3 ? 'dark' : 'outline-secondary'}
                    onClick={() => setMonthFilter(3)}
                  >
                    3 Months
                  </Button>
                  <Button
                    variant={monthFilter === 6 ? 'dark' : 'outline-secondary'}
                    onClick={() => setMonthFilter(6)}
                  >
                    6 Months
                  </Button>
                  <Button
                    variant={monthFilter === 9 ? 'dark' : 'outline-secondary'}
                    onClick={() => setMonthFilter(9)}
                  >
                    9 Months
                  </Button>
                  <Button
                    variant={monthFilter === 12 ? 'dark' : 'outline-secondary'}
                    onClick={() => setMonthFilter(12)}
                  >
                    12 Months
                  </Button>
                </ButtonGroup>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Team Coverage and Formations */}
      <Row className="mb-4">
        <Col md={8}>
          <SimpleTable
            title="Team Coverage"
            columns={[
              { key: "team_name", label: "Team" },
              { key: "total_reports", label: "Total Reports" },
              { key: "live_reports", label: "Live" },
              { key: "video_reports", label: "Video" }
            ]}
            data={data.team_coverage || []}
            emptyMessage="No team coverage data"
          />
        </Col>
        <Col md={4}>
          <SimpleBarChart
            title="Formation Usage"
            labels={formationLabels.slice(0, 10)}
            data={formationData.slice(0, 10)}
            height={400}
          />
        </Col>
      </Row>
    </div>
  );
};

export default MatchTeamAnalyticsTab;
