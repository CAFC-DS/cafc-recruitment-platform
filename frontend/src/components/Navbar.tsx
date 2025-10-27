import React, { useState, useRef, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Navbar,
  Nav,
  Container,
  Button,
  Form,
  InputGroup,
} from "react-bootstrap";
import { useAuth } from "../App"; // Import useAuth
import { useTheme } from "../contexts/ThemeContext";
import DarkModeToggle from "./DarkModeToggle";
import { useCurrentUser } from "../hooks/useCurrentUser";
import axiosInstance from "../axiosInstance";
import logo from "../assets/logo.png";
import AddNewReportModal from "./AddNewReportModal";

const AppNavbar: React.FC = () => {
  const { token, logout } = useAuth(); // Use the auth hook
  const { theme } = useTheme();
  const { isAdmin, isLoanManager, canAccessPlayers, canAccessAnalytics, canAccessLoanReports } = useCurrentUser();
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

  // Add New Report Modal state
  const [showAddNewModal, setShowAddNewModal] = useState(false);

  // Draft indicator state
  const [hasSavedDraft, setHasSavedDraft] = useState(false);

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
        searchCacheRef.current.delete(firstKey);
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
          prev < Math.min(searchResults.length, 8) - 1 ? prev + 1 : prev,
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
                <Nav.Link as={Link} to="/intel">
                  🕵️ Intel
                </Nav.Link>
                {canAccessAnalytics && (
                  <Nav.Link as={Link} to="/analytics">
                    📊 Analytics
                  </Nav.Link>
                )}
                {isAdmin && (
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
                <InputGroup size="sm">
                  <Form.Control
                    type="text"
                    placeholder="Search players..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      handleSearch(e.target.value);
                    }}
                    onKeyDown={handleKeyDown}
                    style={{
                      backgroundColor: "rgba(255, 255, 255, 0.95)",
                      borderColor: "rgba(255, 255, 255, 0.3)",
                      color: "#374151",
                      fontWeight: "500",
                      paddingLeft: "0.75rem",
                      fontSize: "0.875rem",
                    }}
                    className="navbar-search-input"
                  />
                  <Button
                    variant="outline-light"
                    type="submit"
                    size="sm"
                    disabled={isSearching}
                    style={{
                      borderColor: "rgba(255, 255, 255, 0.3)",
                      backgroundColor: "rgba(255, 255, 255, 0.1)",
                      color: "white",
                      borderLeft: "none",
                    }}
                  >
                    {isSearching ? "⏳" : "🔍"}
                  </Button>
                </InputGroup>
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
                    maxHeight: "350px",
                    overflowY: "auto",
                    marginTop: "4px",
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
                        padding: "8px",
                        fontSize: "12px",
                        color: "#666",
                        borderBottom: "1px solid #eee",
                      }}
                    >
                      Found {searchResults.length} results
                    </div>
                  )}
                  {!isSearching &&
                    searchResults.length > 0 &&
                    searchResults.slice(0, 8).map((player, index) => {
                      // Try different possible field names for player name
                      const playerName =
                        player.playername ||
                        player.name ||
                        player.player_name ||
                        player.fullname ||
                        player.full_name ||
                        "Unknown Player";
                      const team =
                        player.team || player.club || player.current_team || "";
                      const position = player.position || player.pos || "";

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
                              index < Math.min(searchResults.length, 8) - 1
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
                          {(team || position) && (
                            <div
                              style={{
                                color: "#666666",
                                fontSize: "12px",
                                fontWeight: "500",
                              }}
                            >
                              {[team, position].filter(Boolean).join(" • ")}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  {searchResults.length > 8 && (
                    <div
                      style={{
                        padding: "10px 16px",
                        textAlign: "center",
                        fontSize: "12px",
                        color: "#6b7280",
                        borderTop: "1px solid #f3f4f6",
                        backgroundColor: "#f9fafb",
                        fontWeight: "500",
                      }}
                    >
                      +{searchResults.length - 8} more results - press Enter to
                      see all
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <Nav className="d-flex align-items-center">
            <DarkModeToggle />
            {token && hasSavedDraft && (
              <Button
                variant="info"
                onClick={() => navigate('/scouting?openDraft=true')}
                size="sm"
                className="ms-2 rounded-pill"
                style={{ fontWeight: 600 }}
                title="Click to restore your saved draft"
              >
                💾 Draft Saved
              </Button>
            )}
            {token && (
              <Button
                variant="danger"
                onClick={() => setShowAddNewModal(true)}
                size="sm"
                className="ms-2 rounded-pill"
                style={{ fontWeight: 600 }}
              >
                + Add New
              </Button>
            )}
            {token ? (
              <Button
                variant="outline-light"
                onClick={logout}
                size="sm"
                className="ms-2 rounded-pill"
              >
                Logout
              </Button>
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

      {/* Add New Report Modal */}
      <AddNewReportModal
        show={showAddNewModal}
        onHide={() => setShowAddNewModal(false)}
        onSuccess={() => {
          setShowAddNewModal(false);
          // Optionally refresh data here if needed
        }}
      />
    </Navbar>
  );
};

export default AppNavbar;
