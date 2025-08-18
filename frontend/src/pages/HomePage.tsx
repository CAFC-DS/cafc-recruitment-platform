import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Badge, Button, Spinner, Alert } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../axiosInstance';
import { useAuth } from '../App';
import { useCurrentUser } from '../hooks/useCurrentUser';

interface ScoutReport {
  report_id: number;
  created_at: string;
  player_name: string;
  performance_score: number;
  attribute_score: number;
  report_type: string;
  scout_name: string;
  player_id: number;
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
  const [recentIntelReports, setRecentIntelReports] = useState<IntelReport[]>([]);
  const [topAttributeReports, setTopAttributeReports] = useState<ScoutReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (token) {
      fetchDashboardData();
    }
  }, [token]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch user info
      const userResponse = await axiosInstance.get('/users/me');
      setUserRole(userResponse.data.role || 'scout');

      // Fetch recent scout reports (last 5) - role-based filtering will be done on server
      const scoutResponse = await axiosInstance.get('/scout_reports/all?page=1&limit=5');
      const scoutReports = scoutResponse.data.reports || scoutResponse.data || [];
      
      // Filter scout reports for scout role (client-side backup)
      const filteredScoutReports = userResponse.data.role === 'scout' ? 
        (Array.isArray(scoutReports) ? scoutReports.filter(report => report.scout_name === userResponse.data.username) : []) :
        (Array.isArray(scoutReports) ? scoutReports : []);
      setRecentScoutReports(filteredScoutReports);

      // Fetch recent intel reports (last 5) - role-based filtering will be done on server
      const intelResponse = await axiosInstance.get('/intel_reports/all?page=1&limit=5');
      const intelReports = intelResponse.data.reports || intelResponse.data || [];
      
      // For now, intel reports don't have scout_name field, so we show all for scouts
      // TODO: Add created_by field to intel reports for proper filtering
      setRecentIntelReports(Array.isArray(intelReports) ? intelReports : []);

      // For top attribute reports, use filtered scout reports
      const topReports = filteredScoutReports.length > 0 ? 
        filteredScoutReports
          .filter(report => report.attribute_score && report.attribute_score > 0)
          .sort((a, b) => (b.attribute_score || 0) - (a.attribute_score || 0))
          .slice(0, 5) : [];
      setTopAttributeReports(topReports);

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
      `}</style>
      <Container className="mt-4">
        {/* Welcome Header */}
        <div className="mb-4">
          <h1 className="text-dark">
            Welcome, {user?.firstname && user?.lastname ? `${user.firstname} ${user.lastname}` : user?.username || 'User'}
          </h1>
          <p className="text-muted">Charlton Athletic Recruitment Platform Dashboard</p>
        </div>

      {/* 2x2 Grid Dashboard */}
      <Row className="g-4">
        {/* Top Left: Recent Scout Reports */}
        <Col md={6}>
          <Card className="h-100">
            <Card.Header className="bg-light border-bottom">
              <div className="d-flex justify-content-between align-items-center">
                <h5 className="mb-0">⚽ Recent Scout Reports</h5>
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
                      <div className="text-end">
                        <Badge bg={getPerformanceScoreVariant(report.performance_score)} className="me-1">
                          {report.performance_score}
                        </Badge>
                        <Badge bg={getAttributeScoreVariant(report.attribute_score)}>
                          {report.attribute_score}
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

        {/* Top Right: Recent Intel Reports */}
        <Col md={6}>
          <Card className="h-100">
            <Card.Header className="bg-light border-bottom">
              <div className="d-flex justify-content-between align-items-center">
                <h5 className="mb-0">🕵️ Recent Intel Reports</h5>
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
                <h5 className="mb-0">🏆 Highest Attribute Scores</h5>
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
                        <Badge bg={getAttributeScoreVariant(report.attribute_score)} className="fs-6">
                          {report.attribute_score}
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

        {/* Bottom Right: Empty (as requested) */}
        <Col md={6}>
          <Card className="h-100">
            <Card.Body className="d-flex align-items-center justify-content-center text-muted">
              <div className="text-center">
                <h5>📋</h5>
                <p>Available for future features</p>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
      </Container>
    </>
  );
};

export default HomePage;