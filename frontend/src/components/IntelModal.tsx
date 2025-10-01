import React, { useState } from "react";
import { Modal, Form, Button, Row, Col, Alert, Spinner } from "react-bootstrap";
import axiosInstance from "../axiosInstance";
import { Player } from "../types/Player";

interface IntelModalProps {
  show: boolean;
  onHide: () => void;
  selectedPlayer: Player | null;
  onIntelSubmitSuccess: () => void;
}

const IntelModal: React.FC<IntelModalProps> = ({
  show,
  onHide,
  selectedPlayer,
  onIntelSubmitSuccess,
}) => {
  const [formData, setFormData] = useState({
    contactName: "",
    contactOrganisation: "",
    dateOfInformation: "",
    confirmedContractExpiry: "",
    contractOptions: "",
    potentialDealTypes: [] as string[],
    transferFee: "",
    currentWages: "",
    expectedWages: "",
    conversationNotes: "",
    actionRequired: "monitor",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const dealTypeOptions = [
    { value: "free", label: "Free Transfer" },
    { value: "permanent", label: "Permanent Transfer" },
    { value: "loan", label: "Loan" },
    { value: "loan_with_option", label: "Loan with Option" },
  ];

  const actionOptions = [
    { value: "beyond us", label: "Beyond Us" },
    { value: "discuss urgently", label: "Discuss Urgently" },
    { value: "monitor", label: "Monitor" },
    { value: "no action", label: "No Action" },
  ];

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleNumericInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    // Allow numbers, decimals, commas, currency symbols, and common wage/fee formats
    const numericRegex = /^[0-9.,€£$k/weeM\s]*$/;
    if (value === "" || numericRegex.test(value)) {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleDealTypeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      potentialDealTypes: checked
        ? [...prev.potentialDealTypes, value]
        : prev.potentialDealTypes.filter((type) => type !== value),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    // Validate required fields
    if (!formData.contactName.trim()) {
      setError("Contact Name is required");
      setIsSubmitting(false);
      return;
    }
    if (!formData.contactOrganisation.trim()) {
      setError("Contact Organisation is required");
      setIsSubmitting(false);
      return;
    }
    if (!formData.dateOfInformation) {
      setError("Date of Information is required");
      setIsSubmitting(false);
      return;
    }
    if (formData.potentialDealTypes.length === 0) {
      setError("At least one Potential Deal Type must be selected");
      setIsSubmitting(false);
      return;
    }
    if (!formData.conversationNotes.trim()) {
      setError("Conversation Notes are required");
      setIsSubmitting(false);
      return;
    }

    try {
      const payload = {
        player_id:
          selectedPlayer?.universal_id ||
          selectedPlayer?.player_id ||
          selectedPlayer?.cafc_player_id,
        contact_name: formData.contactName,
        contact_organisation: formData.contactOrganisation,
        date_of_information: formData.dateOfInformation,
        confirmed_contract_expiry: formData.confirmedContractExpiry || null,
        contract_options: formData.contractOptions || null,
        potential_deal_types: formData.potentialDealTypes,
        transfer_fee: formData.transferFee || null,
        current_wages: formData.currentWages || null,
        expected_wages: formData.expectedWages || null,
        conversation_notes: formData.conversationNotes,
        action_required: formData.actionRequired,
      };

      await axiosInstance.post("/intel_reports", payload);
      onIntelSubmitSuccess();
    } catch (error: any) {
      console.error("Error submitting intel report:", error);
      setError(
        error.response?.data?.detail ||
          "Failed to submit intel report. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      contactName: "",
      contactOrganisation: "",
      dateOfInformation: "",
      confirmedContractExpiry: "",
      contractOptions: "",
      potentialDealTypes: [],
      transferFee: "",
      currentWages: "",
      expectedWages: "",
      conversationNotes: "",
      actionRequired: "monitor",
    });
    setError("");
  };

  return (
    <Modal show={show} onHide={onHide} size="lg" centered onExited={resetForm}>
      <Modal.Header
        closeButton
        style={{ backgroundColor: "#000000", color: "white" }}
        className="modal-header-dark"
      >
        <Modal.Title>🕵️ Player Intel Report</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {selectedPlayer && (
          <Alert variant="info" className="mb-3">
            <strong>Player:</strong> {selectedPlayer.player_name} (
            {selectedPlayer.team})
          </Alert>
        )}

        {error && (
          <Alert variant="danger" className="mb-3">
            {error}
          </Alert>
        )}

        <Form onSubmit={handleSubmit}>
          <Row className="mb-3">
            <Col md={6}>
              <Form.Group controlId="contactName">
                <Form.Label>Contact Name *</Form.Label>
                <Form.Control
                  type="text"
                  name="contactName"
                  value={formData.contactName}
                  onChange={handleInputChange}
                  required
                  placeholder="e.g. John Smith"
                />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group controlId="contactOrganisation">
                <Form.Label>Contact Organisation *</Form.Label>
                <Form.Control
                  type="text"
                  name="contactOrganisation"
                  value={formData.contactOrganisation}
                  onChange={handleInputChange}
                  required
                  placeholder="e.g. Manchester United FC"
                />
              </Form.Group>
            </Col>
          </Row>

          <Row className="mb-3">
            <Col md={6}>
              <Form.Group controlId="dateOfInformation">
                <Form.Label>Date of Information *</Form.Label>
                <Form.Control
                  type="date"
                  name="dateOfInformation"
                  value={formData.dateOfInformation}
                  onChange={handleInputChange}
                  required
                />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group controlId="confirmedContractExpiry">
                <Form.Label>Confirmed Contract Expiry</Form.Label>
                <Form.Control
                  type="date"
                  name="confirmedContractExpiry"
                  value={formData.confirmedContractExpiry}
                  onChange={handleInputChange}
                />
              </Form.Group>
            </Col>
          </Row>

          <Form.Group className="mb-3" controlId="contractOptions">
            <Form.Label>Contract Options</Form.Label>
            <Form.Control
              type="text"
              name="contractOptions"
              value={formData.contractOptions}
              onChange={handleInputChange}
              placeholder="e.g. 1+1 year option, Release clause €50M"
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Potential Deal Types *</Form.Label>
            <div className="mt-2">
              {dealTypeOptions.map((option) => (
                <Form.Check
                  key={option.value}
                  inline
                  type="checkbox"
                  id={`deal-type-${option.value}`}
                  label={option.label}
                  value={option.value}
                  checked={formData.potentialDealTypes.includes(option.value)}
                  onChange={handleDealTypeChange}
                />
              ))}
            </div>
          </Form.Group>

          <Row className="mb-3">
            <Col md={4}>
              <Form.Group controlId="transferFee">
                <Form.Label>Transfer Fee</Form.Label>
                <Form.Control
                  type="text"
                  name="transferFee"
                  value={formData.transferFee}
                  onChange={handleNumericInputChange}
                  placeholder="e.g. 25M, Free, Undisclosed"
                  title="Enter numeric values with common formats (25M, 25.5M, etc.)"
                />
                <Form.Text className="text-muted">
                  Use formats like: 25M, 50k, Free, Undisclosed
                </Form.Text>
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group controlId="currentWages">
                <Form.Label>Current Wages</Form.Label>
                <Form.Control
                  type="text"
                  name="currentWages"
                  value={formData.currentWages}
                  onChange={handleNumericInputChange}
                  placeholder="e.g. 50k/week"
                  title="Enter numeric wage values"
                />
                <Form.Text className="text-muted">
                  Use formats like: 50k/week, 2.5M/year
                </Form.Text>
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group controlId="expectedWages">
                <Form.Label>Expected Wages</Form.Label>
                <Form.Control
                  type="text"
                  name="expectedWages"
                  value={formData.expectedWages}
                  onChange={handleNumericInputChange}
                  placeholder="e.g. 75k/week"
                  title="Enter numeric wage values"
                />
                <Form.Text className="text-muted">
                  Use formats like: 75k/week, 3M/year
                </Form.Text>
              </Form.Group>
            </Col>
          </Row>

          <Form.Group className="mb-3" controlId="conversationNotes">
            <Form.Label>Conversation Notes *</Form.Label>
            <Form.Control
              as="textarea"
              rows={4}
              name="conversationNotes"
              value={formData.conversationNotes}
              onChange={handleInputChange}
              required
              placeholder="Detailed notes about the conversation, key information disclosed, reliability of source, etc."
            />
          </Form.Group>

          <Form.Group className="mb-4" controlId="actionRequired">
            <Form.Label>Action Required *</Form.Label>
            <Form.Select
              name="actionRequired"
              value={formData.actionRequired}
              onChange={handleInputChange}
              required
            >
              {actionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Form.Select>
          </Form.Group>

          <div className="d-flex justify-content-end gap-2">
            <Button
              variant="secondary"
              onClick={onHide}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" />
                  Submitting...
                </>
              ) : (
                "Submit Intel Report"
              )}
            </Button>
          </div>
        </Form>
      </Modal.Body>
    </Modal>
  );
};

export default IntelModal;
