import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Container, Row, Col, Card, Form, Button, Badge, Table, Spinner, Alert, ListGroup, Collapse } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../axiosInstance';
import { useAuth } from '../App';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { normalizeText, containsAccentInsensitive } from '../utils/textNormalization';

interface Player {
  player_id: number;
  player_name: string;
  first_name: string;
  last_name: string;
  age: number | null;
  squad_name: string;
  position: string;
  scout_reports_count: number;
  intel_reports_count: number;
  last_report_date: string | null;
  recruitment_status: string;
}

interface PaginationInfo {
  current_page: number;
  total_pages: number;
  total_count: number;
  limit: number;
  has_next: boolean;
  has_prev: boolean;
}

const PlayersPage: React.FC = () => {
  const { token } = useAuth();
  const { user, loading: userLoading, canAccessPlayers } = useCurrentUser();
  const navigate = useNavigate();
  const [players, setPlayers] = useState<Player[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    current_page: 1,
    total_pages: 1,
    total_count: 0,
    limit: 20,
    has_next: false,
    has_prev: false
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [currentPage, setCurrentPage] = useState(1);
  
  // Advanced search functionality
  const [playerSearch, setPlayerSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [playerSearchError, setPlayerSearchError] = useState('');
  const [playerSearchLoading, setPlayerSearchLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchCacheRef = useRef<Record<string, Player[]>>({});

  const positions = ["GK", "RB", "RWB", "RCB", "LCB", "LCB(3)", "LWB", "LB", "DM", "CM", "RAM", "AM", "LAM", "RW", "LW", "Target Man CF", "In Behind CF"];
  
  // Status badge - simplified for now
  const getStatusBadge = () => {
    return <Badge bg="secondary">🔍 Scouted</Badge>;
  };

  const fetchPlayers = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20'
      });
      
      if (searchTerm) params.append('search', searchTerm);
      if (positionFilter) params.append('position', positionFilter);
      if (teamFilter) params.append('team', teamFilter);
      
      const response = await axiosInstance.get(`/players/all?${params}`);
      setPlayers(response.data.players);
      setPagination(response.data.pagination);
      setCurrentPage(page);
    } catch (error) {
      console.error('Error fetching players:', error);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, positionFilter, teamFilter]);

  useEffect(() => {
    if (token) {
      fetchPlayers(1);
    }
  }, [token, fetchPlayers]);

  const handlePageChange = (page: number) => {
    fetchPlayers(page);
  };

  const handleSearch = () => {
    fetchPlayers(1);
  };

  const performPlayerSearch = useCallback(async (query: string) => {
    const trimmedQuery = query.trim();
    const normalizedQuery = normalizeText(trimmedQuery);
    
    // Check cache first using normalized query
    if (searchCacheRef.current[normalizedQuery]) {
      setSearchResults(searchCacheRef.current[normalizedQuery]);
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
      
      // Cache the results using normalized query
      searchCacheRef.current[normalizedQuery] = results;
      
      setSearchResults(results);
      setShowDropdown(results.length > 0);
      
      if (results.length === 0) {
        setPlayerSearchError('No players found.');
      } else {
        setPlayerSearchError('');
      }
    } catch (error) {
      console.error('Error searching players:', error);
      setSearchResults([]);
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
      setSearchResults([]);
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

  const handlePlayerSelect = (player: Player) => {
    navigate(`/player/${player.player_id}`);
  };
  
  // Close dropdown when clicking outside
  const handleInputBlur = () => {
    // Small delay to allow click on dropdown items
    setTimeout(() => {
      setShowDropdown(false);
    }, 200);
  };
  
  const handleInputFocus = () => {
    if (searchResults.length > 0) {
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

  // Server-side filtering eliminates need for client-side filtering
  const displayPlayers = players;

  const uniqueTeams = players.reduce((teams: string[], player) => {
    if (!teams.includes(player.squad_name)) {
      teams.push(player.squad_name);
    }
    return teams;
  }, []).sort();

  if (loading || userLoading) {
    return (
      <Container className="mt-4 text-center">
        <Spinner animation="border" />
        <p>Loading players...</p>
      </Container>
    );
  }

  if (!canAccessPlayers) {
    return (
      <Container className="mt-4">
        <Alert variant="danger">
          <Alert.Heading>Access Denied</Alert.Heading>
          <p>
            You don't have permission to view the players database. 
            This page is only accessible to managers and administrators.
          </p>
          <Button variant="outline-danger" onClick={() => navigate('/')}>
            Return to Home
          </Button>
        </Alert>
      </Container>
    );
  }

  return (
    <Container className="mt-4">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>👥 Players Database</h2>
        <div className="d-flex align-items-center gap-3">
          <Badge bg="info">{pagination.total_count} players (Page {pagination.current_page} of {pagination.total_pages})</Badge>
          <div className="btn-group" role="group">
            <Button
              variant={viewMode === 'cards' ? 'primary' : 'outline-primary'}
              size="sm"
              onClick={() => setViewMode('cards')}
            >
              🔳 Cards
            </Button>
            <Button
              variant={viewMode === 'table' ? 'primary' : 'outline-primary'}
              size="sm"
              onClick={() => setViewMode('table')}
            >
              📊 Table
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Player Search */}
      <Card className="mb-4">
        <Card.Body>
          <Card.Title>🔍 Player Search</Card.Title>
          <Form.Group controlId="playerName">
            <div className="position-relative">
              <Form.Control
                type="text"
                placeholder="Search for a player by name..."
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
            {showDropdown && searchResults.length > 0 && (
              <ListGroup className="mt-2" style={{ position: 'absolute', zIndex: 1000, width: 'calc(100% - 30px)', maxHeight: '200px', overflowY: 'auto' }}>
                {searchResults.map((player, index) => (
                  <ListGroup.Item 
                    key={`${player.player_id || index}-${player.player_name}`} 
                    action 
                    onClick={() => handlePlayerSelect(player)}
                    className="d-flex justify-content-between align-items-center"
                  >
                    <div>
                      <strong>{player.player_name}</strong>
                      <small className="text-muted ms-2">{player.position}</small>
                    </div>
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
        </Card.Body>
      </Card>

      {/* Advanced Filters */}
      <Card className="mb-4">
        <Card.Header style={{ backgroundColor: '#000000', color: 'white' }}>
          <div className="d-flex justify-content-between align-items-center">
            <h6 className="mb-0 text-white">🔧 Advanced Filters</h6>
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
            <Col md={4} className="mb-3">
              <Form.Group>
                <Form.Label className="small fw-bold">Position</Form.Label>
                <Form.Select
                  size="sm"
                  value={positionFilter}
                  onChange={(e) => setPositionFilter(e.target.value)}
                >
                  <option value="">All Positions</option>
                  {positions.map(pos => (
                    <option key={pos} value={pos}>{pos}</option>
                  ))}
                </Form.Select>
              </Form.Group>
            </Col>
            <Col md={4} className="mb-3">
              <Form.Group>
                <Form.Label className="small fw-bold">Team</Form.Label>
                <Form.Select
                  size="sm"
                  value={teamFilter}
                  onChange={(e) => setTeamFilter(e.target.value)}
                >
                  <option value="">All Teams</option>
                  {uniqueTeams.map(team => (
                    <option key={team} value={team}>{team}</option>
                  ))}
                </Form.Select>
              </Form.Group>
            </Col>
            <Col md={4} className="mb-3 d-flex align-items-end">
              <Button 
                variant="outline-secondary" 
                size="sm" 
                onClick={() => {
                  setSearchTerm('');
                  setPositionFilter('');
                  setTeamFilter('');
                  fetchPlayers(1);
                }}
                className="me-2"
              >
                🔄 Clear Filters
              </Button>
              <Button 
                variant="primary" 
                size="sm" 
                onClick={handleSearch}
              >
                Apply Filters
              </Button>
            </Col>
          </Row>
          </Card.Body>
        </Collapse>
      </Card>

      {/* Players List */}
      {displayPlayers.length === 0 ? (
        <Card className="text-center p-4">
          <Card.Body>
            <h5>No Players Found</h5>
            <p className="text-muted">Try adjusting your search criteria.</p>
          </Card.Body>
        </Card>
      ) : viewMode === 'cards' ? (
        <Row>
          {displayPlayers.map((player) => (
            <Col key={player.player_id} lg={6} xl={4} className="mb-3">
              <Card className="h-100 shadow-sm hover-card" style={{ borderRadius: '12px', border: '2px solid #dc3545' }}>
                <Card.Header className="d-flex justify-content-between align-items-start border-0 bg-gradient" style={{ background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)', borderRadius: '12px 12px 0 0' }}>
                  <div>
                    <Badge bg="dark">{player.position}</Badge>
                    <small className="ms-2 text-muted">Age: {player.age || 'Unknown'}</small>
                  </div>
                  <small className="text-muted">
                    {player.last_report_date ? 
                      new Date(player.last_report_date).toLocaleDateString() : 
                      'No reports'
                    }
                  </small>
                </Card.Header>
                <Card.Body>
                  <Card.Title className="h6 mb-2">{player.player_name}</Card.Title>
                  <div className="mb-2">
                    <small className="text-muted">
                      <strong>Club:</strong> {player.squad_name}
                    </small>
                  </div>
                  <div className="mb-3">
                    <Row className="text-center">
                      <Col xs={6}>
                        <div className="border-end">
                          <strong className="text-success">{player.scout_reports_count}</strong>
                          <div><small className="text-muted">Scout Reports</small></div>
                        </div>
                      </Col>
                      <Col xs={6}>
                        <div>
                          <strong className="text-info">{player.intel_reports_count}</strong>
                          <div><small className="text-muted">Intel Reports</small></div>
                        </div>
                      </Col>
                    </Row>
                  </div>
                  <div className="text-center mb-3">
                    <Badge bg="secondary">🔍 Scouted</Badge>
                  </div>
                </Card.Body>
                <Card.Footer className="bg-transparent border-0 pt-0">
                  <div className="d-grid">
                    <Button 
                      variant="danger" 
                      size="sm"
                      className="rounded-pill"
                      onClick={() => navigate(`/player/${player.player_id}`)}
                    >
                      👁️ View Profile
                    </Button>
                  </div>
                </Card.Footer>
              </Card>
            </Col>
          ))}
        </Row>
      ) : (
        <div className="table-responsive">
          <Table hover className="table-modern">
            <thead className="table-dark">
              <tr>
                <th>Player</th>
                <th>Position</th>
                <th>Club</th>
                <th>Age</th>
                <th>Scout Reports</th>
                <th>Intel Reports</th>
                <th>Status</th>
                <th>Last Report</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayPlayers.map((player) => (
                <tr key={player.player_id} className="align-middle">
                  <td>
                    <div>
                      <strong>{player.player_name}</strong>
                      <br />
                      <small className="text-muted">{player.first_name} {player.last_name}</small>
                    </div>
                  </td>
                  <td>
                    <Badge bg="dark">{player.position}</Badge>
                  </td>
                  <td>{player.squad_name}</td>
                  <td>{player.age || 'Unknown'}</td>
                  <td className="text-center">
                    <Badge bg="success" className="fs-6">{player.scout_reports_count}</Badge>
                  </td>
                  <td className="text-center">
                    <Badge bg="info" className="fs-6">{player.intel_reports_count}</Badge>
                  </td>
                  <td><Badge bg="secondary">🔍 Scouted</Badge></td>
                  <td>
                    <small>
                      {player.last_report_date ? 
                        new Date(player.last_report_date).toLocaleDateString() : 
                        'No reports'
                      }
                    </small>
                  </td>
                  <td>
                    <Button 
                      variant="danger" 
                      size="sm"
                      className="rounded-pill"
                      onClick={() => navigate(`/player/${player.player_id}`)}
                      title="View Profile"
                    >
                      👁️
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {pagination.total_pages > 1 && (
        <Row className="mt-4">
          <Col md={4}>
            <div className="d-flex align-items-center">
              <Button 
                variant="outline-secondary" 
                size="sm" 
                onClick={() => handlePageChange(currentPage - 1)} 
                disabled={!pagination.has_prev || loading}
                className="me-2"
              >
                ‹
              </Button>
              <small className="text-muted mx-2">
                Page {currentPage} of {pagination.total_pages}
              </small>
              <Button 
                variant="outline-secondary" 
                size="sm" 
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={!pagination.has_next || loading}
                className="ms-2"
              >
                ›
              </Button>
            </div>
          </Col>
        </Row>
      )}

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
        }
      `}</style>
    </Container>
  );
};

export default PlayersPage;