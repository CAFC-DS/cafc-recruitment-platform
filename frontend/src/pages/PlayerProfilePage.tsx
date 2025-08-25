import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Container, Row, Col, Card, Badge, Button, Table, Tab, Tabs, Form, Alert, Spinner, Modal } from 'react-bootstrap';
import axiosInstance from '../axiosInstance';
import PlayerReportModal from '../components/PlayerReportModal';
import IntelReportModal from '../components/IntelReportModal';
import PitchView from '../components/PitchView';

interface PlayerProfile {
  player_id: number;
  player_name: string;
  first_name: string;
  last_name: string;
  age: number | null;
  birth_date: string | null;
  squad_name: string;
  position: string;
  recruitment_status: string;
  scout_reports: any[];
  intel_reports: any[];
  notes: any[];
}

const PlayerProfilePage: React.FC = () => {
  const { playerId } = useParams<{ playerId: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedReport, setSelectedReport] = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showIntelModal, setShowIntelModal] = useState(false);
  const [selectedIntelId, setSelectedIntelId] = useState<number | null>(null);
  const [loadingReportId, setLoadingReportId] = useState<number | null>(null);
  
  // Notes functionality
  const [showAddNoteModal, setShowAddNoteModal] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [isPrivateNote, setIsPrivateNote] = useState(true);
  const [addingNote, setAddingNote] = useState(false);

  // Pipeline functionality removed - will be added later
  const [updatingStatus, setUpdatingStatus] = useState(false);
  
  const getStatusBadge = (status: string) => {
    return <Badge bg="secondary">🔍 Scouted</Badge>;
  };
  
  const pipelineStatuses = []; // Placeholder for now
  
  const updatePipelineStatus = async (newStatus: string) => {
    // Placeholder function - will be implemented later
    console.log('Pipeline status update:', newStatus);
  };

  // Performance scoring functions matching website-wide system
  const getPerformanceScoreVariant = (score: number) => {
    if (score === 10) return 'gold';
    if (score === 9) return 'silver';  
    if (score >= 7) return 'success'; // 7-8 green
    if (score >= 3) return 'warning'; // 3-6 amber
    return 'danger'; // 1-3 red
  };

  const getAttributeScoreVariant = (score: number) => {
    if (score === 100) return 'gold';
    if (score >= 90) return 'silver';
    if (score >= 70) return 'success';
    if (score >= 40) return 'warning';
    return 'danger';
  };

  useEffect(() => {
    if (playerId) {
      fetchPlayerProfile();
    }
  }, [playerId]);

  const fetchPlayerProfile = async () => {
    if (!playerId) {
      setError('No player ID provided');
      setLoading(false);
      return;
    }
    
    try {
      const response = await axiosInstance.get(`/players/${playerId}/profile`);
      setProfile(response.data);
    } catch (error: any) {
      console.error('Error fetching player profile:', error);
      setError('Failed to load player profile');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenReportModal = async (reportId: number) => {
    setLoadingReportId(reportId);
    try {
      const response = await axiosInstance.get(`/scout_reports/${reportId}`);
      setSelectedReport(response.data);
      setShowReportModal(true);
    } catch (error) {
      console.error('Error fetching report:', error);
    } finally {
      setLoadingReportId(null);
    }
  };

  const handleOpenIntelModal = (intelId: number) => {
    setSelectedIntelId(intelId);
    setShowIntelModal(true);
  };

  // Pipeline update function removed - will be added later

  const addNote = async () => {
    if (!profile || !newNote.trim()) return;
    
    setAddingNote(true);
    try {
      await axiosInstance.post(`/players/${profile.player_id}/notes`, {
        player_id: profile.player_id,
        note_content: newNote.trim(),
        is_private: isPrivateNote
      });
      
      setNewNote('');
      setIsPrivateNote(true);
      setShowAddNoteModal(false);
      
      // Refresh profile to get updated notes
      fetchPlayerProfile();
    } catch (error) {
      console.error('Error adding note:', error);
    } finally {
      setAddingNote(false);
    }
  };

  const exportToPDF = async () => {
    if (!profile) return;
    
    try {
      // Open the PDF export endpoint in a new tab
      const exportUrl = `${axiosInstance.defaults.baseURL}/players/${profile.player_id}/export-pdf`;
      window.open(exportUrl, '_blank');
    } catch (error) {
      console.error('Error exporting PDF:', error);
    }
  };

  if (loading) {
    return (
      <Container className="mt-4 text-center">
        <Spinner animation="border" />
        <p>Loading player profile...</p>
      </Container>
    );
  }

  if (error || !profile) {
    return (
      <Container className="mt-4">
        <Alert variant="danger">
          {error || 'Player not found'}
          <Button variant="outline-primary" className="ms-3" onClick={() => navigate(-1)}>
            Go Back
          </Button>
        </Alert>
      </Container>
    );
  }

  return (
    <Container className="mt-4">
      {/* Header Section */}
      <Card className="mb-4 shadow-sm">
        <Card.Body>
          <Row className="align-items-center">
            <Col md={8}>
              <div className="d-flex align-items-center mb-2">
                <h2 className="mb-0 me-3">{profile.player_name}</h2>
                <Badge bg="secondary">🔍 Scouted</Badge>
              </div>
              <div className="text-muted">
                <Row>
                  <Col sm={6}>
                    <p className="mb-1"><strong>Age:</strong> {profile.age || 'Unknown'}</p>
                    <div className="mb-2">
                      <strong className="mb-1 d-block">Position:</strong>
                      <PitchView positions={[profile.position]} className="mb-2" />
                    </div>
                  </Col>
                  <Col sm={6}>
                    <p className="mb-1"><strong>Club:</strong> {profile.squad_name}</p>
                    <p className="mb-1"><strong>Birth Date:</strong> {profile.birth_date || 'Unknown'}</p>
                  </Col>
                </Row>
              </div>
            </Col>
            <Col md={4} className="text-end">
              <div className="btn-group-vertical d-grid gap-2">
                {/* Pipeline status selector will be added later */}
                <Button variant="success" size="sm" onClick={exportToPDF}>
                  📄 Export PDF
                </Button>
                <Button variant="outline-secondary" size="sm" onClick={() => navigate(-1)}>
                  ← Back
                </Button>
              </div>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* Tabs Section */}
      <Tabs defaultActiveKey="overview" className="mb-4" fill>
        <Tab eventKey="overview" title="📊 Overview">
          <Row>
            <Col md={6} className="mb-4">
              <Card className="h-100">
                <Card.Header>
                  <Card.Title className="h6 mb-0">⚽ Scout Reports ({profile.scout_reports.length})</Card.Title>
                </Card.Header>
                <Card.Body style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {profile.scout_reports.length === 0 ? (
                    <p className="text-muted">No scout reports yet.</p>
                  ) : (
                    profile.scout_reports.map((report) => (
                      <div key={report.report_id} className="border-bottom pb-3 mb-3">
                        <div className="d-flex justify-content-between align-items-start">
                          <div>
                            <Badge bg="dark" className="me-2">{report.report_type}</Badge>
                            {report.scouting_type && <Badge bg="secondary">{report.scouting_type}</Badge>}
                          </div>
                          <small className="text-muted">{new Date(report.created_at).toLocaleDateString()}</small>
                        </div>
                        <p className="mb-2 mt-2">{report.summary}</p>
                        <div className="d-flex justify-content-between align-items-center">
                          <small className="text-muted">by {report.scout_name}</small>
                          <div>
                            {report.performance_score && (
                              <Badge bg={getPerformanceScoreVariant(report.performance_score)} className="me-2">Performance: {report.performance_score}</Badge>
                            )}
                            {report.attribute_score && (
                              <Badge bg={getAttributeScoreVariant(report.attribute_score)}>Attributes: {report.attribute_score}</Badge>
                            )}
                          </div>
                        </div>
                        <Button 
                          size="sm" 
                          variant="outline-dark" 
                          className="mt-2 rounded-pill"
                          onClick={() => handleOpenReportModal(report.report_id)}
                          disabled={loadingReportId === report.report_id}
                        >
                          {loadingReportId === report.report_id ? 
                            <Spinner animation="border" size="sm" /> : 
                            'View Full Report'
                          }
                        </Button>
                      </div>
                    ))
                  )}
                </Card.Body>
              </Card>
            </Col>
            <Col md={6} className="mb-4">
              <Card className="h-100">
                <Card.Header>
                  <Card.Title className="h6 mb-0">🕵️ Intel Reports ({profile.intel_reports.length})</Card.Title>
                </Card.Header>
                <Card.Body style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {profile.intel_reports.length === 0 ? (
                    <p className="text-muted">No intel reports yet.</p>
                  ) : (
                    profile.intel_reports.map((intel) => (
                      <div key={intel.intel_id} className="border-bottom pb-3 mb-3">
                        <div className="d-flex justify-content-between align-items-start">
                          <div>
                            <strong>{intel.contact_name}</strong>
                            <small className="text-muted d-block">{intel.contact_organisation}</small>
                          </div>
                          <small className="text-muted">{new Date(intel.created_at).toLocaleDateString()}</small>
                        </div>
                        <p className="mb-2 mt-2">{intel.conversation_notes}</p>
                        <div className="d-flex justify-content-between align-items-center">
                          <Badge bg={intel.action_required === 'discuss urgently' ? 'danger' : 
                                     intel.action_required === 'monitor' ? 'warning' : 'secondary'}>
                            {intel.action_required}
                          </Badge>
                          {intel.transfer_fee && <small><strong>Fee:</strong> {intel.transfer_fee}</small>}
                        </div>
                        <Button 
                          size="sm" 
                          variant="outline-dark" 
                          className="mt-2 rounded-pill"
                          onClick={() => handleOpenIntelModal(intel.intel_id)}
                        >
                          View Full Report
                        </Button>
                      </div>
                    ))
                  )}
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Tab>

        <Tab eventKey="scout-reports" title="⚽ Scout Reports">
          <Card>
            <Card.Header>
              <Card.Title className="h6 mb-0">All Scout Reports ({profile.scout_reports.length})</Card.Title>
            </Card.Header>
            <Card.Body>
              {profile.scout_reports.length === 0 ? (
                <Alert variant="info">No scout reports available for this player.</Alert>
              ) : (
                <Table responsive hover>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Scout</th>
                      <th>Performance</th>
                      <th>Attributes</th>
                      <th>Summary</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.scout_reports.map((report) => (
                      <tr key={report.report_id}>
                        <td>{new Date(report.created_at).toLocaleDateString()}</td>
                        <td>
                          <Badge bg="dark">{report.report_type}</Badge>
                          {report.scouting_type && (
                            <Badge bg="secondary" className="ms-1">{report.scouting_type}</Badge>
                          )}
                        </td>
                        <td>{report.scout_name}</td>
                        <td>
                          {report.performance_score ? (
                            <Badge bg={getPerformanceScoreVariant(report.performance_score)}>
                              {report.performance_score}
                            </Badge>
                          ) : '-'}
                        </td>
                        <td>
                          {report.attribute_score ? (
                            <Badge bg={getAttributeScoreVariant(report.attribute_score)}>
                              {report.attribute_score}
                            </Badge>
                          ) : '-'}
                        </td>
                        <td style={{ maxWidth: '200px' }}>{report.summary}</td>
                        <td>
                          <Button 
                            size="sm" 
                            variant="outline-dark"
                            className="rounded-pill"
                            onClick={() => handleOpenReportModal(report.report_id)}
                            disabled={loadingReportId === report.report_id}
                          >
                            {loadingReportId === report.report_id ? 
                              <Spinner animation="border" size="sm" /> : 
                              'View'
                            }
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card.Body>
          </Card>
        </Tab>

        <Tab eventKey="intel-reports" title="🕵️ Intel Reports">
          <Card>
            <Card.Header>
              <Card.Title className="h6 mb-0">All Intel Reports ({profile.intel_reports.length})</Card.Title>
            </Card.Header>
            <Card.Body>
              {profile.intel_reports.length === 0 ? (
                <Alert variant="info">No intel reports available for this player.</Alert>
              ) : (
                <Table responsive hover>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Contact</th>
                      <th>Organisation</th>
                      <th>Action Required</th>
                      <th>Transfer Fee</th>
                      <th>Notes</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.intel_reports.map((intel) => (
                      <tr key={intel.intel_id}>
                        <td>{new Date(intel.created_at).toLocaleDateString()}</td>
                        <td>{intel.contact_name}</td>
                        <td>{intel.contact_organisation}</td>
                        <td>
                          <Badge bg={intel.action_required === 'discuss urgently' ? 'danger' : 
                                     intel.action_required === 'monitor' ? 'warning' : 'secondary'}>
                            {intel.action_required}
                          </Badge>
                        </td>
                        <td>{intel.transfer_fee || '-'}</td>
                        <td style={{ maxWidth: '200px' }}>{intel.conversation_notes}</td>
                        <td>
                          <Button 
                            size="sm" 
                            variant="outline-dark"
                            className="rounded-pill"
                            onClick={() => handleOpenIntelModal(intel.intel_id)}
                          >
                            View
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card.Body>
          </Card>
        </Tab>

        <Tab eventKey="notes" title="📝 Notes">
          <Card>
            <Card.Header className="d-flex justify-content-between align-items-center">
              <Card.Title className="h6 mb-0">Player Notes ({profile.notes.length})</Card.Title>
              <Button 
                variant="danger" 
                size="sm"
                className="rounded-pill"
                onClick={() => setShowAddNoteModal(true)}
              >
                + Add Note
              </Button>
            </Card.Header>
            <Card.Body>
              {profile.notes.length === 0 ? (
                <Alert variant="info">No notes yet. Add the first note above.</Alert>
              ) : (
                profile.notes.map((note) => (
                  <div key={note.id} className="border-bottom pb-3 mb-3">
                    <div className="d-flex justify-content-between align-items-start mb-2">
                      <div>
                        <strong>{note.author}</strong>
                        {note.is_private && <Badge bg="warning" className="ms-2">Private</Badge>}
                      </div>
                      <small className="text-muted">{new Date(note.created_at).toLocaleString()}</small>
                    </div>
                    <p className="mb-0">{note.content}</p>
                  </div>
                ))
              )}
            </Card.Body>
          </Card>
        </Tab>
      </Tabs>

      {/* Add Note Modal */}
      <Modal show={showAddNoteModal} onHide={() => setShowAddNoteModal(false)}>
        <Modal.Header closeButton style={{ backgroundColor: '#000000', color: 'white' }} className="modal-header-dark">
          <Modal.Title>Add Note for {profile.player_name}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Note Content</Form.Label>
              <Form.Control
                as="textarea"
                rows={4}
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Enter your note about this player..."
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Check
                type="checkbox"
                label="Private note (only visible to you)"
                checked={isPrivateNote}
                onChange={(e) => setIsPrivateNote(e.target.checked)}
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowAddNoteModal(false)}>
            Cancel
          </Button>
          <Button 
            variant="danger" 
            className="rounded-pill"
            onClick={addNote}
            disabled={addingNote || !newNote.trim()}
          >
            {addingNote ? <Spinner animation="border" size="sm" /> : 'Add Note'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Report Modal */}
      <PlayerReportModal 
        show={showReportModal} 
        onHide={() => setShowReportModal(false)} 
        report={selectedReport} 
      />
      
      {/* Intel Modal */}
      <IntelReportModal 
        show={showIntelModal} 
        onHide={() => setShowIntelModal(false)} 
        intelId={selectedIntelId}
      />
      
      <style>{`
        .badge.bg-gold {
          background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%) !important;
          color: #000 !important;
          font-weight: 600;
        }
        .badge.bg-silver {
          background: linear-gradient(135deg, #c0c0c0 0%, #e8e8e8 100%) !important;
          color: #000 !important;
          font-weight: 600;
        }
      `}</style>
    </Container>
  );
};

export default PlayerProfilePage;