import React from "react";
import { Row, Col, Card } from "react-bootstrap";

interface AnalyticsDashboardShimmerProps {
  statCount?: number;
  showChart?: boolean;
  showTable?: boolean;
}

const AnalyticsDashboardShimmer: React.FC<AnalyticsDashboardShimmerProps> = ({
  statCount = 4,
  showChart = true,
  showTable = true,
}) => {
  return (
    <div>
      {statCount > 0 && (
        <Row className="mb-4">
          {Array.from({ length: statCount }).map((_, idx) => (
            <Col md={12 / statCount} key={idx}>
              <Card className="shadow-sm">
                <Card.Body className="py-3">
                  <div
                    className="shimmer-line mb-2"
                    style={{ width: "60%", height: "13px" }}
                  />
                  <div
                    className="shimmer-line"
                    style={{ width: "40%", height: "22px" }}
                  />
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {showChart && (
        <Row className="mb-4">
          <Col>
            <Card className="shadow-sm">
              <Card.Body>
                <div
                  className="shimmer-line mb-3"
                  style={{ width: "220px", height: "18px" }}
                />
                <div className="shimmer-line" style={{ width: "100%", height: "260px" }} />
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}

      {showTable && (
        <Row>
          <Col>
            <Card className="shadow-sm">
              <Card.Body>
                <div
                  className="shimmer-line mb-3"
                  style={{ width: "180px", height: "18px" }}
                />
                {Array.from({ length: 5 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="shimmer-line mb-2"
                    style={{ width: "100%", height: "20px" }}
                  />
                ))}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
};

export default AnalyticsDashboardShimmer;
