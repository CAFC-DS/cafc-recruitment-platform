import React, { useState, useEffect, useRef, useCallback } from "react";
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
  Card,
} from "react-bootstrap";
import axiosInstance from "../axiosInstance";
import Select from "react-select";
import { Player } from "../types/Player";

interface QueuedReport {
  id: string; // unique ID for queue management
  timestamp: string;
  player: Player;
  assessmentType: "Player Assessment" | "Flag" | "Clips";
  formData: any;
  fixtureDate: string;
  selectedMatch: string;
  strengths: any[];
  weaknesses: any[];
  attributeScores: any;
  positionAttributes: string[];
}

interface ScoutingAssessmentModalProps {
  show: boolean;
  onHide: () => void;
  selectedPlayer?: Player | null; // Now optional - modal can manage its own player selection
  onAssessmentSubmitSuccess: () => void;
  editMode?: boolean;
  reportId?: number | null;
  existingReportData?: any;
}

const ScoutingAssessmentModal: React.FC<ScoutingAssessmentModalProps> = ({
  show,
  onHide,
  selectedPlayer: propSelectedPlayer, // Rename to distinguish from internal state
  onAssessmentSubmitSuccess,
  editMode = false,
  reportId,
  existingReportData,
}) => {
  const [assessmentType, setAssessmentType] = useState<
    "Player Assessment" | "Flag" | "Clips" | null
  >(null);
  const [showWarningModal, setShowWarningModal] = useState(false);
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
  const [loadingAttributes, setLoadingAttributes] = useState(false);

  // Frontend cache for attributes by position
  const attributesCache = useRef<{
    [position: string]: string[];
  }>({});

  // Internal player search state (when no player passed via props)
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerSearchResults, setPlayerSearchResults] = useState<Player[]>([]);
  const [showPlayerDropdown, setShowPlayerDropdown] = useState(false);
  const [playerSearchLoading, setPlayerSearchLoading] = useState(false);

  // Selected match state (separate from formData for clarity)
  const [selectedMatch, setSelectedMatch] = useState<string>("");

  // Persistent fixture context (saved to localStorage between reports)
  const [fixtureContextSaved, setFixtureContextSaved] = useState(false);

  // Loading state for matches
  const [loadingMatches, setLoadingMatches] = useState(false);

  // Debounce timer for player search
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Report queue state
  const [reportQueue, setReportQueue] = useState<QueuedReport[]>([]);

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

  // Clear form when modal is closed or when switching to new assessment
  useEffect(() => {
    if (!show) {
      // Reset everything when modal closes
      setFormData(initialFormData);
      setAssessmentType(null);
      setFixtureDate("");
      setMatches([]);
      setStrengths([]);
      setWeaknesses([]);
      setPositionAttributes([]);
      setAttributeScores({});
      setSelectedPlayer(null);
      setPlayerSearch("");
      setPlayerSearchResults([]);
      setShowPlayerDropdown(false);
      setSelectedMatch("");
    } else if (show && !editMode) {
      // Check for saved draft in localStorage
      const draftStr = localStorage.getItem("scoutingAssessmentDraft");

      if (draftStr) {
        try {
          const draft = JSON.parse(draftStr);

          // Restore all form fields from draft
          if (draft.assessmentType) setAssessmentType(draft.assessmentType);
          if (draft.formData) setFormData(draft.formData);
          if (draft.fixtureDate) setFixtureDate(draft.fixtureDate);
          if (draft.strengths) setStrengths(draft.strengths);
          if (draft.weaknesses) setWeaknesses(draft.weaknesses);
          if (draft.attributeScores) setAttributeScores(draft.attributeScores);
          if (draft.positionAttributes) setPositionAttributes(draft.positionAttributes);

          // Restore player and fixture context
          if (draft.selectedPlayer) {
            setSelectedPlayer({
              universal_id: draft.selectedPlayer.id,
              player_id: draft.selectedPlayer.id,
              player_name: draft.selectedPlayer.name,
              position: draft.selectedPlayer.position,
              squad_name: draft.selectedPlayer.team,
            } as Player);
          }
          if (draft.playerSearch) setPlayerSearch(draft.playerSearch);
          if (draft.selectedMatch) setSelectedMatch(draft.selectedMatch);

          // Fetch matches if we have a fixture date in the draft
          if (draft.fixtureDate) {
            setLoadingMatches(true);
            axiosInstance.get(`/matches/date?fixture_date=${draft.fixtureDate}`)
              .then(response => {
                const sortedMatches = response.data.sort((a: any, b: any) => {
                  const matchA = `${a.home_team} vs ${a.away_team}`.toLowerCase();
                  const matchB = `${b.home_team} vs ${b.away_team}`.toLowerCase();
                  return matchA.localeCompare(matchB);
                });
                setMatches(sortedMatches);
              })
              .catch(e => {
                console.error("Error fetching matches from draft:", e);
                setMatches([]);
              })
              .finally(() => {
                setLoadingMatches(false);
              });
          }

          console.log("Draft restored from localStorage");
        } catch (error) {
          console.error("Error restoring draft:", error);
          // Clear form if draft is corrupted
          setFormData(initialFormData);
          setAssessmentType(null);
          setFixtureDate("");
          setMatches([]);
          setStrengths([]);
          setWeaknesses([]);
          setPositionAttributes([]);
          setAttributeScores({});
        }
      } else {
        // Clear form when opening for new assessment (no draft)
        setFormData(initialFormData);
        setAssessmentType(null);
        setFixtureDate("");
        setMatches([]);
        setStrengths([]);
        setWeaknesses([]);
        setPositionAttributes([]);
        setAttributeScores({});
        // Don't clear selectedPlayer/playerSearch here - they might be set from props
      }
    }
  }, [show, editMode]);

  // Initialize player from props (for edit mode) or check fixture context
  useEffect(() => {
    if (propSelectedPlayer) {
      setSelectedPlayer(propSelectedPlayer);
      setPlayerSearch(propSelectedPlayer.player_name || "");
    } else if (show && !editMode) {
      // Check for saved fixture context
      const fixtureContextStr = localStorage.getItem('lastUsedFixture');
      if (fixtureContextStr) {
        try {
          const context = JSON.parse(fixtureContextStr);
          setFixtureDate(context.fixtureDate || "");
          setSelectedMatch(context.matchId || "");
          setFixtureContextSaved(true);

          // Fetch matches if we have a fixture date
          if (context.fixtureDate) {
            axiosInstance.get(`/matches/date?fixture_date=${context.fixtureDate}`)
              .then(response => {
                const sortedMatches = response.data.sort((a: any, b: any) => {
                  const matchA = `${a.home_team} vs ${a.away_team}`.toLowerCase();
                  const matchB = `${b.home_team} vs ${b.away_team}`.toLowerCase();
                  return matchA.localeCompare(matchB);
                });
                setMatches(sortedMatches);
              })
              .catch(e => console.error("Error fetching matches from context:", e));
          }
        } catch (e) {
          console.error("Error loading fixture context:", e);
        }
      }
    }
  }, [show, propSelectedPlayer, editMode]);

  // Load queue from localStorage on component mount (runs once)
  const [queueInitialized, setQueueInitialized] = useState(false);

  useEffect(() => {
    if (!queueInitialized) {
      const queueStr = localStorage.getItem('reportQueue');
      if (queueStr) {
        try {
          const queue = JSON.parse(queueStr);
          setReportQueue(queue);
        } catch (e) {
          console.error("Error loading queue:", e);
        }
      }
      setQueueInitialized(true);
    }
  }, [queueInitialized]);

  // Reload queue when modal opens (to sync with navbar changes)
  useEffect(() => {
    if (show && queueInitialized) {
      const queueStr = localStorage.getItem('reportQueue');
      if (queueStr) {
        try {
          const queue = JSON.parse(queueStr);
          setReportQueue(queue);
        } catch (e) {
          console.error("Error loading queue:", e);
        }
      } else {
        setReportQueue([]);
      }
    }
  }, [show, queueInitialized]);

  // Save queue to localStorage whenever it changes (but only after initialization)
  useEffect(() => {
    if (queueInitialized) {
      if (reportQueue.length > 0) {
        localStorage.setItem('reportQueue', JSON.stringify(reportQueue));
      } else {
        localStorage.removeItem('reportQueue');
      }
    }
  }, [reportQueue, queueInitialized]);

  // Player search handler with debouncing
  const handlePlayerSearch = (query: string) => {
    setPlayerSearch(query);

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // If query too short, clear results immediately
    if (query.trim().length < 2) {
      setPlayerSearchResults([]);
      setShowPlayerDropdown(false);
      setPlayerSearchLoading(false);
      return;
    }

    // Show loading state
    setPlayerSearchLoading(true);

    // Debounce the actual search
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await axiosInstance.get(`/players/search`, {
          params: { query: query.trim() }
        });
        setPlayerSearchResults(response.data || []);
        setShowPlayerDropdown(true);
      } catch (error) {
        console.error("Error searching players:", error);
        setPlayerSearchResults([]);
      } finally {
        setPlayerSearchLoading(false);
      }
    }, 300); // 300ms debounce delay
  };

  const handlePlayerSelect = (player: Player) => {
    setSelectedPlayer(player);
    setPlayerSearch(player.player_name || "");
    setShowPlayerDropdown(false);
  };

  const clearFixtureContext = () => {
    localStorage.removeItem('lastUsedFixture');
    setFixtureContextSaved(false);
    setFixtureDate("");
    setSelectedMatch("");
    setFormData({ ...formData, selectedMatch: "" });
    setMatches([]);
  };

  // Reset form but keep fixture context for rapid entry
  const resetFormKeepFixture = () => {
    // Clear player selection
    setSelectedPlayer(null);
    setPlayerSearch("");
    setPlayerSearchResults([]);
    setShowPlayerDropdown(false);

    // Keep: fixtureDate, selectedMatch, assessmentType

    // Clear form data but preserve selectedMatch in formData
    setFormData({
      ...initialFormData,
      selectedMatch: selectedMatch, // Keep the match ID in formData
    });
    setStrengths([]);
    setWeaknesses([]);
    setAttributeScores({});
    setPositionAttributes([]);
  };

  // Add current report to queue
  const handleAddToQueue = () => {
    if (!selectedPlayer || !assessmentType) return;

    const queuedReport: QueuedReport = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date().toISOString(),
      player: selectedPlayer,
      assessmentType: assessmentType,
      formData: { ...formData },
      fixtureDate,
      selectedMatch,
      strengths: [...strengths],
      weaknesses: [...weaknesses],
      attributeScores: { ...attributeScores },
      positionAttributes: [...positionAttributes],
    };

    // Add new report to queue
    setReportQueue([...reportQueue, queuedReport]);
    setToastMessage(`Report for ${selectedPlayer.player_name} added to queue!`);

    // Clear any existing draft since report is now in queue
    localStorage.removeItem("scoutingAssessmentDraft");

    setToastVariant("info");
    setShowToast(true);

    // Reset form but keep fixture context
    resetFormKeepFixture();
  };

  // Remove report from queue
  const handleRemoveFromQueue = (reportId: string) => {
    setReportQueue(reportQueue.filter(r => r.id !== reportId));
    setToastMessage("Report removed from queue");
    setToastVariant("info");
    setShowToast(true);
  };

  // Edit queued report - load it back into form and remove from queue
  const handleEditQueued = (reportId: string) => {
    const report = reportQueue.find(r => r.id === reportId);
    if (!report) return;

    // Remove report from queue
    setReportQueue(reportQueue.filter(r => r.id !== reportId));

    // Populate form with queued report data
    setSelectedPlayer(report.player);
    setPlayerSearch(report.player.player_name || "");
    setAssessmentType(report.assessmentType);
    setFormData(report.formData);
    setFixtureDate(report.fixtureDate);
    setSelectedMatch(report.selectedMatch);
    setStrengths(report.strengths);
    setWeaknesses(report.weaknesses);
    setAttributeScores(report.attributeScores);
    setPositionAttributes(report.positionAttributes);

    // Fetch matches if needed
    if (report.fixtureDate) {
      setLoadingMatches(true);
      axiosInstance.get(`/matches/date?fixture_date=${report.fixtureDate}`)
        .then(response => {
          const sortedMatches = response.data.sort((a: any, b: any) => {
            const matchA = `${a.home_team} vs ${a.away_team}`.toLowerCase();
            const matchB = `${b.home_team} vs ${b.away_team}`.toLowerCase();
            return matchA.localeCompare(matchB);
          });
          setMatches(sortedMatches);
          setLoadingMatches(false);
        })
        .catch(e => {
          console.error("Error fetching matches:", e);
          setLoadingMatches(false);
        });
    }

    // Show notification
    setToastMessage(`Editing report for ${report.player.player_name}`);
    setToastVariant("info");
    setShowToast(true);

    // Scroll to top of modal to show the form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Clear entire queue
  const handleClearQueue = () => {
    if (window.confirm(`Are you sure you want to clear all ${reportQueue.length} queued reports?`)) {
      setReportQueue([]);
      setToastMessage("Queue cleared");
      setToastVariant("info");
      setShowToast(true);
    }
  };

  // Submit all queued reports in batch
  const handleBatchSubmit = async () => {
    if (reportQueue.length === 0) return;

    setLoading(true);
    let successCount = 0;
    let failCount = 0;
    const failedReports: QueuedReport[] = [];

    for (const queuedReport of reportQueue) {
      try {
        const payload: any = {
          player_id: queuedReport.player.universal_id || queuedReport.player.player_id,
          reportType: queuedReport.assessmentType,
        };

        if (queuedReport.assessmentType === "Player Assessment") {
          payload.selectedMatch = parseInt(queuedReport.formData.selectedMatch, 10);
          payload.playerPosition = queuedReport.formData.playerPosition;
          payload.formation = queuedReport.formData.formation;
          payload.playerBuild = queuedReport.formData.playerBuild;
          payload.playerHeight = queuedReport.formData.playerHeight;
          payload.scoutingType = queuedReport.formData.scoutingType;
          payload.purposeOfAssessment = queuedReport.formData.purposeOfAssessment;
          payload.performanceScore = queuedReport.formData.performanceScore;
          payload.assessmentSummary = queuedReport.formData.assessmentSummary;
          payload.justificationRationale = queuedReport.formData.justificationRationale;
          payload.oppositionDetails = queuedReport.formData.oppositionDetails;
          payload.strengths = queuedReport.strengths.map((s: any) => s.value);
          payload.weaknesses = queuedReport.weaknesses.map((w: any) => w.value);
          payload.attributeScores = queuedReport.attributeScores;
        } else if (queuedReport.assessmentType === "Flag") {
          payload.selectedMatch = parseInt(queuedReport.formData.selectedMatch, 10);
          payload.playerPosition = queuedReport.formData.playerPosition;
          payload.formation = queuedReport.formData.formation;
          payload.playerBuild = queuedReport.formData.playerBuild;
          payload.playerHeight = queuedReport.formData.playerHeight;
          payload.scoutingType = queuedReport.formData.scoutingType;
          payload.assessmentSummary = queuedReport.formData.assessmentSummary;
          payload.flagCategory = queuedReport.formData.flagCategory;
        } else if (queuedReport.assessmentType === "Clips") {
          payload.playerPosition = queuedReport.formData.playerPosition;
          payload.playerBuild = queuedReport.formData.playerBuild;
          payload.playerHeight = queuedReport.formData.playerHeight;
          payload.strengths = queuedReport.strengths.map((s: any) => s.value);
          payload.weaknesses = queuedReport.weaknesses.map((w: any) => w.value);
          payload.assessmentSummary = queuedReport.formData.assessmentSummary;
          payload.performanceScore = queuedReport.formData.performanceScore;
        }

        await axiosInstance.post("/scout_reports", payload);
        successCount++;
      } catch (error) {
        console.error(`Failed to submit report for ${queuedReport.player.player_name}:`, error);
        failCount++;
        failedReports.push(queuedReport);
      }
    }

    setLoading(false);

    if (failCount === 0) {
      setToastMessage(`All ${successCount} reports submitted successfully!`);
      setToastVariant("success");
      setShowToast(true);

      // Clear queue
      setReportQueue([]);

      // Call success callback
      onAssessmentSubmitSuccess();

      // Close modal and refresh to show new reports after user has time to see success message
      onHide();
      setTimeout(() => window.location.reload(), 2500);
    } else {
      setToastMessage(`${successCount} succeeded, ${failCount} failed. Failed reports kept in queue.`);
      setToastVariant("warning");
      setShowToast(true);

      // Keep only failed reports in queue
      setReportQueue(failedReports);
    }
  };

  // Submit All - adds current report to queue if valid, then batch submits
  const handleSubmitAll = async () => {
    // If current form is valid, add it to queue first
    if (isFormValid() && selectedPlayer && assessmentType) {
      const queuedReport: QueuedReport = {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date().toISOString(),
        player: selectedPlayer,
        assessmentType: assessmentType,
        formData: { ...formData },
        fixtureDate,
        selectedMatch,
        strengths: [...strengths],
        weaknesses: [...weaknesses],
        attributeScores: { ...attributeScores },
        positionAttributes: [...positionAttributes],
      };

      // Add current report to queue
      const updatedQueue = [...reportQueue, queuedReport];
      setReportQueue(updatedQueue);

      // Clear draft since we're submitting
      localStorage.removeItem("scoutingAssessmentDraft");

      // Wait a tick for state to update, then batch submit with the updated queue
      setTimeout(async () => {
        await handleBatchSubmitWithQueue(updatedQueue);
      }, 0);
    } else {
      // Just submit the existing queue
      await handleBatchSubmit();
    }
  };

  // Helper function to batch submit with a specific queue
  const handleBatchSubmitWithQueue = async (queue: QueuedReport[]) => {
    if (queue.length === 0) return;

    setLoading(true);
    let successCount = 0;
    let failCount = 0;
    const failedReports: QueuedReport[] = [];

    for (const queuedReport of queue) {
      try {
        const payload: any = {
          player_id: queuedReport.player.universal_id || queuedReport.player.player_id,
          reportType: queuedReport.assessmentType,
        };

        if (queuedReport.assessmentType === "Player Assessment") {
          payload.selectedMatch = parseInt(queuedReport.formData.selectedMatch, 10);
          payload.playerPosition = queuedReport.formData.playerPosition;
          payload.formation = queuedReport.formData.formation;
          payload.playerBuild = queuedReport.formData.playerBuild;
          payload.playerHeight = queuedReport.formData.playerHeight;
          payload.scoutingType = queuedReport.formData.scoutingType;
          payload.purposeOfAssessment = queuedReport.formData.purposeOfAssessment;
          payload.performanceScore = queuedReport.formData.performanceScore;
          payload.assessmentSummary = queuedReport.formData.assessmentSummary;
          payload.justificationRationale = queuedReport.formData.justificationRationale;
          payload.oppositionDetails = queuedReport.formData.oppositionDetails;
          payload.strengths = queuedReport.strengths.map((s: any) => s.value);
          payload.weaknesses = queuedReport.weaknesses.map((w: any) => w.value);
          payload.attributeScores = queuedReport.attributeScores;
        } else if (queuedReport.assessmentType === "Flag") {
          payload.selectedMatch = parseInt(queuedReport.formData.selectedMatch, 10);
          payload.playerPosition = queuedReport.formData.playerPosition;
          payload.formation = queuedReport.formData.formation;
          payload.playerBuild = queuedReport.formData.playerBuild;
          payload.playerHeight = queuedReport.formData.playerHeight;
          payload.scoutingType = queuedReport.formData.scoutingType;
          payload.assessmentSummary = queuedReport.formData.assessmentSummary;
          payload.flagCategory = queuedReport.formData.flagCategory;
        } else if (queuedReport.assessmentType === "Clips") {
          payload.playerPosition = queuedReport.formData.playerPosition;
          payload.playerBuild = queuedReport.formData.playerBuild;
          payload.playerHeight = queuedReport.formData.playerHeight;
          payload.strengths = queuedReport.strengths.map((s: any) => s.value);
          payload.weaknesses = queuedReport.weaknesses.map((w: any) => w.value);
          payload.assessmentSummary = queuedReport.formData.assessmentSummary;
          payload.performanceScore = queuedReport.formData.performanceScore;
        }

        await axiosInstance.post("/scout_reports", payload);
        successCount++;
      } catch (error) {
        console.error(`Failed to submit report for ${queuedReport.player.player_name}:`, error);
        failCount++;
        failedReports.push(queuedReport);
      }
    }

    setLoading(false);

    if (failCount === 0) {
      setToastMessage(`All ${successCount} reports submitted successfully!`);
      setToastVariant("success");
      setShowToast(true);

      // Clear queue
      setReportQueue([]);

      // Call success callback
      onAssessmentSubmitSuccess();

      // Close modal and refresh to show new reports after user has time to see success message
      onHide();
      setTimeout(() => window.location.reload(), 2500);
    } else {
      setToastMessage(`${successCount} succeeded, ${failCount} failed. Failed reports kept in queue.`);
      setToastVariant("warning");
      setShowToast(true);

      // Keep only failed reports in queue
      setReportQueue(failedReports);
    }
  };

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
        selectedPlayer &&
        fixtureDate &&
        selectedMatch &&
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
        selectedPlayer &&
        fixtureDate &&
        selectedMatch &&
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
        selectedPlayer &&
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
    setSelectedMatch(""); // Clear selected match when date changes

    if (date) {
      setLoadingMatches(true);
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
      } finally {
        setLoadingMatches(false);
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
      // Check cache first
      if (attributesCache.current[position]) {
        // Use cached attributes immediately
        const cachedAttrs = attributesCache.current[position];
        setPositionAttributes(cachedAttrs);
        const initialScores: { [key: string]: number } = {};
        cachedAttrs.forEach((attr: string) => {
          initialScores[attr] = 0;
        });
        setAttributeScores(initialScores);
        return;
      }

      // Fetch from API if not cached
      setLoadingAttributes(true);
      try {
        const response = await axiosInstance.get(`/attributes/${position}`);
        const attrs = response.data;

        // Cache the result
        attributesCache.current[position] = attrs;

        setPositionAttributes(attrs);
        const initialScores: { [key: string]: number } = {};
        attrs.forEach((attr: string) => {
          initialScores[attr] = 0;
        });
        setAttributeScores(initialScores);
      } catch (error) {
        console.error("Error fetching attributes:", error);
        setPositionAttributes([]);
      } finally {
        setLoadingAttributes(false);
      }
    } else {
      setPositionAttributes([]);
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

  // Auto-save draft function (reusable)
  const saveDraft = useCallback((showNotification = false) => {
    // Don't save if in edit mode
    if (editMode) {
      return;
    }

    // Check if there's any content to save
    const hasContent =
      assessmentType ||
      formData.selectedMatch ||
      formData.playerPosition ||
      formData.assessmentSummary ||
      strengths.length > 0 ||
      weaknesses.length > 0 ||
      fixtureDate;

    if (hasContent) {
      const draft = {
        timestamp: new Date().toISOString(),
        selectedPlayer: selectedPlayer
          ? {
              id: selectedPlayer.universal_id || selectedPlayer.player_id,
              name: selectedPlayer.player_name,
              position: selectedPlayer.position,
              team: selectedPlayer.squad_name || selectedPlayer.team,
            }
          : null,
        playerSearch,
        selectedMatch,
        assessmentType,
        formData,
        fixtureDate,
        strengths,
        weaknesses,
        attributeScores,
        positionAttributes,
      };

      localStorage.setItem("scoutingAssessmentDraft", JSON.stringify(draft));
      console.log("Draft auto-saved to localStorage");

      // Show toast notification only if requested
      if (showNotification) {
        setToastMessage("Draft saved successfully!");
        setToastVariant("info");
        setShowToast(true);
      }
    }
  }, [
    editMode,
    assessmentType,
    formData,
    strengths,
    weaknesses,
    fixtureDate,
    selectedPlayer,
    playerSearch,
    selectedMatch,
    attributeScores,
    positionAttributes,
  ]);

  // Save draft to localStorage when modal closes
  const handleModalClose = () => {
    saveDraft(true); // Save with notification
    onHide();
  };

  // Auto-save on field changes (debounced to avoid excessive saves)
  useEffect(() => {
    if (show && !editMode) {
      const timeoutId = setTimeout(() => {
        saveDraft(false); // Save without notification
      }, 2000); // Wait 2 seconds after last change

      return () => clearTimeout(timeoutId);
    }
  }, [
    show,
    editMode,
    assessmentType,
    formData,
    strengths,
    weaknesses,
    fixtureDate,
    selectedPlayer,
    playerSearch,
    selectedMatch,
    attributeScores,
    positionAttributes,
    saveDraft,
  ]);

  // Save draft before logout/redirect/browser close
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (show && !editMode) {
        saveDraft(false); // Save without notification

        // Only show warning if there's unsaved content
        const hasContent =
          assessmentType ||
          formData.selectedMatch ||
          formData.playerPosition ||
          formData.assessmentSummary ||
          strengths.length > 0 ||
          weaknesses.length > 0 ||
          fixtureDate;

        if (hasContent) {
          e.preventDefault();
          e.returnValue = ''; // Required for Chrome
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [
    show,
    editMode,
    assessmentType,
    formData,
    strengths,
    weaknesses,
    fixtureDate,
    saveDraft,
  ]);

  const handleConfirmSubmit = async () => {
    setLoading(true);
    try {
      const payload: any = {
        player_id: selectedPlayer?.universal_id,
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

      // Save fixture context for next report
      if (fixtureDate && selectedMatch) {
        localStorage.setItem('lastUsedFixture', JSON.stringify({
          fixtureDate: fixtureDate,
          matchId: selectedMatch
        }));
      }

      // Clear the draft from localStorage on successful submission
      localStorage.removeItem("scoutingAssessmentDraft");
      console.log("Draft cleared after successful submission");

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
    if (!assessmentType) {
      return (
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
      );
    }

    return (
      <Form onSubmit={handleSubmit}>
        <p>
          <span className="text-danger">*</span> indicates a required field.
        </p>

        {/* Queue Panel - Shows when queue has items */}
        {reportQueue.length > 0 && (
          <Card className="mb-4" style={{ backgroundColor: "#f0f8ff", border: "1px solid #007bff" }}>
            <Card.Header style={{ backgroundColor: "#007bff", color: "white" }}>
              <h6 className="mb-0">Queued Reports ({reportQueue.length})</h6>
            </Card.Header>
            <Card.Body style={{ maxHeight: "200px", overflowY: "auto" }}>
              <ListGroup>
                {reportQueue.map((report) => (
                  <ListGroup.Item key={report.id} className="d-flex justify-content-between align-items-center">
                    <div>
                      <strong>{report.player.player_name}</strong>
                      <div className="text-muted small">
                        {report.assessmentType}
                        {report.formData.performanceScore && ` - Score: ${report.formData.performanceScore}`}
                      </div>
                    </div>
                    <div>
                      <Button size="sm" variant="outline-primary" onClick={() => handleEditQueued(report.id)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="outline-danger" onClick={() => handleRemoveFromQueue(report.id)} className="ms-1">
                        Remove
                      </Button>
                    </div>
                  </ListGroup.Item>
                ))}
              </ListGroup>
            </Card.Body>
          </Card>
        )}

        {/* Report Details Section - Always show first */}
        <div className="mb-4">
            {/* Player Search */}
            <Form.Group className="mb-3" controlId="playerSearch">
              <Form.Label>
                Player <span className="text-danger">*</span>
              </Form.Label>
              <div className="position-relative">
                <Form.Control
                  type="text"
                  placeholder="Search for player..."
                  value={playerSearch}
                  onChange={(e) => handlePlayerSearch(e.target.value)}
                  onBlur={() => setTimeout(() => setShowPlayerDropdown(false), 200)}
                  onFocus={() => {
                    if (playerSearchResults.length > 0) setShowPlayerDropdown(true);
                  }}
                  disabled={editMode && propSelectedPlayer !== null}
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
              {showPlayerDropdown && playerSearchResults.length > 0 && (
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
                  {playerSearchResults.map((player, index) => (
                    <ListGroup.Item
                      key={player.universal_id || `player-${index}`}
                      action
                      onClick={() => handlePlayerSelect(player)}
                      className="d-flex justify-content-between align-items-center"
                    >
                      <span>{player.player_name}</span>
                      <small className="text-muted">({player.squad_name})</small>
                    </ListGroup.Item>
                  ))}
                </ListGroup>
              )}
              {selectedPlayer && (
                <div className="mt-2 p-2" style={{ backgroundColor: "#e7f3ff", borderRadius: "4px" }}>
                  <strong>Selected:</strong> {selectedPlayer.player_name} ({selectedPlayer.squad_name})
                </div>
              )}
            </Form.Group>

            {(assessmentType === "Player Assessment" || assessmentType === "Flag") && (
              <Row className="mb-3">
                <Form.Group as={Col} controlId="reportFixtureDate">
                  <Form.Label>
                    Fixture Date <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    type="date"
                    value={fixtureDate}
                    onChange={handleFixtureDateChange}
                  />
                </Form.Group>
                <Form.Group as={Col} controlId="reportSelectedMatch">
                  <Form.Label>
                    Match <span className="text-danger">*</span>
                  </Form.Label>
                  {loadingMatches ? (
                    <div className="d-flex align-items-center p-2" style={{ border: "1px solid #dee2e6", borderRadius: "4px", backgroundColor: "#f8f9fa" }}>
                      <Spinner animation="border" size="sm" className="me-2" />
                      <span className="text-muted">Loading matches...</span>
                    </div>
                  ) : (
                    <Select
                      isSearchable
                      isDisabled={!fixtureDate || matches.length === 0}
                      options={matches.map((match) => ({
                        value: match.match_id,
                        label: `${match.home_team} vs ${match.away_team}${match.data_source === "internal" ? " 📝" : ""}`,
                      }))}
                      value={
                        selectedMatch &&
                        matches.find((match) => match.match_id && match.match_id.toString() === selectedMatch)
                          ? {
                              value: parseInt(selectedMatch),
                              label: `${matches.find((match) => match.match_id && match.match_id.toString() === selectedMatch)?.home_team} vs ${matches.find((match) => match.match_id && match.match_id.toString() === selectedMatch)?.away_team}`,
                            }
                          : null
                      }
                      onChange={(selectedOption) => {
                        const matchId = selectedOption ? selectedOption.value.toString() : "";
                        setSelectedMatch(matchId);
                        setFormData({ ...formData, selectedMatch: matchId });
                      }}
                      placeholder="Select Match"
                      isClearable
                      key={`match-select-report-${selectedMatch}-${matches.length}`}
                    />
                  )}
                </Form.Group>
              </Row>
            )}

            {fixtureContextSaved && (assessmentType === "Player Assessment" || assessmentType === "Flag") && (
              <div className="mt-2">
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={clearFixtureContext}
                >
                  Clear Fixture Context
                </Button>
                <small className="text-muted ms-2">
                  Using saved fixture from previous report
                </small>
              </div>
            )}
        </div>

        <hr className="my-4" />

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
                  disabled={!selectedPlayer || !fixtureDate || !selectedMatch}
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
                  disabled={!selectedPlayer || !fixtureDate || !selectedMatch}
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
                  disabled={!selectedPlayer || !fixtureDate || !selectedMatch}
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
                  disabled={!selectedPlayer || !fixtureDate || !selectedMatch}
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
                  disabled={!selectedPlayer || !fixtureDate || !selectedMatch}
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
                  disabled={!selectedPlayer || !fixtureDate || !selectedMatch}
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
                  isDisabled={!selectedPlayer || !fixtureDate || !selectedMatch}
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
                  isDisabled={!selectedPlayer || !fixtureDate || !selectedMatch}
                />
              </Form.Group>
            </Row>
            {loadingAttributes && (
              <Row className="mb-3">
                <Col className="text-center">
                  <Spinner animation="border" size="sm" className="me-2" />
                  <span>Loading attributes for {formData.playerPosition}...</span>
                </Col>
              </Row>
            )}
            {!loadingAttributes && positionAttributes.length > 0 && (
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
                  disabled={!selectedPlayer || !fixtureDate || !selectedMatch}
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
                disabled={!selectedPlayer || !fixtureDate || !selectedMatch}
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
                disabled={!selectedPlayer || !fixtureDate || !selectedMatch}
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
                disabled={!selectedPlayer || !fixtureDate || !selectedMatch}
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
                  disabled={!selectedPlayer || !fixtureDate || !selectedMatch}
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
                  disabled={!selectedPlayer || !fixtureDate || !selectedMatch}
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
                  disabled={!selectedPlayer || !fixtureDate || !selectedMatch}
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
                  disabled={!selectedPlayer || !fixtureDate || !selectedMatch}
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
                  disabled={!selectedPlayer || !fixtureDate || !selectedMatch}
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
                  disabled={!selectedPlayer || !fixtureDate || !selectedMatch}
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
                disabled={!selectedPlayer || !fixtureDate || !selectedMatch}
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
                  disabled={!selectedPlayer}
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
                  disabled={!selectedPlayer}
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
                  disabled={!selectedPlayer}
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
                  isDisabled={!selectedPlayer}
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
                  isDisabled={!selectedPlayer}
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
                disabled={!selectedPlayer}
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
                disabled={!selectedPlayer}
              />
            </Form.Group>
          </>
        )}

        <div className="d-flex justify-content-between align-items-center">
          <div>
            <Button
              variant="primary"
              onClick={handleAddToQueue}
              disabled={!isFormValid() || loading}
            >
              Add to Queue
            </Button>
            {!editMode && (
              <Button
                variant="success"
                onClick={handleSubmitAll}
                disabled={(reportQueue.length === 0 && !isFormValid()) || loading}
                className="ms-2"
              >
                {loading ? (
                  <Spinner animation="border" size="sm" />
                ) : (
                  `Submit All (${isFormValid() ? reportQueue.length + 1 : reportQueue.length})`
                )}
              </Button>
            )}
            {editMode && (
              <Button
                variant="success"
                onClick={handleSubmit}
                disabled={!isFormValid() || loading}
                className="ms-2"
              >
                {loading ? <Spinner animation="border" size="sm" /> : "Update"}
              </Button>
            )}
          </div>
          <Button variant="secondary" onClick={() => setAssessmentType(null)}>
            Back
          </Button>
        </div>
      </Form>
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

  return (
    <>
      <Modal show={show} onHide={handleModalClose} size="lg">
        <Modal.Header
          closeButton
          style={getHeaderStyle()}
          className="modal-header-dark"
        >
          <Modal.Title>
            {assessmentType
              ? `${getHeaderIcon()} ${editMode ? "Edit" : ""} ${assessmentType}${selectedPlayer ? ` for ${selectedPlayer.player_name}` : ""}`
              : "📋 Select Assessment Type"}
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
          <Button variant="primary" onClick={handleConfirmSubmit} disabled={loading}>
            {loading ? (
              <>
                <Spinner animation="border" size="sm" /> Submitting...
              </>
            ) : (
              "Continue"
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      <ToastContainer position="top-end" className="p-3">
        <Toast
          onClose={() => setShowToast(false)}
          show={showToast}
          delay={5000}
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
