import React, { useState, useEffect } from "react";
import { Modal, Button, Form, Alert, Spinner, ListGroup, Badge } from "react-bootstrap";
import axiosInstance from "../axiosInstance";

interface ShareLink {
  share_token: string;
  share_url: string;
  created_at: string;
  expires_at: string | null;
  access_count: number;
  last_accessed: string | null;
  is_active: boolean;
  created_by: string;
}

interface ShareLinkModalProps {
  show: boolean;
  onHide: () => void;
  reportId: number;
}

const ShareLinkModal: React.FC<ShareLinkModalProps> = ({
  show,
  onHide,
  reportId,
}) => {
  const [loading, setLoading] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [existingLinks, setExistingLinks] = useState<ShareLink[]>([]);
  const [newShareUrl, setNewShareUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch existing share links when modal opens
  useEffect(() => {
    if (show && reportId) {
      fetchExistingLinks();
    }
    // Reset states when modal closes
    if (!show) {
      setNewShareUrl(null);
      setExpiresAt(null);
      setCopySuccess(false);
      setError(null);
    }
  }, [show, reportId]);

  const fetchExistingLinks = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axiosInstance.get(`/scout_reports/${reportId}/shares`);
      setExistingLinks(response.data.links || []);
    } catch (err: any) {
      console.error("Error fetching share links:", err);
      setError(err.response?.data?.detail || "Failed to fetch existing links");
    } finally {
      setLoading(false);
    }
  };

  const generateNewLink = async () => {
    setGeneratingLink(true);
    setError(null);
    setCopySuccess(false);
    try {
      const response = await axiosInstance.post(`/scout_reports/${reportId}/share`, {
        expires_days: 30, // Default 30 days
      });
      setNewShareUrl(response.data.share_url);
      setExpiresAt(response.data.expires_at);
      // Refresh existing links
      fetchExistingLinks();
    } catch (err: any) {
      console.error("Error generating share link:", err);
      setError(err.response?.data?.detail || "Failed to generate share link");
    } finally {
      setGeneratingLink(false);
    }
  };

  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 3000);
  };

  const revokeLink = async (token: string) => {
    if (!window.confirm("Are you sure you want to revoke this share link? It will no longer be accessible.")) {
      return;
    }

    try {
      await axiosInstance.delete(`/shared-reports/${token}`);
      // Refresh links list
      fetchExistingLinks();
      // Clear new share URL if it matches the revoked token
      if (newShareUrl && newShareUrl.includes(token)) {
        setNewShareUrl(null);
      }
    } catch (err: any) {
      console.error("Error revoking link:", err);
      setError(err.response?.data?.detail || "Failed to revoke link");
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <Modal show={show} onHide={onHide} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Share Scout Report</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {error && (
          <Alert variant="danger" dismissible onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {copySuccess && (
          <Alert variant="success">
            Link copied to clipboard!
          </Alert>
        )}

        {/* New Share Link Section */}
        {newShareUrl ? (
          <div className="mb-4">
            <h6>New Share Link Generated</h6>
            <Form.Group className="mb-2">
              <Form.Control
                type="text"
                value={newShareUrl}
                readOnly
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
            </Form.Group>
            <div className="d-flex gap-2 mb-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => copyToClipboard(newShareUrl)}
              >
                📋 Copy Link
              </Button>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => setNewShareUrl(null)}
              >
                Close
              </Button>
            </div>
            {expiresAt && (
              <small className="text-muted">
                Expires on {formatDate(expiresAt)} (30 days)
              </small>
            )}
          </div>
        ) : (
          <div className="mb-4">
            <p>Generate a shareable link that allows external users to view this report without logging in.</p>
            <Button
              variant="success"
              onClick={generateNewLink}
              disabled={generatingLink}
            >
              {generatingLink ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" />
                  Generating...
                </>
              ) : (
                <>🔗 Generate New Share Link</>
              )}
            </Button>
          </div>
        )}

        <hr />

        {/* Existing Links Section */}
        <h6>Existing Share Links</h6>
        {loading ? (
          <div className="text-center py-3">
            <Spinner animation="border" />
          </div>
        ) : existingLinks.length === 0 ? (
          <Alert variant="info">No share links created yet.</Alert>
        ) : (
          <ListGroup>
            {existingLinks.map((link) => (
              <ListGroup.Item key={link.share_token}>
                <div className="d-flex justify-content-between align-items-start">
                  <div className="flex-grow-1">
                    <div className="d-flex align-items-center gap-2 mb-1">
                      <strong>Share Link</strong>
                      {link.is_active ? (
                        <Badge bg="success">Active</Badge>
                      ) : (
                        <Badge bg="secondary">Revoked</Badge>
                      )}
                    </div>
                    <Form.Control
                      type="text"
                      value={link.share_url}
                      readOnly
                      size="sm"
                      className="mb-2"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <div className="small text-muted">
                      <div>Created: {formatDate(link.created_at)} by {link.created_by}</div>
                      <div>Expires: {formatDate(link.expires_at)}</div>
                      <div>Views: {link.access_count}</div>
                      {link.last_accessed && (
                        <div>Last accessed: {formatDate(link.last_accessed)}</div>
                      )}
                    </div>
                  </div>
                  <div className="d-flex flex-column gap-1 ms-3">
                    <Button
                      variant="outline-primary"
                      size="sm"
                      onClick={() => copyToClipboard(link.share_url)}
                    >
                      📋 Copy
                    </Button>
                    {link.is_active && (
                      <Button
                        variant="outline-danger"
                        size="sm"
                        onClick={() => revokeLink(link.share_token)}
                      >
                        🗑️ Revoke
                      </Button>
                    )}
                  </div>
                </div>
              </ListGroup.Item>
            ))}
          </ListGroup>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default ShareLinkModal;
