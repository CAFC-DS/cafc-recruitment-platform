import React, { useEffect, useState } from "react";
import { Alert, Button, Card, Col, Form, Row, Spinner } from "react-bootstrap";
import axiosInstance from "../../axiosInstance";

interface StageMovementAnalytics {
  window_start: string;
  window_end: string;
  metrics: {
    moved_into_stage_1: number;
    moved_stage_1_to_2: number;
    moved_stage_2_to_3: number;
    archived_from_stage_2: number;
    archived_from_stage_3: number;
  };
}

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB");
};

const getDefaultStartDate = () => {
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);
  return weekAgo.toISOString().slice(0, 10);
};

const getTodayIso = () => new Date().toISOString().slice(0, 10);

const metricCards = [
  {
    key: "moved_into_stage_1",
    title: "Moved into Stage 1",
    subtitle: "New players entering the shortlist",
  },
  {
    key: "moved_stage_1_to_2",
    title: "Stage 1 to Stage 2",
    subtitle: "Players progressed into deeper review",
  },
  {
    key: "moved_stage_2_to_3",
    title: "Stage 2 to Stage 3",
    subtitle: "Players moved into final shortlist review",
  },
  {
    key: "archived_from_stage_2",
    title: "Archived from Stage 2",
    subtitle: "Players removed after Stage 2 review",
  },
  {
    key: "archived_from_stage_3",
    title: "Archived from Stage 3",
    subtitle: "Players removed after Stage 3 review",
  },
] as const;

const StageMovementAnalyticsTab: React.FC = () => {
  const [data, setData] = useState<StageMovementAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(getDefaultStartDate);
  const [endDate, setEndDate] = useState(getTodayIso);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axiosInstance.get("/analytics/stage-movements", {
        params: {
          start_date: startDate,
          end_date: endDate,
        },
      });
      setData(response.data);
    } catch (fetchError) {
      console.error("Error fetching stage movement analytics:", fetchError);
      setError("Unable to load stage movement analytics right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  if (error) {
    return <Alert variant="danger">{error}</Alert>;
  }

  if (!data) {
    return <Alert variant="light">No stage movement data available.</Alert>;
  }

  return (
    <div>
      <Card className="shadow-sm mb-4">
        <Card.Body className="py-3">
          <div className="d-flex justify-content-between align-items-center flex-wrap" style={{ gap: "0.75rem" }}>
            <div>
              <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#111827" }}>
                Stage movement window
              </div>
              <div style={{ fontSize: "0.82rem", color: "#64748b" }}>
                {formatDate(data.window_start)} to {formatDate(data.window_end)}
              </div>
            </div>
            <span className="badge badge-neutral-grey">Shortlist stage movement summary</span>
          </div>
          <Row className="g-3 mt-1 align-items-end">
            <Col md={4}>
              <Form.Group>
                <Form.Label className="small fw-bold">Start date</Form.Label>
                <Form.Control
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label className="small fw-bold">End date</Form.Label>
                <Form.Control
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </Form.Group>
            </Col>
            <Col md={4}>
              <Button variant="dark" onClick={fetchData} className="w-100">
                Update window
              </Button>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Row className="g-3">
        {metricCards.map((metric) => (
          <Col key={metric.key} xl={4} md={6}>
            <Card className="shadow-sm h-100 hover-card">
              <Card.Body>
                <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {metric.title}
                </div>
                <div style={{ fontSize: "2rem", fontWeight: 800, color: "#111827", lineHeight: 1.1, marginTop: "0.45rem" }}>
                  {data.metrics[metric.key].toLocaleString("en-GB")}
                </div>
                <div style={{ fontSize: "0.82rem", color: "#64748b", marginTop: "0.5rem" }}>
                  {metric.subtitle}
                </div>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
};

export default StageMovementAnalyticsTab;
