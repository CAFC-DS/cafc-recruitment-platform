import React, { useState, useEffect, useRef, useCallback } from "react";
import { Modal, Form, Button, Row, Col, Alert, Spinner, ListGroup, Card } from "react-bootstrap";
import Select from "react-select";
import axiosInstance from "../axiosInstance";
import { Player } from "../types/Player";

type IntelType = "player_information" | "general_note" | "reference_form";

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
  relationshipToPlayer: [] as string[],
  lengthOfRelationship: "",
  relevanceOfRelationship: "",
  referenceRating: "",
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
  // Pagination for player search (infinite scroll, mirrors navbar search)
  const [playerSearchOffset, setPlayerSearchOffset] = useState(0);
  const [hasMorePlayerResults, setHasMorePlayerResults] = useState(false);
  const [loadingMorePlayers, setLoadingMorePlayers] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchCacheRef = useRef<Record<string, { players: Player[]; hasMore: boolean }>>({});
  const currentPlayerSearchQueryRef = useRef<string>("");
  const playerSearchObserverRef = useRef<IntersectionObserver | null>(null);
  const PLAYER_SEARCH_PAGE_SIZE = 10;

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

  const relationshipToPlayerOptions = [
    { value: "Managed/Coached", label: "Managed/Coached" },
    { value: "Worked With", label: "Worked With" },
    { value: "Played With", label: "Played With" },
    { value: "Friend/Family", label: "Friend/Family" },
    { value: "Mutual Circles", label: "Mutual Circles" },
    { value: "Other", label: "Other" },
  ];

  const lengthOfRelationshipOptions = [
    { value: "Less Than 1 Year", label: "Less Than 1 Year" },
    { value: "1-2 Years", label: "1-2 Years" },
    { value: "2-3 Years", label: "2-3 Years" },
    { value: "3+ Years", label: "3+ Years" },
  ];

  const relevanceOfRelationshipOptions = [
    { value: "Current", label: "Current" },
    { value: "Recent (Within 2 Years)", label: "Recent (Within 2 Years)" },
    { value: "Historic (2+ Years)", label: "Historic (2+ Years)" },
  ];

  const referenceRatingOptions = [
    { value: "Extremely Positive", label: "Extremely Positive" },
    { value: "Positive", label: "Positive" },
    { value: "Mixed", label: "Mixed" },
    { value: "Negative", label: "Negative" },
    { value: "Extremely Negative", label: "Extremely Negative" },
  ];

  const effectiveIntelType: IntelType | null = editMode
    ? (((existingReportData?.intel_type as IntelType | undefined) ?? "player_information"))
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
    currentPlayerSearchQueryRef.current = trimmedQuery;
    setPlayerSearchOffset(0);

    const cached = searchCacheRef.current[trimmedQuery];
    if (cached) {
      setSearchedPlayers(cached.players);
      setHasMorePlayerResults(cached.hasMore);
      // Restore the offset so scrolling continues from the last loaded page
      // rather than refetching pages already cached (avoids duplicates).
      setPlayerSearchOffset(Math.max(0, cached.players.length - PLAYER_SEARCH_PAGE_SIZE));
      setPlayerSearchLoading(false);
      setShowPlayerDropdown(cached.players.length > 0);
      return;
    }

    try {
      setPlayerSearchLoading(true);
      const response = await axiosInstance.get(`/players/search`, {
        params: { query: trimmedQuery, limit: PLAYER_SEARCH_PAGE_SIZE, offset: 0 },
      });
      let results: Player[] = [];
      let hasMore = false;
      if (Array.isArray(response.data)) {
        results = response.data;
      } else if (response.data) {
        results = response.data.players || [];
        hasMore = response.data.has_more || false;
      }
      // Ignore stale responses if the query changed during the request
      if (currentPlayerSearchQueryRef.current !== trimmedQuery) return;
      searchCacheRef.current[trimmedQuery] = { players: results, hasMore };
      setSearchedPlayers(results);
      setHasMorePlayerResults(hasMore);
      setShowPlayerDropdown(results.length > 0);
    } catch (searchError) {
      console.error("Error searching players:", searchError);
      setSearchedPlayers([]);
      setHasMorePlayerResults(false);
      setShowPlayerDropdown(false);
    } finally {
      setPlayerSearchLoading(false);
    }
  };

  // Load the next page of player search results (infinite scroll)
  const loadMorePlayerResults = useCallback(async () => {
    if (loadingMorePlayers || !hasMorePlayerResults) return;
    const query = currentPlayerSearchQueryRef.current;
    if (!query) return;

    setLoadingMorePlayers(true);
    const nextOffset = playerSearchOffset + PLAYER_SEARCH_PAGE_SIZE;

    try {
      const response = await axiosInstance.get(`/players/search`, {
        params: { query, limit: PLAYER_SEARCH_PAGE_SIZE, offset: nextOffset },
      });
      let results: Player[] = [];
      let hasMore = false;
      if (Array.isArray(response.data)) {
        results = response.data;
      } else if (response.data) {
        results = response.data.players || [];
        hasMore = response.data.has_more || false;
      }
      if (currentPlayerSearchQueryRef.current !== query) return;
      setSearchedPlayers((prev) => {
        const merged = [...prev, ...results];
        // Keep the cache in sync so re-focusing the same query restores all loaded pages
        searchCacheRef.current[query] = { players: merged, hasMore };
        return merged;
      });
      setHasMorePlayerResults(hasMore);
      setPlayerSearchOffset(nextOffset);
    } catch (error) {
      console.error("Error loading more players:", error);
    } finally {
      setLoadingMorePlayers(false);
    }
  }, [loadingMorePlayers, hasMorePlayerResults, playerSearchOffset]);

  // Attach an IntersectionObserver to the last result so scrolling loads more
  const lastPlayerResultRef = useCallback(
    (node: HTMLElement | null) => {
      if (loadingMorePlayers) return;
      if (playerSearchObserverRef.current) playerSearchObserverRef.current.disconnect();
      playerSearchObserverRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMorePlayerResults) {
          loadMorePlayerResults();
        }
      });
      if (node) playerSearchObserverRef.current.observe(node);
    },
    [loadingMorePlayers, hasMorePlayerResults, loadMorePlayerResults],
  );

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
      setHasMorePlayerResults(false);
      setPlayerSearchOffset(0);
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
    setHasMorePlayerResults(false);
    setPlayerSearchOffset(0);
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
        existingReportData.intel_type === "general_note"
          ? "general_note"
          : existingReportData.intel_type === "reference_form"
            ? "reference_form"
            : "player_information";

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
        relationshipToPlayer: existingReportData.relationship_to_player || [],
        lengthOfRelationship: existingReportData.length_of_relationship || "",
        relevanceOfRelationship: existingReportData.relevance_of_relationship || "",
        referenceRating: existingReportData.reference_rating || "",
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

    if (currentIntelType === "reference_form") {
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
      if (formData.relationshipToPlayer.length === 0) {
        setError("At least one Relationship To Player must be selected");
        setIsSubmitting(false);
        return;
      }
      if (!formData.lengthOfRelationship) {
        setError("Length of Relationship is required");
        setIsSubmitting(false);
        return;
      }
      if (!formData.relevanceOfRelationship) {
        setError("Relevance of Relationship is required");
        setIsSubmitting(false);
        return;
      }
      if (!formData.conversationNotes.trim()) {
        setError("Reference is required");
        setIsSubmitting(false);
        return;
      }
      if (!formData.referenceRating) {
        setError("Reference Rating is required");
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
        notes:
          currentIntelType === "general_note"
            ? formData.notes
            : currentIntelType === "reference_form"
              ? formData.conversationNotes
              : null,
        relationship_to_player:
          currentIntelType === "reference_form" ? formData.relationshipToPlayer : [],
        length_of_relationship:
          currentIntelType === "reference_form" ? formData.lengthOfRelationship || null : null,
        relevance_of_relationship:
          currentIntelType === "reference_form" ? formData.relevanceOfRelationship || null : null,
        reference_rating:
          currentIntelType === "reference_form" ? formData.referenceRating || null : null,
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
                  maxHeight: "240px",
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
                  const isLast = index === searchedPlayers.length - 1;

                  return (
                    <ListGroup.Item
                      key={player.universal_id || `fallback-${index}-${playerName}`}
                      ref={isLast ? (lastPlayerResultRef as any) : undefined}
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
                {loadingMorePlayers && (
                  <ListGroup.Item className="d-flex justify-content-center align-items-center text-muted">
                    <Spinner animation="border" size="sm" className="me-2" />
                    Loading more...
                  </ListGroup.Item>
                )}
                {!hasMorePlayerResults && !loadingMorePlayers && (
                  <ListGroup.Item className="text-center text-muted" style={{ fontSize: "0.8rem" }}>
                    {searchedPlayers.length} result{searchedPlayers.length !== 1 ? "s" : ""}
                  </ListGroup.Item>
                )}
              </ListGroup>
            )}
            {searchedPlayer && (
              <div className="mt-2 p-2" style={{ backgroundColor: "var(--color-background)", borderRadius: "4px" }}>
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

  const renderReferenceFormFields = () => (
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

      <Row className="mb-3">
        <Form.Group as={Col} md={6} controlId="relationshipToPlayer">
          <Form.Label>
            Relationship To Player <span className="text-danger">*</span>
          </Form.Label>
          <Select
            isMulti
            options={relationshipToPlayerOptions}
            value={relationshipToPlayerOptions.filter((option) =>
              formData.relationshipToPlayer.includes(option.value),
            )}
            onChange={(selectedOptions) => {
              setFormData((prev) => ({
                ...prev,
                relationshipToPlayer: selectedOptions
                  ? selectedOptions.map((opt) => opt.value)
                  : [],
              }));
            }}
            placeholder="Select relationships..."
            classNamePrefix="react-select"
          />
        </Form.Group>
        <Form.Group as={Col} md={6} controlId="lengthOfRelationship">
          <Form.Label>
            Length of Relationship <span className="text-danger">*</span>
          </Form.Label>
          <Form.Select
            name="lengthOfRelationship"
            value={formData.lengthOfRelationship}
            onChange={handleInputChange}
            required
          >
            <option value="">Select length...</option>
            {lengthOfRelationshipOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Form.Select>
        </Form.Group>
      </Row>

      <Row className="mb-3">
        <Form.Group as={Col} md={6} controlId="relevanceOfRelationship">
          <Form.Label>
            Relevance of Relationship <span className="text-danger">*</span>
          </Form.Label>
          <Form.Select
            name="relevanceOfRelationship"
            value={formData.relevanceOfRelationship}
            onChange={handleInputChange}
            required
          >
            <option value="">Select relevance...</option>
            {relevanceOfRelationshipOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Form.Select>
        </Form.Group>
        <Form.Group as={Col} md={6} controlId="referenceRating">
          <Form.Label>
            Reference Rating <span className="text-danger">*</span>
          </Form.Label>
          <Form.Select
            name="referenceRating"
            value={formData.referenceRating}
            onChange={handleInputChange}
            required
          >
            <option value="">Select rating...</option>
            {referenceRatingOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Form.Select>
        </Form.Group>
      </Row>

      <Form.Group className="mb-3" controlId="conversationNotes">
        <Form.Label>
          Reference <span className="text-danger">*</span>
        </Form.Label>
        <Form.Control
          as="textarea"
          rows={6}
          name="conversationNotes"
          value={formData.conversationNotes}
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
              : effectiveIntelType === "reference_form"
                ? "Edit Reference Form"
                : "Edit Intel Report"
            : effectiveIntelType
              ? effectiveIntelType === "general_note"
                ? "General Note"
                : effectiveIntelType === "reference_form"
                  ? "Reference Form"
                  : "Player Information"
              : "Select Intel Type"}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {!editMode && !effectiveIntelType ? (
          <div>
            <p className="mb-4">Choose the type of intel entry you want to add.</p>
            <Row className="g-3">
              <Col md={4}>
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
              <Col md={4}>
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
              <Col md={4}>
                <Card
                  className="h-100 intel-type-card"
                  role="button"
                  onClick={() => setIntelType("reference_form")}
                >
                  <Card.Body>
                    <div className="fw-bold mb-2">Reference Form</div>
                    <div className="text-muted small">
                      Reference from a contact who knows the player, including relationship context and rating.
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
              {effectiveIntelType === "reference_form" && renderReferenceFormFields()}

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
                      effectiveIntelType === "general_note"
                        ? "Update General Note"
                        : effectiveIntelType === "reference_form"
                          ? "Update Reference Form"
                          : "Update Intel Report"
                    ) : effectiveIntelType === "general_note" ? (
                      "Submit General Note"
                    ) : effectiveIntelType === "reference_form" ? (
                      "Submit Reference Form"
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
          border: 1px solid var(--color-border);
          transition: border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
        }
        .intel-type-card:hover {
          border-color: var(--color-text);
          transform: translateY(-2px);
          box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.08);
        }
      `}</style>
    </Modal>
  );
};

export default IntelModal;
