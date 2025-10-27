import React, { useState, useEffect, useRef } from "react";
import {
  Modal,
  Form,
  Button,
  Row,
  Col,
  OverlayTrigger,
  Tooltip,
  Spinner,
  Toast,
  ToastContainer,
  ListGroup,
  Alert,
  Card,
} from "react-bootstrap";
import axiosInstance from "../axiosInstance";
import Select from "react-select";
import { Player } from "../types/Player";

interface ScoutingAssessmentModalProps {
  show: boolean;
  onHide: () => void;
  selectedPlayer: Player | null;
  onAssessmentSubmitSuccess: () => void;
  editMode?: boolean;
  reportId?: number | null;
  existingReportData?: any;
  initialAssessmentType?: "Player Assessment" | "Flag" | "Clips" | null;
}

const ScoutingAssessmentModal: React.FC<ScoutingAssessmentModalProps> = ({
  show,
  onHide,
  selectedPlayer,
  onAssessmentSubmitSuccess,
  editMode = false,
  reportId,
  existingReportData,
  initialAssessmentType = null,
}) => {
  const [assessmentType, setAssessmentType] = useState<
    "Player Assessment" | "Flag" | "Clips" | null
  >(null);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [showCloseWarningModal, setShowCloseWarningModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastVariant, setToastVariant] = useState("success");
  const [fixtureDate, setFixtureDate] = useState("");
  const [matches, setMatches] = useState<any[]>([]);
  const [strengths, setStrengths] = useState<any[]>([]);
  const [weaknesses, setWeaknesses] = useState<any[]>([]);
  const [positionAttributes, setPositionAttributes] = useState<string[]>([]);
  const [attributeScores, setAttributeScores] = useState<{
    [key: string]: number;
  }>({});

  // Queue state for batch assessments
  const [assessmentQueue, setAssessmentQueue] = useState<any[]>([]);
  const [showQueuePanel, setShowQueuePanel] = useState(false);

  // Loading state for position attributes
  const [attributesLoading, setAttributesLoading] = useState(false);

  // Draft state
  const [hasSavedDraft, setHasSavedDraft] = useState(false);

  // Player search state variables
  const [playerSearch, setPlayerSearch] = useState("");
  const [searchedPlayers, setSearchedPlayers] = useState<Player[]>([]);
  const [searchedPlayer, setSearchedPlayer] = useState<Player | null>(null);
  const [playerSearchLoading, setPlayerSearchLoading] = useState(false);
  const [showPlayerDropdown, setShowPlayerDropdown] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchCacheRef = useRef<Record<string, Player[]>>({});

  const initialFormData = {
    selectedMatch: "",
    playerPosition: "",
    formation: "",
    playerBuild: "",
    playerHeight: "",
    scoutingType: "Live",
    purposeOfAssessment: "Player Report",
    performanceScore: 5,
    assessmentSummary: "",
    justificationRationale: "",
    flagCategory: "",
    oppositionDetails: "",
  };

  const [formData, setFormData] = useState(initialFormData);

  // Load persisted fixture date and match from localStorage on mount
  useEffect(() => {
    if (show && !editMode) {
      const persistedFixtureDate = localStorage.getItem('persistedFixtureDate');
      const persistedSelectedMatch = localStorage.getItem('persistedSelectedMatch');

      if (persistedFixtureDate) {
        setFixtureDate(persistedFixtureDate);
        // Fetch matches for persisted date
        const fetchPersistedMatches = async () => {
          try {
            const response = await axiosInstance.get(
              `/matches/date?fixture_date=${persistedFixtureDate}`,
            );
            const sortedMatches = response.data.sort((a: any, b: any) => {
              const matchA = `${a.home_team} vs ${a.away_team}`.toLowerCase();
              const matchB = `${b.home_team} vs ${b.away_team}`.toLowerCase();
              return matchA.localeCompare(matchB);
            });
            setMatches(sortedMatches);
          } catch (error) {
            console.error("Error fetching persisted matches:", error);
            setMatches([]);
          }
        };
        fetchPersistedMatches();
      }

      if (persistedSelectedMatch) {
        setFormData(prev => ({ ...prev, selectedMatch: persistedSelectedMatch }));
      }
    }
  }, [show, editMode]);

  // Clear form when modal is closed or when switching to new assessment
  useEffect(() => {
    if (!show) {
      // Reset everything when modal closes EXCEPT fixtureDate and selectedMatch (they persist)
      setFormData(prev => ({
        ...initialFormData,
        selectedMatch: prev.selectedMatch, // Keep this persisted
      }));
      setAssessmentType(null);
      // DO NOT clear fixtureDate - it persists
      // DO NOT clear formData.selectedMatch - it persists
      setStrengths([]);
      setWeaknesses([]);
      setPositionAttributes([]);
      setAttributeScores({});
      setPlayerSearch("");
      setSearchedPlayers([]);
      setSearchedPlayer(null);
      setShowPlayerDropdown(false);
      // Clear queue when modal closes
      setAssessmentQueue([]);
      setShowQueuePanel(false);
    } else if (show && !editMode) {
      // Clear form when opening for new assessment EXCEPT fixtureDate and selectedMatch
      setFormData(prev => ({
        ...initialFormData,
        selectedMatch: prev.selectedMatch, // Keep this persisted
      }));
      setAssessmentType(null);
      // DO NOT clear fixtureDate - it persists
      // DO NOT clear formData.selectedMatch - it persists
      setStrengths([]);
      setWeaknesses([]);
      setPositionAttributes([]);
      setAttributeScores({});
      setPlayerSearch("");
      setSearchedPlayers([]);
      setSearchedPlayer(null);
      setShowPlayerDropdown(false);
    }
  }, [show, editMode]);

  // Set initial assessment type if provided (from navbar flow)
  useEffect(() => {
    if (show && initialAssessmentType && !editMode) {
      setAssessmentType(initialAssessmentType);
    }
  }, [show, initialAssessmentType, editMode]);

  // Populate form when in edit mode
  useEffect(() => {
    if (editMode && existingReportData) {
      setAssessmentType(existingReportData.reportType);
      setFormData({
        selectedMatch: existingReportData.selectedMatch?.toString() || "",
        playerPosition: existingReportData.playerPosition || "",
        formation: existingReportData.formation || "",
        playerBuild: existingReportData.playerBuild || "",
        playerHeight: existingReportData.playerHeight || "",
        scoutingType: existingReportData.scoutingType || "Live",
        purposeOfAssessment:
          existingReportData.purposeOfAssessment || "Player Report",
        performanceScore: existingReportData.performanceScore || 5,
        assessmentSummary: existingReportData.assessmentSummary || "",
        justificationRationale: existingReportData.justificationRationale || "",
        flagCategory: existingReportData.flagCategory || "",
        oppositionDetails: existingReportData.oppositionDetails || "",
      });

      if (existingReportData.fixtureDate) {
        const fixtureDate = existingReportData.fixtureDate;
        setFixtureDate(fixtureDate);

        // Fetch matches for the fixture date in edit mode
        const fetchMatchesForEdit = async () => {
          try {
            const response = await axiosInstance.get(
              `/matches/date?fixture_date=${fixtureDate}`,
            );
            const sortedMatches = response.data.sort((a: any, b: any) => {
              const matchA = `${a.home_team} vs ${a.away_team}`.toLowerCase();
              const matchB = `${b.home_team} vs ${b.away_team}`.toLowerCase();
              return matchA.localeCompare(matchB);
            });
            setMatches(sortedMatches);
          } catch (error) {
            console.error("Error fetching matches for edit:", error);
            setMatches([]);
          }
        };

        // Execute the async function
        fetchMatchesForEdit();
      }

      if (existingReportData.strengths) {
        setStrengths(
          existingReportData.strengths.map((s: string) => ({
            value: s,
            label: s,
          })),
        );
      }

      if (existingReportData.weaknesses) {
        setWeaknesses(
          existingReportData.weaknesses.map((w: string) => ({
            value: w,
            label: w,
          })),
        );
      }

      if (existingReportData.attributeScores) {
        setAttributeScores(existingReportData.attributeScores);
      }

      if (existingReportData.playerPosition) {
        setPositionAttributes(
          Object.keys(existingReportData.attributeScores || {}),
        );
      }
    }
  }, [editMode, existingReportData]);

  const isFormValid = () => {
    if (assessmentType === "Player Assessment") {
      const baseValid =
        formData.selectedMatch &&
        formData.playerPosition &&
        formData.playerHeight &&
        formData.assessmentSummary &&
        formData.justificationRationale &&
        formData.performanceScore > 0 &&
        formData.scoutingType &&
        formData.purposeOfAssessment;

      // If Loan Report is selected, also require oppositionDetails
      if (formData.purposeOfAssessment === "Loan Report") {
        return baseValid && formData.oppositionDetails;
      }

      return baseValid;
    } else if (assessmentType === "Flag") {
      return (
        formData.selectedMatch &&
        formData.playerPosition &&
        formData.playerBuild &&
        formData.playerHeight &&
        formData.scoutingType &&
        formData.assessmentSummary &&
        formData.flagCategory
      );
    } else if (assessmentType === "Clips") {
      return (
        formData.playerPosition &&
        formData.playerBuild &&
        formData.playerHeight &&
        formData.assessmentSummary &&
        formData.performanceScore > 0 &&
        strengths.length > 0 &&
        weaknesses.length > 0
      );
    }
    return false;
  };

  const handleFixtureDateChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const date = e.target.value;
    setFixtureDate(date);
    // Save to localStorage for persistence
    if (date) {
      localStorage.setItem('persistedFixtureDate', date);
    } else {
      localStorage.removeItem('persistedFixtureDate');
    }
    if (date) {
      try {
        const response = await axiosInstance.get(
          `/matches/date?fixture_date=${date}`,
        );
        const sortedMatches = response.data.sort((a: any, b: any) => {
          const matchA = `${a.home_team} vs ${a.away_team}`.toLowerCase();
          const matchB = `${b.home_team} vs ${b.away_team}`.toLowerCase();
          return matchA.localeCompare(matchB);
        });
        setMatches(sortedMatches);
      } catch (error) {
        console.error("Error fetching matches:", error);
        setMatches([]);
      }
    } else {
      setMatches([]);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handlePositionChange = async (
    e: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    const position = e.target.value;
    setFormData({ ...formData, playerPosition: position });
    if (position) {
      try {
        setAttributesLoading(true);
        const startTime = performance.now();
        console.log(`Fetching attributes for position: ${position}`);

        const response = await axiosInstance.get(`/attributes/${position}`, {
          timeout: 10000, // 10 second timeout
        });

        const endTime = performance.now();
        const duration = endTime - startTime;

        console.log(`Attributes loaded in ${duration.toFixed(0)}ms for position: ${position}`);

        if (duration > 2000) {
          console.warn(`SLOW: Attributes took ${duration.toFixed(0)}ms for position: ${position}`);
        }

        setPositionAttributes(response.data);
        const initialScores: { [key: string]: number } = {};
        response.data.forEach((attr: string) => {
          initialScores[attr] = 0;
        });
        setAttributeScores(initialScores);
      } catch (error: any) {
        console.error("Error fetching attributes:", error);

        if (error.code === 'ECONNABORTED') {
          setToastMessage("Loading attributes timed out. Please try again or check your connection.");
          setToastVariant("warning");
          setShowToast(true);
        }

        setPositionAttributes([]);
      } finally {
        setAttributesLoading(false);
      }
    } else {
      setPositionAttributes([]);
      setAttributesLoading(false);
    }
  };

  const handleAttributeScoreChange = (attribute: string, value: number) => {
    setAttributeScores({ ...attributeScores, [attribute]: value });
  };

  const handleMultiSelectChange = (
    selectedOptions: any,
    field: "strengths" | "weaknesses",
  ) => {
    if (field === "strengths") {
      setStrengths(selectedOptions);
    } else {
      setWeaknesses(selectedOptions);
    }
  };

  const handleMatchSelectChange = (selectedOption: any) => {
    const matchValue = selectedOption ? selectedOption.value.toString() : "";
    setFormData({
      ...formData,
      selectedMatch: matchValue,
    });
    // Save to localStorage for persistence
    if (matchValue) {
      localStorage.setItem('persistedSelectedMatch', matchValue);
    } else {
      localStorage.removeItem('persistedSelectedMatch');
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
      const startTime = performance.now();

      const response = await axiosInstance.get(
        `/players/search?query=${encodeURIComponent(trimmedQuery)}`,
        { timeout: 10000 } // 10 second timeout for search
      );

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Log slow searches
      if (duration > 2000) {
        console.warn(`Slow player search: ${duration.toFixed(0)}ms for query "${trimmedQuery}"`);
      }

      let results = response.data || [];

      // Cache the results
      searchCacheRef.current[trimmedQuery] = results;

      setSearchedPlayers(results);
      setShowPlayerDropdown(results.length > 0);
    } catch (error: any) {
      console.error("Error searching players:", error);

      // Show user-friendly error message for timeouts
      if (error.code === 'ECONNABORTED') {
        setToastMessage("Player search timed out. Please try again or check your connection.");
        setToastVariant("warning");
        setShowToast(true);
      }

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
    }, 300); // 300ms delay
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
      "Unknown Team";
    setPlayerSearch(`${playerName} (${team})`);
    setSearchedPlayers([]);
    setShowPlayerDropdown(false);
  };

  const handleInputBlur = () => {
    // Increased delay to prevent dropdown from closing during click
    setTimeout(() => {
      setShowPlayerDropdown(false);
    }, 300);
  };

  const handleInputFocus = () => {
    if (searchedPlayers.length > 0) {
      setShowPlayerDropdown(true);
    }
  };

  // Queue management functions
  const addToQueue = () => {
    const currentPlayer = selectedPlayer || searchedPlayer;
    if (!currentPlayer) {
      setToastMessage("Please select a player first");
      setToastVariant("warning");
      setShowToast(true);
      return;
    }

    // Validate form before adding to queue
    if (!isFormValid()) {
      setToastMessage("Please complete all required fields before adding to queue");
      setToastVariant("warning");
      setShowToast(true);
      return;
    }

    // Check if player is already in queue
    const playerAlreadyQueued = assessmentQueue.some(
      item => item.player.universal_id === currentPlayer.universal_id
    );
    if (playerAlreadyQueued) {
      setToastMessage(`${currentPlayer.player_name} is already in the queue`);
      setToastVariant("warning");
      setShowToast(true);
      return;
    }

    const queuedAssessment = {
      id: Date.now(), // Temporary ID for queue management
      player: currentPlayer,
      assessmentType,
      formData: { ...formData },
      strengths: [...strengths],
      weaknesses: [...weaknesses],
      attributeScores: { ...attributeScores },
      fixtureDate,
    };

    setAssessmentQueue([...assessmentQueue, queuedAssessment]);
    setShowQueuePanel(true);

    // Store the current position before clearing
    const currentPosition = formData.playerPosition;

    // Clear form for next player (keep fixture/match AND position)
    setFormData(prev => ({
      ...initialFormData,
      selectedMatch: prev.selectedMatch,
      playerPosition: currentPosition, // Keep position selected
    }));
    setStrengths([]);
    setWeaknesses([]);

    // Keep position attributes and reset scores to 0
    // This prevents having to re-select position for players in same position
    if (currentPosition && positionAttributes.length > 0) {
      const resetScores: { [key: string]: number } = {};
      positionAttributes.forEach((attr: string) => {
        resetScores[attr] = 0;
      });
      setAttributeScores(resetScores);
      // Don't clear positionAttributes - keep them
    } else {
      setPositionAttributes([]);
      setAttributeScores({});
    }

    setPlayerSearch("");
    setSearchedPlayers([]);
    setSearchedPlayer(null);
    setShowPlayerDropdown(false);

    // Show success message
    setToastMessage(`Added ${currentPlayer.player_name} to queue (${assessmentQueue.length + 1} total)`);
    setToastVariant("success");
    setShowToast(true);
  };

  const removeFromQueue = (queueId: number) => {
    setAssessmentQueue(assessmentQueue.filter(item => item.id !== queueId));
    if (assessmentQueue.length <= 1) {
      setShowQueuePanel(false);
    }
  };

  const clearQueue = () => {
    setAssessmentQueue([]);
    setShowQueuePanel(false);
  };

  const handleModalClose = () => {
    const currentPlayer = selectedPlayer || searchedPlayer;

    // If there are items in queue, show warning modal with options
    if (assessmentQueue.length > 0) {
      setShowCloseWarningModal(true);
    }
    // If no queue but has current player/data, auto-save silently
    else if (currentPlayer) {
      // Auto-save draft without prompting
      const queueToSave = [{
        id: Date.now(),
        player: currentPlayer,
        assessmentType,
        formData: { ...formData },
        strengths: [...strengths],
        weaknesses: [...weaknesses],
        attributeScores: { ...attributeScores },
        fixtureDate,
      }];

      const draft = {
        queue: queueToSave,
        timestamp: new Date().toISOString(),
        fixtureDate,
        assessmentType,
      };
      localStorage.setItem('scoutingAssessmentDraft', JSON.stringify(draft));
      setHasSavedDraft(true);
      console.log('💾 Auto-saved draft on close');
      onHide();
    }
    // No data to save, just close
    else {
      onHide();
    }
  };

  const handleConfirmClose = () => {
    // Close without saving
    clearQueue();
    clearDraft(); // Also clear any saved draft
    setShowCloseWarningModal(false);
    onHide();
  };

  const handleSaveAndClose = async () => {
    // Submit queue and close
    setShowCloseWarningModal(false);
    await handleSubmitAll(false);
  };

  const saveDraftToLocalStorage = () => {
    const currentPlayer = selectedPlayer || searchedPlayer;
    let queueToSave = [...assessmentQueue];

    // Add current form to queue if player is selected (even if incomplete)
    if (currentPlayer) {
      queueToSave.push({
        id: Date.now(),
        player: currentPlayer,
        assessmentType,
        formData: { ...formData },
        strengths: [...strengths],
        weaknesses: [...weaknesses],
        attributeScores: { ...attributeScores },
        fixtureDate,
      });
    }

    const draft = {
      queue: queueToSave,
      timestamp: new Date().toISOString(),
      fixtureDate,
      assessmentType,
    };
    localStorage.setItem('scoutingAssessmentDraft', JSON.stringify(draft));
    setHasSavedDraft(true);
    setShowCloseWarningModal(false);

    setToastMessage(`Saved ${queueToSave.length} report(s) as draft.`);
    setToastVariant("info");
    setShowToast(true);

    onHide();
  };

  const loadDraftFromLocalStorage = async () => {
    const draftStr = localStorage.getItem('scoutingAssessmentDraft');
    console.log('🔍 Loading draft from localStorage:', draftStr);
    if (draftStr) {
      try {
        const draft = JSON.parse(draftStr);
        const queue = draft.queue || [];
        console.log('📦 Parsed draft queue:', queue);

        setFixtureDate(draft.fixtureDate || '');
        setAssessmentType(draft.assessmentType || null);

        // If there are items in the queue, populate the form with the LAST item (the one being worked on)
        // and keep the rest in the queue
        if (queue.length > 0) {
          const lastItem = queue[queue.length - 1];
          const remainingQueue = queue.slice(0, -1);

          console.log('✏️ Loading last item into form:', lastItem);
          console.log('📋 Remaining queue:', remainingQueue);

          // Restore the queue (all items except the last one)
          setAssessmentQueue(remainingQueue);
          setShowQueuePanel(remainingQueue.length > 0);

          // Populate the form with the last item's data
          setSearchedPlayer(lastItem.player);
          setPlayerSearch(lastItem.player?.player_name || '');
          setFormData(lastItem.formData || {});
          setStrengths(lastItem.strengths || []);
          setWeaknesses(lastItem.weaknesses || []);
          setAttributeScores(lastItem.attributeScores || {});

          // Fetch position attributes if position is saved
          if (lastItem.formData?.playerPosition) {
            try {
              setAttributesLoading(true);
              const response = await axiosInstance.get(`/attributes/${lastItem.formData.playerPosition}`);
              setPositionAttributes(response.data);
              console.log('📊 Loaded position attributes for:', lastItem.formData.playerPosition);
            } catch (error) {
              console.error('Error fetching position attributes:', error);
              setPositionAttributes([]);
            } finally {
              setAttributesLoading(false);
            }
          }

          console.log('✅ Form populated with player:', lastItem.player?.player_name);
        }

        setHasSavedDraft(false);

        setToastMessage(`Restored ${queue.length} report(s) from draft`);
        setToastVariant("success");
        setShowToast(true);
      } catch (error) {
        console.error('❌ Error loading draft:', error);
      }
    }
  };

  const clearDraft = () => {
    localStorage.removeItem('scoutingAssessmentDraft');
    setHasSavedDraft(false);
  };

  // Check for saved draft and auto-load when modal opens
  useEffect(() => {
    if (show && !editMode && !selectedPlayer) {
      const draftStr = localStorage.getItem('scoutingAssessmentDraft');
      setHasSavedDraft(!!draftStr);

      // Auto-load draft if it exists and no player is selected
      if (draftStr) {
        console.log('🚀 Auto-loading draft on modal open');
        loadDraftFromLocalStorage();
      }
    }
  }, [show, editMode, selectedPlayer]);

  const handleSubmitAll = async (includeCurrentForm: boolean = false) => {
    let itemsToSubmit = [...assessmentQueue];
    let submittingCurrentForm = false;

    // If includeCurrentForm is true and form is valid, add current form to submission
    if (includeCurrentForm && isFormValid()) {
      const currentPlayer = selectedPlayer || searchedPlayer;
      const currentItem = {
        id: Date.now(),
        player: currentPlayer,
        assessmentType,
        formData: { ...formData },
        strengths: [...strengths],
        weaknesses: [...weaknesses],
        attributeScores: { ...attributeScores },
        fixtureDate,
      };
      itemsToSubmit.push(currentItem);
      submittingCurrentForm = true;
    }

    if (itemsToSubmit.length === 0) {
      setToastMessage("No assessments to submit");
      setToastVariant("warning");
      setShowToast(true);
      return;
    }

    setLoading(true);
    try {
      console.log(`Submitting ${itemsToSubmit.length} assessments...`);

      // Build array of payloads
      const payloads = itemsToSubmit.map(item => {
        const payload: any = {
          player_id: item.player?.universal_id,
          reportType: item.assessmentType,
        };

        if (item.assessmentType === "Player Assessment") {
          payload.selectedMatch = parseInt(item.formData.selectedMatch, 10);
          payload.playerPosition = item.formData.playerPosition;
          payload.formation = item.formData.formation;
          payload.playerBuild = item.formData.playerBuild;
          payload.playerHeight = item.formData.playerHeight;
          payload.scoutingType = item.formData.scoutingType;
          payload.purposeOfAssessment = item.formData.purposeOfAssessment;
          payload.performanceScore = item.formData.performanceScore;
          payload.assessmentSummary = item.formData.assessmentSummary;
          payload.justificationRationale = item.formData.justificationRationale;
          payload.oppositionDetails = item.formData.oppositionDetails;
          payload.strengths = item.strengths.map((s: any) => s.value);
          payload.weaknesses = item.weaknesses.map((w: any) => w.value);
          payload.attributeScores = item.attributeScores;
        } else if (item.assessmentType === "Flag") {
          payload.selectedMatch = parseInt(item.formData.selectedMatch, 10);
          payload.playerPosition = item.formData.playerPosition;
          payload.formation = item.formData.formation;
          payload.playerBuild = item.formData.playerBuild;
          payload.playerHeight = item.formData.playerHeight;
          payload.scoutingType = item.formData.scoutingType;
          payload.assessmentSummary = item.formData.assessmentSummary;
          payload.flagCategory = item.formData.flagCategory;
        } else if (item.assessmentType === "Clips") {
          payload.playerPosition = item.formData.playerPosition;
          payload.playerBuild = item.formData.playerBuild;
          payload.playerHeight = item.formData.playerHeight;
          payload.strengths = item.strengths.map((s: any) => s.value);
          payload.weaknesses = item.weaknesses.map((w: any) => w.value);
          payload.assessmentSummary = item.formData.assessmentSummary;
          payload.performanceScore = item.formData.performanceScore;
        }

        return payload;
      });

      console.log("Batch payload:", { reports: payloads });

      // Submit all assessments in batch
      const response = await axiosInstance.post("/scout_reports/batch", { reports: payloads });
      console.log("Batch submission response:", response.data);

      setToastMessage(`Successfully submitted ${itemsToSubmit.length} assessment(s)!`);
      setToastVariant("success");
      setShowToast(true);
      clearQueue();

      // Only clear draft and close modal if we submitted the current form too
      if (submittingCurrentForm) {
        clearDraft();
        onAssessmentSubmitSuccess();
        onHide();
      } else {
        // Only submitted queue, keep modal open with current incomplete form
        const currentPlayer = selectedPlayer || searchedPlayer;

        // Clear old draft and save new draft with just the current incomplete form
        if (currentPlayer) {
          const newDraft = {
            queue: [{
              id: Date.now(),
              player: currentPlayer,
              assessmentType,
              formData: { ...formData },
              strengths: [...strengths],
              weaknesses: [...weaknesses],
              attributeScores: { ...attributeScores },
              fixtureDate,
            }],
            timestamp: new Date().toISOString(),
            fixtureDate,
            assessmentType,
          };
          localStorage.setItem('scoutingAssessmentDraft', JSON.stringify(newDraft));
          console.log('💾 Updated draft after queue submission - keeping current incomplete form');
        } else {
          // No current form, clear draft completely
          clearDraft();
        }

        onAssessmentSubmitSuccess();
        // Don't close modal - user can continue working on current form
      }
    } catch (error: any) {
      console.error("Error submitting batch reports:", error);
      console.error("Error response:", error.response?.data);
      console.error("Error status:", error.response?.status);

      const errorMessage = error.response?.data?.detail || "Failed to submit batch reports. Please try again.";
      setToastMessage(errorMessage);
      setToastVariant("danger");
      setShowToast(true);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmSubmit = async () => {
    setLoading(true);
    try {
      const currentPlayer = selectedPlayer || searchedPlayer;
      const payload: any = {
        player_id: currentPlayer?.universal_id,
        reportType: assessmentType,
      };

      if (assessmentType === "Player Assessment") {
        payload.selectedMatch = parseInt(formData.selectedMatch, 10);
        payload.playerPosition = formData.playerPosition;
        payload.formation = formData.formation;
        payload.playerBuild = formData.playerBuild;
        payload.playerHeight = formData.playerHeight;
        payload.scoutingType = formData.scoutingType;
        payload.purposeOfAssessment = formData.purposeOfAssessment;
        payload.performanceScore = formData.performanceScore;
        payload.assessmentSummary = formData.assessmentSummary;
        payload.justificationRationale = formData.justificationRationale;
        payload.oppositionDetails = formData.oppositionDetails;
        payload.strengths = strengths.map((s) => s.value);
        payload.weaknesses = weaknesses.map((w) => w.value);
        payload.attributeScores = attributeScores;
      } else if (assessmentType === "Flag") {
        payload.selectedMatch = parseInt(formData.selectedMatch, 10);
        payload.playerPosition = formData.playerPosition;
        payload.formation = formData.formation;
        payload.playerBuild = formData.playerBuild;
        payload.playerHeight = formData.playerHeight;
        payload.scoutingType = formData.scoutingType;
        payload.assessmentSummary = formData.assessmentSummary;
        payload.flagCategory = formData.flagCategory;
      } else if (assessmentType === "Clips") {
        payload.playerPosition = formData.playerPosition;
        payload.playerBuild = formData.playerBuild;
        payload.playerHeight = formData.playerHeight;
        payload.strengths = strengths.map((s) => s.value);
        payload.weaknesses = weaknesses.map((w) => w.value);
        payload.assessmentSummary = formData.assessmentSummary;
        payload.performanceScore = formData.performanceScore;
      }

      if (editMode && reportId) {
        await axiosInstance.put(`/scout_reports/${reportId}`, payload);
        setToastMessage("Scout report updated successfully!");
      } else {
        await axiosInstance.post("/scout_reports", payload);
        setToastMessage("Scout report submitted successfully!");
      }

      setShowWarningModal(false);
      setToastVariant("success");
      setShowToast(true);
      clearDraft(); // Clear saved draft after successful submission
      onAssessmentSubmitSuccess();
      onHide();
    } catch (error) {
      console.error("Error submitting form:", error);
      setToastMessage("Failed to submit scout report. Please try again.");
      setToastVariant("danger");
      setShowToast(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      assessmentType === "Player Assessment" &&
      Object.values(attributeScores).some((score) => score === 0)
    ) {
      setShowWarningModal(true);
    } else {
      handleConfirmSubmit();
    }
  };

  const renderTooltip = (props: any) => (
    <Tooltip id="button-tooltip" {...props}>
      <div style={{ textAlign: "left", fontSize: "11px" }}>
        10 - Mid Prem & Above
        <br />
        9 - Bottom Prem
        <br />
        8 - Top Champ
        <br />
        7 - Average Champ
        <br />
        6 - Top L1
        <br />
        5 - Average L1
        <br />
        4 - Top L2
        <br />
        3 - Average L2
        <br />
        2 - National League
        <br />1 - Step 2 & Below
      </div>
    </Tooltip>
  );

  const playerPositions = [
    "GK",
    "RB",
    "RWB",
    "RCB(3)",
    "RCB(2)",
    "CCB(3)",
    "LCB(2)",
    "LCB(3)",
    "LWB",
    "LB",
    "DM",
    "CM",
    "RAM",
    "AM",
    "LAM",
    "RW",
    "LW",
    "Target Man CF",
    "In Behind CF",
  ];
  const formations = [
    "3-5-2",
    "3-4-3",
    "4-1-2-1-2",
    "4-2-2-2",
    "4-2-3-1",
    "4-3-2-1",
    "4-3-3",
    "4-4-1-1",
    "4-4-2",
  ];
  const playerBuilds = ["Slight", "Lean", "Medium", "Strong", "Heavy"];
  const playerHeights = Array.from(
    { length: 16 },
    (_, i) => 5 * 12 + 4 + i,
  ).map((inches) => `${Math.floor(inches / 12)}'${inches % 12}"`);
  const allStrengths = [
    "Stature",
    "Strength",
    "Power",
    "Speed - Off The Ball",
    "Speed - On The Ball",
    "Acceleration",
    "Agility",
    "Leap",
    "Athleticism",
    "Aggression",
    "Stamina",
    "Intensity",
    "Work Rate",
    "Body Language",
    "Leadership",
    "Organisation",
    "Composure",
    "Creativity",
    "Decision Making",
    "Anticipation",
    "Game Awareness",
    "Two Footedness",
    "Versatility",
    "Technical Ability",
    "Ball Striking",
    "Attacking Transitions",
    "Attacking Scanning/Awareness",
    "Receiving",
    "Ball Manipulation",
    "Playing Under Pressure",
    "Passing",
    "Passing - Vision",
    "Passing - Ranges",
    "Long Passing",
    "Breaking Lines",
    "Creative Passing",
    "Ball Carrying",
    "Attacking 1v1",
    "Crossing",
    "Finding & Creating Space",
    "Attacking Movement",
    "Attacking The Box",
    "Hold Up",
    "Link Up",
    "Chance Creation",
    "Finishing – Inside The Box",
    "Finishing – Outside The Box",
    "Finishing - Aerial",
    "Aerial Duels - Attacking",
    "Aerial Duels - Defensive",
    "Defensive Transition",
    "Defensive Scanning/Awareness",
    "Defensive Positioning",
    "Line Defending",
    "Front Footed Defending",
    "Defending Space",
    "Defending The Back Post",
    "Defending The Box",
    "Stopping The Cross",
    "1v1 Defending",
    "Ground Duels",
    "Clearances",
    "2nd Balls",
    "Interceptions",
    "Recovery Runs",
    "Tracking Runners",
    "Pressing",
    "Set Pieces - Delivery",
    "Set Pieces - Attacking",
    "Set Pieces - Marking",
    "Reflexes",
    "Savings 1v1s",
    "Sweeping",
    "GK Positioning",
    "Distribution From Hands",
  ].map((s) => ({ value: s, label: s }));
  const allWeaknesses = [
    "Stature",
    "Strength",
    "Power",
    "Speed - Off The Ball",
    "Speed - On The Ball",
    "Acceleration",
    "Agility",
    "Leap",
    "Athleticism",
    "Aggression",
    "Stamina",
    "Intensity",
    "Work Rate",
    "Body Language",
    "Leadership",
    "Organisation",
    "Composure",
    "Creativity",
    "Decision Making",
    "Anticipation",
    "Game Awareness",
    "Two Footedness",
    "Versatility",
    "Technical Ability",
    "Ball Striking",
    "Attacking Transitions",
    "Attacking Scanning/Awareness",
    "Receiving",
    "Ball Manipulation",
    "Playing Under Pressure",
    "Passing",
    "Passing - Vision",
    "Passing - Ranges",
    "Long Passing",
    "Breaking Lines",
    "Creative Passing",
    "Ball Carrying",
    "Attacking 1v1",
    "Crossing",
    "Finding & Creating Space",
    "Attacking Movement",
    "Attacking The Box",
    "Hold Up",
    "Link Up",
    "Chance Creation",
    "Finishing – Inside The Box",
    "Finishing – Outside The Box",
    "Finishing - Aerial",
    "Aerial Duels - Attacking",
    "Aerial Duels - Defensive",
    "Defensive Transition",
    "Defensive Scanning/Awareness",
    "Defensive Positioning",
    "Line Defending",
    "Front Footed Defending",
    "Defending Space",
    "Defending The Back Post",
    "Defending The Box",
    "Stopping The Cross",
    "1v1 Defending",
    "Ground Duels",
    "Clearances",
    "2nd Balls",
    "Interceptions",
    "Recovery Runs",
    "Tracking Runners",
    "Pressing",
    "Set Pieces - Delivery",
    "Set Pieces - Attacking",
    "Set Pieces - Marking",
    "Reflexes",
    "Savings 1v1s",
    "Sweeping",
    "GK Positioning",
    "Distribution From Hands",
  ].map((w) => ({ value: w, label: w }));

  const renderContent = () => {
    const currentPlayer = selectedPlayer || searchedPlayer;
    const hasPlayer = !!currentPlayer;

    // When initialAssessmentType is provided, skip the assessment type selection screen
    if (initialAssessmentType && !editMode && assessmentType === null) {
      // This will be handled by the useEffect that sets assessmentType
      return null;
    }

    // Render Queue Panel (shown on all screens when queue has items)
    const renderQueuePanel = () => {
      if (assessmentQueue.length === 0) return null;

      return (
        <Alert variant="info" className="mb-3">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <strong>📋 Assessment Queue ({assessmentQueue.length})</strong>
            <div>
              <Button
                variant="link"
                size="sm"
                onClick={() => setShowQueuePanel(!showQueuePanel)}
                className="p-0 me-2"
              >
                {showQueuePanel ? "Hide" : "Show"}
              </Button>
              <Button
                variant="link"
                size="sm"
                onClick={clearQueue}
                className="p-0 text-danger"
              >
                Clear All
              </Button>
            </div>
          </div>
          {showQueuePanel && (
            <ListGroup className="mt-2">
              {assessmentQueue.map((item, index) => {
                const matchLabel = matches.find(m => m.match_id.toString() === item.formData.selectedMatch);
                return (
                  <ListGroup.Item key={item.id} className="d-flex justify-content-between align-items-center">
                    <div>
                      <strong>{index + 1}. {item.player.player_name}</strong>
                      {" "}({item.player.team})
                      <br />
                      <small className="text-muted">
                        {item.assessmentType} - {item.formData.playerPosition}
                        {item.formData.performanceScore && ` - Score: ${item.formData.performanceScore}/10`}
                        {matchLabel && ` - ${matchLabel.home_team} vs ${matchLabel.away_team}`}
                      </small>
                    </div>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      onClick={() => removeFromQueue(item.id)}
                    >
                      Remove
                    </Button>
                  </ListGroup.Item>
                );
              })}
            </ListGroup>
          )}
        </Alert>
      );
    };

    // If no assessment type is selected and no initialAssessmentType, show type selection
    if (!assessmentType && !initialAssessmentType) {
      return (
        <>
          {/* Queue Panel */}
          {renderQueuePanel()}

          {/* Player Search Section - Only show when no player is selected */}
          {!hasPlayer && (
            <Card className="mb-4" style={{ backgroundColor: "#f8f9fa", border: "2px solid #dee2e6" }}>
              <Card.Body>
                <Card.Title style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>
                  Select Player & Match
                </Card.Title>
                <Form.Group controlId="playerSearch" className="mb-3">
                  <Form.Label>Player</Form.Label>
                  <div className="position-relative">
                    <Form.Control
                      type="text"
                      placeholder="Enter player name (minimum 3 characters)"
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
                        width: "calc(100% - 30px)",
                        maxHeight: "200px",
                        overflowY: "auto",
                      }}
                    >
                      {searchedPlayers.map((player, index) => (
                        <ListGroup.Item
                          key={
                            player.universal_id ||
                            `fallback-${index}-${player.player_name}`
                          }
                          action
                          onMouseDown={(e) => {
                            e.preventDefault(); // Prevent blur from firing
                            handlePlayerSelect(player);
                          }}
                          className="d-flex justify-content-between align-items-center"
                          style={{ cursor: 'pointer' }}
                        >
                          <span>{player.player_name}</span>
                          <small className="text-muted">({player.team})</small>
                        </ListGroup.Item>
                      ))}
                    </ListGroup>
                  )}
                </Form.Group>
                <Row className="mb-3">
                  <Form.Group as={Col} controlId="isolatedFixtureDate">
                    <Form.Label>Fixture Date</Form.Label>
                    <Form.Control
                      type="date"
                      value={fixtureDate}
                      onChange={handleFixtureDateChange}
                    />
                  </Form.Group>
                  <Form.Group as={Col} controlId="isolatedSelectedMatch">
                    <Form.Label>Match</Form.Label>
                    <Select
                      isSearchable
                      isDisabled={!fixtureDate || matches.length === 0}
                      options={matches.map((match) => ({
                        value: match.match_id,
                        label: `${match.home_team} vs ${match.away_team}${match.data_source === "internal" ? " 📝" : ""}`,
                      }))}
                      value={
                        formData.selectedMatch &&
                        matches.find(
                          (match) =>
                            match.match_id &&
                            match.match_id.toString() === formData.selectedMatch,
                        )
                          ? {
                              value: parseInt(formData.selectedMatch),
                              label: `${matches.find((match) => match.match_id && match.match_id.toString() === formData.selectedMatch)?.home_team} vs ${matches.find((match) => match.match_id && match.match_id.toString() === formData.selectedMatch)?.away_team}`,
                            }
                          : null
                      }
                      onChange={handleMatchSelectChange}
                      placeholder="Select Match"
                      isClearable
                      key={`match-select-isolated-type-${formData.selectedMatch}-${matches.length}`}
                    />
                  </Form.Group>
                </Row>
              </Card.Body>
            </Card>
          )}

          {/* Show selected player confirmation */}
          {searchedPlayer && (
            <Alert variant="success" className="mb-3">
              <strong>Selected Player:</strong> {searchedPlayer.player_name} ({searchedPlayer.team})
            </Alert>
          )}

          {/* Assessment Type Selection */}
          <div style={{ opacity: hasPlayer ? 1 : 0.5, pointerEvents: hasPlayer ? 'auto' : 'none' }}>
            <div className="d-grid gap-2">
              <Button
                variant="primary"
                size="lg"
                onClick={() => setAssessmentType("Player Assessment")}
              >
                ⚽ Player Assessment
              </Button>
              <Button
                variant="warning"
                size="lg"
                onClick={() => setAssessmentType("Flag")}
              >
                🏳️ Flag Assessment
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => setAssessmentType("Clips")}
              >
                🎬 Clips Assessment
              </Button>
            </div>
          </div>
        </>
      );
    }

    return (
      <>
        {/* Queue Panel */}
        {renderQueuePanel()}

        {/* Player Search Section - Only show when no player is selected */}
        {!selectedPlayer && (
          <Card className="mb-4" style={{ backgroundColor: "#f8f9fa", border: "2px solid #dee2e6" }}>
            <Card.Body>
              <Card.Title style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>
                Select Player & Match
              </Card.Title>
              <Form.Group controlId="playerSearch" className="mb-3">
                <Form.Label>Player</Form.Label>
                <div className="position-relative">
                  <Form.Control
                    type="text"
                    placeholder="Enter player name (minimum 3 characters)"
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
                      width: "calc(100% - 30px)",
                      maxHeight: "200px",
                      overflowY: "auto",
                    }}
                  >
                    {searchedPlayers.map((player, index) => (
                      <ListGroup.Item
                        key={
                          player.universal_id ||
                          `fallback-${index}-${player.player_name}`
                        }
                        action
                        onMouseDown={(e) => {
                          e.preventDefault(); // Prevent blur from firing
                          handlePlayerSelect(player);
                        }}
                        className="d-flex justify-content-between align-items-center"
                        style={{ cursor: 'pointer' }}
                      >
                        <span>{player.player_name}</span>
                        <small className="text-muted">({player.team})</small>
                      </ListGroup.Item>
                    ))}
                  </ListGroup>
                )}
              </Form.Group>
              <Row className="mb-3">
                <Form.Group as={Col} controlId="isolatedFixtureDate">
                  <Form.Label>Fixture Date</Form.Label>
                  <Form.Control
                    type="date"
                    value={fixtureDate}
                    onChange={handleFixtureDateChange}
                  />
                </Form.Group>
                <Form.Group as={Col} controlId="isolatedSelectedMatch">
                  <Form.Label>Match</Form.Label>
                  <Select
                    isSearchable
                    isDisabled={!fixtureDate || matches.length === 0}
                    options={matches.map((match) => ({
                      value: match.match_id,
                      label: `${match.home_team} vs ${match.away_team}${match.data_source === "internal" ? " 📝" : ""}`,
                    }))}
                    value={
                      formData.selectedMatch &&
                      matches.find(
                        (match) =>
                          match.match_id &&
                          match.match_id.toString() === formData.selectedMatch,
                      )
                        ? {
                            value: parseInt(formData.selectedMatch),
                            label: `${matches.find((match) => match.match_id && match.match_id.toString() === formData.selectedMatch)?.home_team} vs ${matches.find((match) => match.match_id && match.match_id.toString() === formData.selectedMatch)?.away_team}`,
                          }
                        : null
                    }
                    onChange={handleMatchSelectChange}
                    placeholder="Select Match"
                    isClearable
                    key={`match-select-isolated-${formData.selectedMatch}-${matches.length}`}
                  />
                </Form.Group>
              </Row>
            </Card.Body>
          </Card>
        )}

        {/* Show selected player confirmation */}
        {searchedPlayer && (
          <Alert variant="success" className="mb-3">
            <strong>Selected Player:</strong> {searchedPlayer.player_name} ({searchedPlayer.team})
          </Alert>
        )}

        {/* Form Section - Greyed out when no player is selected */}
        <div style={{ opacity: hasPlayer ? 1 : 0.5, pointerEvents: hasPlayer ? 'auto' : 'none' }}>
          <Form onSubmit={handleSubmit}>
            <p>
              <span className="text-danger">*</span> indicates a required field.
            </p>
            {assessmentType === "Player Assessment" && (
          <>
            {/* Player Assessment Form Fields */}
            <Row className="mb-3">
              <Form.Group as={Col} controlId="playerPosition">
                <Form.Label>
                  Player Position <span className="text-danger">*</span>
                </Form.Label>
                <Form.Select
                  name="playerPosition"
                  value={formData.playerPosition}
                  onChange={handlePositionChange}
                >
                  <option value="">Select Position</option>
                  {playerPositions.map((pos) => (
                    <option key={pos} value={pos}>
                      {pos}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
              <Form.Group as={Col} controlId="formation">
                <Form.Label>Formation</Form.Label>
                <Form.Select
                  name="formation"
                  value={formData.formation}
                  onChange={handleChange}
                >
                  <option value="">Select Formation</option>
                  {formations.map((form) => (
                    <option key={form} value={form}>
                      {form}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
              <Form.Group as={Col} controlId="playerBuild">
                <Form.Label>Player Build</Form.Label>
                <Form.Select
                  name="playerBuild"
                  value={formData.playerBuild}
                  onChange={handleChange}
                >
                  <option value="">Select Build</option>
                  {playerBuilds.map((build) => (
                    <option key={build} value={build}>
                      {build}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
              <Form.Group as={Col} controlId="playerHeight">
                <Form.Label>
                  Player Height <span className="text-danger">*</span>
                </Form.Label>
                <Form.Select
                  name="playerHeight"
                  value={formData.playerHeight}
                  onChange={handleChange}
                >
                  <option value="">Select Height</option>
                  {playerHeights.map((height) => (
                    <option key={height} value={height}>
                      {height}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            </Row>
            <Row className="mb-3">
              <Form.Group as={Col} controlId="scoutingType">
                <Form.Label>
                  Scouting Type <span className="text-danger">*</span>
                </Form.Label>
                <Form.Select
                  name="scoutingType"
                  value={formData.scoutingType}
                  onChange={handleChange}
                >
                  <option value="Live">Live</option>
                  <option value="Video">Video</option>
                </Form.Select>
              </Form.Group>
              <Form.Group as={Col} controlId="purposeOfAssessment">
                <Form.Label>
                  Purpose of Assessment <span className="text-danger">*</span>
                </Form.Label>
                <Form.Select
                  name="purposeOfAssessment"
                  value={formData.purposeOfAssessment}
                  onChange={handleChange}
                >
                  <option value="Player Report">Player Report</option>
                  <option value="Loan Report">Loan Report</option>
                </Form.Select>
              </Form.Group>
            </Row>
            <Row className="mb-3">
              <Form.Group as={Col} controlId="strengths">
                <Form.Label>Strengths</Form.Label>
                <Select
                  isMulti
                  options={allStrengths}
                  value={strengths}
                  onChange={(selected) =>
                    handleMultiSelectChange(selected, "strengths")
                  }
                />
              </Form.Group>
              <Form.Group as={Col} controlId="weaknesses">
                <Form.Label>Weaknesses</Form.Label>
                <Select
                  isMulti
                  options={allWeaknesses}
                  value={weaknesses}
                  onChange={(selected) =>
                    handleMultiSelectChange(selected, "weaknesses")
                  }
                />
              </Form.Group>
            </Row>
            {attributesLoading && (
              <Row className="mb-3">
                <Col className="text-center">
                  <Spinner animation="border" size="sm" className="me-2" />
                  <span>Loading position attributes...</span>
                </Col>
              </Row>
            )}
            {!attributesLoading && positionAttributes.length > 0 && (
              <Row className="mb-3">
                {positionAttributes.map((attr) => (
                  <Col md={6} key={attr}>
                    <Form.Group controlId={`attribute_${attr}`}>
                      <OverlayTrigger placement="top" overlay={renderTooltip}>
                        <Form.Label>
                          {attr} ({attributeScores[attr] || 0}){" "}
                          <span className="text-danger">*</span>
                        </Form.Label>
                      </OverlayTrigger>
                      <Form.Range
                        min="0"
                        max="10"
                        value={attributeScores[attr] || 0}
                        onChange={(e) =>
                          handleAttributeScoreChange(
                            attr,
                            parseInt(e.target.value, 10),
                          )
                        }
                      />
                    </Form.Group>
                  </Col>
                ))}
              </Row>
            )}
            {formData.purposeOfAssessment === "Loan Report" && (
              <Form.Group className="mb-3" controlId="oppositionDetails">
                <Form.Label>
                  Opposition Details (formation, style and direct opponent){" "}
                  <span className="text-danger">*</span>
                </Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  name="oppositionDetails"
                  value={formData.oppositionDetails}
                  onChange={handleChange}
                  placeholder="Please provide details about the opposition's formation, playing style, and the player's direct opponent"
                />
              </Form.Group>
            )}
            <Form.Group className="mb-3" controlId="assessmentSummary">
              <Form.Label>
                Assessment Summary <span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                name="assessmentSummary"
                value={formData.assessmentSummary}
                onChange={handleChange}
              />
            </Form.Group>
            <Form.Group className="mb-3" controlId="justificationRationale">
              <Form.Label>
                Justification/Rationale <span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                name="justificationRationale"
                value={formData.justificationRationale}
                onChange={handleChange}
              />
            </Form.Group>
            <Form.Group className="mb-3" controlId="performanceScore">
              <OverlayTrigger placement="top" overlay={renderTooltip}>
                <Form.Label>
                  Performance Score ({formData.performanceScore}){" "}
                  <span className="text-danger">*</span>
                </Form.Label>
              </OverlayTrigger>
              <Form.Range
                name="performanceScore"
                min="1"
                max="10"
                value={formData.performanceScore}
                onChange={handleChange}
              />
            </Form.Group>
          </>
        )}

        {assessmentType === "Flag" && (
          <>
            {/* Flag Assessment Form Fields */}
            <Row className="mb-3">
              <Form.Group as={Col} controlId="playerPosition">
                <Form.Label>
                  Player Position <span className="text-danger">*</span>
                </Form.Label>
                <Form.Select
                  name="playerPosition"
                  value={formData.playerPosition}
                  onChange={handlePositionChange}
                >
                  <option value="">Select Position</option>
                  {playerPositions.map((pos) => (
                    <option key={pos} value={pos}>
                      {pos}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
              <Form.Group as={Col} controlId="formation">
                <Form.Label>Formation</Form.Label>
                <Form.Select
                  name="formation"
                  value={formData.formation}
                  onChange={handleChange}
                >
                  <option value="">Select Formation</option>
                  {formations.map((form) => (
                    <option key={form} value={form}>
                      {form}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
              <Form.Group as={Col} controlId="playerBuild">
                <Form.Label>
                  Player Build <span className="text-danger">*</span>
                </Form.Label>
                <Form.Select
                  name="playerBuild"
                  value={formData.playerBuild}
                  onChange={handleChange}
                >
                  <option value="">Select Build</option>
                  {playerBuilds.map((build) => (
                    <option key={build} value={build}>
                      {build}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
              <Form.Group as={Col} controlId="playerHeight">
                <Form.Label>
                  Player Height <span className="text-danger">*</span>
                </Form.Label>
                <Form.Select
                  name="playerHeight"
                  value={formData.playerHeight}
                  onChange={handleChange}
                >
                  <option value="">Select Height</option>
                  {playerHeights.map((height) => (
                    <option key={height} value={height}>
                      {height}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            </Row>
            <Row className="mb-3">
              <Form.Group as={Col} controlId="scoutingType">
                <Form.Label>
                  Scouting Type <span className="text-danger">*</span>
                </Form.Label>
                <Form.Select
                  name="scoutingType"
                  value={formData.scoutingType}
                  onChange={handleChange}
                >
                  <option value="">Select Type</option>
                  <option value="Live">Live</option>
                  <option value="Video">Video</option>
                </Form.Select>
              </Form.Group>
              <Form.Group as={Col} controlId="flagCategory">
                <Form.Label>
                  Flag Category <span className="text-danger">*</span>
                </Form.Label>
                <Form.Select
                  name="flagCategory"
                  value={formData.flagCategory}
                  onChange={handleChange}
                >
                  <option value="">Select Category</option>
                  <option value="Positive">Positive</option>
                  <option value="Neutral">Neutral</option>
                  <option value="Negative">Negative</option>
                </Form.Select>
              </Form.Group>
            </Row>
            <Form.Group className="mb-3" controlId="assessmentSummary">
              <Form.Label>
                Summary Notes <span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                name="assessmentSummary"
                value={formData.assessmentSummary}
                onChange={handleChange}
              />
            </Form.Group>
          </>
        )}

        {assessmentType === "Clips" && (
          <>
            {/* Clips Assessment Form Fields */}
            <Row className="mb-3">
              <Form.Group as={Col} controlId="playerPosition">
                <Form.Label>
                  Player Position <span className="text-danger">*</span>
                </Form.Label>
                <Form.Select
                  name="playerPosition"
                  value={formData.playerPosition}
                  onChange={handlePositionChange}
                >
                  <option value="">Select Position</option>
                  {playerPositions.map((pos) => (
                    <option key={pos} value={pos}>
                      {pos}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
              <Form.Group as={Col} controlId="playerBuild">
                <Form.Label>
                  Player Build <span className="text-danger">*</span>
                </Form.Label>
                <Form.Select
                  name="playerBuild"
                  value={formData.playerBuild}
                  onChange={handleChange}
                >
                  <option value="">Select Build</option>
                  {playerBuilds.map((build) => (
                    <option key={build} value={build}>
                      {build}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
              <Form.Group as={Col} controlId="playerHeight">
                <Form.Label>
                  Player Height <span className="text-danger">*</span>
                </Form.Label>
                <Form.Select
                  name="playerHeight"
                  value={formData.playerHeight}
                  onChange={handleChange}
                >
                  <option value="">Select Height</option>
                  {playerHeights.map((height) => (
                    <option key={height} value={height}>
                      {height}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            </Row>
            <Row className="mb-3">
              <Form.Group as={Col} controlId="strengths">
                <Form.Label>
                  Strengths <span className="text-danger">*</span>
                </Form.Label>
                <Select
                  isMulti
                  options={allStrengths}
                  value={strengths}
                  onChange={(selected) =>
                    handleMultiSelectChange(selected, "strengths")
                  }
                />
              </Form.Group>
              <Form.Group as={Col} controlId="weaknesses">
                <Form.Label>
                  Weaknesses <span className="text-danger">*</span>
                </Form.Label>
                <Select
                  isMulti
                  options={allWeaknesses}
                  value={weaknesses}
                  onChange={(selected) =>
                    handleMultiSelectChange(selected, "weaknesses")
                  }
                />
              </Form.Group>
            </Row>
            <Form.Group className="mb-3" controlId="assessmentSummary">
              <Form.Label>
                Report Summary <span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                name="assessmentSummary"
                value={formData.assessmentSummary}
                onChange={handleChange}
              />
            </Form.Group>
            <Form.Group className="mb-3" controlId="performanceScore">
              <OverlayTrigger placement="top" overlay={renderTooltip}>
                <Form.Label>
                  Performance Score ({formData.performanceScore}){" "}
                  <span className="text-danger">*</span>
                </Form.Label>
              </OverlayTrigger>
              <Form.Range
                name="performanceScore"
                min="1"
                max="10"
                value={formData.performanceScore}
                onChange={handleChange}
              />
            </Form.Group>
          </>
        )}

        <div className="d-flex justify-content-between align-items-center">
          <div className="d-flex gap-2 flex-wrap">
            {!editMode && (
              <>
                {/* No queue: Show "Submit", "Save & Add Another", and "Save Report" */}
                {assessmentQueue.length === 0 && (
                  <>
                    <Button
                      variant="danger"
                      type="submit"
                      disabled={!isFormValid() || loading}
                    >
                      {loading ? (
                        <Spinner animation="border" size="sm" />
                      ) : (
                        "Submit"
                      )}
                    </Button>
                    <Button
                      variant="primary"
                      onClick={(e) => {
                        e.preventDefault();
                        if (isFormValid()) {
                          addToQueue();
                        }
                      }}
                      disabled={!isFormValid() || loading}
                    >
                      Save & Add Another
                    </Button>
                    <Button
                      variant="info"
                      onClick={(e) => {
                        e.preventDefault();
                        // Save current incomplete form
                        const currentPlayer = selectedPlayer || searchedPlayer;
                        if (currentPlayer) {
                          const tempQueue = [{
                            id: Date.now(),
                            player: currentPlayer,
                            assessmentType,
                            formData: { ...formData },
                            strengths: [...strengths],
                            weaknesses: [...weaknesses],
                            attributeScores: { ...attributeScores },
                            fixtureDate,
                          }];
                          const draft = {
                            queue: tempQueue,
                            timestamp: new Date().toISOString(),
                            fixtureDate,
                            assessmentType,
                          };
                          localStorage.setItem('scoutingAssessmentDraft', JSON.stringify(draft));
                          setHasSavedDraft(true);
                          setToastMessage('Saved report as draft.');
                          setToastVariant("info");
                          setShowToast(true);
                          onHide();
                        }
                      }}
                      disabled={loading || !selectedPlayer && !searchedPlayer}
                    >
                      💾 Save Report
                    </Button>
                  </>
                )}

                {/* Queue exists: Show "Save & Add Another", "Save All Reports", and "Submit All (N)" */}
                {assessmentQueue.length > 0 && (
                  <>
                    <Button
                      variant="primary"
                      onClick={(e) => {
                        e.preventDefault();
                        if (isFormValid()) {
                          addToQueue();
                        }
                      }}
                      disabled={!isFormValid() || loading}
                    >
                      Save & Add Another
                    </Button>
                    <Button
                      variant="info"
                      onClick={(e) => {
                        e.preventDefault();
                        // Save queue + current form if there's a player selected
                        const currentPlayer = selectedPlayer || searchedPlayer;
                        let queueToSave = [...assessmentQueue];

                        // Add current form to queue if player is selected
                        if (currentPlayer) {
                          queueToSave.push({
                            id: Date.now(),
                            player: currentPlayer,
                            assessmentType,
                            formData: { ...formData },
                            strengths: [...strengths],
                            weaknesses: [...weaknesses],
                            attributeScores: { ...attributeScores },
                            fixtureDate,
                          });
                        }

                        const draft = {
                          queue: queueToSave,
                          timestamp: new Date().toISOString(),
                          fixtureDate,
                          assessmentType,
                        };
                        localStorage.setItem('scoutingAssessmentDraft', JSON.stringify(draft));
                        setHasSavedDraft(true);
                        setToastMessage(`Saved ${queueToSave.length} report(s) as draft.`);
                        setToastVariant("info");
                        setShowToast(true);
                        onHide();
                      }}
                      disabled={loading}
                    >
                      💾 Save All Reports ({assessmentQueue.length + ((selectedPlayer || searchedPlayer) ? 1 : 0)})
                    </Button>
                    <Button
                      variant="success"
                      onClick={(e) => {
                        e.preventDefault();
                        // Include current form if valid, otherwise just submit queue
                        handleSubmitAll(isFormValid() === true);
                      }}
                      disabled={loading || (assessmentQueue.length === 0 && isFormValid() !== true)}
                    >
                      {loading ? (
                        <Spinner animation="border" size="sm" />
                      ) : (
                        `Submit All (${assessmentQueue.length + (isFormValid() === true ? 1 : 0)})`
                      )}
                    </Button>
                  </>
                )}
              </>
            )}
            {/* Edit mode: Show "Update" button */}
            {editMode && (
              <Button
                variant="danger"
                type="submit"
                disabled={!isFormValid() || loading}
              >
                {loading ? (
                  <Spinner animation="border" size="sm" />
                ) : (
                  "Update"
                )}
              </Button>
            )}
          </div>
          <Button variant="secondary" onClick={() => setAssessmentType(null)}>
            Back
          </Button>
        </div>
          </Form>
        </div>
      </>
    );
  };

  const getHeaderStyle = () => {
    return { backgroundColor: "#000000", color: "white" };
  };

  const getHeaderIcon = () => {
    switch (assessmentType) {
      case "Player Assessment":
        return "⚽";
      case "Flag":
        return "🏳️";
      case "Clips":
        return "🎬";
      default:
        return "📋";
    }
  };

  const currentPlayer = selectedPlayer || searchedPlayer;
  const currentPlayerName = currentPlayer?.player_name || "Unknown Player";

  return (
    <>
      <Modal show={show} onHide={handleModalClose} size="lg">
        <Modal.Header
          closeButton
          style={getHeaderStyle()}
          className="modal-header-dark"
        >
          <Modal.Title className="d-flex justify-content-between align-items-center w-100 pe-3">
            <span>
              {assessmentType
                ? `${getHeaderIcon()} ${editMode ? "Edit" : ""} ${assessmentType} for ${currentPlayerName}`
                : currentPlayer
                  ? "📋 Select Assessment Type"
                  : "🔍 Search for Player"}
            </span>
            <div className="d-flex gap-2">
              {hasSavedDraft && !show && (
                <span
                  className="badge bg-info"
                  style={{ cursor: 'pointer' }}
                  onClick={loadDraftFromLocalStorage}
                  title="Click to restore saved draft"
                >
                  💾 Draft Saved
                </span>
              )}
              {assessmentQueue.length > 0 && !editMode && (
                <span className="badge bg-success">
                  Queue: {assessmentQueue.length}
                </span>
              )}
            </div>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>{renderContent()}</Modal.Body>
      </Modal>

      <Modal show={showWarningModal} onHide={() => setShowWarningModal(false)}>
        <Modal.Header
          closeButton
          style={{ backgroundColor: "#000000", color: "white" }}
          className="modal-header-dark"
        >
          <Modal.Title>Warning</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          One or more attribute scores are 0. Are you sure you want to continue?
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowWarningModal(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirmSubmit}
            disabled={loading}
          >
            {loading ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Submitting...
              </>
            ) : (
              "Continue"
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showCloseWarningModal} onHide={() => setShowCloseWarningModal(false)}>
        <Modal.Header
          closeButton
          style={{ backgroundColor: "#000000", color: "white" }}
          className="modal-header-dark"
        >
          <Modal.Title>⚠️ Unsaved Assessments in Queue</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          You have {assessmentQueue.length} assessment(s) in your queue{((selectedPlayer || searchedPlayer) ? ' plus the current report you\'re working on' : '')}.
          <br /><br />
          What would you like to do?
        </Modal.Body>
        <Modal.Footer className="d-flex justify-content-between">
          <Button
            variant="danger"
            onClick={handleConfirmClose}
          >
            Discard Everything
          </Button>
          <div className="d-flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setShowCloseWarningModal(false)}
            >
              Keep Editing
            </Button>
            <Button
              variant="info"
              onClick={saveDraftToLocalStorage}
            >
              💾 Save Draft
            </Button>
          </div>
        </Modal.Footer>
      </Modal>

      <ToastContainer position="top-end" className="p-3">
        <Toast
          onClose={() => setShowToast(false)}
          show={showToast}
          delay={toastVariant === "info" ? 8000 : 3000}
          autohide
          bg={toastVariant}
        >
          <Toast.Header>
            <strong className="me-auto">Notification</strong>
          </Toast.Header>
          <Toast.Body className={toastVariant === "danger" ? "text-white" : ""}>
            {toastMessage}
          </Toast.Body>
        </Toast>
      </ToastContainer>

      <style>{`
        .modal-header-dark .btn-close {
          filter: invert(1) grayscale(100%) brightness(200%);
        }

        /* Override dark mode styling for range sliders */
        .form-range {
          background: transparent !important;
          -webkit-appearance: none !important;
          appearance: none !important;
          height: 6px !important;
          border-radius: 5px !important;
          background: linear-gradient(to right, #dee2e6 0%, #dee2e6 100%) !important;
          outline: none !important;
        }

        .form-range::-webkit-slider-track {
          background: #dee2e6 !important;
          height: 6px !important;
          border-radius: 5px !important;
          border: none !important;
        }

        .form-range::-webkit-slider-thumb {
          -webkit-appearance: none !important;
          appearance: none !important;
          height: 20px !important;
          width: 20px !important;
          border-radius: 50% !important;
          background: #0d6efd !important;
          cursor: pointer !important;
          border: none !important;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
        }

        .form-range::-moz-range-track {
          background: #dee2e6 !important;
          height: 6px !important;
          border-radius: 5px !important;
          border: none !important;
        }

        .form-range::-moz-range-thumb {
          height: 20px !important;
          width: 20px !important;
          border-radius: 50% !important;
          background: #0d6efd !important;
          cursor: pointer !important;
          border: none !important;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
        }

        /* Force light appearance for range sliders regardless of theme */
        [data-bs-theme="dark"] .form-range,
        body.dark .form-range,
        .dark .form-range {
          background: linear-gradient(to right, #dee2e6 0%, #dee2e6 100%) !important;
        }

        [data-bs-theme="dark"] .form-range::-webkit-slider-track,
        body.dark .form-range::-webkit-slider-track,
        .dark .form-range::-webkit-slider-track {
          background: #dee2e6 !important;
        }

        [data-bs-theme="dark"] .form-range::-webkit-slider-thumb,
        body.dark .form-range::-webkit-slider-thumb,
        .dark .form-range::-webkit-slider-thumb {
          background: #0d6efd !important;
        }

        [data-bs-theme="dark"] .form-range::-moz-range-track,
        body.dark .form-range::-moz-range-track,
        .dark .form-range::-moz-range-track {
          background: #dee2e6 !important;
        }

        [data-bs-theme="dark"] .form-range::-moz-range-thumb,
        body.dark .form-range::-moz-range-thumb,
        .dark .form-range::-moz-range-thumb {
          background: #0d6efd !important;
        }
      `}</style>
    </>
  );
};

export default ScoutingAssessmentModal;
