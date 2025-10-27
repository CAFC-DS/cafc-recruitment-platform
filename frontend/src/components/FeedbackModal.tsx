import React, { useState } from "react";
import { Modal, Form, Button, Alert, Spinner } from "react-bootstrap";
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
  const [success, setSuccess] = useState(false);

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
    setSuccess(false);

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
      setSuccess(true);
      // Reset form after 2 seconds and close modal
      setTimeout(() => {
        resetForm();
        onHide();
      }, 2000);
    } catch (error: any) {
      console.error("Error submitting feedback:", error);
      setError(
        error.response?.data?.detail ||
          "Failed to submit feedback. Please try again."
      );
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
    setSuccess(false);
  };

  return (
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

        {success && (
          <Alert variant="success" className="mb-3">
            ✅ Feedback submitted successfully! Thank you for your input.
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
              disabled={isSubmitting || success}
            >
              {isSubmitting ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" />
                  Sending...
                </>
              ) : success ? (
                "Sent!"
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
  );
};

export default FeedbackModal;
