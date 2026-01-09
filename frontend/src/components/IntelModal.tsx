import React, { useState, useEffect, useRef } from "react";
import { Modal, Form, Button, Row, Col, Alert, Spinner, ListGroup, Card } from "react-bootstrap";
import Select from "react-select";
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

  // Player search state variables
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
    // Allow numbers only
    const numericRegex = /^[0-9]*$/;
    if (value === "" || numericRegex.test(value)) {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  // Player search functions
  const performPlayerSearch = async (query: string) => {
    const trimmedQuery = query.trim();

    // Check cache first
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
      let results = response.data || [];

      // Cache the results
      searchCacheRef.current[trimmedQuery] = results;

      setSearchedPlayers(results);
      setShowPlayerDropdown(results.length > 0);
    } catch (error) {
      console.error("Error searching players:", error);
      setSearchedPlayers([]);
      setShowPlayerDropdown(false);
    } finally {
      setPlayerSearchLoading(false);
    }
  };

  const handlePlayerSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setPlayerSearch(query);

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (query.length <= 2) {
      setSearchedPlayers([]);
      setShowPlayerDropdown(false);
      setPlayerSearchLoading(false);
      return;
    }

    // Set loading immediately for better UX
    setPlayerSearchLoading(true);

    // Debounce the actual search
    searchTimeoutRef.current = setTimeout(() => {
      performPlayerSearch(query);
    }, 300);
  };

  const handlePlayerSelect = (player: Player) => {
    setSearchedPlayer(player);
    const playerName =
      player.player_name ||
      player.name ||
      player.playername ||
      "Unknown Player";
    const team =
      player.team ||
      player.club ||
      player.current_team ||
      player.squad_name ||
      "";
    const age = player.age || "";

    // Format: "Name (Team • Age X)"
    const searchText = `${playerName} (${[team, age ? `Age ${age}` : ""].filter(Boolean).join(" • ")})`;
    setPlayerSearch(searchText);
    setSearchedPlayers([]);
    setShowPlayerDropdown(false);
  };

  const handleInputBlur = () => {
    // Small delay to allow click on dropdown items
    setTimeout(() => {
      setShowPlayerDropdown(false);
    }, 200);
  };

  const handleInputFocus = () => {
    if (searchedPlayers.length > 0) {
      setShowPlayerDropdown(true);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

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
      const currentPlayer = selectedPlayer || searchedPlayer;
      const payload = {
        player_id:
          currentPlayer?.universal_id ||
          currentPlayer?.player_id ||
          currentPlayer?.cafc_player_id,
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
    setPlayerSearch("");
    setSearchedPlayers([]);
    setSearchedPlayer(null);
    setShowPlayerDropdown(false);
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
        <Form onSubmit={handleSubmit}>
          <p>
            <span className="text-danger">*</span> indicates a required field.
          </p>

          {/* Player Search Section - Only show when no player is selected */}
          {!selectedPlayer && (
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
                        player.player_name ||
                        player.name ||
                        player.playername ||
                        "Unknown Player";
                      const team =
                        player.team ||
                        player.club ||
                        player.current_team ||
                        player.squad_name ||
                        "";
                      const age = player.age || "";

                      return (
                        <ListGroup.Item
                          key={
                            player.universal_id ||
                            `fallback-${index}-${playerName}`
                          }
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
                  <div
                    className="mt-2 p-2"
                    style={{ backgroundColor: "#e7f3ff", borderRadius: "4px" }}
                  >
                    <strong>Selected:</strong> {searchedPlayer.player_name} (
                    {searchedPlayer.squad_name || searchedPlayer.team})
                  </div>
                )}
              </Form.Group>

              <hr className="my-4" />
            </>
          )}

          {error && (
            <Alert variant="danger" className="mb-3">
              {error}
            </Alert>
          )}

          {/* Form Section - Greyed out when no player is selected */}
          <div
            style={{
              opacity: selectedPlayer || searchedPlayer ? 1 : 0.5,
              pointerEvents: selectedPlayer || searchedPlayer ? "auto" : "none",
            }}
          >
            {/* Row 1: Date of Information, Contact Name, Contact Organisation */}
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

            {/* Row 2: Confirmed Contract Expiry */}
            <Form.Group className="mb-3" controlId="confirmedContractExpiry">
              <Form.Label>Confirmed Contract Expiry</Form.Label>
              <Form.Control
                type="date"
                name="confirmedContractExpiry"
                value={formData.confirmedContractExpiry}
                onChange={handleInputChange}
              />
            </Form.Group>

            {/* Row 3: Contract Options and Potential Deal Types */}
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
                    setFormData({
                      ...formData,
                      potentialDealTypes: selectedOptions
                        ? selectedOptions.map((opt) => opt.value)
                        : [],
                    });
                  }}
                  placeholder="Select deal types..."
                  classNamePrefix="react-select"
                />
              </Form.Group>
            </Row>

            {/* Row 4: Transfer Fee, Current Wages, Expected Wages */}
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
                  placeholder="e.g. 50000"
                />
                <Form.Text className="text-muted">
                  Wages/week in GBP (numbers only)
                </Form.Text>
              </Form.Group>
              <Form.Group as={Col} md={4} controlId="expectedWages">
                <Form.Label>Expected Wages</Form.Label>
                <Form.Control
                  type="text"
                  name="expectedWages"
                  value={formData.expectedWages}
                  onChange={handleNumericInputChange}
                  placeholder="e.g. 75000"
                />
                <Form.Text className="text-muted">
                  Wages/week in GBP (numbers only)
                </Form.Text>
              </Form.Group>
            </Row>

            {/* Conversation Notes */}
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

            {/* Action Required */}
            <Form.Group className="mb-4" controlId="actionRequired">
              <Form.Label>
                Action Required <span className="text-danger">*</span>
              </Form.Label>
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
          </div>
        </Form>
      </Modal.Body>
      <style>{`
        .modal-header-dark .btn-close {
          filter: invert(1) grayscale(100%) brightness(200%);
        }
      `}</style>
    </Modal>
  );
};

export default IntelModal;
