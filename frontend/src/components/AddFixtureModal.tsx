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

interface Team {
  name: string;
  id: number;
  type: string | null;
  countryId: number | null;
  countryName: string | null;
  skillCornerId: number | null;
  heimspielId: number | null;
  wyscoutId: number | null;
}

interface AddFixtureModalProps {
  show: boolean;
  onHide: () => void;
}

const AddFixtureModal: React.FC<AddFixtureModalProps> = ({ show, onHide }) => {
  const [formData, setFormData] = useState({
    homeTeam: "",
    awayTeam: "",
    date: "",
    homeTeamId: null as number | null,
    awayTeamId: null as number | null,
    homeTeamType: null as string | null,
    awayTeamType: null as string | null,
    homeTeamCountryId: null as number | null,
    awayTeamCountryId: null as number | null,
    homeTeamCountryName: null as string | null,
    awayTeamCountryName: null as string | null,
    homeTeamSkillCornerId: null as number | null,
    awayTeamSkillCornerId: null as number | null,
    homeTeamHeimspielId: null as number | null,
    awayTeamHeimspielId: null as number | null,
    homeTeamWyscoutId: null as number | null,
    awayTeamWyscoutId: null as number | null,
  });
  const [teams, setTeams] = useState<Team[]>([]);
  const [homeSearch, setHomeSearch] = useState("");
  const [awaySearch, setAwaySearch] = useState("");
  const [showHomeDropdown, setShowHomeDropdown] = useState(false);
  const [showAwayDropdown, setShowAwayDropdown] = useState(false);
  const [homeManualEntry, setHomeManualEntry] = useState(false);
  const [awayManualEntry, setAwayManualEntry] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastVariant, setToastVariant] = useState("success");

  // Fetch teams when modal opens
  useEffect(() => {
    if (show) {
      fetchTeams();
    }
  }, [show]);

  const fetchTeams = async () => {
    setLoadingTeams(true);
    try {
      const response = await axiosInstance.get("/teams-with-ids");
      setTeams(response.data.teams || []);
    } catch (error) {
      console.error("Error fetching teams:", error);
      setToastMessage("Error loading teams. Please try again.");
      setToastVariant("danger");
      setShowToast(true);
    } finally {
      setLoadingTeams(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleTeamSelect = (field: "homeTeam" | "awayTeam", team: Team) => {
    if (field === "homeTeam") {
      setFormData({
        ...formData,
        homeTeam: team.name,
        homeTeamId: team.id,
        homeTeamType: team.type,
        homeTeamCountryId: team.countryId,
        homeTeamCountryName: team.countryName,
        homeTeamSkillCornerId: team.skillCornerId,
        homeTeamHeimspielId: team.heimspielId,
        homeTeamWyscoutId: team.wyscoutId,
      });
      setHomeSearch(team.name);
      setShowHomeDropdown(false);
    } else {
      setFormData({
        ...formData,
        awayTeam: team.name,
        awayTeamId: team.id,
        awayTeamType: team.type,
        awayTeamCountryId: team.countryId,
        awayTeamCountryName: team.countryName,
        awayTeamSkillCornerId: team.skillCornerId,
        awayTeamHeimspielId: team.heimspielId,
        awayTeamWyscoutId: team.wyscoutId,
      });
      setAwaySearch(team.name);
      setShowAwayDropdown(false);
    }
  };

  const filterTeams = (searchTerm: string) => {
    if (!searchTerm) return [];
    const lowerSearch = searchTerm.toLowerCase();
    return teams
      .filter((team) => team.name.toLowerCase().includes(lowerSearch))
      .slice(0, 10); // Limit to 10 results
  };

  const handleClear = () => {
    setFormData({
      homeTeam: "",
      awayTeam: "",
      date: "",
      homeTeamId: null,
      awayTeamId: null,
      homeTeamType: null,
      awayTeamType: null,
      homeTeamCountryId: null,
      awayTeamCountryId: null,
      homeTeamCountryName: null,
      awayTeamCountryName: null,
      homeTeamSkillCornerId: null,
      awayTeamSkillCornerId: null,
      homeTeamHeimspielId: null,
      awayTeamHeimspielId: null,
      homeTeamWyscoutId: null,
      awayTeamWyscoutId: null,
    });
    setHomeSearch("");
    setAwaySearch("");
    setShowHomeDropdown(false);
    setShowAwayDropdown(false);
    setHomeManualEntry(false);
    setAwayManualEntry(false);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axiosInstance.post("/matches", formData);
      setToastMessage("Fixture added successfully!");
      setToastVariant("success");
      setShowToast(true);
      handleClear(); // Clear form data on successful submission
      onHide(); // Close the modal after successful submission
    } catch (error) {
      console.error("Error adding fixture:", error);
      setToastMessage("Error adding fixture. Please try again.");
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
          <Modal.Title>Add New Fixture</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {loadingTeams ? (
            <div className="text-center p-4">
              <Spinner animation="border" />
              <p className="mt-2">Loading teams...</p>
            </div>
          ) : (
            <Form onSubmit={handleSubmit}>
              <Form.Group className="mb-3" controlId="homeTeam">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <Form.Label className="mb-0">Home Team</Form.Label>
                  <Form.Check
                    type="checkbox"
                    label="Enter manually"
                    checked={homeManualEntry}
                    onChange={(e) => {
                      setHomeManualEntry(e.target.checked);
                      if (e.target.checked) {
                        setShowHomeDropdown(false);
                        setHomeSearch("");
                      } else {
                        setFormData({ ...formData, homeTeam: "" });
                      }
                    }}
                    style={{ fontSize: "0.875rem" }}
                  />
                </div>
                <div style={{ position: "relative" }}>
                  {homeManualEntry ? (
                    <Form.Control
                      type="text"
                      placeholder="Enter home team name..."
                      value={formData.homeTeam}
                      onChange={(e) =>
                        setFormData({ ...formData, homeTeam: e.target.value })
                      }
                      required
                    />
                  ) : (
                    <>
                      <Form.Control
                        type="text"
                        placeholder="Search for home team..."
                        value={homeSearch}
                        onChange={(e) => {
                          setHomeSearch(e.target.value);
                          setShowHomeDropdown(true);
                        }}
                        onFocus={() => setShowHomeDropdown(true)}
                        required={!formData.homeTeam}
                      />
                      {formData.homeTeam && (
                        <small className="text-success">
                          ✓ Selected: {formData.homeTeam}
                        </small>
                      )}
                      {showHomeDropdown && homeSearch && (
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
                          {filterTeams(homeSearch).length > 0 ? (
                            filterTeams(homeSearch).map((team) => (
                              <div
                                key={`home-${team.id}`}
                                onClick={() => handleTeamSelect("homeTeam", team)}
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
                                {team.name}
                              </div>
                            ))
                          ) : (
                            <div style={{ padding: "8px 12px", color: "#6c757d" }}>
                              No teams found
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </Form.Group>
              <Form.Group className="mb-3" controlId="awayTeam">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <Form.Label className="mb-0">Away Team</Form.Label>
                  <Form.Check
                    type="checkbox"
                    label="Enter manually"
                    checked={awayManualEntry}
                    onChange={(e) => {
                      setAwayManualEntry(e.target.checked);
                      if (e.target.checked) {
                        setShowAwayDropdown(false);
                        setAwaySearch("");
                      } else {
                        setFormData({ ...formData, awayTeam: "" });
                      }
                    }}
                    style={{ fontSize: "0.875rem" }}
                  />
                </div>
                <div style={{ position: "relative" }}>
                  {awayManualEntry ? (
                    <Form.Control
                      type="text"
                      placeholder="Enter away team name..."
                      value={formData.awayTeam}
                      onChange={(e) =>
                        setFormData({ ...formData, awayTeam: e.target.value })
                      }
                      required
                    />
                  ) : (
                    <>
                      <Form.Control
                        type="text"
                        placeholder="Search for away team..."
                        value={awaySearch}
                        onChange={(e) => {
                          setAwaySearch(e.target.value);
                          setShowAwayDropdown(true);
                        }}
                        onFocus={() => setShowAwayDropdown(true)}
                        required={!formData.awayTeam}
                      />
                      {formData.awayTeam && (
                        <small className="text-success">
                          ✓ Selected: {formData.awayTeam}
                        </small>
                      )}
                      {showAwayDropdown && awaySearch && (
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
                          {filterTeams(awaySearch).length > 0 ? (
                            filterTeams(awaySearch).map((team) => (
                              <div
                                key={`away-${team.id}`}
                                onClick={() => handleTeamSelect("awayTeam", team)}
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
                                {team.name}
                              </div>
                            ))
                          ) : (
                            <div style={{ padding: "8px 12px", color: "#6c757d" }}>
                              No teams found
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </Form.Group>
              <Form.Group className="mb-3" controlId="date">
                <Form.Label>Date</Form.Label>
                <Form.Control
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleChange}
                  required
                />
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

export default AddFixtureModal;
