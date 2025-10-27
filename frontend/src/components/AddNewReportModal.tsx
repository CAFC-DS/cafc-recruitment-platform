import React, { useState } from "react";
import { Modal, Button, ListGroup } from "react-bootstrap";
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
  const [showFixtureModal, setShowFixtureModal] = useState(false);
  const [showIntelModal, setShowIntelModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  const handleOptionSelect = (option: string) => {
    onHide(); // Close the selection modal first

    switch (option) {
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
        onIntelSubmitSuccess={() => {
          setShowIntelModal(false);
          onSuccess();
        }}
      />

      <FeedbackModal
        show={showFeedbackModal}
        onHide={() => setShowFeedbackModal(false)}
      />
    </>
  );
};

export default AddNewReportModal;
