import React, { useState, useEffect } from "react";
import { Modal, Card, Row, Col, Spinner, Alert } from "react-bootstrap";
import axiosInstance from "../axiosInstance";
import { getRecommendationColor, getContrastTextColor } from "../utils/colorUtils";

interface IntelReportModalProps {
  show: boolean;
  onHide: () => void;
  intelId: number | null;
}

interface IntelReportDetails {
  intel_id: number;
  created_at: string;
  player_name: string;
  contact_name: string;
  contact_organisation: string;
  date_of_information: string | null;
  confirmed_contract_expiry: string | null;
  contract_options: string | null;
  potential_deal_types: string[];
  transfer_fee: string | null;
  current_wages: string | null;
  expected_wages: string | null;
  conversation_notes: string;
  notes?: string | null;
  recommendation?: string | null;
  action_required?: string | null;
  intel_type?: "player_information" | "general_note";
}

const IntelReportModal: React.FC<IntelReportModalProps> = ({
  show,
  onHide,
  intelId,
}) => {
  const [intel, setIntel] = useState<IntelReportDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (show && intelId) {
      fetchIntelReport();
    }
  }, [show, intelId]);

  const fetchIntelReport = async () => {
    if (!intelId) return;

    setLoading(true);
    setError("");
    try {
      const response = await axiosInstance.get(`/intel_reports/${intelId}`);
      setIntel(response.data);
    } catch (fetchError: any) {
      console.error("Error fetching intel report:", fetchError);
      setError("Failed to load intel report");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: string | null) => {
    if (!value) return "Not specified";
    if (value.includes("£") || value.includes("$") || value.includes("€")) {
      return value;
    }
    return `£${value}`;
  };

  const formatRecommendation = (recommendation?: string | null) => {
    if (!recommendation) return "Not specified";
    const formatted: { [key: string]: string } = {
      "discuss urgently": "Discuss Urgently",
      monitor: "Monitor",
      "beyond us": "Beyond Us",
      "no action": "No Action",
    };
    return formatted[recommendation.toLowerCase()] || recommendation;
  };

  const formatDealType = (type: string) => {
    const labels: { [key: string]: string } = {
      free: "Free Transfer",
      permanent: "Permanent",
      loan: "Loan",
      loan_with_option: "Loan with Option",
      na: "N/A",
    };
    return labels[type] || type;
  };

  const formatIntelType = (intelType?: string | null) =>
    intelType === "general_note" ? "General Note" : "Player Information";

  const handleClose = () => {
    setIntel(null);
    setError("");
    onHide();
  };

  const recommendation = intel?.recommendation || intel?.action_required || "";
  const intelType = intel?.intel_type || "player_information";
  const notesText = intel?.notes || intel?.conversation_notes || "";

  return (
    <Modal show={show} onHide={handleClose} size="lg" centered>
      <Modal.Header
        closeButton
        style={{ backgroundColor: "#000000", color: "white" }}
        className="modal-header-dark"
      >
        <Modal.Title>{intel ? `${intel.player_name} - Intel Report` : "Intel Report"}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {loading && (
          <div className="text-center py-4">
            <Spinner animation="border" />
            <p className="mt-2">Loading intel report...</p>
          </div>
        )}

        {error && <Alert variant="danger">{error}</Alert>}

        {intel && (
          <>
            <Card className="mb-4">
              <Card.Header style={{ backgroundColor: "#000000", color: "white" }}>
                <h6 className="mb-0">Report Overview</h6>
              </Card.Header>
              <Card.Body>
                <Row>
                  <Col md={6}>
                    <p>
                      <strong>Player:</strong> {intel.player_name}
                    </p>
                    <p>
                      <strong>Type:</strong> {formatIntelType(intelType)}
                    </p>
                    <p>
                      <strong>Report Date:</strong> {new Date(intel.created_at).toLocaleDateString("en-GB")}
                    </p>
                  </Col>
                  <Col md={6}>
                    <p>
                      <strong>Date of Information:</strong>{" "}
                      {intel.date_of_information
                        ? new Date(intel.date_of_information).toLocaleDateString("en-GB")
                        : "N/A"}
                    </p>
                    {intelType === "player_information" ? (
                      <>
                        <p>
                          <strong>Contact:</strong> {intel.contact_name || "N/A"}
                        </p>
                        <p>
                          <strong>Organisation:</strong> {intel.contact_organisation || "N/A"}
                        </p>
                      </>
                    ) : (
                      <>
                        <p>
                          <strong>Contact:</strong> {intel.contact_name || "N/A"}
                        </p>
                        <p>
                          <strong>Organisation:</strong> {intel.contact_organisation || "N/A"}
                        </p>
                      </>
                    )}
                  </Col>
                </Row>
              </Card.Body>
            </Card>

            {intelType === "general_note" ? (
              <>
                <Card className="mb-4">
                  <Card.Header className="bg-light text-dark">
                    <h6 className="mb-0">Notes</h6>
                  </Card.Header>
                  <Card.Body>
                    <div className="border-start border-secondary border-4 ps-3">
                      <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>
                        {notesText}
                      </p>
                    </div>
                  </Card.Body>
                </Card>

              </>
            ) : (
              <>
                <Card className="mb-4">
                  <Card.Header className="bg-light text-dark">
                    <h6 className="mb-0">Contract Information</h6>
                  </Card.Header>
                  <Card.Body>
                    <Row>
                      <Col md={6}>
                        <p>
                          <strong>Contract Expiry:</strong>{" "}
                          {intel.confirmed_contract_expiry
                            ? new Date(intel.confirmed_contract_expiry).toLocaleDateString("en-GB")
                            : "Not specified"}
                        </p>
                        <p>
                          <strong>Contract Options:</strong> {intel.contract_options || "None specified"}
                        </p>
                      </Col>
                      <Col md={6}>
                        <p>
                          <strong>Current Wages:</strong> {formatCurrency(intel.current_wages)}
                        </p>
                        <p>
                          <strong>Expected Wages:</strong> {formatCurrency(intel.expected_wages)}
                        </p>
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>

                <Card className="mb-4">
                  <Card.Header className="bg-light text-dark">
                    <h6 className="mb-0">Deal Information</h6>
                  </Card.Header>
                  <Card.Body>
                    <Row>
                      <Col md={6}>
                        <p>
                          <strong>Transfer Fee:</strong> {formatCurrency(intel.transfer_fee)}
                        </p>
                      </Col>
                      <Col md={6}>
                        <p>
                          <strong>Potential Deal Types:</strong>{" "}
                          {intel.potential_deal_types?.length
                            ? intel.potential_deal_types.map(formatDealType).join(", ")
                            : "None specified"}
                        </p>
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>

                <Card className="mb-4">
                  <Card.Header className="bg-light text-dark">
                    <h6 className="mb-0">Conversation Notes</h6>
                  </Card.Header>
                  <Card.Body>
                    <div className="border-start border-secondary border-4 ps-3">
                      <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>
                        {notesText}
                      </p>
                    </div>
                  </Card.Body>
                </Card>

                <Card>
                  <Card.Header className="d-flex align-items-center justify-content-between">
                    <h6 className="mb-0">Recommendation</h6>
                    <span
                      className="badge fs-6"
                      style={{
                        backgroundColor: getRecommendationColor(recommendation),
                        color: getContrastTextColor(getRecommendationColor(recommendation)),
                      }}
                    >
                      {formatRecommendation(recommendation)}
                    </span>
                  </Card.Header>
                </Card>
              </>
            )}
          </>
        )}
      </Modal.Body>
    </Modal>
  );
};

export default IntelReportModal;
