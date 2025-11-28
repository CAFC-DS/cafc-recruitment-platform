import React, { useState, useEffect } from "react";
import {
  Modal,
  Form,
  Button,
  Spinner,
  Toast,
  ToastContainer,
} from "react-bootstrap";
import axiosInstance from "../axiosInstance";

interface AddPlayerModalProps {
  show: boolean;
  onHide: () => void;
}

const AddPlayerModal: React.FC<AddPlayerModalProps> = ({ show, onHide }) => {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    birthDate: "",
    squadName: "",
    position: "",
    league: "",
  });
  const [leagues, setLeagues] = useState<string[]>([]);
  const [clubs, setClubs] = useState<string[]>([]);
  const [leagueSearch, setLeagueSearch] = useState("");
  const [squadSearch, setSquadSearch] = useState("");
  const [showLeagueDropdown, setShowLeagueDropdown] = useState(false);
  const [showSquadDropdown, setShowSquadDropdown] = useState(false);
  const [leagueManualEntry, setLeagueManualEntry] = useState(false);
  const [squadManualEntry, setSquadManualEntry] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastVariant, setToastVariant] = useState("success");

  // Position options (same as assessment form)
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

  // Fetch leagues and clubs when modal opens
  useEffect(() => {
    if (show) {
      fetchLeaguesAndClubs();
    }
  }, [show]);

  const fetchLeaguesAndClubs = async () => {
    setLoadingData(true);
    try {
      // Fetch leagues
      const leaguesResponse = await axiosInstance.get("/leagues");
      setLeagues(leaguesResponse.data.leagues || []);

      // Fetch all clubs
      const clubsResponse = await axiosInstance.get("/clubs");
      setClubs(clubsResponse.data.clubs || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      setToastMessage("Error loading leagues and clubs. Please try again.");
      setToastVariant("danger");
      setShowToast(true);
    } finally {
      setLoadingData(false);
    }
  };

  const filterLeagues = (searchTerm: string) => {
    if (!searchTerm) return [];
    const lowerSearch = searchTerm.toLowerCase();
    return leagues
      .filter((league) => league.toLowerCase().includes(lowerSearch))
      .slice(0, 10); // Limit to 10 results
  };

  const filterClubs = (searchTerm: string) => {
    if (!searchTerm) return [];
    const lowerSearch = searchTerm.toLowerCase();
    return clubs
      .filter((club) => club.toLowerCase().includes(lowerSearch))
      .slice(0, 10); // Limit to 10 results
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleClear = () => {
    setFormData({
      firstName: "",
      lastName: "",
      birthDate: "",
      squadName: "",
      position: "",
      league: "",
    });
    setLeagueSearch("");
    setSquadSearch("");
    setShowLeagueDropdown(false);
    setShowSquadDropdown(false);
    setLeagueManualEntry(false);
    setSquadManualEntry(false);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axiosInstance.post("/players", formData);
      setToastMessage("Player added successfully!");
      setToastVariant("success");
      setShowToast(true);
      handleClear(); // Clear form data on successful submission
      onHide(); // Close the modal after successful submission
    } catch (error) {
      console.error("Error adding player:", error);
      setToastMessage("Error adding player. Please try again.");
      setToastVariant("danger");
      setShowToast(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Modal show={show} onHide={onHide}>
        <Modal.Header
          closeButton
          style={{ backgroundColor: "#000000", color: "white" }}
          className="modal-header-dark"
        >
          <Modal.Title>Add New Player</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {loadingData ? (
            <div className="text-center p-4">
              <Spinner animation="border" />
              <p className="mt-2">Loading data...</p>
            </div>
          ) : (
            <Form onSubmit={handleSubmit}>
              <Form.Group className="mb-3" controlId="firstName">
                <Form.Label>First Name</Form.Label>
                <Form.Control
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  required
                />
              </Form.Group>
              <Form.Group className="mb-3" controlId="lastName">
                <Form.Label>Last Name</Form.Label>
                <Form.Control
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  required
                />
              </Form.Group>
              <Form.Group className="mb-3" controlId="birthDate">
                <Form.Label>Birth Date</Form.Label>
                <Form.Control
                  type="date"
                  name="birthDate"
                  value={formData.birthDate}
                  onChange={handleChange}
                />
              </Form.Group>
              <Form.Group className="mb-3" controlId="league">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <Form.Label className="mb-0">League</Form.Label>
                  <Form.Check
                    type="checkbox"
                    label="Enter manually"
                    checked={leagueManualEntry}
                    onChange={(e) => {
                      setLeagueManualEntry(e.target.checked);
                      if (e.target.checked) {
                        setShowLeagueDropdown(false);
                        setLeagueSearch("");
                      } else {
                        setFormData({ ...formData, league: "" });
                      }
                    }}
                    style={{ fontSize: "0.875rem" }}
                  />
                </div>
                <div style={{ position: "relative" }}>
                  {leagueManualEntry ? (
                    <Form.Control
                      type="text"
                      placeholder="Enter league name..."
                      value={formData.league}
                      onChange={(e) =>
                        setFormData({ ...formData, league: e.target.value })
                      }
                      required
                    />
                  ) : (
                    <>
                      <Form.Control
                        type="text"
                        placeholder="Search for league..."
                        value={leagueSearch}
                        onChange={(e) => {
                          setLeagueSearch(e.target.value);
                          setShowLeagueDropdown(true);
                        }}
                        onFocus={() => setShowLeagueDropdown(true)}
                        required={!formData.league}
                      />
                      {formData.league && (
                        <small className="text-success">
                          ✓ Selected: {formData.league}
                        </small>
                      )}
                      {showLeagueDropdown && leagueSearch && (
                        <div
                          style={{
                            position: "absolute",
                            top: "100%",
                            left: 0,
                            right: 0,
                            maxHeight: "200px",
                            overflowY: "auto",
                            backgroundColor: "white",
                            border: "1px solid #ced4da",
                            borderRadius: "0.25rem",
                            zIndex: 1000,
                            marginTop: "2px",
                          }}
                        >
                          {filterLeagues(leagueSearch).length > 0 ? (
                            filterLeagues(leagueSearch).map((league, index) => (
                              <div
                                key={`league-${index}`}
                                onClick={() => {
                                  setFormData({ ...formData, league });
                                  setLeagueSearch(league);
                                  setShowLeagueDropdown(false);
                                }}
                                style={{
                                  padding: "8px 12px",
                                  cursor: "pointer",
                                  borderBottom: "1px solid #f0f0f0",
                                }}
                                onMouseEnter={(e) =>
                                  (e.currentTarget.style.backgroundColor = "#f8f9fa")
                                }
                                onMouseLeave={(e) =>
                                  (e.currentTarget.style.backgroundColor = "white")
                                }
                              >
                                {league}
                              </div>
                            ))
                          ) : (
                            <div style={{ padding: "8px 12px", color: "#6c757d" }}>
                              No leagues found
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </Form.Group>
              <Form.Group className="mb-3" controlId="squadName">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <Form.Label className="mb-0">Squad Name</Form.Label>
                  <Form.Check
                    type="checkbox"
                    label="Enter manually"
                    checked={squadManualEntry}
                    onChange={(e) => {
                      setSquadManualEntry(e.target.checked);
                      if (e.target.checked) {
                        setShowSquadDropdown(false);
                        setSquadSearch("");
                      } else {
                        setFormData({ ...formData, squadName: "" });
                      }
                    }}
                    style={{ fontSize: "0.875rem" }}
                  />
                </div>
                <div style={{ position: "relative" }}>
                  {squadManualEntry ? (
                    <Form.Control
                      type="text"
                      placeholder="Enter squad/club name..."
                      value={formData.squadName}
                      onChange={(e) =>
                        setFormData({ ...formData, squadName: e.target.value })
                      }
                      required
                    />
                  ) : (
                    <>
                      <Form.Control
                        type="text"
                        placeholder="Search for squad/club..."
                        value={squadSearch}
                        onChange={(e) => {
                          setSquadSearch(e.target.value);
                          setShowSquadDropdown(true);
                        }}
                        onFocus={() => setShowSquadDropdown(true)}
                        required={!formData.squadName}
                      />
                      {formData.squadName && (
                        <small className="text-success">
                          ✓ Selected: {formData.squadName}
                        </small>
                      )}
                      {showSquadDropdown && squadSearch && (
                        <div
                          style={{
                            position: "absolute",
                            top: "100%",
                            left: 0,
                            right: 0,
                            maxHeight: "200px",
                            overflowY: "auto",
                            backgroundColor: "white",
                            border: "1px solid #ced4da",
                            borderRadius: "0.25rem",
                            zIndex: 1000,
                            marginTop: "2px",
                          }}
                        >
                          {filterClubs(squadSearch).length > 0 ? (
                            filterClubs(squadSearch).map((club, index) => (
                              <div
                                key={`club-${index}`}
                                onClick={() => {
                                  setFormData({ ...formData, squadName: club });
                                  setSquadSearch(club);
                                  setShowSquadDropdown(false);
                                }}
                                style={{
                                  padding: "8px 12px",
                                  cursor: "pointer",
                                  borderBottom: "1px solid #f0f0f0",
                                }}
                                onMouseEnter={(e) =>
                                  (e.currentTarget.style.backgroundColor = "#f8f9fa")
                                }
                                onMouseLeave={(e) =>
                                  (e.currentTarget.style.backgroundColor = "white")
                                }
                              >
                                {club}
                              </div>
                            ))
                          ) : (
                            <div style={{ padding: "8px 12px", color: "#6c757d" }}>
                              No clubs found
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </Form.Group>
            <Form.Group className="mb-3" controlId="position">
              <Form.Label>Position</Form.Label>
              <Form.Select
                name="position"
                value={formData.position}
                onChange={handleChange}
                required
              >
                <option value="">Select a position</option>
                {playerPositions.map((position) => (
                  <option key={position} value={position}>
                    {position}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            <div className="d-flex justify-content-between">
              <Button variant="primary" type="submit" disabled={loading}>
                {loading ? <Spinner animation="border" size="sm" /> : "Submit"}
              </Button>
              <Button
                variant="secondary"
                type="button"
                onClick={handleClear}
                disabled={loading}
              >
                Clear
              </Button>
            </div>
          </Form>
          )}
        </Modal.Body>
      </Modal>

      <ToastContainer position="top-end" className="p-3">
        <Toast
          onClose={() => setShowToast(false)}
          show={showToast}
          delay={3000}
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
    </>
  );
};

export default AddPlayerModal;
