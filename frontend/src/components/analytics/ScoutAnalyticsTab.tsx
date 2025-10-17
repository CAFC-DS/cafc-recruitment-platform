import React, { useState, useEffect } from "react";
import { Row, Col, Spinner, Form, Card, Button, ButtonGroup } from "react-bootstrap";
import axiosInstance from "../../axiosInstance";
import SimpleLineChart from "./SimpleLineChart";
import SimpleTable from "./SimpleTable";

interface ScoutAnalytics {
  scout_stats: Array<{
    scout_name: string;
    scout_id: number;
    total_reports: number;
    avg_performance_given: number;
    avg_attribute_given: number;
    player_assessments: number;
    flags: number;
    clips: number;
    live_reports: number;
    video_reports: number;
    unique_players_reported_on: number;
    games_fixtures_covered: number;
    avg_players_per_report: number;
  }>;
  monthly_reports_timeline: {
    labels: string[];
    datasets: Array<{
      label: string;
      data: number[];
      backgroundColor: string;
    }>;
  };
}

const ScoutAnalyticsTab: React.FC = () => {
  const [data, setData] = useState<ScoutAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [monthFilter, setMonthFilter] = useState<number>(6);
  const [selectedPosition, setSelectedPosition] = useState<string>("");

  useEffect(() => {
    fetchData();
  }, [monthFilter, selectedPosition]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (monthFilter) params.months = monthFilter;
      if (selectedPosition) params.position = selectedPosition;

      const response = await axiosInstance.get("/analytics/scouts", { params });
      setData(response.data);
    } catch (error) {
      console.error("Error fetching scout analytics:", error);
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
  const timelineLabels = data.monthly_reports_timeline?.labels || [];
  const timelineDatasets = (data.monthly_reports_timeline?.datasets || []).map((ds) => ({
    label: ds.label || "",
    data: ds.data || [],
    borderColor: ds.backgroundColor || "#e31e24",
    backgroundColor: ds.backgroundColor ? `${ds.backgroundColor}20` : "rgba(227, 30, 36, 0.1)"
  }));

  // Position options (hardcoded common positions)
  const positionOptions = [
    "Goalkeeper",
    "Defender",
    "Midfielder",
    "Forward",
    "Centre Back",
    "Full Back",
    "Wing Back",
    "Defensive Midfielder",
    "Central Midfielder",
    "Attacking Midfielder",
    "Winger",
    "Striker"
  ];

  return (
    <div>
      {/* Filters */}
      <Row className="mb-4">
        <Col md={6}>
          <Form.Group>
            <Form.Label>Filter by Position</Form.Label>
            <Form.Select
              value={selectedPosition}
              onChange={(e) => setSelectedPosition(e.target.value)}
            >
              <option value="">All Positions</option>
              {positionOptions.map((pos) => (
                <option key={pos} value={pos}>
                  {pos}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        </Col>
      </Row>

      {/* Monthly Timeline */}
      <Row className="mb-4">
        <Col>
          <SimpleLineChart
            title="Scout Activity Timeline"
            labels={timelineLabels}
            datasets={timelineDatasets}
            height={350}
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

      {/* Scout Performance Table */}
      <Row className="mb-4">
        <Col>
          <SimpleTable
            title="Scout Performance Metrics"
            columns={[
              { key: "scout_name", label: "Scout" },
              { key: "total_reports", label: "Total Reports" },
              { key: "player_assessments", label: "Assessments" },
              { key: "flags", label: "Flags" },
              { key: "live_reports", label: "Live" },
              { key: "video_reports", label: "Video" },
              { key: "unique_players_reported_on", label: "Unique Players" },
              { key: "games_fixtures_covered", label: "Fixtures" },
              {
                key: "avg_performance_given",
                label: "Avg Performance",
                render: (val) => (val ?? 0).toFixed(2)
              },
              {
                key: "avg_attribute_given",
                label: "Avg Attribute",
                render: (val) => (val ?? 0).toFixed(2)
              },
              {
                key: "avg_players_per_report",
                label: "Avg Players/Report",
                render: (val) => (val ?? 0).toFixed(2)
              }
            ]}
            data={data.scout_stats || []}
            emptyMessage="No scout data available"
          />
        </Col>
      </Row>
    </div>
  );
};

export default ScoutAnalyticsTab;
