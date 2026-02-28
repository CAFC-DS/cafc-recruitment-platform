import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Form,
  Modal,
  Row,
  Spinner,
  Table,
} from "react-bootstrap";
import axios from "axios";
import axiosInstance from "../../axiosInstance";

type ConfidenceLevel = "high" | "medium" | "low";

interface AuditCandidate {
  external: {
    player_id: number;
    player_name: string;
    first_name: string | null;
    last_name: string | null;
    birth_date: string | null;
    squad_name: string | null;
    position: string | null;
    data_source: string;
    universal_id: string;
  };
  confidence: ConfidenceLevel;
  name_similarity: number;
  squad_similarity: number;
  evidence: string[];
}

interface AuditItem {
  internal_player: {
    cafc_player_id: number;
    player_name: string;
    first_name: string | null;
    last_name: string | null;
    birth_date: string | null;
    squad_name: string | null;
    position: string | null;
    data_source: string;
    universal_id: string;
  };
  best_confidence: ConfidenceLevel;
  candidate_count: number;
  candidates: AuditCandidate[];
}

interface InternalAuditResponse {
  items: AuditItem[];
  summary: {
    high: number;
    medium: number;
    low: number;
    unresolved: number;
    total_candidates: number;
    last_scan_at: string;
  };
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

interface SafetyCheck {
  dependencies?: {
    scout_reports?: number;
    intel_reports?: number;
    player_notes?: number;
  };
  total_dependencies?: number;
}

interface InternalPlayerAuditTabProps {
  onStatsChange?: (stats: {
    totalCandidates: number;
    unresolved: number;
    lastScanAt: string;
  }) => void;
}

const CONFIDENCE_OPTIONS = [
  { value: "all", label: "All Confidence" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const getConfidenceBadge = (confidence: string) => {
  if (confidence === "high") return "danger";
  if (confidence === "medium") return "warning";
  return "info";
};

const formatDate = (value?: string | null) => {
  if (!value) return "N/A";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
};

const InternalPlayerAuditTab: React.FC<InternalPlayerAuditTabProps> = ({
  onStatsChange,
}) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [data, setData] = useState<InternalAuditResponse | null>(null);

  const [confidence, setConfidence] = useState<string>("all");
  const [name, setName] = useState("");
  const [squad, setSquad] = useState("");
  const [searchName, setSearchName] = useState("");
  const [searchSquad, setSearchSquad] = useState("");
  const [page, setPage] = useState(1);
  const [limit] = useState(25);

  const [reviewItem, setReviewItem] = useState<AuditItem | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [mergeLoadingId, setMergeLoadingId] = useState<number | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [candidateImpact, setCandidateImpact] = useState<Record<number, SafetyCheck>>(
    {}
  );

  const fetchAudit = useCallback(
    async (isRefresh: boolean = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setError(null);

        const response = await axiosInstance.get<InternalAuditResponse>(
          "/admin/internal-player-audit",
          {
            params: {
              page,
              limit,
              confidence,
              name: searchName || undefined,
              squad: searchSquad || undefined,
            },
          }
        );
        setData(response.data);
        if (onStatsChange) {
          onStatsChange({
            totalCandidates: response.data.summary.total_candidates,
            unresolved: response.data.summary.unresolved,
            lastScanAt: response.data.summary.last_scan_at,
          });
        }
      } catch (err) {
        if (axios.isAxiosError(err) && err.response) {
          setError(err.response.data.detail || "Failed to load internal player audit");
        } else {
          setError("Failed to load internal player audit");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page, limit, confidence, searchName, searchSquad, onStatsChange]
  );

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  const applyFilters = () => {
    setPage(1);
    setSearchName(name.trim());
    setSearchSquad(squad.trim());
  };

  const openReview = async (item: AuditItem) => {
    setReviewItem(item);
    setShowReviewModal(true);
    setCandidateImpact({});
    setImpactLoading(true);

    try {
      const entries = await Promise.all(
        item.candidates.map(async (candidate) => {
          try {
            const response = await axiosInstance.get(
              `/admin/player-safety-check/${candidate.external.player_id}`
            );
            return [candidate.external.player_id, response.data] as const;
          } catch {
            return [candidate.external.player_id, {}] as const;
          }
        })
      );

      const next: Record<number, SafetyCheck> = {};
      entries.forEach(([playerId, payload]) => {
        next[playerId] = payload;
      });
      setCandidateImpact(next);
    } finally {
      setImpactLoading(false);
    }
  };

  const closeReview = () => {
    setShowReviewModal(false);
    setReviewItem(null);
    setCandidateImpact({});
    setMergeLoadingId(null);
  };

  const handleMergeToInternal = async (item: AuditItem, candidate: AuditCandidate) => {
    const keepCafcId = item.internal_player.cafc_player_id;
    const removePlayerId = candidate.external.player_id;
    if (
      !window.confirm(
        `Merge external player ${removePlayerId} into internal CAFC ID ${keepCafcId}?\n\nThis will re-assign related records to the internal player.`
      )
    ) {
      return;
    }

    try {
      setMergeLoadingId(removePlayerId);
      setError(null);
      await axiosInstance.post(
        `/admin/merge-players?keep_cafc_id=${keepCafcId}&remove_player_id=${removePlayerId}`
      );
      setSuccess(
        `Merged external ${removePlayerId} into internal ${keepCafcId} (${item.internal_player.player_name}).`
      );
      closeReview();
      fetchAudit(true);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.detail || "Failed to merge duplicate players");
      } else {
        setError("Failed to merge duplicate players");
      }
    } finally {
      setMergeLoadingId(null);
    }
  };

  const pagingLabel = useMemo(() => {
    if (!data) return "";
    const start = (data.page - 1) * data.limit + 1;
    const end = Math.min(data.page * data.limit, data.total);
    return `${start}-${end} of ${data.total}`;
  }, [data]);

  return (
    <div className="admin-audit-shell">
      {error && (
        <Alert variant="danger" dismissible onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert variant="success" dismissible onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Card className="mb-3 admin-card">
        <Card.Header className="admin-card-header">
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <h5 className="mb-0">Internal Player Audit</h5>
              <small className="text-white-50">
                Internal records matched against external candidates using tiered confidence.
              </small>
            </div>
            <Button
              size="sm"
              variant="outline-light"
              onClick={() => fetchAudit(true)}
              disabled={refreshing}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        </Card.Header>
        <Card.Body>
          <Row className="g-2 align-items-end">
            <Col md={3}>
              <Form.Label className="small fw-bold">Confidence</Form.Label>
              <Form.Select
                size="sm"
                value={confidence}
                onChange={(e) => {
                  setConfidence(e.target.value);
                  setPage(1);
                }}
              >
                {CONFIDENCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Form.Select>
            </Col>
            <Col md={3}>
              <Form.Label className="small fw-bold">Name Search</Form.Label>
              <Form.Control
                size="sm"
                value={name}
                placeholder="Internal player name"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyFilters();
                  }
                }}
              />
            </Col>
            <Col md={3}>
              <Form.Label className="small fw-bold">Squad Search</Form.Label>
              <Form.Control
                size="sm"
                value={squad}
                placeholder="Squad name"
                onChange={(e) => setSquad(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyFilters();
                  }
                }}
              />
            </Col>
            <Col md={3} className="d-flex gap-2">
              <Button size="sm" variant="dark" onClick={applyFilters}>
                Apply
              </Button>
              <Button
                size="sm"
                variant="outline-secondary"
                onClick={() => {
                  setName("");
                  setSquad("");
                  setSearchName("");
                  setSearchSquad("");
                  setConfidence("all");
                  setPage(1);
                }}
              >
                Reset
              </Button>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Row className="g-3 mb-3">
        <Col md={3}>
          <Card className="admin-metric-card">
            <Card.Body>
              <div className="metric-title">High Confidence</div>
              <div className="metric-value">
                {data?.summary.high ?? 0}
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="admin-metric-card">
            <Card.Body>
              <div className="metric-title">Medium Confidence</div>
              <div className="metric-value">{data?.summary.medium ?? 0}</div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="admin-metric-card">
            <Card.Body>
              <div className="metric-title">Low Confidence</div>
              <div className="metric-value">{data?.summary.low ?? 0}</div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="admin-metric-card">
            <Card.Body>
              <div className="metric-title">Unresolved Internal</div>
              <div className="metric-value">{data?.summary.unresolved ?? 0}</div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Card className="admin-card">
        <Card.Body>
          {loading ? (
            <div className="text-center py-4">
              <Spinner animation="border" />
              <p className="mt-2 mb-0">Running internal-player audit...</p>
            </div>
          ) : !data || data.items.length === 0 ? (
            <Alert variant="info" className="mb-0">
              No internal duplicate candidates found for current filters.
            </Alert>
          ) : (
            <>
              <div className="table-responsive">
                <Table hover className="mb-0 align-middle admin-audit-table">
                  <thead>
                    <tr>
                      <th>Internal Player</th>
                      <th>Top External Candidate</th>
                      <th>Confidence</th>
                      <th>Evidence</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => {
                      const top = item.candidates[0];
                      return (
                        <tr key={item.internal_player.cafc_player_id}>
                          <td>
                            <div className="fw-semibold">{item.internal_player.player_name}</div>
                            <small className="text-muted">
                              CAFC ID: {item.internal_player.cafc_player_id}
                              {" | "}DOB: {formatDate(item.internal_player.birth_date)}
                              {" | "}Squad: {item.internal_player.squad_name || "N/A"}
                            </small>
                          </td>
                          <td>
                            <div className="fw-semibold">{top.external.player_name}</div>
                            <small className="text-muted">
                              External ID: {top.external.player_id}
                              {" | "}DOB: {formatDate(top.external.birth_date)}
                              {" | "}Squad: {top.external.squad_name || "N/A"}
                            </small>
                          </td>
                          <td>
                            <Badge bg={getConfidenceBadge(item.best_confidence)}>
                              {item.best_confidence.toUpperCase()}
                            </Badge>
                          </td>
                          <td>
                            <div className="d-flex flex-wrap gap-1">
                              {top.evidence.map((ev) => (
                                <Badge key={`${item.internal_player.cafc_player_id}-${ev}`} bg="secondary">
                                  {ev}
                                </Badge>
                              ))}
                            </div>
                          </td>
                          <td>
                            <Button
                              size="sm"
                              variant="dark"
                              onClick={() => openReview(item)}
                            >
                              Review ({item.candidate_count})
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>

              <div className="d-flex justify-content-between align-items-center mt-3">
                <small className="text-muted">
                  Showing {pagingLabel}
                </small>
                <div className="d-flex gap-2">
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    disabled={data.page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    disabled={data.page >= data.total_pages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card.Body>
      </Card>

      <Modal show={showReviewModal} onHide={closeReview} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Review Internal Duplicate Candidates</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {reviewItem && (
            <>
              <Alert variant="dark">
                <div className="fw-semibold">{reviewItem.internal_player.player_name}</div>
                <small>
                  Keep Internal: CAFC ID {reviewItem.internal_player.cafc_player_id} | DOB{" "}
                  {formatDate(reviewItem.internal_player.birth_date)} | Squad{" "}
                  {reviewItem.internal_player.squad_name || "N/A"}
                </small>
              </Alert>

              {impactLoading ? (
                <div className="text-center py-3">
                  <Spinner animation="border" size="sm" />
                  <span className="ms-2">Loading impact counts...</span>
                </div>
              ) : null}

              <Table responsive hover className="align-middle">
                <thead>
                  <tr>
                    <th>External Candidate</th>
                    <th>Confidence</th>
                    <th>Evidence</th>
                    <th>Affected Rows</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewItem.candidates.map((candidate) => {
                    const impact = candidateImpact[candidate.external.player_id];
                    const affected =
                      impact?.total_dependencies ??
                      ((impact?.dependencies?.scout_reports || 0) +
                        (impact?.dependencies?.intel_reports || 0) +
                        (impact?.dependencies?.player_notes || 0));
                    return (
                      <tr key={candidate.external.player_id}>
                        <td>
                          <div className="fw-semibold">{candidate.external.player_name}</div>
                          <small className="text-muted">
                            External ID: {candidate.external.player_id} | DOB {formatDate(candidate.external.birth_date)} | Squad{" "}
                            {candidate.external.squad_name || "N/A"}
                          </small>
                        </td>
                        <td>
                          <Badge bg={getConfidenceBadge(candidate.confidence)}>
                            {candidate.confidence.toUpperCase()}
                          </Badge>
                        </td>
                        <td>
                          <div className="d-flex flex-wrap gap-1">
                            {candidate.evidence.map((ev) => (
                              <Badge key={`${candidate.external.player_id}-${ev}`} bg="secondary">
                                {ev}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td>{typeof affected === "number" ? affected : "N/A"}</td>
                        <td>
                          <Button
                            size="sm"
                            variant="dark"
                            disabled={mergeLoadingId === candidate.external.player_id}
                            onClick={() => handleMergeToInternal(reviewItem, candidate)}
                          >
                            {mergeLoadingId === candidate.external.player_id ? "Merging..." : "Merge to Internal"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeReview}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default InternalPlayerAuditTab;
