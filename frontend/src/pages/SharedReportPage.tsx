import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Container, Alert, Spinner, Card, Row, Col } from "react-bootstrap";
import axios from "axios";
import PlayerReportModal from "../components/PlayerReportModal";

const SharedReportPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReport = async () => {
      if (!token) {
        setError("No share token provided");
        setLoading(false);
        return;
      }

      try {
        // Use axios directly (not axiosInstance) since this is public/unauthenticated
        const baseURL = process.env.REACT_APP_API_URL || "http://localhost:3001";
        const response = await axios.get(`${baseURL}/public/report/${token}`);
        setReport(response.data);
      } catch (err: any) {
        console.error("Error fetching shared report:", err);
        if (err.response?.status === 404) {
          setError("Share link not found");
        } else if (err.response?.status === 403) {
          setError(err.response.data?.detail || "This share link has expired or been revoked");
        } else {
          setError("Failed to load report. Please check the link and try again.");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [token]);

  if (loading) {
    return (
      <Container className="d-flex justify-content-center align-items-center" style={{ minHeight: "100vh" }}>
        <div className="text-center">
          <Spinner animation="border" role="status" />
          <p className="mt-3">Loading shared report...</p>
        </div>
      </Container>
    );
  }

  if (error) {
    return (
      <Container className="mt-5">
        <Alert variant="danger">
          <Alert.Heading>Access Denied</Alert.Heading>
          <p>{error}</p>
        </Alert>
      </Container>
    );
  }

  return (
    <div style={{ backgroundColor: "#f8f9fa", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ backgroundColor: "#fff", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", padding: "1rem 0" }}>
        <Container>
          <h4 className="mb-0">Shared Scout Report</h4>
          <small className="text-muted">This is a shared report - View only</small>
        </Container>
      </div>

      {/* Report Content */}
      <Container className="py-4">
        {report && (
          <Card>
            <Card.Body>
              {/* Player Header */}
              <Row className="mb-4">
                <Col>
                  <h3>{report.player_name}</h3>
                  <div className="text-muted">
                    {report.player_position && <span>{report.player_position} • </span>}
                    {report.squad_name && <span>{report.squad_name} • </span>}
                    {report.age && <span>Age {report.age}</span>}
                  </div>
                </Col>
              </Row>

              {/* Fixture Details */}
              <Row className="mb-4">
                <Col md={6}>
                  <strong>Fixture:</strong> {report.home_squad_name} vs {report.away_squad_name}
                </Col>
                <Col md={6}>
                  <strong>Date:</strong> {report.fixture_date}
                </Col>
              </Row>

              {/* Scout Info */}
              <Row className="mb-4">
                <Col md={6}>
                  <strong>Scout:</strong> {report.scout_name}
                </Col>
                <Col md={6}>
                  <strong>Report Date:</strong> {new Date(report.created_at).toLocaleDateString()}
                </Col>
              </Row>

              {/* Report Type & Details */}
              <Row className="mb-4">
                <Col md={4}>
                  <strong>Report Type:</strong> {report.report_type || "Player Assessment"}
                </Col>
                <Col md={4}>
                  <strong>Position Played:</strong> {report.position_played || "N/A"}
                </Col>
                <Col md={4}>
                  <strong>Scouting Type:</strong> {report.scouting_type || "N/A"}
                </Col>
              </Row>

              {/* Performance Score */}
              {report.performance_score && (
                <Row className="mb-4">
                  <Col>
                    <strong>Performance Score:</strong>{" "}
                    <span
                      style={{
                        backgroundColor: getPerformanceScoreColorHelper(report.performance_score),
                        color: "white",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        marginLeft: "8px",
                      }}
                    >
                      {report.performance_score}
                    </span>
                  </Col>
                </Row>
              )}

              {/* Flag Category */}
              {report.flag_category && (
                <Row className="mb-4">
                  <Col>
                    <strong>Grade:</strong>{" "}
                    <span
                      style={{
                        backgroundColor: getGradeColorHelper(report.flag_category),
                        color: "white",
                        padding: "4px 12px",
                        borderRadius: "4px",
                        marginLeft: "8px",
                      }}
                    >
                      {report.flag_category}
                    </span>
                  </Col>
                </Row>
              )}

              {/* Attributes */}
              {report.individual_attribute_scores && Object.keys(report.individual_attribute_scores).length > 0 && (
                <Row className="mb-4">
                  <Col>
                    <h5>Attributes</h5>
                    <Row>
                      {Object.entries(report.individual_attribute_scores).map(([attr, score]: [string, any]) => (
                        score > 0 && (
                          <Col md={4} key={attr} className="mb-2">
                            <div className="d-flex justify-content-between align-items-center">
                              <span>{attr}:</span>
                              <span
                                style={{
                                  backgroundColor: getAttributeScoreColorHelper(score),
                                  color: "white",
                                  padding: "2px 8px",
                                  borderRadius: "4px",
                                }}
                              >
                                {score}
                              </span>
                            </div>
                          </Col>
                        )
                      ))}
                    </Row>
                    {report.average_attribute_score > 0 && (
                      <div className="mt-2">
                        <strong>Average Attribute Score:</strong>{" "}
                        <span
                          style={{
                            backgroundColor: getAttributeScoreColorHelper(report.average_attribute_score),
                            color: "white",
                            padding: "2px 8px",
                            borderRadius: "4px",
                            marginLeft: "8px",
                          }}
                        >
                          {report.average_attribute_score}
                        </span>
                      </div>
                    )}
                  </Col>
                </Row>
              )}

              {/* Strengths */}
              {report.strengths && report.strengths.length > 0 && (
                <Row className="mb-4">
                  <Col>
                    <h5>Strengths</h5>
                    <ul>
                      {report.strengths.map((strength: string, index: number) => (
                        <li key={index}>{strength}</li>
                      ))}
                    </ul>
                  </Col>
                </Row>
              )}

              {/* Weaknesses */}
              {report.weaknesses && report.weaknesses.length > 0 && (
                <Row className="mb-4">
                  <Col>
                    <h5>Weaknesses</h5>
                    <ul>
                      {report.weaknesses.map((weakness: string, index: number) => (
                        <li key={index}>{weakness}</li>
                      ))}
                    </ul>
                  </Col>
                </Row>
              )}

              {/* Summary */}
              {report.summary && (
                <Row className="mb-4">
                  <Col>
                    <h5>Summary</h5>
                    <p style={{ whiteSpace: "pre-wrap" }}>{report.summary}</p>
                  </Col>
                </Row>
              )}

              {/* Justification */}
              {report.justification && (
                <Row className="mb-4">
                  <Col>
                    <h5>Justification</h5>
                    <p style={{ whiteSpace: "pre-wrap" }}>{report.justification}</p>
                  </Col>
                </Row>
              )}

              {/* Additional Details */}
              {(report.build || report.height || report.formation) && (
                <Row className="mb-2">
                  <Col>
                    <h6>Additional Details</h6>
                    {report.build && <div><strong>Build:</strong> {report.build}</div>}
                    {report.height && <div><strong>Height:</strong> {report.height}</div>}
                    {report.formation && <div><strong>Formation:</strong> {report.formation}</div>}
                  </Col>
                </Row>
              )}
            </Card.Body>
          </Card>
        )}
      </Container>

      {/* Footer */}
      <div className="text-center py-4 text-muted">
        <small>This report was shared via a secure link</small>
      </div>
    </div>
  );
};

// Helper functions for colors (simplified versions)
const getPerformanceScoreColorHelper = (score: number) => {
  if (score >= 7) return "#28a745"; // green
  if (score >= 5) return "#ffc107"; // yellow
  return "#dc3545"; // red
};

const getAttributeScoreColorHelper = (score: number) => {
  if (score >= 7) return "#28a745";
  if (score >= 5) return "#ffc107";
  return "#dc3545";
};

const getGradeColorHelper = (grade: string) => {
  const gradeUpper = grade.toUpperCase();
  if (gradeUpper.includes("A")) return "#28a745";
  if (gradeUpper.includes("B")) return "#17a2b8";
  if (gradeUpper.includes("C")) return "#ffc107";
  if (gradeUpper.includes("D")) return "#fd7e14";
  return "#6c757d";
};

export default SharedReportPage;
