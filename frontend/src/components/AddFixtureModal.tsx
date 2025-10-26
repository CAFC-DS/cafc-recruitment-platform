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
  });
  const [teams, setTeams] = useState<Team[]>([]);
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

  const handleTeamSelect = (field: "homeTeam" | "awayTeam", teamName: string) => {
    const selectedTeam = teams.find((t) => t.name === teamName);
    if (field === "homeTeam") {
      setFormData({
        ...formData,
        homeTeam: teamName,
        homeTeamId: selectedTeam?.id || null,
      });
    } else {
      setFormData({
        ...formData,
        awayTeam: teamName,
        awayTeamId: selectedTeam?.id || null,
      });
    }
  };

  const handleClear = () => {
    setFormData({
      homeTeam: "",
      awayTeam: "",
      date: "",
      homeTeamId: null,
      awayTeamId: null,
    });
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
                <Form.Label>Home Team</Form.Label>
                <Form.Select
                  name="homeTeam"
                  value={formData.homeTeam}
                  onChange={(e) => handleTeamSelect("homeTeam", e.target.value)}
                  required
                >
                  <option value="">Select home team...</option>
                  {teams.map((team) => (
                    <option key={`home-${team.id}`} value={team.name}>
                      {team.name}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
              <Form.Group className="mb-3" controlId="awayTeam">
                <Form.Label>Away Team</Form.Label>
                <Form.Select
                  name="awayTeam"
                  value={formData.awayTeam}
                  onChange={(e) => handleTeamSelect("awayTeam", e.target.value)}
                  required
                >
                  <option value="">Select away team...</option>
                  {teams.map((team) => (
                    <option key={`away-${team.id}`} value={team.name}>
                      {team.name}
                    </option>
                  ))}
                </Form.Select>
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
