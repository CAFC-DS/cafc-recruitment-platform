import React, { useState } from "react";
import { Modal, Form, Button, Alert, Spinner, Toast, ToastContainer } from "react-bootstrap";
import axiosInstance from "../axiosInstance";
import { useCurrentUser } from "../hooks/useCurrentUser";

interface FeedbackModalProps {
  show: boolean;
  onHide: () => void;
}

const FeedbackModal: React.FC<FeedbackModalProps> = ({ show, onHide }) => {
  const { user } = useCurrentUser();
  const [formData, setFormData] = useState({
    type: "bug",
    title: "",
    description: "",
    priority: "medium",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastVariant, setToastVariant] = useState<"success" | "danger">("success");

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    // Validation
    if (!formData.title.trim()) {
      setError("Title is required");
      setIsSubmitting(false);
      return;
    }
    if (!formData.description.trim()) {
      setError("Description is required");
      setIsSubmitting(false);
      return;
    }

    try {
      await axiosInstance.post("/feedback", formData);

      // Show success toast
      setToastMessage("Feedback submitted successfully! Thank you for your input.");
      setToastVariant("success");
      setShowToast(true);

      // Reset form and close modal
      resetForm();
      onHide();
    } catch (error: any) {
      console.error("Error submitting feedback:", error);
      setToastMessage(
        error.response?.data?.detail ||
          "Failed to submit feedback. Please try again."
      );
      setToastVariant("danger");
      setShowToast(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      type: "bug",
      title: "",
      description: "",
      priority: "medium",
    });
    setError("");
  };

  return (
    <>
      <Modal show={show} onHide={onHide} size="lg" centered onExited={resetForm}>
        <Modal.Header
          closeButton
          style={{ backgroundColor: "#000", color: "white" }}
        >
          <Modal.Title>💬 Send Feedback</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && (
            <Alert variant="danger" className="mb-3">
              {error}
            </Alert>
          )}

          <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3" controlId="feedbackType">
            <Form.Label>Type *</Form.Label>
            <Form.Select
              name="type"
              value={formData.type}
              onChange={handleInputChange}
              required
            >
              <option value="bug">🐛 Bug Report</option>
              <option value="feature">💡 Feature Request</option>
              <option value="feedback">💬 General Feedback</option>
            </Form.Select>
          </Form.Group>

          <Form.Group className="mb-3" controlId="feedbackPriority">
            <Form.Label>Priority</Form.Label>
            <Form.Select
              name="priority"
              value={formData.priority}
              onChange={handleInputChange}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Form.Select>
            <Form.Text className="text-muted">
              How urgent is this issue or request?
            </Form.Text>
          </Form.Group>

          <Form.Group className="mb-3" controlId="feedbackTitle">
            <Form.Label>Title *</Form.Label>
            <Form.Control
              type="text"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              required
              placeholder="Brief summary of the issue or request"
              maxLength={200}
            />
          </Form.Group>

          <Form.Group className="mb-4" controlId="feedbackDescription">
            <Form.Label>Description *</Form.Label>
            <Form.Control
              as="textarea"
              rows={6}
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              required
              placeholder={
                formData.type === "bug"
                  ? "Please describe:\n- What you were doing\n- What happened\n- What you expected to happen\n- Steps to reproduce (if applicable)"
                  : formData.type === "feature"
                  ? "Please describe:\n- What feature you'd like to see\n- Why it would be useful\n- How you envision it working"
                  : "Share your thoughts, suggestions, or concerns..."
              }
            />
          </Form.Group>

          <div className="d-flex justify-content-end gap-2">
            <Button
              variant="secondary"
              onClick={onHide}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" />
                  Sending...
                </>
              ) : (
                "Submit Feedback"
              )}
            </Button>
          </div>
        </Form>
      </Modal.Body>
      <style>{`
        .modal-header .btn-close {
          filter: invert(1) grayscale(100%) brightness(200%);
        }
      `}</style>
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
        <Toast.Body className={toastVariant === "success" ? "text-white" : ""}>
          {toastMessage}
        </Toast.Body>
      </Toast>
    </ToastContainer>
    </>
  );
};

export default FeedbackModal;
