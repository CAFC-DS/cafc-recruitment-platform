import React, { useState } from "react";
import { Modal, Card, Row, Col, Button } from "react-bootstrap";
import SubmissionStatusBadge from "./agents/SubmissionStatusBadge";
import NotesHistoryModal from "./recommendations/NotesHistoryModal";
import { internalRecommendationsService } from "../services/internalRecommendationsService";

// Despite the name, this modal is only used internally (from PlayerProfilePage's
// Intel History section) to show internal staff the detail of an agent-submitted
// recommendation - it is never rendered on the agent portal itself. Any data
// fetches here (e.g. notes history) must use internalRecommendationsService, not
// agentRecommendationsService, or internal users get a 403 "Agent access required".
interface AgentRecommendationModalProps {
  show: boolean;
  onHide: () => void;
  recommendation: any | null;
  playerName?: string | null;
}

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("en-GB") : "Not specified";

const splitDealTypes = (csv?: string | null): string[] => {
  if (!csv) return [];
  return csv
    .split(",")
    .map((part: string) => part.trim())
    .filter(Boolean);
};

const formatWage = (value: any, currency?: string | null, basis?: string | null) => {
  if (value === null || value === undefined || value === "") return "Not specified";
  const trimmedCurrency = currency ? currency.trim() : "";
  const trimmedBasis = basis ? basis.trim() : "";
  const parts = [trimmedCurrency, String(value), trimmedBasis ? `(${trimmedBasis})` : ""].filter(Boolean);
  return parts.join(" ");
};

const formatTransferFee = (value: any, currency?: string | null) => {
  if (value === null || value === undefined || value === "") return "Not specified";
  const trimmedCurrency = currency ? currency.trim() : "";
  // The serialiser already formats the display string (e.g. "GBP 500,000-1,000,000").
  // If the value already includes a currency prefix, return as-is.
  const stringValue = String(value);
  if (trimmedCurrency && !stringValue.toUpperCase().includes(trimmedCurrency.toUpperCase())) {
    return `${trimmedCurrency} ${stringValue}`;
  }
  return stringValue;
};

const AgentRecommendationModal: React.FC<AgentRecommendationModalProps> = ({
  show,
  onHide,
  recommendation,
  playerName,
}) => {
  const [showNotesHistory, setShowNotesHistory] = useState(false);

  if (!recommendation) {
    return null;
  }

  const dealTypes = splitDealTypes(recommendation.potential_deal_type);
  const positions = splitDealTypes(recommendation.recommended_position);
  const contractOptions = splitDealTypes(recommendation.contract_options);
  const agreementTypes = splitDealTypes(recommendation.agreement_type);
  const wageBasis =
    recommendation.wage_basis ||
    recommendation.expected_wages_basis ||
    recommendation.current_wages_basis ||
    null;

  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <Modal.Header
        closeButton
        style={{ backgroundColor: "#000000", color: "white" }}
        className="modal-header-dark"
      >
        <Modal.Title>
          {playerName ? `${playerName} — Agent Recommendation` : "Agent Recommendation"}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Card className="mb-4">
          <Card.Header style={{ backgroundColor: "#000000", color: "white" }}>
            <h6 className="mb-0">Submission Overview</h6>
          </Card.Header>
          <Card.Body>
            <Row>
              <Col md={6}>
                <p>
                  <strong>Agent:</strong> {recommendation.agent_name || "Not specified"}
                </p>
                <p>
                  <strong>Agency:</strong> {recommendation.agency || "Not specified"}
                </p>
                <p>
                  <strong>Submission Date:</strong>{" "}
                  {formatDate(recommendation.submission_date ?? recommendation.created_at)}
                </p>
              </Col>
              <Col md={6}>
                <p>
                  <strong>Status:</strong>{" "}
                  <SubmissionStatusBadge status={recommendation.status} />
                </p>
                {recommendation.agent_status ? (
                  <p>
                    <strong>Agent Availability:</strong> {recommendation.agent_status}
                  </p>
                ) : null}
                {recommendation.transfermarkt_link ? (
                  <p>
                    <strong>Transfermarkt:</strong>{" "}
                    <a href={recommendation.transfermarkt_link} target="_blank" rel="noreferrer">
                      open
                    </a>
                  </p>
                ) : null}
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
                  <strong>Deal Types:</strong>{" "}
                  {dealTypes.length > 0 ? dealTypes.join(", ") : "Not specified"}
                </p>
                <p>
                  <strong>Agreement Type:</strong>{" "}
                  {agreementTypes.length > 0 ? agreementTypes.join(", ") : "Not specified"}
                </p>
              </Col>
              <Col md={6}>
                <p>
                  <strong>Transfer Fee:</strong>{" "}
                  {formatTransferFee(recommendation.transfer_fee, recommendation.transfer_fee_currency)}
                </p>
                <p>
                  <strong>Recommended Position:</strong>{" "}
                  {positions.length > 0 ? positions.join(", ") : "Not specified"}
                </p>
              </Col>
            </Row>
          </Card.Body>
        </Card>

        <Card className="mb-4">
          <Card.Header className="bg-light text-dark">
            <h6 className="mb-0">Wages</h6>
          </Card.Header>
          <Card.Body>
            <Row>
              <Col md={6}>
                <p>
                  <strong>Current Wages:</strong>{" "}
                  {formatWage(
                    recommendation.current_wages_per_week,
                    recommendation.current_wages_currency,
                    wageBasis,
                  )}
                </p>
              </Col>
              <Col md={6}>
                <p>
                  <strong>Expected Wages:</strong>{" "}
                  {formatWage(
                    recommendation.expected_wages_per_week,
                    recommendation.expected_wages_currency,
                    wageBasis,
                  )}
                </p>
              </Col>
            </Row>
          </Card.Body>
        </Card>

        <Card className="mb-4">
          <Card.Header className="bg-light text-dark">
            <h6 className="mb-0">Contract</h6>
          </Card.Header>
          <Card.Body>
            <Row>
              <Col md={6}>
                <p>
                  <strong>Contract Expiry:</strong>{" "}
                  {recommendation.confirmed_contract_expiry
                    ? formatDate(recommendation.confirmed_contract_expiry)
                    : "Not specified"}
                </p>
              </Col>
              <Col md={6}>
                <p>
                  <strong>Contract Options:</strong>{" "}
                  {contractOptions.length > 0 ? contractOptions.join(", ") : "None specified"}
                </p>
              </Col>
            </Row>
          </Card.Body>
        </Card>

        {recommendation.additional_information ? (
          <Card className="mb-4">
            <Card.Header className="bg-light text-dark">
              <h6 className="mb-0">Additional Information</h6>
            </Card.Header>
            <Card.Body>
              <div className="border-start border-secondary border-4 ps-3">
                <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>
                  {recommendation.additional_information}
                </p>
              </div>
            </Card.Body>
          </Card>
        ) : null}

        <Card>
          <Card.Header className="bg-light text-dark d-flex justify-content-between align-items-center">
            <h6 className="mb-0">Internal Notes Shared With Agent</h6>
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => setShowNotesHistory(true)}
              className="agent-rec-fixed-light-btn"
            >
              View Note History
            </Button>
          </Card.Header>
          <Card.Body>
            <div className="border-start border-secondary border-4 ps-3">
              <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>
                {recommendation.shared_notes || "No notes shared yet."}
              </p>
            </div>
          </Card.Body>
        </Card>
      </Modal.Body>

      <NotesHistoryModal
        show={showNotesHistory}
        onHide={() => setShowNotesHistory(false)}
        playerName={playerName || recommendation.player_name}
        fetchHistory={() => internalRecommendationsService.getNotesHistory(recommendation.id)}
        showAuthor
      />
    </Modal>
  );
};

export default AgentRecommendationModal;
