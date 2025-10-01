import React, { useState } from "react";
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
              <Form.Label>League</Form.Label>
              <Form.Control
                type="text"
                name="league"
                value={formData.league}
                onChange={handleChange}
                placeholder="Enter league name"
                required
              />
            </Form.Group>
            <Form.Group className="mb-3" controlId="squadName">
              <Form.Label>Squad Name</Form.Label>
              <Form.Control
                type="text"
                name="squadName"
                value={formData.squadName}
                onChange={handleChange}
                placeholder="Enter squad/club name"
                required
              />
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
