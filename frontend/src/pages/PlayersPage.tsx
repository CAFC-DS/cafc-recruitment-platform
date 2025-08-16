import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Form, Button, Badge, InputGroup, Table, Spinner } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../axiosInstance';
import { useAuth } from '../App';

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

const PlayersPage: React.FC = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  const positions = ["GK", "RB", "RWB", "RCB", "LCB", "LCB(3)", "LWB", "LB", "DM", "CM", "RAM", "AM", "LAM", "RW", "LW", "Target Man CF", "In Behind CF"];
  
  // Pipeline functionality removed - will be added later
  const getStatusBadge = (status: string) => {
    return <Badge bg="secondary">🔍 Scouted</Badge>;
  };
  
  const pipelineStatuses = []; // Placeholder for now

  useEffect(() => {
    if (token) {
      fetchPlayers();
    }
  }, [token]);

  const fetchPlayers = async () => {
    try {
      const response = await axiosInstance.get('/players/all');
      setPlayers(response.data);
    } catch (error) {
      console.error('Error fetching players:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredPlayers = players.filter(player => {
    const matchesSearch = player.player_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         player.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         player.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         player.squad_name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesPosition = !positionFilter || player.position === positionFilter;
    const matchesTeam = !teamFilter || player.squad_name.toLowerCase().includes(teamFilter.toLowerCase());
    const matchesStatus = true; // No status filtering for now

    return matchesSearch && matchesPosition && matchesTeam && matchesStatus;
  });

  const uniqueTeams = players.reduce((teams: string[], player) => {
    if (!teams.includes(player.squad_name)) {
      teams.push(player.squad_name);
    }
    return teams;
  }, []).sort();

  if (loading) {
    return (
      <Container className="mt-4 text-center">
        <Spinner animation="border" />
        <p>Loading players...</p>
      </Container>
    );
  }

  return (
    <Container className="mt-4">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>👥 Players Database</h2>
        <div className="d-flex align-items-center gap-3">
          <Badge bg="info">{filteredPlayers.length} players</Badge>
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

      {/* Filters */}
      <Card className="mb-4">
        <Card.Header style={{ backgroundColor: '#000000', color: 'white' }}>
          <Card.Title className="h6 mb-0 text-white">🔍 Filter Players</Card.Title>
        </Card.Header>
        <Card.Body>
          <Row>
            <Col md={3} className="mb-3">
              <Form.Group>
                <Form.Label className="small fw-bold">Search</Form.Label>
                <InputGroup size="sm">
                  <Form.Control
                    type="text"
                    placeholder="Name, team..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </InputGroup>
              </Form.Group>
            </Col>
            <Col md={2} className="mb-3">
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
            <Col md={3} className="mb-3">
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
            {/* Status filter removed - will be added with pipeline */}
            <Col md={1} className="mb-3 d-flex align-items-end">
              <Button 
                variant="outline-secondary" 
                size="sm" 
                onClick={() => {
                  setSearchTerm('');
                  setPositionFilter('');
                  setTeamFilter('');
                  setStatusFilter('');
                }}
              >
                🔄
              </Button>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* Players List */}
      {filteredPlayers.length === 0 ? (
        <Card className="text-center p-4">
          <Card.Body>
            <h5>No Players Found</h5>
            <p className="text-muted">Try adjusting your search criteria.</p>
          </Card.Body>
        </Card>
      ) : viewMode === 'cards' ? (
        <Row>
          {filteredPlayers.map((player) => (
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
              {filteredPlayers.map((player) => (
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