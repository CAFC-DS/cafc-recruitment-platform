import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Badge, Button, Spinner, Alert, Form } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../axiosInstance';
import { useAuth } from '../App';
import { useCurrentUser } from '../hooks/useCurrentUser';
import PlayerReportModal from '../components/PlayerReportModal';

interface ScoutReport {
  report_id: number;
  created_at: string;
  player_name: string;
  performance_score: number;
  attribute_score: number;
  report_type: string;
  scout_name: string;
  player_id: number;
  flag_category?: string;
}

interface IntelReport {
  intel_id: number;
  created_at: string;
  player_name: string;
  contact_name: string;
  action_required: string;
  player_id: number | null;
}

const HomePage: React.FC = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const [userRole, setUserRole] = useState('');
  const [recentScoutReports, setRecentScoutReports] = useState<ScoutReport[]>([]);
  const [recentFlagReports, setRecentFlagReports] = useState<ScoutReport[]>([]);
  const [recentIntelReports, setRecentIntelReports] = useState<IntelReport[]>([]);
  const [topAttributeReports, setTopAttributeReports] = useState<ScoutReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [loadingReportId, setLoadingReportId] = useState<number | null>(null);
  const [databaseMetadata, setDatabaseMetadata] = useState<any>(null);
  const [recencyFilter, setRecencyFilter] = useState('30'); // Default to 30 days

  useEffect(() => {
    if (token) {
      fetchDashboardData();
    }
  }, [token, recencyFilter]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch user info
      const userResponse = await axiosInstance.get('/users/me');
      setUserRole(userResponse.data.role || 'scout');

      // Fetch recent scout reports with recency filter
      const scoutResponse = await axiosInstance.get(`/scout_reports/all?page=1&limit=50&recency_days=${recencyFilter}`);
      const scoutReports = scoutResponse.data.reports || scoutResponse.data || [];
      
      // Role-based filtering is handled by backend - no need for client-side filtering
      const filteredScoutReports = Array.isArray(scoutReports) ? scoutReports : [];
      
      // Separate flag reports from regular scout reports
      const flagReports = filteredScoutReports
        .filter(report => 
          report.report_type?.toLowerCase() === 'flag' || 
          report.report_type?.toLowerCase() === 'flag assessment'
        )
        .slice(0, 10); // Show 10 most recent flag reports
      const regularReports = filteredScoutReports
        .filter(report => 
          report.report_type?.toLowerCase() !== 'flag' && 
          report.report_type?.toLowerCase() !== 'flag assessment'
        )
        .slice(0, 10); // Show 10 most recent regular reports
      
      setRecentScoutReports(regularReports);
      setRecentFlagReports(flagReports);

      // Fetch recent intel reports (last 5) - role-based filtering will be done on server
      const intelResponse = await axiosInstance.get('/intel_reports/all?page=1&limit=5');
      const intelReports = intelResponse.data.reports || intelResponse.data || [];
      
      // For now, intel reports don't have scout_name field, so we show all for scouts
      // TODO: Add created_by field to intel reports for proper filtering
      setRecentIntelReports(Array.isArray(intelReports) ? intelReports : []);

      // For top attribute reports, use all filtered reports (including flag reports with attribute scores)
      const topReports = filteredScoutReports.length > 0 ? 
        filteredScoutReports
          .filter(report => report.attribute_score && report.attribute_score > 0)
          .sort((a, b) => (b.attribute_score || 0) - (a.attribute_score || 0))
          .slice(0, 10) : []; // Show top 10 attribute reports
      setTopAttributeReports(topReports);

      // Fetch database metadata
      try {
        const metadataResponse = await axiosInstance.get('/database/metadata');
        setDatabaseMetadata(metadataResponse.data);
      } catch (metadataError) {
        console.error('Error fetching database metadata:', metadataError);
        // Non-critical, don't fail the whole dashboard
      }

    } catch (error: any) {
      console.error('Error fetching dashboard data:', error);
      
      // Handle authentication errors specifically
      if (error.response?.status === 401 || error.response?.status === 422) {
        setError('Authentication failed. Please log in again.');
        // Clear token and redirect will be handled by axios interceptor
      } else {
        setError('Failed to load dashboard data');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOpenReportModal = async (reportId: number) => {
    try {
      setLoadingReportId(reportId);
      const response = await axiosInstance.get(`/scout_reports/${reportId}`);
      setSelectedReport(response.data);
      setShowReportModal(true);
    } catch (error) {
      console.error('Error fetching report details:', error);
    } finally {
      setLoadingReportId(null);
    }
  };

  const handleCloseReportModal = () => {
    setShowReportModal(false);
    setSelectedReport(null);
  };

  // Performance score colors matching website-wide system
  const getPerformanceScoreVariant = (score: number) => {
    if (score === 10) return 'gold';
    if (score === 9) return 'silver';  
    if (score >= 7) return 'success'; // 7-8 green
    if (score >= 3) return 'warning'; // 3-6 amber
    return 'danger'; // 1-3 red
  };

  // Red to green color scale for attribute scores
  const getAttributeScoreVariant = (score: number) => {
    if (score === 100) return 'gold';
    if (score >= 90) return 'silver';
    if (score >= 70) return 'success';
    if (score >= 40) return 'warning';
    return 'danger';
  };


  if (loading) {
    return (
      <Container className="mt-4 text-center">
        <Spinner animation="border" />
        <p className="mt-2">Loading dashboard...</p>
      </Container>
    );
  }

  if (error) {
    return (
      <Container className="mt-4">
        <Alert variant="danger">{error}</Alert>
      </Container>
    );
  }

  return (
    <>
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
        .flag-positive {
          background-color: #198754 !important;
          color: white !important;
        }
        .flag-neutral {
          background-color: #6c757d !important;
          color: white !important;
        }
        .flag-negative {
          background-color: #ffc107 !important;
          color: #212529 !important;
        }
        .flag-default {
          background-color: #6c757d !important;
          color: white !important;
        }
      `}</style>
      <Container className="mt-4">
        {/* Welcome Header */}
        <div className="mb-4">
          <h1 className="text-dark">
            Welcome, {user?.firstname} {user?.lastname}
          </h1>
          <Row>
            <Col md={8}>
              <p className="text-muted mb-2">Charlton Athletic Recruitment Platform Dashboard</p>
              <div className="d-flex align-items-center gap-2">
                <small className="text-muted">Show reports from:</small>
                <Form.Select 
                  size="sm" 
                  value={recencyFilter} 
                  onChange={e => setRecencyFilter(e.target.value)}
                  style={{ width: 'auto' }}
                >
                  <option value="7">Last 7 Days</option>
                  <option value="30">Last 30 Days</option>
                  <option value="90">Last 90 Days</option>
                  <option value="all">All Time</option>
                </Form.Select>
              </div>
            </Col>
            <Col md={4}>
              {/* Database Status Info - positioned on the right */}
              {databaseMetadata && !databaseMetadata.error && (
                <div className="d-flex flex-column gap-1 mt-2">
                  {databaseMetadata.players_table && (
                    <small className="text-muted d-flex align-items-center justify-content-end">
                      👥 Players: {databaseMetadata.players_table.count?.toLocaleString() || '0'} records
                      {databaseMetadata.players_table.last_updated && (
                        <span className="ms-1">
                          (Updated: {new Date(databaseMetadata.players_table.last_updated).toLocaleDateString()})
                        </span>
                      )}
                    </small>
                  )}
                  {databaseMetadata.matches_table && (
                    <small className="text-muted d-flex align-items-center justify-content-end">
                      ⚽ Matches: {databaseMetadata.matches_table.count?.toLocaleString() || '0'} records
                      {databaseMetadata.matches_table.last_updated && (
                        <span className="ms-1">
                          (Updated: {new Date(databaseMetadata.matches_table.last_updated).toLocaleDateString()})
                        </span>
                      )}
                    </small>
                  )}
                </div>
              )}
            </Col>
          </Row>
        </div>

      {/* 2x2 Grid Dashboard */}
      <Row className="g-4">
        {/* Top Left: Recent Scout Reports */}
        <Col md={6}>
          <Card className="h-100">
            <Card.Header className="bg-light border-bottom">
              <div className="d-flex justify-content-between align-items-center">
                <h5 className="mb-0">⚽ Recent Scout Reports ({recentScoutReports.length})</h5>
                <Button 
                  variant="outline-dark" 
                  size="sm"
                  onClick={() => navigate('/scouting')}
                >
                  View All
                </Button>
              </div>
            </Card.Header>
            <Card.Body style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {recentScoutReports.length === 0 ? (
                <p className="text-muted text-center">No recent scout reports</p>
              ) : (
                recentScoutReports.map((report) => (
                  <div key={report.report_id} className="border-bottom pb-2 mb-2">
                    <div className="d-flex justify-content-between align-items-start">
                      <div className="d-flex align-items-start">
                        <Button 
                          variant="outline-dark" 
                          size="sm" 
                          onClick={() => handleOpenReportModal(report.report_id)} 
                          disabled={loadingReportId === report.report_id}
                          title="View Report"
                          className="me-2 mt-1"
                        >
                          {loadingReportId === report.report_id ? <Spinner as="span" animation="border" size="sm" /> : '👁️'}
                        </Button>
                        <div>
                          <Button 
                            variant="link" 
                            className="p-0 text-decoration-none text-start fw-bold"
                            style={{ color: 'inherit' }}
                            onClick={() => navigate(`/player/${report.player_id}`)}
                          >
                            {report.player_name}
                          </Button>
                          <div className="small text-muted">by {report.scout_name}</div>
                        </div>
                      </div>
                      <div className="text-end">
                        <div className="mb-1">
                          <Badge bg={getPerformanceScoreVariant(report.performance_score)} className="me-1">
                            {report.performance_score}
                          </Badge>
                          <Badge bg={getAttributeScoreVariant(report.attribute_score)}>
                            {report.attribute_score}
                          </Badge>
                        </div>
                        <div className="small text-muted">
                          {new Date(report.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </Card.Body>
          </Card>
        </Col>

        {/* Top Right: Recent Intel Reports */}
        <Col md={6}>
          <Card className="h-100">
            <Card.Header className="bg-light border-bottom">
              <div className="d-flex justify-content-between align-items-center">
                <h5 className="mb-0">🕵️ Recent Intel Reports ({recentIntelReports.length})</h5>
                <Button 
                  variant="outline-dark" 
                  size="sm"
                  onClick={() => navigate('/intel')}
                >
                  View All
                </Button>
              </div>
            </Card.Header>
            <Card.Body style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {recentIntelReports.length === 0 ? (
                <div className="text-center">
                  <p className="text-muted">No intel reports yet</p>
                  <Button 
                    variant="outline-secondary" 
                    size="sm"
                    onClick={() => navigate('/intel')}
                  >
                    Create First Intel Report
                  </Button>
                </div>
              ) : (
                recentIntelReports.map((report) => (
                  <div key={report.intel_id} className="border-bottom pb-2 mb-2">
                    <div className="d-flex justify-content-between align-items-start">
                      <div>
                        {report.player_id ? (
                          <Button 
                            variant="link" 
                            className="p-0 text-decoration-none text-start fw-bold"
                            style={{ color: 'inherit' }}
                            onClick={() => navigate(`/player/${report.player_id}`)}
                          >
                            {report.player_name}
                          </Button>
                        ) : (
                          <span className="fw-bold">{report.player_name}</span>
                        )}
                        <div className="small text-muted">by {report.contact_name}</div>
                      </div>
                      <div className="text-end">
                        <Badge bg={
                          report.action_required === 'discuss urgently' ? 'danger' : 
                          report.action_required === 'monitor' ? 'warning' : 'secondary'
                        }>
                          {report.action_required}
                        </Badge>
                        <div className="small text-muted">
                          {new Date(report.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </Card.Body>
          </Card>
        </Col>

        {/* Bottom Left: Top Attribute Scores */}
        <Col md={6}>
          <Card className="h-100">
            <Card.Header className="bg-light border-bottom">
              <div className="d-flex justify-content-between align-items-center">
                <h5 className="mb-0">🏆 Highest Attribute Scores ({topAttributeReports.length})</h5>
                <Button 
                  variant="outline-dark" 
                  size="sm"
                  onClick={() => navigate('/scouting')}
                >
                  View All
                </Button>
              </div>
            </Card.Header>
            <Card.Body style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {topAttributeReports.length === 0 ? (
                <p className="text-muted text-center">No reports with attribute scores</p>
              ) : (
                topAttributeReports.map((report, index) => (
                  <div key={report.report_id} className="border-bottom pb-2 mb-2">
                    <div className="d-flex justify-content-between align-items-start">
                      <div className="d-flex align-items-center">
                        <span className="badge bg-secondary me-2">#{index + 1}</span>
                        <Button 
                          variant="outline-dark" 
                          size="sm" 
                          onClick={() => handleOpenReportModal(report.report_id)} 
                          disabled={loadingReportId === report.report_id}
                          title="View Report"
                          className="me-2"
                        >
                          {loadingReportId === report.report_id ? <Spinner as="span" animation="border" size="sm" /> : '👁️'}
                        </Button>
                        <div>
                          <Button 
                            variant="link" 
                            className="p-0 text-decoration-none text-start fw-bold"
                            style={{ color: 'inherit' }}
                            onClick={() => navigate(`/player/${report.player_id}`)}
                          >
                            {report.player_name}
                          </Button>
                          <div className="small text-muted">by {report.scout_name}</div>
                        </div>
                      </div>
                      <div className="text-end">
                        <div className="mb-1">
                          <Badge bg={getAttributeScoreVariant(report.attribute_score)} className="fs-6">
                            {report.attribute_score}
                          </Badge>
                        </div>
                        <div className="small text-muted">
                          {new Date(report.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </Card.Body>
          </Card>
        </Col>

        {/* Bottom Right: Recent Flag Reports */}
        <Col md={6}>
          <Card className="h-100">
            <Card.Header className="bg-light border-bottom">
              <div className="d-flex justify-content-between align-items-center">
                <h5 className="mb-0">🚩 Recent Flag Reports ({recentFlagReports.length})</h5>
                <Button 
                  variant="outline-dark" 
                  size="sm"
                  onClick={() => navigate('/scouting')}
                >
                  View All
                </Button>
              </div>
            </Card.Header>
            <Card.Body style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {recentFlagReports.length === 0 ? (
                <p className="text-muted text-center">No recent flag reports</p>
              ) : (
                recentFlagReports.map((report) => (
                  <div key={report.report_id} className="border-bottom pb-2 mb-2">
                    <div className="d-flex justify-content-between align-items-start">
                      <div className="d-flex align-items-start">
                        <Button 
                          variant="outline-dark" 
                          size="sm" 
                          onClick={() => handleOpenReportModal(report.report_id)} 
                          disabled={loadingReportId === report.report_id}
                          title="View Report"
                          className="me-2 mt-1"
                        >
                          {loadingReportId === report.report_id ? <Spinner as="span" animation="border" size="sm" /> : '👁️'}
                        </Button>
                        <div>
                          <Button 
                            variant="link" 
                            className="p-0 text-decoration-none text-start fw-bold"
                            style={{ color: 'inherit' }}
                            onClick={() => navigate(`/player/${report.player_id}`)}
                          >
                            {report.player_name}
                          </Button>
                          <div className="small text-muted">by {report.scout_name}</div>
                        </div>
                      </div>
                      <div className="text-end">
                        <div className="mb-1">
                          <Badge className={`flag-${(report.flag_category?.toLowerCase() || 'default')}`}>
                            🚩 {report.flag_category || 'Not specified'}
                          </Badge>
                        </div>
                        <div className="small text-muted">
                          {new Date(report.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
      </Container>
      
      {/* Player Report Modal */}
      <PlayerReportModal 
        show={showReportModal}
        onHide={handleCloseReportModal}
        report={selectedReport}
      />
    </>
  );
};

export default HomePage;