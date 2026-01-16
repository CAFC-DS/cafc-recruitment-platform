import React, { useState, useEffect } from "react";
import { Modal, Card, Row, Col, Spinner, Alert } from "react-bootstrap";
import axiosInstance from "../axiosInstance";
import { getFlagColor, getContrastTextColor } from "../utils/colorUtils";

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
  date_of_information: string;
  confirmed_contract_expiry: string | null;
  contract_options: string;
  potential_deal_types: string[];
  transfer_fee: string | null;
  current_wages: string | null;
  expected_wages: string | null;
  conversation_notes: string;
  action_required: string;
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
    } catch (error: any) {
      console.error("Error fetching intel report:", error);
      setError("Failed to load intel report");
    } finally {
      setLoading(false);
    }
  };

  const getDealTypeBadge = (type: string) => {
    const labels: { [key: string]: string } = {
      free: "Free Transfer",
      permanent: "Permanent",
      loan: "Loan",
      loan_with_option: "Loan with Option",
    };

    return (
      <span key={type} className="badge badge-neutral-grey me-1">
        {labels[type] || type}
      </span>
    );
  };

  const formatCurrency = (value: string | null) => {
    if (!value) return "Not specified";
    // If already has a currency symbol, return as is
    if (value.includes("£") || value.includes("$") || value.includes("€")) {
      return value;
    }
    // Otherwise add £ prefix
    return `£${value}`;
  };

  const formatActionRequired = (action: string) => {
    const formatted: { [key: string]: string } = {
      "discuss urgently": "Discuss Urgently",
      "monitor": "Monitor",
      "beyond us": "Beyond Us",
      "no action": "No Action",
    };
    return formatted[action.toLowerCase()] || action;
  };

  const handleClose = () => {
    setIntel(null);
    setError("");
    onHide();
  };

  return (
    <Modal show={show} onHide={handleClose} size="lg" centered>
      <Modal.Header
        closeButton
        style={{ backgroundColor: "#000000", color: "white" }}
        className="modal-header-dark"
      >
        <Modal.Title>Intel Report</Modal.Title>
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
            {/* Header Information */}
            <Card className="mb-4">
              <Card.Header className="bg-light">
                <h5 className="mb-0">Report Overview</h5>
              </Card.Header>
              <Card.Body>
                <Row>
                  <Col md={6}>
                    <p>
                      <strong>Player:</strong> {intel.player_name}
                    </p>
                    <p>
                      <strong>Date Submitted:</strong>{" "}
                      {new Date(intel.created_at).toLocaleDateString("en-GB")}
                    </p>
                    <p>
                      <strong>Information Date:</strong>{" "}
                      {new Date(intel.date_of_information).toLocaleDateString("en-GB")}
                    </p>
                  </Col>
                  <Col md={6}>
                    <p>
                      <strong>Contact:</strong> {intel.contact_name}
                    </p>
                    <p>
                      <strong>Organisation:</strong>{" "}
                      {intel.contact_organisation}
                    </p>
                  </Col>
                </Row>
              </Card.Body>
            </Card>

            {/* Contract Information */}
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
                        ? new Date(
                            intel.confirmed_contract_expiry,
                          ).toLocaleDateString("en-GB")
                        : "Not specified"}
                    </p>
                    <p>
                      <strong>Contract Options:</strong>{" "}
                      {intel.contract_options || "None specified"}
                    </p>
                  </Col>
                  <Col md={6}>
                    <p>
                      <strong>Current Wages:</strong>{" "}
                      {formatCurrency(intel.current_wages)}
                    </p>
                    <p>
                      <strong>Expected Wages:</strong>{" "}
                      {formatCurrency(intel.expected_wages)}
                    </p>
                  </Col>
                </Row>
              </Card.Body>
            </Card>

            {/* Deal Information */}
            <Card className="mb-4">
              <Card.Header className="bg-light text-dark">
                <h6 className="mb-0">Deal Information</h6>
              </Card.Header>
              <Card.Body>
                <Row>
                  <Col md={6}>
                    <p>
                      <strong>Transfer Fee:</strong>{" "}
                      {formatCurrency(intel.transfer_fee)}
                    </p>
                  </Col>
                  <Col md={6}>
                    <p>
                      <strong>Potential Deal Types:</strong>{" "}
                      {intel.potential_deal_types &&
                      intel.potential_deal_types.length > 0 ? (
                        <span>
                          {intel.potential_deal_types.map((type, index) => {
                            const labels: { [key: string]: string } = {
                              free: "Free Transfer",
                              permanent: "Permanent",
                              loan: "Loan",
                              loan_with_option: "Loan with Option",
                            };
                            return (
                              <span key={type}>
                                {labels[type] || type}
                                {index < intel.potential_deal_types.length - 1 ? ", " : ""}
                              </span>
                            );
                          })}
                        </span>
                      ) : (
                        <span className="text-muted">None specified</span>
                      )}
                    </p>
                  </Col>
                </Row>
              </Card.Body>
            </Card>

            {/* Conversation Notes */}
            <Card className="mb-4">
              <Card.Header className="bg-light text-dark">
                <h6 className="mb-0">Conversation Notes</h6>
              </Card.Header>
              <Card.Body>
                <div className="border-start border-secondary border-4 ps-3">
                  <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>
                    {intel.conversation_notes}
                  </p>
                </div>
              </Card.Body>
            </Card>

            {/* Action Required */}
            <Card>
              <Card.Header className="d-flex align-items-center justify-content-between">
                <h6 className="mb-0">Action Required</h6>
                <span
                  className="badge fs-6"
                  style={{
                    backgroundColor: getFlagColor(intel.action_required),
                    color: getContrastTextColor(
                      getFlagColor(intel.action_required),
                    ),
                    fontWeight: "bold",
                  }}
                >
                  {formatActionRequired(intel.action_required)}
                </span>
              </Card.Header>
              <Card.Body>
                {intel.action_required.toLowerCase() === "discuss urgently" && (
                  <Alert variant="danger">
                    <strong>Urgent Discussion Required</strong>
                    <br />
                    This intelligence requires immediate attention and
                    discussion with the recruitment team.
                  </Alert>
                )}
                {intel.action_required.toLowerCase() === "monitor" && (
                  <Alert variant="warning">
                    <strong>Monitor Situation</strong>
                    <br />
                    Keep tracking this player's situation and gather more
                    information as it becomes available.
                  </Alert>
                )}
                {intel.action_required.toLowerCase() === "beyond us" && (
                  <Alert variant="secondary">
                    <strong>Beyond Our Reach</strong>
                    <br />
                    This transfer appears to be beyond our current capabilities
                    or budget constraints.
                  </Alert>
                )}
                {intel.action_required.toLowerCase() === "no action" && (
                  <Alert variant="light">
                    <strong>No Action Required</strong>
                    <br />
                    This information is noted but no immediate action is
                    required.
                  </Alert>
                )}
              </Card.Body>
            </Card>
          </>
        )}
      </Modal.Body>
    </Modal>
  );
};

export default IntelReportModal;
