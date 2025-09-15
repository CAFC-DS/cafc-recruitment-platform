import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Container, Form, Button, Row, Col, ListGroup, Card, Spinner, Table, Badge, Collapse, Alert, Modal } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../axiosInstance';
import PlayerReportModal from '../components/PlayerReportModal';
import AddPlayerModal from '../components/AddPlayerModal';
import AddFixtureModal from '../components/AddFixtureModal';
import ScoutingAssessmentModal from '../components/ScoutingAssessmentModal';
import { useAuth } from '../App';
import { useViewMode } from '../contexts/ViewModeContext';
import { normalizeText, containsAccentInsensitive } from '../utils/textNormalization';

interface ScoutReport {
  report_id: number;
  created_at: string;
  player_name: string;
  age: number | null;
  fixture_date: string;
  fixture_details: string;
  home_team: string | null;
  away_team: string | null;
  position_played: string;
  performance_score: number;
  attribute_score: number;
  scout_name: string;
  report_type: string;
  scouting_type: string;
  player_id: number;
  purpose: string | null;
}

const ScoutingPage: React.FC = () => {
  const { token } = useAuth();
  const { viewMode, setViewMode, initializeUserViewMode } = useViewMode();
  const navigate = useNavigate();
  const [playerSearch, setPlayerSearch] = useState('');
  const [players, setPlayers] = useState<any[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [showAssessmentModal, setShowAssessmentModal] = useState(false);
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [showAddFixtureModal, setShowAddFixtureModal] = useState(false);
  const [scoutReports, setScoutReports] = useState<ScoutReport[]>([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [loadingReportId, setLoadingReportId] = useState<number | null>(null);

  // New states from IntelPage
  const [currentPage, setCurrentPage] = useState(1);
  const [totalReports, setTotalReports] = useState(0);
  const [itemsPerPage] = useState(20);
  const [recencyFilter, setRecencyFilter] = useState<string>('7');
  const [loading, setLoading] = useState(false);
  const [errorReports, setErrorReports] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [playerSearchError, setPlayerSearchError] = useState('');
  const [playerSearchLoading, setPlayerSearchLoading] = useState(false);
  
  // Add debouncing and caching for player search
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchCacheRef = useRef<Record<string, any[]>>({});
  const [showDropdown, setShowDropdown] = useState(false);
  
  // Advanced filters
  const [performanceFilter, setPerformanceFilter] = useState('');
  const [attributeFilter, setAttributeFilter] = useState('');
  const [scoutNameFilter, setScoutNameFilter] = useState('');
  const [playerNameFilter, setPlayerNameFilter] = useState('');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [reportTypeFilter, setReportTypeFilter] = useState('');
  const [scoutingTypeFilter, setScoutingTypeFilter] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  
  // Role-based permissions
  const [userRole, setUserRole] = useState('');
  const [currentUsername, setCurrentUsername] = useState('');
  
  // Edit and delete functionality
  const [editMode, setEditMode] = useState(false);
  const [editReportId, setEditReportId] = useState<number | null>(null);
  const [editReportData, setEditReportData] = useState<any>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteReportId, setDeleteReportId] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchScoutReports = useCallback(async (recency: string) => {
    setLoading(true);
    setErrorReports(null);
    try {
      const params: any = {
        page: 1,
        limit: 1000, // Load all reports for client-side filtering and pagination
      };
      if (recency !== 'all') {
        params.recency_days = parseInt(recency);
      }
      const response = await axiosInstance.get('/scout_reports/all', { params });
      let reports = response.data.reports || [];
      
      // Apply role-based filtering for scout users
      if (userRole === 'scout' && currentUsername) {
        reports = reports.filter((report: ScoutReport) => report.scout_name === currentUsername);
      }
      
      setScoutReports(reports);
      setTotalReports(reports.length); // Use actual loaded reports count
    } catch (error) {
      console.error('Error fetching scout reports:', error);
      setErrorReports('Failed to load scout reports. Please try again.');
      setScoutReports([]);
      setTotalReports(0);
    } finally {
      setLoading(false);
    }
  }, [userRole, currentUsername]);

  // Fetch user role and username
  const fetchUserInfo = useCallback(async () => {
    try {
      const response = await axiosInstance.get('/users/me');
      setUserRole(response.data.role || 'scout');
      setCurrentUsername(response.data.username || '');
      // Initialize user's view mode preference
      if (response.data.id || response.data.username) {
        initializeUserViewMode(response.data.id?.toString() || response.data.username);
      }
    } catch (error) {
      console.error('Error fetching user info:', error);
    }
  }, [initializeUserViewMode]);

  const handleEditReport = async (reportId: number) => {
    try {
      setLoadingReportId(reportId);
      const response = await axiosInstance.get(`/scout_reports/details/${reportId}`);
      setEditReportData(response.data);
      setEditReportId(reportId);
      setSelectedPlayer({ player_id: response.data.player_id, player_name: response.data.player_name });
      setEditMode(true);
      setShowAssessmentModal(true);
    } catch (error) {
      console.error('Error fetching report for edit:', error);
    } finally {
      setLoadingReportId(null);
    }
  };

  const handleDeleteReport = (reportId: number) => {
    setDeleteReportId(reportId);
    setShowDeleteModal(true);
  };

  const confirmDeleteReport = async () => {
    if (!deleteReportId) return;
    
    try {
      setDeleteLoading(true);
      await axiosInstance.delete(`/scout_reports/${deleteReportId}`);
      setShowDeleteModal(false);
      setDeleteReportId(null);
      fetchScoutReports(recencyFilter);
    } catch (error) {
      console.error('Error deleting report:', error);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleAssessmentModalHide = () => {
    setShowAssessmentModal(false);
    setEditMode(false);
    setEditReportId(null);
    setEditReportData(null);
  };

  useEffect(() => {
    if (token) {
      fetchUserInfo().then(() => {
        fetchScoutReports(recencyFilter);
      });
    }
  }, [token, recencyFilter, fetchScoutReports, fetchUserInfo]);

  const performPlayerSearch = useCallback(async (query: string) => {
    const trimmedQuery = query.trim();
    const normalizedQuery = normalizeText(trimmedQuery);
    
    // Check cache first using normalized query
    if (searchCacheRef.current[normalizedQuery]) {
      setPlayers(searchCacheRef.current[normalizedQuery]);
      setPlayerSearchError('');
      setPlayerSearchLoading(false);
      setShowDropdown(searchCacheRef.current[normalizedQuery].length > 0);
      return;
    }
    
    try {
      setPlayerSearchLoading(true);
      // Backend now handles comprehensive accent-insensitive search
      const response = await axiosInstance.get(`/players/search?query=${encodeURIComponent(trimmedQuery)}`);
      let results = response.data || [];
      
      // Backend already handles accent-insensitive search and sorting
      // No need for additional client-side filtering
      
      // Cache the results using normalized query
      searchCacheRef.current[normalizedQuery] = results;
      
      setPlayers(results);
      setShowDropdown(results.length > 0);
      
      if (results.length === 0) {
        setPlayerSearchError('No players found.');
      } else {
        setPlayerSearchError('');
      }
    } catch (error) {
      console.error('Error searching players:', error);
      setPlayers([]);
      setShowDropdown(false);
      setPlayerSearchError('Error searching for players.');
    } finally {
      setPlayerSearchLoading(false);
    }
  }, []);

  const handlePlayerSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setPlayerSearch(query);
    
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // Clear error immediately when user starts typing
    setPlayerSearchError('');
    
    if (query.length <= 2) {
      setPlayers([]);
      setShowDropdown(false);
      setPlayerSearchLoading(false);
      return;
    }
    
    // Set loading immediately for better UX
    setPlayerSearchLoading(true);
    
    // Debounce the actual search
    searchTimeoutRef.current = setTimeout(() => {
      performPlayerSearch(query);
    }, 300); // 300ms delay
  };

  const handlePlayerSelect = (player: any) => {
    setSelectedPlayer(player);
    setPlayerSearch(`${player.player_name} (${player.squad_name})`);
    setPlayers([]);
    setShowDropdown(false);
    setPlayerSearchError('');
  };
  
  // Close dropdown when clicking outside
  const handleInputBlur = () => {
    // Small delay to allow click on dropdown items
    setTimeout(() => {
      setShowDropdown(false);
    }, 200);
  };
  
  const handleInputFocus = () => {
    if (players.length > 0) {
      setShowDropdown(true);
    }
  };
  
  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const handleShowAssessmentModal = () => {
    if (selectedPlayer) {
      setShowAssessmentModal(true);
    } else {
      alert('Please select a player first.');
    }
  };


  const handleOpenReportModal = async (report_id: number) => {
    setLoadingReportId(report_id);
    try {
      const response = await axiosInstance.get(`/scout_reports/${report_id}`);
      setSelectedReport(response.data);
      setShowReportModal(true);
    } catch (error) {
      console.error('Error fetching single scout report:', error);
    } finally {
      setLoadingReportId(null);
    }
  };

  const getPerformanceScoreVariant = (score: number) => {
    if (score === 10) return 'gold';
    if (score === 9) return 'silver';
    if (score >= 7) return 'success'; // 7-8 green
    if (score >= 3) return 'warning'; // 3-6 amber
    return 'danger'; // 1-3 red
  };

  const getAttributeScoreVariant = (score: number) => {
    if (score >= 64) return 'success'; // 80 * 0.8
    if (score >= 40) return 'warning'; // 80 * 0.5
    if (score >= 24) return 'danger'; // 80 * 0.3
    return 'dark'; // For scores 0-23
  };

  const getReportTypeBadge = (reportType: string, scoutingType: string, flagType?: string) => {
    switch (reportType.toLowerCase()) {
      case 'flag':
      case 'flag assessment':
        // Create a unique class for this flag type
        const flagClass = `flag-${flagType?.toLowerCase() || 'default'}`;
        return <Badge className={flagClass} style={{ fontWeight: '500' }}>🚩 Flag</Badge>;
      case 'clips':
        return <Badge bg="secondary">📹 Clips</Badge>;
      case 'player assessment':
      case 'player':
        return <Badge bg="dark">⚽ Player Assessment</Badge>;
      default:
        return <Badge bg="dark">{reportType}</Badge>;
    }
  };

  const getScoutingTypeBadge = (scoutingType: string) => {
    switch (scoutingType.toLowerCase()) {
      case 'live':
        return <Badge bg="light" text="dark" className="border">📡 Live</Badge>;
      case 'video':
        return <Badge bg="secondary">🎥 Video</Badge>;
      default:
        return <Badge bg="secondary">{scoutingType}</Badge>;
    }
  };

  const getPurposeBadge = (purpose: string | null) => {
    if (!purpose) return null;
    
    switch (purpose.toLowerCase()) {
      case 'player report':
        return <Badge bg="primary">📋 Player Report</Badge>;
      case 'loan report':
        return <Badge bg="info">🤝 Loan Report</Badge>;
      case 'player assessment':
        return <Badge bg="primary">📋 Player Report</Badge>;
      case 'loan assessment':
        return <Badge bg="info">🤝 Loan Report</Badge>;
      default:
        return <Badge bg="secondary">{purpose}</Badge>;
    }
  };

  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  // Filter reports based on advanced filters
  const getFilteredReports = () => {
    let filtered = scoutReports;

    // Performance score filter
    if (performanceFilter) {
      const [min, max] = performanceFilter.split('-').map(Number);
      if (max) {
        filtered = filtered.filter(report => report.performance_score >= min && report.performance_score <= max);
      } else {
        // Single value filter (like "9" or "10")
        const score = parseInt(performanceFilter);
        filtered = filtered.filter(report => report.performance_score === score);
      }
    }

    // Attribute score filter
    if (attributeFilter) {
      const [min, max] = attributeFilter.split('-').map(Number);
      if (max) {
        filtered = filtered.filter(report => report.attribute_score >= min && report.attribute_score <= max);
      } else {
        // Single value filter
        const score = parseInt(attributeFilter);
        filtered = filtered.filter(report => report.attribute_score === score);
      }
    }

    // Scout name filter
    if (scoutNameFilter) {
      filtered = filtered.filter(report => 
        report.scout_name.toLowerCase().includes(scoutNameFilter.toLowerCase())
      );
    }

    // Player name filter
    if (playerNameFilter) {
      filtered = filtered.filter(report => 
        containsAccentInsensitive(report.player_name, playerNameFilter)
      );
    }

    // Report type filter
    if (reportTypeFilter) {
      filtered = filtered.filter(report => 
        report.report_type.toLowerCase().includes(reportTypeFilter.toLowerCase())
      );
    }

    // Scouting type filter
    if (scoutingTypeFilter) {
      filtered = filtered.filter(report => 
        report.scouting_type.toLowerCase() === scoutingTypeFilter.toLowerCase()
      );
    }

    // Position filter
    if (positionFilter) {
      filtered = filtered.filter(report => 
        report.position_played && report.position_played.toLowerCase().includes(positionFilter.toLowerCase())
      );
    }

    // Date range filter
    if (dateFromFilter || dateToFilter) {
      filtered = filtered.filter(report => {
        const reportDate = new Date(report.created_at);
        const fromDate = dateFromFilter ? new Date(dateFromFilter) : new Date('1900-01-01');
        const toDate = dateToFilter ? new Date(dateToFilter) : new Date('2100-12-31');
        return reportDate >= fromDate && reportDate <= toDate;
      });
    }

    return filtered;
  };

  const filteredReports = getFilteredReports();
  
  // Client-side pagination for filtered results
  const getPaginatedReports = () => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredReports.slice(startIndex, endIndex);
  };
  
  const paginatedReports = getPaginatedReports();
  const filteredTotalPages = Math.ceil(filteredReports.length / itemsPerPage);
  
  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [performanceFilter, attributeFilter, scoutNameFilter, playerNameFilter, dateFromFilter, dateToFilter, reportTypeFilter, scoutingTypeFilter, positionFilter]);

  return (
    <Container className="mt-4">
      <Card className="mb-4">
        <Card.Body>
          <Card.Title>Player Search</Card.Title>
          <Form.Group as={Col} controlId="playerName">
            <div className="position-relative">
              <Form.Control
                type="text"
                placeholder="Enter player name"
                value={playerSearch}
                onChange={handlePlayerSearchChange}
                onBlur={handleInputBlur}
                onFocus={handleInputFocus}
              />
              {playerSearchLoading && (
                <div className="position-absolute top-50 end-0 translate-middle-y me-3" style={{ zIndex: 10 }}>
                  <Spinner animation="border" size="sm" />
                </div>
              )}
            </div>
            {showDropdown && players.length > 0 && (
              <ListGroup className="mt-2" style={{ position: 'absolute', zIndex: 1000, width: 'calc(100% - 30px)', maxHeight: '200px', overflowY: 'auto' }}>
                {players.map((player, index) => (
                  <ListGroup.Item 
                    key={`${player.player_id || player.id || index}-${player.player_name}`} 
                    action 
                    onClick={() => handlePlayerSelect(player)}
                    className="d-flex justify-content-between align-items-center"
                  >
                    <span>{player.player_name}</span>
                    <small className="text-muted">({player.squad_name})</small>
                  </ListGroup.Item>
                ))}
              </ListGroup>
            )}
            {playerSearchError && (
              <div className="mt-2">
                <small className="text-danger d-block">
                  ⚠️ {playerSearchError}
                </small>
              </div>
            )}
          </Form.Group>
          <Button className="mt-2" variant="danger" onClick={handleShowAssessmentModal} disabled={!selectedPlayer}>
            Add Assessment
          </Button>
          <Button className="mt-2 ms-2" variant="outline-secondary" onClick={() => setShowAddPlayerModal(true)}>
            Add Player
          </Button>
          <Button className="mt-2 ms-2" variant="outline-secondary" onClick={() => setShowAddFixtureModal(true)}>
            Add Fixture
          </Button>
        </Card.Body>
      </Card>

      <AddPlayerModal show={showAddPlayerModal} onHide={() => setShowAddPlayerModal(false)} />
      <AddFixtureModal show={showAddFixtureModal} onHide={() => setShowAddFixtureModal(false)} />
      <ScoutingAssessmentModal
        show={showAssessmentModal}
        onHide={handleAssessmentModalHide}
        selectedPlayer={selectedPlayer}
        onAssessmentSubmitSuccess={() => fetchScoutReports(recencyFilter)}
        editMode={editMode}
        reportId={editReportId}
        existingReportData={editReportData}
      />

      {/* Delete Confirmation Modal */}
      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)}>
        <Modal.Header closeButton style={{ backgroundColor: '#000000', color: 'white' }}>
          <Modal.Title>Confirm Delete</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to delete this scout report? This action cannot be undone.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmDeleteReport} disabled={deleteLoading}>
            {deleteLoading ? <Spinner animation="border" size="sm" /> : 'Delete'}
          </Button>
        </Modal.Footer>
      </Modal>

      <div className="d-flex justify-content-between align-items-center mt-4 mb-3">
        <h3>Scout Reports</h3>
        <div className="d-flex align-items-center gap-3">
          <div className="btn-group">
            <Button variant={viewMode === 'cards' ? 'primary' : 'outline-primary'} size="sm" onClick={() => setViewMode('cards')}>
              Cards
            </Button>
            <Button variant={viewMode === 'table' ? 'primary' : 'outline-primary'} size="sm" onClick={() => setViewMode('table')}>
              Table
            </Button>
          </div>
        </div>
      </div>

      {/* Pagination and Filters Row */}
      <Row className="mb-3 align-items-center">
        <Col md={4}>
          {filteredTotalPages > 1 && (
            <div className="d-flex align-items-center">
              <Button 
                variant="outline-secondary" 
                size="sm" 
                onClick={() => handlePageChange(currentPage - 1)} 
                disabled={currentPage === 1 || loading}
                className="me-2"
              >
                ‹
              </Button>
              <small className="text-muted mx-2">
                Page {currentPage} of {filteredTotalPages}
              </small>
              <Button 
                variant="outline-secondary" 
                size="sm" 
                onClick={() => handlePageChange(currentPage + 1)} 
                disabled={currentPage >= filteredTotalPages || loading}
              >
                ›
              </Button>
            </div>
          )}
        </Col>
        <Col md={4} className="text-center">
          <Form.Select 
            size="sm" 
            value={recencyFilter} 
            onChange={e => { setRecencyFilter(e.target.value); setCurrentPage(1); }}
            style={{ maxWidth: '150px', display: 'inline-block' }}
          >
            <option value="all">All Time</option>
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
          </Form.Select>
        </Col>
        <Col md={4} className="text-end">
          <small className="text-muted">
            Showing {Math.min(paginatedReports.length, itemsPerPage)} of {filteredReports.length} filtered results
            {filteredReports.length !== totalReports && <span> ({totalReports} total)</span>}
          </small>
        </Col>
      </Row>

      {/* Advanced Filters */}
      <Card className="mb-3">
        <Card.Header style={{ backgroundColor: '#000000', color: 'white' }}>
          <div className="d-flex justify-content-between align-items-center">
            <h6 className="mb-0 text-white">🔍 Advanced Filters</h6>
            <Button 
              variant="outline-secondary" 
              size="sm" 
              onClick={() => setShowFilters(!showFilters)}
              style={{ color: 'white', borderColor: 'white' }}
            >
              {showFilters ? '▲ Hide Filters' : '▼ Show Filters'}
            </Button>
          </div>
        </Card.Header>
        <Collapse in={showFilters}>
          <Card.Body>
            <Row>
              <Col md={3}>
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-bold">Performance Score</Form.Label>
                  <Form.Select size="sm" value={performanceFilter} onChange={(e) => setPerformanceFilter(e.target.value)}>
                    <option value="">All Scores</option>
                    <option value="1-3">1-3 (Poor)</option>
                    <option value="4-6">4-6 (Average)</option>
                    <option value="7-8">7-8 (Good)</option>
                    <option value="9">9 (Excellent)</option>
                    <option value="10">10 (Outstanding)</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-bold">Attribute Score</Form.Label>
                  <Form.Select size="sm" value={attributeFilter} onChange={(e) => setAttributeFilter(e.target.value)}>
                    <option value="">All Scores</option>
                    <option value="0-20">0-20 (Very Low)</option>
                    <option value="21-40">21-40 (Low)</option>
                    <option value="41-60">41-60 (Average)</option>
                    <option value="61-75">61-75 (Good)</option>
                    <option value="76-80">76-80 (Excellent)</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-bold">Report Type</Form.Label>
                  <Form.Select size="sm" value={reportTypeFilter} onChange={(e) => setReportTypeFilter(e.target.value)}>
                    <option value="">All Types</option>
                    <option value="player assessment">Player Assessment</option>
                    <option value="flag">Flag</option>
                    <option value="clips">Clips</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-bold">Scouting Type</Form.Label>
                  <Form.Select size="sm" value={scoutingTypeFilter} onChange={(e) => setScoutingTypeFilter(e.target.value)}>
                    <option value="">All Types</option>
                    <option value="live">Live</option>
                    <option value="video">Video</option>
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>
            <Row>
              <Col md={3}>
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-bold">Scout Name</Form.Label>
                  <Form.Control size="sm" type="text" placeholder="Enter scout name" value={scoutNameFilter} onChange={(e) => setScoutNameFilter(e.target.value)} />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-bold">Player Name</Form.Label>
                  <Form.Control size="sm" type="text" placeholder="Enter player name" value={playerNameFilter} onChange={(e) => setPlayerNameFilter(e.target.value)} />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-bold">Position</Form.Label>
                  <Form.Control size="sm" type="text" placeholder="e.g. GK, CM, ST" value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)} />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-bold">Date Range</Form.Label>
                  <div className="d-flex gap-1">
                    <Form.Control size="sm" type="date" value={dateFromFilter} onChange={(e) => setDateFromFilter(e.target.value)} placeholder="From" />
                    <Form.Control size="sm" type="date" value={dateToFilter} onChange={(e) => setDateToFilter(e.target.value)} placeholder="To" />
                  </div>
                </Form.Group>
              </Col>
            </Row>
            <Row>
              <Col>
                <Button 
                  variant="outline-secondary" 
                  size="sm" 
                  onClick={() => {
                    setPerformanceFilter('');
                    setAttributeFilter('');
                    setScoutNameFilter('');
                    setPlayerNameFilter('');
                    setDateFromFilter('');
                    setDateToFilter('');
                    setReportTypeFilter('');
                    setScoutingTypeFilter('');
                    setPositionFilter('');
                  }}
                >
                  🔄 Clear All Filters
                </Button>
                <small className="text-muted ms-3">
                  Showing {filteredReports.length} of {scoutReports.length} reports
                </small>
              </Col>
            </Row>
          </Card.Body>
        </Collapse>
      </Card>

      {loading ? (
        <div className="text-center"><Spinner animation="border" /></div>
      ) : errorReports ? (
        <Alert variant="danger">{errorReports}</Alert>
      ) : (
        <>
          {viewMode === 'table' ? (
            <div className="table-responsive">
              <Table responsive hover className="table-modern">
                <thead className="table-dark">
                  <tr>
                    <th>Report Date</th>
                    <th>Player</th>
                    <th>Position</th>
                    <th>Fixture Date</th>
                    <th>Fixture</th>
                    <th>Scout</th>
                    <th>Type</th>
                    <th>Performance</th>
                    <th>Attributes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedReports.map((report) => (
                    <tr key={report.report_id}>
                      <td>{new Date(report.created_at).toLocaleDateString()}</td>
                      <td>
                        <Button variant="link" onClick={() => navigate(`/player/${report.player_id}`)}>
                          {report.player_name}
                        </Button>
                      </td>
                      <td>
                        <Badge bg="dark">{report.position_played || 'N/A'}</Badge>
                      </td>
                      <td>
                        {report.fixture_date && report.fixture_date !== 'N/A' ? 
                          new Date(report.fixture_date).toLocaleDateString() : 
                          'N/A'
                        }
                      </td>
                      <td>
                        {report.fixture_details && report.fixture_details !== 'N/A' ? 
                          report.fixture_details : 
                          'N/A'
                        }
                      </td>
                      <td>{report.scout_name}</td>
                      <td>
                        {getReportTypeBadge(report.report_type, report.scouting_type, (report as any).flag_category)}
                        {report.scouting_type && <span className="ms-1">{getScoutingTypeBadge(report.scouting_type)}</span>}
                        {report.purpose && <span className="ms-1">{getPurposeBadge(report.purpose)}</span>}
                      </td>
                      <td><Badge bg={getPerformanceScoreVariant(report.performance_score)}>{report.performance_score}</Badge></td>
                      <td><Badge bg={getAttributeScoreVariant(report.attribute_score)}>{report.attribute_score}</Badge></td>
                      <td>
                        <div className="btn-group">
                          <Button variant="outline-dark" size="sm" onClick={() => handleOpenReportModal(report.report_id)} disabled={loadingReportId === report.report_id} title="View Report">
                            {loadingReportId === report.report_id ? <Spinner as="span" animation="border" size="sm" /> : '👁️'}
                          </Button>
                          <Button variant="outline-secondary" size="sm" title="Edit" onClick={() => handleEditReport(report.report_id)}>✏️</Button>
                          <Button variant="outline-danger" size="sm" title="Delete" onClick={() => handleDeleteReport(report.report_id)}>🗑️</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          ) : (
            <Row>
              {paginatedReports.map((report) => (
                <Col md={6} lg={4} key={report.report_id} className="mb-4">
                  <Card className="h-100 shadow-sm hover-card" style={{ borderRadius: '12px', border: '2px solid #dc3545' }}>
                    <Card.Header className="border-0 bg-gradient" style={{ background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)', borderRadius: '12px 12px 0 0' }}>
                      <div className="d-flex justify-content-between align-items-start">
                        <div>
                          <Button 
                            variant="link" 
                            className="p-0 text-decoration-none fw-bold h5 mb-1" 
                            style={{ color: '#212529' }} 
                            onClick={() => navigate(`/player/${report.player_id}`)}
                          >
                            {report.player_name}
                          </Button>
                          <div className="mb-2">
                            {getReportTypeBadge(report.report_type, report.scouting_type, (report as any).flag_category)}
                            {report.scouting_type && <span className="ms-1">{getScoutingTypeBadge(report.scouting_type)}</span>}
                            {report.purpose && <span className="ms-1">{getPurposeBadge(report.purpose)}</span>}
                          </div>
                        </div>
                        <div className="text-end">
                          <small className="text-muted d-block">{new Date(report.created_at).toLocaleDateString()}</small>
                          <small className="text-muted">by {report.scout_name}</small>
                        </div>
                      </div>
                    </Card.Header>
                    <Card.Body className="pb-2">
                      {/* Conditional rendering based on report type */}
                      {report.report_type?.toLowerCase() === 'flag' || report.report_type?.toLowerCase() === 'flag assessment' ? (
                        /* Flag Report Layout */
                        <Row className="mb-3">
                          <Col xs={12}>
                            <div className="text-center p-3 rounded" style={{ backgroundColor: '#f8f9fa' }}>
                              <div className="fw-bold text-muted small mb-2">CATEGORY</div>
                              <Badge className={`flag-${(report as any).flag_category?.toLowerCase() || 'default'} fs-5`}>
                                🚩 {(report as any).flag_category || 'Not specified'}
                              </Badge>
                            </div>
                          </Col>
                        </Row>
                      ) : (
                        /* Regular Report Layout */
                        <Row className="mb-3">
                          <Col xs={6}>
                            <div className="text-center p-2 rounded" style={{ backgroundColor: '#f8f9fa' }}>
                              <div className="fw-bold text-muted small mb-1">PERFORMANCE</div>
                              <Badge bg={getPerformanceScoreVariant(report.performance_score)} className="fs-6">
                                {report.performance_score}
                              </Badge>
                            </div>
                          </Col>
                          <Col xs={6}>
                            <div className="text-center p-2 rounded" style={{ backgroundColor: '#f8f9fa' }}>
                              <div className="fw-bold text-muted small mb-1">ATTRIBUTES</div>
                              <Badge bg={getAttributeScoreVariant(report.attribute_score)} className="fs-6">
                                {report.attribute_score}
                              </Badge>
                            </div>
                          </Col>
                        </Row>
                      )}
                      {report.fixture_date && report.fixture_date !== 'N/A' && (
                        <div className="mb-2">
                          <small className="text-muted">
                            📅 <strong>Fixture:</strong> {new Date(report.fixture_date).toLocaleDateString()}
                            {report.fixture_details && report.fixture_details !== 'N/A' && (
                              <><br />🏟️ <strong>{report.fixture_details}</strong></>
                            )}
                          </small>
                        </div>
                      )}
                      {report.position_played && (
                        <div className="mb-2">
                          <small className="text-muted">
                            ⚽ <strong>Position:</strong> {report.position_played}
                          </small>
                        </div>
                      )}
                    </Card.Body>
                    <Card.Footer className="bg-transparent border-0 pt-0">
                      <div className="d-grid gap-2 d-md-flex">
                        <Button 
                          variant="outline-dark" 
                          size="sm" 
                          className="flex-grow-1 rounded-pill" 
                          onClick={() => handleOpenReportModal(report.report_id)} 
                          disabled={loadingReportId === report.report_id}
                        >
                          {loadingReportId === report.report_id ? <Spinner as="span" animation="border" size="sm" /> : '👁️ View Report'}
                        </Button>
                        <Button variant="outline-secondary" size="sm" className="rounded-pill" title="Edit" onClick={() => handleEditReport(report.report_id)}>✏️</Button>
                        <Button variant="outline-danger" size="sm" className="rounded-pill" title="Delete" onClick={() => handleDeleteReport(report.report_id)}>🗑️</Button>
                      </div>
                    </Card.Footer>
                  </Card>
                </Col>
              ))}
            </Row>
          )}
        </>
      )}

      <PlayerReportModal show={showReportModal} onHide={() => setShowReportModal(false)} report={selectedReport} />

      <style>{`
        .hover-card {
          transition: transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
        }
        .hover-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
        }
        .table-modern {
          background: white;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .table-modern thead th {
          background: #6c757d;
          color: white;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-size: 0.85rem;
          border: none;
          padding: 1rem 0.75rem;
        }
        .table-modern tbody tr {
          transition: all 0.2s ease;
        }
        .table-modern tbody tr:hover {
          background-color: #f8f9ff;
          transform: scale(1.002);
        }
        .table-modern td {
          padding: 1rem 0.75rem;
          vertical-align: middle;
          border-top: 1px solid #e9ecef;
          text-align: left;
        }
        .table-modern th {
          text-align: left;
        }
        .table-modern .btn-link {
          text-align: left;
          justify-content: flex-start;
          padding-left: 0;
        }
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
          background-color: #28a745 !important;
          color: #fff !important;
          border-color: #28a745 !important;
        }
        .flag-neutral {
          background-color: #6c757d !important;
          color: #fff !important;
          border-color: #6c757d !important;
        }
        .flag-negative {
          background-color: #ffc107 !important;
          color: #000 !important;
          border-color: #ffc107 !important;
        }
        .flag-default {
          background-color: #fbbf24 !important;
          color: #000 !important;
          border-color: #fbbf24 !important;
        }
        
        /* Dark mode card improvements */
        body.theme-dark .card, [data-bs-theme="dark"] .card {
          background-color: var(--bs-card-bg) !important;
          color: var(--bs-card-color) !important;
          border-color: var(--bs-card-border-color) !important;
        }
        body.theme-dark .card-header, [data-bs-theme="dark"] .card-header {
          background-color: var(--bs-card-bg) !important;
          color: var(--bs-card-color) !important;
          border-bottom-color: var(--bs-card-border-color) !important;
        }
        body.theme-dark .card-body, [data-bs-theme="dark"] .card-body {
          color: var(--bs-card-color) !important;
        }
        body.theme-dark .text-muted, [data-bs-theme="dark"] .text-muted {
          color: var(--bs-secondary-color) !important;
        }
        body.theme-dark .small.text-muted, [data-bs-theme="dark"] .small.text-muted {
          color: #d1d5db !important;
        }
      `}</style>
    </Container>
  );
};

export default ScoutingPage;