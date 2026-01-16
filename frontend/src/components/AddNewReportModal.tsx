import React, { useState } from "react";
import { Modal, Button, ListGroup, Toast, ToastContainer } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import AddFixtureModal from "./AddFixtureModal";
import IntelModal from "./IntelModal";
import FeedbackModal from "./FeedbackModal";

interface AddNewReportModalProps {
  show: boolean;
  onHide: () => void;
  onSuccess: () => void;
}

const AddNewReportModal: React.FC<AddNewReportModalProps> = ({
  show,
  onHide,
  onSuccess,
}) => {
  const navigate = useNavigate();
  const [showFixtureModal, setShowFixtureModal] = useState(false);
  const [showIntelModal, setShowIntelModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  // Toast notification state
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastVariant, setToastVariant] = useState<"success" | "danger">("success");

  const handleOptionSelect = (option: string) => {
    onHide(); // Close the selection modal first

    switch (option) {
      case "report":
        navigate("/scouting");
        break;
      case "fixture":
        setShowFixtureModal(true);
        break;
      case "intel":
        setShowIntelModal(true);
        break;
      case "feedback":
        setShowFeedbackModal(true);
        break;
    }
  };

  return (
    <>
      <Modal show={show} onHide={onHide} centered>
        <Modal.Header closeButton>
          <Modal.Title>Add New</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <ListGroup>
            <ListGroup.Item
              action
              onClick={() => handleOptionSelect("report")}
              className="d-flex align-items-center py-3"
              style={{ cursor: "pointer" }}
            >
              <span style={{ fontSize: "1.5rem", marginRight: "12px" }}>📊</span>
              <div>
                <strong>Add Report</strong>
                <div style={{ fontSize: "0.875rem", color: "#6c757d" }}>
                  Create a new scouting report
                </div>
              </div>
            </ListGroup.Item>

            <ListGroup.Item
              action
              onClick={() => handleOptionSelect("fixture")}
              className="d-flex align-items-center py-3"
              style={{ cursor: "pointer" }}
            >
              <span style={{ fontSize: "1.5rem", marginRight: "12px" }}>⚽</span>
              <div>
                <strong>Add Fixture</strong>
                <div style={{ fontSize: "0.875rem", color: "#6c757d" }}>
                  Create a new match fixture
                </div>
              </div>
            </ListGroup.Item>

            <ListGroup.Item
              action
              onClick={() => handleOptionSelect("intel")}
              className="d-flex align-items-center py-3"
              style={{ cursor: "pointer" }}
            >
              <span style={{ fontSize: "1.5rem", marginRight: "12px" }}>📝</span>
              <div>
                <strong>Add Intel Report</strong>
                <div style={{ fontSize: "0.875rem", color: "#6c757d" }}>
                  Record player intelligence information
                </div>
              </div>
            </ListGroup.Item>

            <ListGroup.Item
              action
              onClick={() => handleOptionSelect("feedback")}
              className="d-flex align-items-center py-3"
              style={{ cursor: "pointer" }}
            >
              <span style={{ fontSize: "1.5rem", marginRight: "12px" }}>💬</span>
              <div>
                <strong>Send Feedback</strong>
                <div style={{ fontSize: "0.875rem", color: "#6c757d" }}>
                  Report bugs or request features
                </div>
              </div>
            </ListGroup.Item>
          </ListGroup>
        </Modal.Body>
      </Modal>

      {/* Sub-modals */}
      <AddFixtureModal
        show={showFixtureModal}
        onHide={() => {
          setShowFixtureModal(false);
          onSuccess();
        }}
      />

      <IntelModal
        show={showIntelModal}
        onHide={() => setShowIntelModal(false)}
        selectedPlayer={null}
        onIntelSubmitSuccess={(message, variant) => {
          setToastMessage(message);
          setToastVariant(variant);
          setShowToast(true);
          setShowIntelModal(false);
          onSuccess();
          // Dispatch custom event to notify Intel page to refresh
          window.dispatchEvent(new CustomEvent('intelReportChanged'));
        }}
      />

      <FeedbackModal
        show={showFeedbackModal}
        onHide={() => setShowFeedbackModal(false)}
      />

      {/* Toast Notification */}
      <ToastContainer position="top-end" className="p-3" style={{ position: "fixed", zIndex: 9999 }}>
        <Toast
          show={showToast}
          onClose={() => setShowToast(false)}
          delay={3000}
          autohide
          bg={toastVariant}
        >
          <Toast.Header>
            <strong className="me-auto">
              {toastVariant === "success" ? "Success" : "Error"}
            </strong>
          </Toast.Header>
          <Toast.Body className={toastVariant === "danger" ? "text-white" : ""}>
            {toastMessage}
          </Toast.Body>
        </Toast>
      </ToastContainer>
    </>
  );
};

export default AddNewReportModal;
