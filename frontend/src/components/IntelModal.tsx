import React, { useState, useEffect, useRef } from "react";
import { Modal, Form, Button, Row, Col, Alert, Spinner, ListGroup, Card } from "react-bootstrap";
import Select from "react-select";
import axiosInstance from "../axiosInstance";
import { Player } from "../types/Player";

type IntelType = "player_information" | "general_note";

interface IntelModalProps {
  show: boolean;
  onHide: () => void;
  selectedPlayer: Player | null;
  onIntelSubmitSuccess: (message: string, variant: "success" | "danger") => void;
  editMode?: boolean;
  reportId?: number | null;
  existingReportData?: any;
}

const initialFormData = {
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
  recommendation: "monitor",
  notes: "",
};

const IntelModal: React.FC<IntelModalProps> = ({
  show,
  onHide,
  selectedPlayer,
  onIntelSubmitSuccess,
  editMode = false,
  reportId = null,
  existingReportData = null,
}) => {
  const [intelType, setIntelType] = useState<IntelType | null>(null);
  const [formData, setFormData] = useState(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [playerSearch, setPlayerSearch] = useState("");
  const [searchedPlayers, setSearchedPlayers] = useState<Player[]>([]);
  const [searchedPlayer, setSearchedPlayer] = useState<Player | null>(null);
  const [playerSearchLoading, setPlayerSearchLoading] = useState(false);
  const [showPlayerDropdown, setShowPlayerDropdown] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchCacheRef = useRef<Record<string, Player[]>>({});

  const dealTypeOptions = [
    { value: "free", label: "Free Transfer" },
    { value: "permanent", label: "Permanent Transfer" },
    { value: "loan", label: "Loan" },
    { value: "loan_with_option", label: "Loan with Option" },
    { value: "na", label: "N/A" },
  ];

  const recommendationOptions = [
    { value: "beyond us", label: "Beyond Us" },
    { value: "unavailable", label: "Unavailable" },
    { value: "discuss urgently", label: "Discuss Urgently" },
    { value: "monitor", label: "Monitor" },
    { value: "no action", label: "No Action" },
  ];

  const effectiveIntelType = editMode
    ? ((existingReportData?.intel_type as IntelType | undefined) || "player_information")
    : intelType;
  const canInteractWithForm = Boolean(selectedPlayer || searchedPlayer || editMode);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleNumericInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const numericRangeRegex = /^\d*(?:-\d*)?$/;
    if (value === "" || numericRangeRegex.test(value)) {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const isValidWageInput = (value: string) => {
    const normalized = value.replace(/,/g, "").replace(/\s+/g, "");
    if (!normalized) return true;
    if (/^\d+$/.test(normalized)) return true;

    const rangeMatch = normalized.match(/^(\d+)-(\d+)$/);
    if (!rangeMatch) return false;
    return parseInt(rangeMatch[1], 10) <= parseInt(rangeMatch[2], 10);
  };

  const performPlayerSearch = async (query: string) => {
    const trimmedQuery = query.trim();
    if (searchCacheRef.current[trimmedQuery]) {
      setSearchedPlayers(searchCacheRef.current[trimmedQuery]);
      setPlayerSearchLoading(false);
      setShowPlayerDropdown(searchCacheRef.current[trimmedQuery].length > 0);
      return;
    }

    try {
      setPlayerSearchLoading(true);
      const response = await axiosInstance.get(
        `/players/search?query=${encodeURIComponent(trimmedQuery)}`,
      );
      const results = Array.isArray(response.data) ? response.data : response.data?.players || [];
      searchCacheRef.current[trimmedQuery] = results;
      setSearchedPlayers(results);
      setShowPlayerDropdown(results.length > 0);
    } catch (searchError) {
      console.error("Error searching players:", searchError);
      setSearchedPlayers([]);
      setShowPlayerDropdown(false);
    } finally {
      setPlayerSearchLoading(false);
    }
  };

  const handlePlayerSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setPlayerSearch(query);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (query.length <= 2) {
      setSearchedPlayers([]);
      setShowPlayerDropdown(false);
      setPlayerSearchLoading(false);
      return;
    }

    setPlayerSearchLoading(true);
    searchTimeoutRef.current = setTimeout(() => {
      performPlayerSearch(query);
    }, 300);
  };

  const handlePlayerSelect = (player: Player) => {
    setSearchedPlayer(player);
    const playerName = player.player_name || player.name || player.playername || "Unknown Player";
    const team = player.team || player.club || player.current_team || player.squad_name || "";
    const age = player.age || "";
    setPlayerSearch(
      `${playerName} (${[team, age ? `Age ${age}` : ""].filter(Boolean).join(" • ")})`,
    );
    setSearchedPlayers([]);
    setShowPlayerDropdown(false);
  };

  const handleInputBlur = () => {
    setTimeout(() => setShowPlayerDropdown(false), 200);
  };

  const handleInputFocus = () => {
    if (searchedPlayers.length > 0) {
      setShowPlayerDropdown(true);
    }
  };

  const resetForm = () => {
    setIntelType(null);
    setFormData(initialFormData);
    setError("");
    setPlayerSearch("");
    setSearchedPlayers([]);
    setSearchedPlayer(null);
    setShowPlayerDropdown(false);
  };

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!show) {
      return;
    }

    if (editMode && existingReportData) {
      const resolvedIntelType: IntelType =
        existingReportData.intel_type === "general_note" ? "general_note" : "player_information";

      setIntelType(resolvedIntelType);
      setFormData({
        contactName: existingReportData.contact_name || "",
        contactOrganisation: existingReportData.contact_organisation || "",
        dateOfInformation: existingReportData.date_of_information || "",
        confirmedContractExpiry: existingReportData.confirmed_contract_expiry || "",
        contractOptions: existingReportData.contract_options || "",
        potentialDealTypes: existingReportData.potential_deal_types || [],
        transferFee: existingReportData.transfer_fee || "",
        currentWages: existingReportData.current_wages || "",
        expectedWages: existingReportData.expected_wages || "",
        conversationNotes: existingReportData.conversation_notes || existingReportData.notes || "",
        recommendation: existingReportData.recommendation || existingReportData.action_required || "monitor",
        notes: existingReportData.notes || existingReportData.conversation_notes || "",
      });

      if (existingReportData.player_name) {
        setPlayerSearch(existingReportData.player_name);
      }
      return;
    }

    if (selectedPlayer) {
      setSearchedPlayer(selectedPlayer);
      setPlayerSearch(selectedPlayer.player_name || selectedPlayer.name || "");
    }
  }, [show, editMode, existingReportData, selectedPlayer]);

  const handleBackToTypePicker = () => {
    setIntelType(null);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    const currentIntelType = effectiveIntelType;
    const currentPlayer = selectedPlayer || searchedPlayer;

    if (!currentIntelType) {
      setError("Please select an intel type");
      setIsSubmitting(false);
      return;
    }

    if (!currentPlayer && !editMode) {
      setError("Please select a player");
      setIsSubmitting(false);
      return;
    }

    if (currentIntelType === "player_information") {
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
      if (!isValidWageInput(formData.currentWages)) {
        setError("Current Wages must be a whole number or range like 6500-7500");
        setIsSubmitting(false);
        return;
      }
      if (!isValidWageInput(formData.expectedWages)) {
        setError("Expected Wages must be a whole number or range like 6500-7500");
        setIsSubmitting(false);
        return;
      }
    }

    if (currentIntelType === "general_note") {
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
      if (!formData.notes.trim()) {
        setError("Notes are required");
        setIsSubmitting(false);
        return;
      }
    }

    try {
      const payload = {
        player_id:
          currentPlayer?.universal_id ||
          currentPlayer?.player_id ||
          currentPlayer?.cafc_player_id ||
          existingReportData?.player_id,
        intel_type: currentIntelType,
        contact_name: formData.contactName || null,
        contact_organisation: formData.contactOrganisation || null,
        date_of_information: formData.dateOfInformation || null,
        confirmed_contract_expiry:
          currentIntelType === "player_information" ? formData.confirmedContractExpiry || null : null,
        contract_options:
          currentIntelType === "player_information" ? formData.contractOptions || null : null,
        potential_deal_types:
          currentIntelType === "player_information" ? formData.potentialDealTypes : [],
        transfer_fee: currentIntelType === "player_information" ? formData.transferFee || null : null,
        current_wages: currentIntelType === "player_information" ? formData.currentWages || null : null,
        expected_wages:
          currentIntelType === "player_information" ? formData.expectedWages || null : null,
        conversation_notes:
          currentIntelType === "player_information" ? formData.conversationNotes : null,
        recommendation:
          currentIntelType === "player_information" ? formData.recommendation : null,
        notes: currentIntelType === "general_note" ? formData.notes : null,
      };

      if (editMode && reportId) {
        await axiosInstance.put(`/intel_reports/${reportId}`, payload);
        onIntelSubmitSuccess("Intel report updated successfully!", "success");
      } else {
        await axiosInstance.post("/intel_reports", payload);
        onIntelSubmitSuccess("Intel report created successfully!", "success");
      }

      onHide();
    } catch (submitError: any) {
      console.error("Error submitting intel report:", submitError);
      let errorMessage = `Failed to ${editMode ? "update" : "submit"} intel report. Please try again.`;

      if (submitError.response?.data) {
        const data = submitError.response.data;
        if (Array.isArray(data.detail)) {
          errorMessage = data.detail.map((err: any) => err.msg).join(", ");
        } else if (typeof data.detail === "string") {
          errorMessage = data.detail;
        } else if (data.detail && typeof data.detail === "object") {
          errorMessage = JSON.stringify(data.detail);
        }
      }

      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderPlayerSearch = () => (
    <>
      {!selectedPlayer && !editMode && (
        <>
          <Form.Group className="mb-3" controlId="playerSearch">
            <Form.Label>
              Player <span className="text-danger">*</span>
            </Form.Label>
            <div className="position-relative">
              <Form.Control
                type="text"
                placeholder="Search for player..."
                value={playerSearch}
                onChange={handlePlayerSearchChange}
                onBlur={handleInputBlur}
                onFocus={handleInputFocus}
                autoComplete="off"
              />
              {playerSearchLoading && (
                <div
                  className="position-absolute top-50 end-0 translate-middle-y me-3"
                  style={{ zIndex: 10 }}
                >
                  <Spinner animation="border" size="sm" />
                </div>
              )}
            </div>
            {showPlayerDropdown && searchedPlayers.length > 0 && (
              <ListGroup
                className="mt-2"
                style={{
                  position: "absolute",
                  zIndex: 1000,
                  maxHeight: "200px",
                  overflowY: "auto",
                  width: "calc(100% - 30px)",
                }}
              >
                {searchedPlayers.map((player, index) => {
                  const playerName =
                    player.player_name || player.name || player.playername || "Unknown Player";
                  const team =
                    player.team || player.club || player.current_team || player.squad_name || "";
                  const age = player.age || "";

                  return (
                    <ListGroup.Item
                      key={player.universal_id || `fallback-${index}-${playerName}`}
                      action
                      onClick={() => handlePlayerSelect(player)}
                    >
                      <div style={{ fontWeight: 600 }}>{playerName}</div>
                      {(team || age) && (
                        <small className="text-muted">
                          {[team, age ? `Age ${age}` : ""].filter(Boolean).join(" • ")}
                        </small>
                      )}
                    </ListGroup.Item>
                  );
                })}
              </ListGroup>
            )}
            {searchedPlayer && (
              <div className="mt-2 p-2" style={{ backgroundColor: "#eef3f7", borderRadius: "4px" }}>
                <strong>Selected:</strong> {searchedPlayer.player_name || searchedPlayer.name} (
                {searchedPlayer.squad_name || searchedPlayer.team || "No club"})
              </div>
            )}
          </Form.Group>
          <hr className="my-4" />
        </>
      )}
    </>
  );

  const renderPlayerInformationFields = () => (
    <>
      <Row className="mb-3">
        <Form.Group as={Col} controlId="dateOfInformation">
          <Form.Label>
            Date of Information <span className="text-danger">*</span>
          </Form.Label>
          <Form.Control
            type="date"
            name="dateOfInformation"
            value={formData.dateOfInformation}
            onChange={handleInputChange}
            required
          />
        </Form.Group>
        <Form.Group as={Col} controlId="contactName">
          <Form.Label>
            Contact Name <span className="text-danger">*</span>
          </Form.Label>
          <Form.Control
            type="text"
            name="contactName"
            value={formData.contactName}
            onChange={handleInputChange}
            required
          />
        </Form.Group>
        <Form.Group as={Col} controlId="contactOrganisation">
          <Form.Label>
            Contact Organisation <span className="text-danger">*</span>
          </Form.Label>
          <Form.Control
            type="text"
            name="contactOrganisation"
            value={formData.contactOrganisation}
            onChange={handleInputChange}
            required
          />
        </Form.Group>
      </Row>

      <Form.Group className="mb-3" controlId="confirmedContractExpiry">
        <Form.Label>Confirmed Contract Expiry</Form.Label>
        <Form.Control
          type="date"
          name="confirmedContractExpiry"
          value={formData.confirmedContractExpiry}
          onChange={handleInputChange}
        />
      </Form.Group>

      <Row className="mb-3">
        <Form.Group as={Col} md={6} controlId="contractOptions">
          <Form.Label>Contract Options</Form.Label>
          <Form.Control
            type="text"
            name="contractOptions"
            value={formData.contractOptions}
            onChange={handleInputChange}
          />
        </Form.Group>
        <Form.Group as={Col} md={6} controlId="potentialDealTypes">
          <Form.Label>
            Potential Deal Types <span className="text-danger">*</span>
          </Form.Label>
          <Select
            isMulti
            options={dealTypeOptions}
            value={dealTypeOptions.filter((option) =>
              formData.potentialDealTypes.includes(option.value),
            )}
            onChange={(selectedOptions) => {
              setFormData((prev) => ({
                ...prev,
                potentialDealTypes: selectedOptions ? selectedOptions.map((opt) => opt.value) : [],
              }));
            }}
            placeholder="Select deal types..."
            classNamePrefix="react-select"
          />
        </Form.Group>
      </Row>

      <Row className="mb-3">
        <Form.Group as={Col} md={4} controlId="transferFee">
          <Form.Label>Transfer Fee</Form.Label>
          <Form.Control
            type="text"
            name="transferFee"
            value={formData.transferFee}
            onChange={handleInputChange}
          />
        </Form.Group>
        <Form.Group as={Col} md={4} controlId="currentWages">
          <Form.Label>Current Wages</Form.Label>
          <Form.Control
            type="text"
            name="currentWages"
            value={formData.currentWages}
            onChange={handleNumericInputChange}
            placeholder="e.g. 50000 or 6500-7500"
          />
          <Form.Text className="text-muted">
            Wages/week in GBP. Use a single value or range, e.g. 6500-7500
          </Form.Text>
        </Form.Group>
        <Form.Group as={Col} md={4} controlId="expectedWages">
          <Form.Label>Expected Wages</Form.Label>
          <Form.Control
            type="text"
            name="expectedWages"
            value={formData.expectedWages}
            onChange={handleNumericInputChange}
            placeholder="e.g. 75000 or 6500-7500"
          />
          <Form.Text className="text-muted">
            Wages/week in GBP. Use a single value or range, e.g. 6500-7500
          </Form.Text>
        </Form.Group>
      </Row>

      <Form.Group className="mb-3" controlId="conversationNotes">
        <Form.Label>
          Conversation Notes <span className="text-danger">*</span>
        </Form.Label>
        <Form.Control
          as="textarea"
          rows={4}
          name="conversationNotes"
          value={formData.conversationNotes}
          onChange={handleInputChange}
          required
        />
      </Form.Group>

      <Form.Group className="mb-4" controlId="recommendation">
        <Form.Label>
          Recommendation <span className="text-danger">*</span>
        </Form.Label>
        <Form.Select
          name="recommendation"
          value={formData.recommendation}
          onChange={handleInputChange}
          required
        >
          {recommendationOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Form.Select>
      </Form.Group>
    </>
  );

  const renderGeneralNoteFields = () => (
    <>
      <Row className="mb-3">
        <Form.Group as={Col} controlId="dateOfInformation">
          <Form.Label>
            Date of Information <span className="text-danger">*</span>
          </Form.Label>
          <Form.Control
            type="date"
            name="dateOfInformation"
            value={formData.dateOfInformation}
            onChange={handleInputChange}
            required
          />
        </Form.Group>
        <Form.Group as={Col} controlId="contactName">
          <Form.Label>
            Contact Name <span className="text-danger">*</span>
          </Form.Label>
          <Form.Control
            type="text"
            name="contactName"
            value={formData.contactName}
            onChange={handleInputChange}
            required
          />
        </Form.Group>
        <Form.Group as={Col} controlId="contactOrganisation">
          <Form.Label>
            Contact Organisation <span className="text-danger">*</span>
          </Form.Label>
          <Form.Control
            type="text"
            name="contactOrganisation"
            value={formData.contactOrganisation}
            onChange={handleInputChange}
            required
          />
        </Form.Group>
      </Row>

      <Form.Group className="mb-3" controlId="notes">
        <Form.Label>
          Notes <span className="text-danger">*</span>
        </Form.Label>
        <Form.Control
          as="textarea"
          rows={6}
          name="notes"
          value={formData.notes}
          onChange={handleInputChange}
          required
        />
      </Form.Group>
    </>
  );

  return (
    <Modal show={show} onHide={onHide} size="lg" centered onExited={resetForm}>
      <Modal.Header
        closeButton
        style={{ backgroundColor: "#000000", color: "white" }}
        className="modal-header-dark"
      >
        <Modal.Title>
          {editMode
            ? effectiveIntelType === "general_note"
              ? "Edit General Note"
              : "Edit Intel Report"
            : effectiveIntelType
              ? effectiveIntelType === "general_note"
                ? "General Note"
                : "Player Information"
              : "Select Intel Type"}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {!editMode && !effectiveIntelType ? (
          <div>
            <p className="mb-4">Choose the type of intel entry you want to add.</p>
            <Row className="g-3">
              <Col md={6}>
                <Card
                  className="h-100 intel-type-card"
                  role="button"
                  onClick={() => setIntelType("player_information")}
                >
                  <Card.Body>
                    <div className="fw-bold mb-2">Player Information Form</div>
                    <div className="text-muted small">
                      Full intel entry with contacts, deal context, notes, wages, and recommendation.
                    </div>
                  </Card.Body>
                </Card>
              </Col>
              <Col md={6}>
                <Card
                  className="h-100 intel-type-card"
                  role="button"
                  onClick={() => setIntelType("general_note")}
                >
                  <Card.Body>
                    <div className="fw-bold mb-2">General Note</div>
                    <div className="text-muted small">
                      Quick player-linked note with contact details and required notes.
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            </Row>
          </div>
        ) : (
          <Form onSubmit={handleSubmit}>
            <p>
              <span className="text-danger">*</span> indicates a required field.
            </p>

            {renderPlayerSearch()}

            {error && (
              <Alert variant="danger" className="mb-3">
                {error}
              </Alert>
            )}

            <div
              style={{
                opacity: canInteractWithForm ? 1 : 0.5,
                pointerEvents: canInteractWithForm ? "auto" : "none",
              }}
            >
              {effectiveIntelType === "player_information" && renderPlayerInformationFields()}
              {effectiveIntelType === "general_note" && renderGeneralNoteFields()}

              <div className="d-flex justify-content-between gap-2">
                <div>
                  {!editMode && (
                    <Button variant="outline-secondary" onClick={handleBackToTypePicker} disabled={isSubmitting}>
                      Back
                    </Button>
                  )}
                </div>
                <div className="d-flex gap-2">
                  <Button variant="secondary" onClick={onHide} disabled={isSubmitting}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Spinner animation="border" size="sm" className="me-2" />
                        {editMode ? "Updating..." : "Submitting..."}
                      </>
                    ) : editMode ? (
                      effectiveIntelType === "general_note" ? "Update General Note" : "Update Intel Report"
                    ) : effectiveIntelType === "general_note" ? (
                      "Submit General Note"
                    ) : (
                      "Submit Intel Report"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </Form>
        )}
      </Modal.Body>

      <style>{`
        .modal-header-dark .btn-close {
          filter: invert(1) grayscale(100%) brightness(200%);
        }
        .intel-type-card {
          cursor: pointer;
          border: 1px solid #d9dfe5;
          transition: border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
        }
        .intel-type-card:hover {
          border-color: #000000;
          transform: translateY(-2px);
          box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.08);
        }
      `}</style>
    </Modal>
  );
};

export default IntelModal;
