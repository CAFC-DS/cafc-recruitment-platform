import React, { useState, useRef, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Navbar,
  Nav,
  Container,
  Button,
  Form,
  Dropdown,
  Modal,
  ListGroup,
  Card,
  Spinner,
} from "react-bootstrap";
import { useAuth } from "../App"; // Import useAuth
import { useTheme } from "../contexts/ThemeContext";
import { useCurrentUser } from "../hooks/useCurrentUser";
import axiosInstance from "../axiosInstance";
import logo from "../assets/logo.png";
import AddFixtureModal from "./AddFixtureModal";
import IntelModal from "./IntelModal";
import AddPlayerModal from "./AddPlayerModal";
import FeedbackModal from "./FeedbackModal";
import ScoutingAssessmentModal from "./ScoutingAssessmentModal";
import HelpModal from "./HelpModal";

const AppNavbar: React.FC = () => {
  const { token, logout } = useAuth(); // Use the auth hook
  const { theme, toggleDarkMode } = useTheme();
  const { user, isAdmin, canAccessAdmin, canAccessIntel, canAccessAnalytics, canAccessLists } = useCurrentUser();
  const navigate = useNavigate();

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchCacheRef = useRef<Map<string, any[]>>(new Map());

  // Sub-modal states for Add New dropdown
  const [showAssessmentModal, setShowAssessmentModal] = useState(false);
  const [showFixtureModal, setShowFixtureModal] = useState(false);
  const [showIntelModal, setShowIntelModal] = useState(false);
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  // Draft indicator state
  const [hasSavedDraft, setHasSavedDraft] = useState(false);

  // Queue indicator state
  const [queueCount, setQueueCount] = useState(0);
  const [showQueueModal, setShowQueueModal] = useState(false);
  const [queuedReports, setQueuedReports] = useState<any[]>([]);

  // Check for saved drafts periodically
  useEffect(() => {
    const checkDraft = () => {
      const draftStr = localStorage.getItem('scoutingAssessmentDraft');
      setHasSavedDraft(!!draftStr);
    };
    checkDraft();
    const interval = setInterval(checkDraft, 1000);
    return () => clearInterval(interval);
  }, []);

  // Check for queued reports periodically
  useEffect(() => {
    const checkQueue = () => {
      const queueStr = localStorage.getItem('reportQueue');
      if (queueStr) {
        try {
          const queue = JSON.parse(queueStr);
          setQueueCount(queue.length || 0);
          setQueuedReports(queue);
        } catch (e) {
          setQueueCount(0);
          setQueuedReports([]);
        }
      } else {
        setQueueCount(0);
        setQueuedReports([]);
      }
    };
    checkQueue();
    const interval = setInterval(checkQueue, 1000);
    return () => clearInterval(interval);
  }, []);

  // Handler to remove a single report from queue
  const handleRemoveFromQueue = (reportId: string) => {
    const updatedQueue = queuedReports.filter((r: any) => r.id !== reportId);
    localStorage.setItem('reportQueue', JSON.stringify(updatedQueue));
    setQueuedReports(updatedQueue);
    setQueueCount(updatedQueue.length);
  };

  // State for batch submission
  const [submittingBatch, setSubmittingBatch] = useState(false);

  // Handler to submit all queued reports
  const handleBatchSubmit = async () => {
    if (queuedReports.length === 0) return;

    if (!window.confirm(`Submit all ${queuedReports.length} queued reports?`)) {
      return;
    }

    setSubmittingBatch(true);
    let successCount = 0;
    let failCount = 0;
    const failedReports: any[] = [];

    for (const queuedReport of queuedReports) {
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

    setSubmittingBatch(false);

    if (failCount === 0) {
      alert(`✅ All ${successCount} reports submitted successfully!`);
      localStorage.removeItem('reportQueue');
      setQueuedReports([]);
      setQueueCount(0);
      setShowQueueModal(false);
    } else {
      alert(`⚠️ ${successCount} succeeded, ${failCount} failed. Failed reports kept in queue.`);
      localStorage.setItem('reportQueue', JSON.stringify(failedReports));
      setQueuedReports(failedReports);
      setQueueCount(failedReports.length);
    }
  };

  // Refresh queue data when queue modal opens
  useEffect(() => {
    if (showQueueModal) {
      const queueStr = localStorage.getItem('reportQueue');
      if (queueStr) {
        try {
          const queue = JSON.parse(queueStr);
          setQueuedReports(queue);
          setQueueCount(queue.length);
        } catch (e) {
          setQueuedReports([]);
          setQueueCount(0);
        }
      } else {
        setQueuedReports([]);
        setQueueCount(0);
      }
    }
  }, [showQueueModal]);

  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setShowSearchResults(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Clear search state when user logs out
  useEffect(() => {
    if (!token) {
      setSearchQuery("");
      setSearchResults([]);
      setShowSearchResults(false);
      setIsSearching(false);
      setSelectedIndex(-1);
    }
  }, [token]);

  // Optimized search with debouncing and caching
  const performSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      setSelectedIndex(-1);
      return;
    }

    // Check cache first
    const cachedResults = searchCacheRef.current.get(query.toLowerCase());
    if (cachedResults) {
      setSearchResults(cachedResults);
      setShowSearchResults(cachedResults.length > 0);
      setSelectedIndex(-1);
      return;
    }

    setIsSearching(true);
    try {
      const response = await axiosInstance.get(
        `/players/search?query=${encodeURIComponent(query)}`,
      );
      const results = response.data || [];

      // Cache the results
      searchCacheRef.current.set(query.toLowerCase(), results);

      // Limit cache size to prevent memory leaks
      if (searchCacheRef.current.size > 20) {
        const firstKey = searchCacheRef.current.keys().next().value;
        if (firstKey) {
          searchCacheRef.current.delete(firstKey);
        }
      }

      setSearchResults(results);
      setShowSearchResults(results.length > 0);
      setSelectedIndex(-1);
    } catch (error) {
      console.error("Search API error:", error);
      setSearchResults([]);
      setShowSearchResults(false);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search handler
  const handleSearch = useCallback(
    (query: string) => {
      // Clear previous timeout
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      // Set new timeout for debouncing
      searchTimeoutRef.current = setTimeout(() => {
        performSearch(query);
      }, 300);
    },
    [performSearch],
  );

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSearchResults || searchResults.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < Math.min(searchResults.length, 10) - 1 ? prev + 1 : prev,
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Escape":
        setShowSearchResults(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const handlePlayerSelect = (player: any) => {
    // Navigate using the same pattern as View Profile buttons
    if (player.player_id) {
      navigate(`/player/${player.player_id}`);
    } else if (player.cafc_player_id) {
      navigate(`/player-profile/${player.cafc_player_id}`);
    } else {
      // Fallback to players search if no ID available
      navigate(`/players?search=${encodeURIComponent(player.playername)}`);
    }
    setShowSearchResults(false);
    setSearchQuery("");
  };

  return (
    <Navbar
      expand="lg"
      sticky="top"
      style={{
        backgroundColor: theme.colors.headerBg,
        borderBottom: `1px solid ${theme.colors.border}`,
      }}
      variant="dark"
    >
      <Container>
        <Navbar.Brand as={Link} to="/">
          <img
            src={logo}
            width="30"
            height="30"
            className="d-inline-block align-top"
            alt="Charlton Athletic Logo"
          />{" "}
          Charlton Athletic
        </Navbar.Brand>
        <Navbar.Toggle aria-controls="basic-navbar-nav" />
        <Navbar.Collapse id="basic-navbar-nav">
          <Nav className="me-auto">
            {token && ( // Only show links if authenticated
              <>
                <Nav.Link as={Link} to="/scouting">
                  ⚽ Scouting
                </Nav.Link>
                {canAccessIntel && (
                  <Nav.Link as={Link} to="/intel">
                    🕵️ Intel
                  </Nav.Link>
                )}
                {canAccessLists && (
                  <Nav.Link as={Link} to="/lists">
                    📋 Lists
                  </Nav.Link>
                )}
                {canAccessAnalytics && (
                  <Nav.Link as={Link} to="/analytics">
                    📊 Analytics
                  </Nav.Link>
                )}
                {canAccessAdmin && (
                  <Nav.Link as={Link} to="/admin">
                    🔧 Admin
                  </Nav.Link>
                )}
              </>
            )}
          </Nav>

          {/* Search Bar - only show when authenticated */}
          {token && (
            <div
              ref={searchContainerRef}
              className="d-flex align-items-center me-3"
              style={{ position: "relative", minWidth: "280px" }}
            >
              <Form className="w-100">
                <div style={{ position: "relative" }}>
                  <Form.Control
                    type="text"
                    placeholder="Search players..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      handleSearch(e.target.value);
                    }}
                    onKeyDown={handleKeyDown}
                    size="sm"
                    style={{
                      backgroundColor: "rgba(255, 255, 255, 0.95)",
                      borderColor: "rgba(255, 255, 255, 0.3)",
                      color: "#374151",
                      fontWeight: "500",
                      paddingLeft: "0.75rem",
                      paddingRight: "2.5rem",
                      fontSize: "0.875rem",
                      borderRadius: "20px !important",
                    }}
                    className="navbar-search-input rounded-pill"
                  />
                  <div
                    style={{
                      position: "absolute",
                      right: "12px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "#6b7280",
                      pointerEvents: "none",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    {isSearching ? (
                      <Spinner animation="border" size="sm" style={{ width: "16px", height: "16px" }} />
                    ) : (
                      "🔍"
                    )}
                  </div>
                </div>
              </Form>

              {/* Search Results Dropdown - Always show when search is active */}
              {(showSearchResults ||
                (searchQuery.length >= 2 && !isSearching)) && (
                <div
                  className="navbar-search-dropdown"
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    backgroundColor: "#ffffff",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    boxShadow: "0 10px 25px rgba(0, 0, 0, 0.15)",
                    zIndex: 9999,
                    maxHeight: "400px",
                    overflowY: "auto",
                    marginTop: "4px",
                    scrollBehavior: "smooth",
                  }}
                >
                  {isSearching && (
                    <div
                      style={{
                        padding: "16px",
                        textAlign: "center",
                        color: "#6b7280",
                      }}
                    >
                      🔄 Searching...
                    </div>
                  )}

                  {!isSearching &&
                    searchResults.length === 0 &&
                    searchQuery.length >= 2 && (
                      <div
                        style={{
                          padding: "16px",
                          textAlign: "center",
                          color: "#6b7280",
                        }}
                      >
                        No players found for "{searchQuery}"
                      </div>
                    )}

                  {!isSearching && searchResults.length > 0 && (
                    <div
                      style={{
                        padding: "8px 16px",
                        fontSize: "12px",
                        color: "#666",
                        borderBottom: "1px solid #eee",
                        fontWeight: "600",
                      }}
                    >
                      {searchResults.length > 10
                        ? `Showing 10 of ${searchResults.length} results`
                        : `Found ${searchResults.length} result${searchResults.length !== 1 ? "s" : ""}`}
                    </div>
                  )}
                  {!isSearching &&
                    searchResults.length > 0 &&
                    searchResults.slice(0, 10).map((player, index) => {
                      // Try different possible field names for player name
                      const playerName =
                        player.playername ||
                        player.name ||
                        player.player_name ||
                        player.fullname ||
                        player.full_name ||
                        "Unknown Player";
                      const team =
                        player.squad_name || player.team || player.club || player.current_team || "";
                      const age = player.age || player.player_age || "";

                      return (
                        <div
                          key={
                            player.universal_id ||
                            `player-${index}-${playerName}`
                          }
                          onClick={() => handlePlayerSelect(player)}
                          className="search-result-item"
                          style={{
                            padding: "12px 16px",
                            cursor: "pointer",
                            borderBottom:
                              index < Math.min(searchResults.length, 10) - 1
                                ? "1px solid #f3f4f6"
                                : "none",
                            backgroundColor:
                              selectedIndex === index ? "#f0f9ff" : "white",
                            color: "#000000",
                            fontSize: "14px",
                            fontWeight: "600",
                          }}
                          onMouseEnter={() => setSelectedIndex(index)}
                          onMouseLeave={() => setSelectedIndex(-1)}
                        >
                          <div
                            style={{
                              color: "#000000",
                              fontSize: "14px",
                              fontWeight: "600",
                              marginBottom: "4px",
                            }}
                          >
                            {playerName}
                          </div>
                          {(team || age) && (
                            <div
                              style={{
                                color: "#666666",
                                fontSize: "12px",
                                fontWeight: "500",
                              }}
                            >
                              {[team, age ? `Age ${age}` : ""].filter(Boolean).join(" • ")}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          <Nav className="d-flex align-items-center">
            {token && (
              <Dropdown className="ms-2">
                <Dropdown.Toggle
                  variant="light"
                  size="sm"
                  className="rounded-pill"
                  style={{ fontWeight: 600 }}
                  id="add-new-dropdown"
                >
                  + Add New
                </Dropdown.Toggle>
                <Dropdown.Menu>
                  <Dropdown.Item onClick={() => setShowAssessmentModal(true)}>
                    📊 Add Assessment
                  </Dropdown.Item>
                  <Dropdown.Item onClick={() => setShowIntelModal(true)}>
                    📝 Add Intel
                  </Dropdown.Item>
                  <Dropdown.Item onClick={() => setShowFixtureModal(true)}>
                    ⚽ Add Fixture
                  </Dropdown.Item>
                  <Dropdown.Item onClick={() => setShowAddPlayerModal(true)}>
                    👤 Add Player
                  </Dropdown.Item>
                  <Dropdown.Divider />
                  <Dropdown.Item onClick={() => setShowFeedbackModal(true)}>
                    💬 Send Feedback
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
            )}
            {token && (hasSavedDraft || queueCount > 0) && (
              <Dropdown className="ms-2">
                <Dropdown.Toggle
                  variant="warning"
                  size="sm"
                  className="rounded-pill"
                  style={{ fontWeight: 600 }}
                  id="in-progress-dropdown"
                >
                  🔄 In Progress
                </Dropdown.Toggle>
                <Dropdown.Menu>
                  {hasSavedDraft && (
                    <>
                      <Dropdown.Header>Draft</Dropdown.Header>
                      <Dropdown.Item onClick={() => navigate('/scouting?openDraft=true')}>
                        📝 Open Draft
                      </Dropdown.Item>
                      <Dropdown.Item
                        onClick={() => {
                          localStorage.removeItem('scoutingAssessmentDraft');
                          setHasSavedDraft(false);
                        }}
                        className="text-danger"
                      >
                        🗑️ Clear Draft
                      </Dropdown.Item>
                    </>
                  )}
                  {hasSavedDraft && queueCount > 0 && <Dropdown.Divider />}
                  {queueCount > 0 && (
                    <>
                      <Dropdown.Header>Queue ({queueCount})</Dropdown.Header>
                      <Dropdown.Item onClick={() => setShowQueueModal(true)}>
                        📝 View Queue
                      </Dropdown.Item>
                      <Dropdown.Item
                        onClick={() => {
                          if (window.confirm(`Clear all ${queueCount} queued reports?`)) {
                            localStorage.removeItem('reportQueue');
                            setQueueCount(0);
                            setQueuedReports([]);
                          }
                        }}
                        className="text-danger"
                      >
                        🗑️ Clear Queue
                      </Dropdown.Item>
                    </>
                  )}
                </Dropdown.Menu>
              </Dropdown>
            )}
            {token ? (
              <Dropdown className="ms-2">
                <Dropdown.Toggle
                  variant="outline-light"
                  size="sm"
                  className="rounded-pill"
                  style={{ fontWeight: 600 }}
                  id="settings-dropdown"
                >
                  ⚙️ Settings
                </Dropdown.Toggle>
                <Dropdown.Menu align="end">
                  <Dropdown.Item onClick={toggleDarkMode}>
                    {theme.isDark ? "☀️ Light Mode" : "🌙 Dark Mode"}
                  </Dropdown.Item>
                  <Dropdown.Item onClick={() => setShowHelpModal(true)}>
                    ❓ Help
                  </Dropdown.Item>
                  <Dropdown.Divider />
                  <Dropdown.Item onClick={logout}>
                    🚪 Logout
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
            ) : (
              <Button
                variant="outline-light"
                size="sm"
                className="ms-2 rounded-pill"
                onClick={() => navigate("/login")}
              >
                Login
              </Button>
            )}
          </Nav>
        </Navbar.Collapse>
      </Container>

      {/* Sub-modals for Add New dropdown */}
      <ScoutingAssessmentModal
        show={showAssessmentModal}
        onHide={() => setShowAssessmentModal(false)}
        onAssessmentSubmitSuccess={() => {
          setShowAssessmentModal(false);
          // Optionally trigger refresh if needed
        }}
      />

      <AddFixtureModal
        show={showFixtureModal}
        onHide={() => setShowFixtureModal(false)}
      />

      <IntelModal
        show={showIntelModal}
        onHide={() => setShowIntelModal(false)}
        selectedPlayer={null}
        onIntelSubmitSuccess={() => setShowIntelModal(false)}
      />

      <AddPlayerModal
        show={showAddPlayerModal}
        onHide={() => setShowAddPlayerModal(false)}
      />

      <FeedbackModal
        show={showFeedbackModal}
        onHide={() => setShowFeedbackModal(false)}
      />

      <HelpModal
        show={showHelpModal}
        onHide={() => setShowHelpModal(false)}
        userRole={user?.role || "scout"}
      />

      {/* Queue Review Modal */}
      <Modal show={showQueueModal} onHide={() => setShowQueueModal(false)} size="lg">
        <Modal.Header closeButton style={{ backgroundColor: "#007bff", color: "white" }}>
          <Modal.Title>📋 Queued Reports ({queueCount})</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {queuedReports.length === 0 ? (
            <div className="text-center text-muted py-4">
              <p>No reports in queue</p>
            </div>
          ) : (
            <Card style={{ backgroundColor: "#f0f8ff", border: "1px solid #007bff" }}>
              <Card.Body style={{ maxHeight: "400px", overflowY: "auto" }}>
                <ListGroup>
                  {queuedReports.map((report: any) => (
                    <ListGroup.Item key={report.id} className="d-flex justify-content-between align-items-center">
                      <div style={{ flex: 1 }}>
                        <strong>{report.player.player_name}</strong>
                        <div className="text-muted small">
                          {report.assessmentType}
                          {report.formData.performanceScore && ` - Score: ${report.formData.performanceScore}`}
                        </div>
                      </div>
                      <div>
                        <Button
                          size="sm"
                          variant="outline-primary"
                          onClick={() => {
                            // Remove from queue
                            const updatedQueue = queuedReports.filter((r: any) => r.id !== report.id);
                            localStorage.setItem('reportQueue', JSON.stringify(updatedQueue));
                            setQueuedReports(updatedQueue);
                            setQueueCount(updatedQueue.length);

                            // Save as draft for the modal to restore
                            const draft = {
                              selectedPlayer: {
                                id: report.player.universal_id || report.player.player_id,
                                name: report.player.player_name,
                                position: report.player.position,
                                team: report.player.squad_name,
                              },
                              playerSearch: report.player.player_name,
                              selectedMatch: report.selectedMatch,
                              assessmentType: report.assessmentType,
                              formData: report.formData,
                              fixtureDate: report.fixtureDate,
                              strengths: report.strengths,
                              weaknesses: report.weaknesses,
                              attributeScores: report.attributeScores,
                              positionAttributes: report.positionAttributes,
                            };
                            localStorage.setItem('scoutingAssessmentDraft', JSON.stringify(draft));

                            // Close queue modal and open assessment modal
                            setShowQueueModal(false);
                            setShowAssessmentModal(true);
                          }}
                          className="me-2"
                        >
                          ✏️ Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline-danger"
                          onClick={() => handleRemoveFromQueue(report.id)}
                        >
                          🗑️ Remove
                        </Button>
                      </div>
                    </ListGroup.Item>
                  ))}
                </ListGroup>
              </Card.Body>
            </Card>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowQueueModal(false)} disabled={submittingBatch}>
            Close
          </Button>
          <Button
            variant="success"
            onClick={handleBatchSubmit}
            disabled={queuedReports.length === 0 || submittingBatch}
          >
            {submittingBatch ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Submitting {queuedReports.length} reports...
              </>
            ) : (
              `✅ Submit All (${queuedReports.length} reports)`
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </Navbar>
  );
};

export default AppNavbar;
