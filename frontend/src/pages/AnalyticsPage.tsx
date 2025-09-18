import React, { useState, useEffect, useCallback } from 'react';
import { Container, Row, Col, Card, Table, Spinner, Alert, Button, Form, Badge } from 'react-bootstrap';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { useAuth } from '../App';
import { useCurrentUser } from '../hooks/useCurrentUser';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface PlayerCoverageStats {
  total_games: number;
  total_players_covered: number;
  total_reports: number;
  average_players_per_game: number;
}

interface GameData {
  match_id: number;
  home_team: string;
  away_team: string;
  scheduled_date: string;
  players_covered: number;
  total_reports: number;
  scouting_type: string;
}

interface TopCoveredGame {
  match: string;
  date: string;
  players_covered: number;
  scouting_type: string;
}

interface DatabaseOverview {
  total_matches_in_database: number;
  matches_with_scout_reports: number;
  coverage_percentage: number;
}

interface TimelineDataPoint {
  month?: string;
  day?: string;
  totalReports: number;
  liveReports: number;
  videoReports: number;
  scouts: { [key: string]: number };
}

interface TimelineData {
  timeline: TimelineDataPoint[];
  totalScouts: number;
  topScouts: { name: string; reports: number }[];
}

interface AnalyticsData {
  all_games_stats: PlayerCoverageStats;
  live_games_stats: PlayerCoverageStats;
  games_with_coverage: GameData[];
  database_overview: DatabaseOverview;
  top_covered_games: TopCoveredGame[];
}

const AnalyticsPage: React.FC = () => {
  const { token } = useAuth();
  const { canAccessAnalytics, loading: userLoading } = useCurrentUser();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [timelineData, setTimelineData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [selectedScout, setSelectedScout] = useState<string>('ALL');
  const [chartType, setChartType] = useState<string>('monthly');
  const [dateRange, setDateRange] = useState<number>(30);

  // All hooks must be at the top before any conditional logic
  const fetchAnalyticsData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:8000/analytics/player-coverage', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch analytics data: ${response.status}`);
      }

      const analyticsData = await response.json();
      setData(analyticsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch analytics data');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchTimelineData = useCallback(async () => {
    try {
      setTimelineLoading(true);
      const response = await fetch('http://localhost:8000/analytics/timeline', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch timeline data: ${response.status}`);
      }

      const timelineDataResponse = await response.json();
      setTimelineData(timelineDataResponse);
    } catch (err) {
      console.error('Timeline data error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch timeline data');
    } finally {
      setTimelineLoading(false);
    }
  }, [token]);

  const fetchDailyTimelineData = useCallback(async (days: number) => {
    try {
      setTimelineLoading(true);
      const response = await fetch(`http://localhost:8000/analytics/timeline-daily?days=${days}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch daily timeline data: ${response.status}`);
      }

      const timelineDataResponse = await response.json();
      setTimelineData(timelineDataResponse);
    } catch (err) {
      console.error('Daily timeline data error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch daily timeline data');
    } finally {
      setTimelineLoading(false);
    }
  }, [token]);

  useEffect(() => {
    // Only fetch data if user has permission
    if (canAccessAnalytics && !userLoading) {
      fetchAnalyticsData();
      if (chartType === 'monthly') {
        fetchTimelineData();
      } else {
        fetchDailyTimelineData(dateRange);
      }
    }
  }, [fetchAnalyticsData, fetchTimelineData, fetchDailyTimelineData, canAccessAnalytics, userLoading, chartType, dateRange]);

  // Check permissions after all hooks
  if (userLoading) {
    return (
      <Container className="d-flex justify-content-center align-items-center" style={{ minHeight: '50vh' }}>
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
      </Container>
    );
  }

  if (!canAccessAnalytics) {
    return (
      <Container>
        <Alert variant="danger">
          <Alert.Heading>Access Denied</Alert.Heading>
          <p>You don't have permission to access analytics. This feature is only available to managers and administrators.</p>
        </Alert>
      </Container>
    );
  }


  if (loading) {
    return (
      <Container className="d-flex justify-content-center align-items-center" style={{ minHeight: '50vh' }}>
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <Alert variant="danger">
          <Alert.Heading>Error</Alert.Heading>
          <p>{error}</p>
          <Button variant="outline-danger" onClick={fetchAnalyticsData}>
            Try Again
          </Button>
        </Alert>
      </Container>
    );
  }

  if (!data) {
    return (
      <Container>
        <Alert variant="info">No analytics data available.</Alert>
      </Container>
    );
  }

  return (
    <Container className="mt-4">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>📊 Analytics Dashboard</h2>
        <div className="d-flex align-items-center gap-3">
          <Badge bg="info">Player Coverage Analytics</Badge>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <Row className="mb-4">
        <Col md={3} className="mb-3">
          <Card className="h-100 shadow-sm hover-card" style={{ borderRadius: '12px', border: '2px solid #dc3545' }}>
            <Card.Header className="border-0" style={{ backgroundColor: '#f8f9fa', color: '#212529', borderRadius: '12px 12px 0 0', padding: '1rem' }}>
              <Card.Title className="h6 mb-0 text-center" style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>Average Players Scouted Per Game (All Types)</Card.Title>
            </Card.Header>
            <Card.Body className="text-center">
              <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#dc3545' }}>
                {data.all_games_stats.average_players_per_game}
              </div>
              <small className="text-muted">
                {data.all_games_stats.total_games} games | {data.all_games_stats.total_players_covered} total players
              </small>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3} className="mb-3">
          <Card className="h-100 shadow-sm hover-card" style={{ borderRadius: '12px', border: '2px solid #28a745' }}>
            <Card.Header className="border-0" style={{ backgroundColor: '#f8f9fa', color: '#212529', borderRadius: '12px 12px 0 0', padding: '1rem' }}>
              <Card.Title className="h6 mb-0 text-center" style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>Average Players Scouted Per Game (Live Scouting Only)</Card.Title>
            </Card.Header>
            <Card.Body className="text-center">
              <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#28a745' }}>
                {data.live_games_stats.average_players_per_game || 0}
              </div>
              <small className="text-muted">
                {data.live_games_stats.total_games} games | {data.live_games_stats.total_players_covered} total players
              </small>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3} className="mb-3">
          <Card className="h-100 shadow-sm hover-card" style={{ borderRadius: '12px', border: '2px solid #ffc107' }}>
            <Card.Header className="border-0" style={{ backgroundColor: '#f8f9fa', color: '#212529', borderRadius: '12px 12px 0 0', padding: '1rem' }}>
              <Card.Title className="h6 mb-0 text-center" style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>Database Coverage Percentage</Card.Title>
            </Card.Header>
            <Card.Body className="text-center">
              <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#ffc107' }}>
                {data.database_overview.coverage_percentage}%
              </div>
              <small className="text-muted">
                {data.database_overview.matches_with_scout_reports} of {data.database_overview.total_matches_in_database} matches
              </small>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3} className="mb-3">
          <Card className="h-100 shadow-sm hover-card" style={{ borderRadius: '12px', border: '2px solid #17a2b8' }}>
            <Card.Header className="border-0" style={{ backgroundColor: '#f8f9fa', color: '#212529', borderRadius: '12px 12px 0 0', padding: '1rem' }}>
              <Card.Title className="h6 mb-0 text-center" style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>Total Scout Reports Generated</Card.Title>
            </Card.Header>
            <Card.Body className="text-center">
              <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#17a2b8' }}>
                {data.all_games_stats.total_reports}
              </div>
              <small className="text-muted">
                Across all games
              </small>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        {/* Top Covered Games */}
        <Col md={6} className="mb-4">
          <Card className="shadow-sm" style={{ borderRadius: '12px', border: '2px solid #dc3545' }}>
            <Card.Header style={{ backgroundColor: '#000000', color: 'white', borderRadius: '12px 12px 0 0' }}>
              <h6 className="mb-0 text-white">🏆 Top 10 Most Covered Games (LIVE Scouting)</h6>
            </Card.Header>
            <Card.Body style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <div className="table-responsive">
                <Table hover className="table-modern">
                  <thead className="table-dark">
                    <tr>
                      <th>Match</th>
                      <th>Date</th>
                      <th>Players</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_covered_games.map((game, index) => (
                      <tr key={index} className="align-middle">
                        <td style={{ fontSize: '0.85rem' }}>{game.match}</td>
                        <td style={{ fontSize: '0.85rem' }}>{new Date(game.date).toLocaleDateString()}</td>
                        <td className="text-center">
                          <Badge bg="success" className="fs-6">{game.players_covered}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </Card.Body>
          </Card>
        </Col>

        {/* Raw Numbers Summary */}
        <Col md={6} className="mb-4">
          <Card className="shadow-sm" style={{ borderRadius: '12px', border: '2px solid #17a2b8' }}>
            <Card.Header style={{ backgroundColor: '#000000', color: 'white', borderRadius: '12px 12px 0 0' }}>
              <h6 className="mb-0 text-white">📋 Raw Numbers Summary</h6>
            </Card.Header>
            <Card.Body>
              <div>
                <h6 style={{ color: '#dc3545', marginBottom: '15px' }}>ALL GAMES</h6>
                <div className="mb-2"><strong>Total Games with Coverage:</strong> <Badge bg="secondary">{data.all_games_stats.total_games}</Badge></div>
                <div className="mb-2"><strong>Total Players Covered:</strong> <Badge bg="secondary">{data.all_games_stats.total_players_covered}</Badge></div>
                <div className="mb-2"><strong>Total Scout Reports:</strong> <Badge bg="secondary">{data.all_games_stats.total_reports}</Badge></div>
                <div className="mb-3"><strong>Average Players per Game:</strong> <Badge bg="danger">{data.all_games_stats.average_players_per_game}</Badge></div>

                <hr style={{ margin: '20px 0' }} />

                <h6 style={{ color: '#28a745', marginBottom: '15px' }}>LIVE SCOUTING ONLY</h6>
                <div className="mb-2"><strong>Total Live Games:</strong> <Badge bg="secondary">{data.live_games_stats.total_games}</Badge></div>
                <div className="mb-2"><strong>Total Players Covered:</strong> <Badge bg="secondary">{data.live_games_stats.total_players_covered}</Badge></div>
                <div className="mb-2"><strong>Total Scout Reports:</strong> <Badge bg="secondary">{data.live_games_stats.total_reports}</Badge></div>
                <div className="mb-3"><strong>Average Players per Game:</strong> <Badge bg="success">{data.live_games_stats.average_players_per_game || 'N/A'}</Badge></div>

                <hr style={{ margin: '20px 0' }} />

                <h6 style={{ color: '#ffc107', marginBottom: '15px' }}>DATABASE OVERVIEW</h6>
                <div className="mb-2"><strong>Total Matches in Database:</strong> <Badge bg="secondary">{data.database_overview.total_matches_in_database}</Badge></div>
                <div className="mb-2"><strong>Matches with Scout Reports:</strong> <Badge bg="secondary">{data.database_overview.matches_with_scout_reports}</Badge></div>
                <div className="mb-2"><strong>Coverage Percentage:</strong> <Badge bg="warning">{data.database_overview.coverage_percentage}%</Badge></div>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Interactive Timeline Visualization */}
      <Row>
        <Col>
          <Card className="shadow-sm" style={{ borderRadius: '12px', border: '2px solid #6c757d' }}>
            <Card.Header style={{ backgroundColor: '#000000', color: 'white', borderRadius: '12px 12px 0 0' }}>
              <div className="d-flex justify-content-between align-items-center">
                <h6 className="mb-0 text-white">📊 Scout Reports Timeline</h6>
                <div className="d-flex gap-2">
                  <Form.Select
                    value={chartType}
                    onChange={(e) => setChartType(e.target.value)}
                    style={{ width: 'auto', backgroundColor: 'white', color: 'black', border: '1px solid #dee2e6' }}
                    size="sm"
                  >
                    <option value="monthly">Monthly View</option>
                    <option value="daily">Daily View</option>
                  </Form.Select>
                  {chartType === 'daily' && (
                    <Form.Select
                      value={dateRange}
                      onChange={(e) => setDateRange(Number(e.target.value))}
                      style={{ width: 'auto', backgroundColor: 'white', color: 'black', border: '1px solid #dee2e6' }}
                      size="sm"
                    >
                      <option value={7}>Last 7 Days</option>
                      <option value={14}>Last 14 Days</option>
                      <option value={30}>Last 30 Days</option>
                      <option value={60}>Last 60 Days</option>
                    </Form.Select>
                  )}
                  <Form.Select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    style={{ width: 'auto', backgroundColor: 'white', color: 'black', border: '1px solid #dee2e6' }}
                    size="sm"
                  >
                    <option value="ALL">All Scout Types</option>
                    <option value="LIVE">Live Scouting</option>
                    <option value="VIDEO">Video Analysis</option>
                  </Form.Select>
                  <Form.Select
                    value={selectedScout}
                    onChange={(e) => setSelectedScout(e.target.value)}
                    style={{ width: 'auto', backgroundColor: 'white', color: 'black', border: '1px solid #dee2e6' }}
                    size="sm"
                  >
                    <option value="ALL">All Scouts</option>
                    {timelineData?.topScouts.map(scout => (
                      <option key={scout.name} value={scout.name}>{scout.name}</option>
                    ))}
                  </Form.Select>
                </div>
              </div>
            </Card.Header>
            <Card.Body style={{ minHeight: '500px', padding: '2rem' }}>
              {timelineLoading ? (
                <div className="text-center py-5">
                  <Spinner animation="border" role="status">
                    <span className="visually-hidden">Loading timeline...</span>
                  </Spinner>
                </div>
              ) : timelineData ? (
                <>
                  {/* Timeline Chart */}
                  <div style={{ height: '350px', marginBottom: '2rem' }}>
                    <Bar
                      data={{
                        labels: timelineData.timeline.map(point => {
                          if (chartType === 'daily' && point.day) {
                            const date = new Date(point.day + 'T00:00:00');
                            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                          } else if (point.month) {
                            const date = new Date(point.month + '-01');
                            return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                          }
                          return '';
                        }),
                        datasets: [
                          {
                            label: 'Total Reports',
                            data: timelineData.timeline.map(point => point.totalReports),
                            borderColor: '#dc3545',
                            backgroundColor: 'rgba(220, 53, 69, 0.6)',
                            borderWidth: 1,
                          },
                          {
                            label: 'Live Scouting (by scouting type)',
                            data: timelineData.timeline.map(point => point.liveReports),
                            borderColor: '#28a745',
                            backgroundColor: 'rgba(40, 167, 69, 0.6)',
                            borderWidth: 1,
                          },
                          {
                            label: 'Video Scouting (by scouting type)',
                            data: timelineData.timeline.map(point => point.videoReports),
                            borderColor: '#17a2b8',
                            backgroundColor: 'rgba(23, 162, 184, 0.6)',
                            borderWidth: 1,
                          },
                          ...(selectedScout !== 'ALL' ? [{
                            label: `${selectedScout} Reports`,
                            data: timelineData.timeline.map(point => point.scouts[selectedScout] || 0),
                            borderColor: '#ffc107',
                            backgroundColor: 'rgba(255, 193, 7, 0.6)',
                            borderWidth: 2,
                          }] : [])
                        ]
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: {
                          mode: 'index' as const,
                          intersect: false,
                        },
                        plugins: {
                          title: {
                            display: true,
                            text: 'Scout Reports Timeline',
                            font: { size: 16, weight: 'bold' },
                            color: '#212529'
                          },
                          legend: {
                            position: 'top' as const,
                            labels: { usePointStyle: true, padding: 20 }
                          },
                          tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            titleColor: '#fff',
                            bodyColor: '#fff',
                            borderColor: '#dee2e6',
                            borderWidth: 1,
                            cornerRadius: 8,
                            displayColors: true,
                            callbacks: {
                              title: (context) => {
                                const dataPoint = timelineData.timeline[context[0].dataIndex];
                                if (chartType === 'daily' && dataPoint.day) {
                                  const date = new Date(dataPoint.day + 'T00:00:00');
                                  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
                                } else if (dataPoint.month) {
                                  const date = new Date(dataPoint.month + '-01');
                                  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                                }
                                return 'Unknown Date';
                              },
                              afterBody: (context) => {
                                const dataPoint = timelineData.timeline[context[0].dataIndex];
                                const scouts = Object.entries(dataPoint.scouts);
                                return [
                                  '',
                                  'Scout Breakdown:',
                                  ...scouts.map(([name, count]) => `  ${name}: ${count} reports`)
                                ];
                              }
                            }
                          }
                        },
                        scales: {
                          x: {
                            display: true,
                            title: { display: true, text: chartType === 'daily' ? 'Day' : 'Month', font: { weight: 'bold' } },
                            grid: { color: 'rgba(0, 0, 0, 0.1)' }
                          },
                          y: {
                            display: true,
                            title: { display: true, text: 'Number of Reports', font: { weight: 'bold' } },
                            grid: { color: 'rgba(0, 0, 0, 0.1)' },
                            beginAtZero: true
                          }
                        }
                      }}
                    />
                  </div>

                  {/* Scout Performance Summary */}
                  <Row>
                    <Col md={12}>
                      <h6 style={{ color: '#495057', marginBottom: '1rem' }}>📈 Top Performing Scouts</h6>
                      <Row>
                        {timelineData.topScouts.slice(0, 6).map((scout, index) => (
                          <Col md={4} key={scout.name} className="mb-3">
                            <div
                              className="d-flex justify-content-between align-items-center p-3"
                              style={{
                                backgroundColor: index === 0 ? '#fff3cd' : index === 1 ? '#d1ecf1' : index === 2 ? '#d4edda' : '#f8f9fa',
                                borderRadius: '8px',
                                border: `2px solid ${index === 0 ? '#ffc107' : index === 1 ? '#17a2b8' : index === 2 ? '#28a745' : '#dee2e6'}`,
                                height: '100%'
                              }}
                            >
                              <span style={{ fontWeight: '600' }}>
                                {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`} {scout.name}
                              </span>
                              <Badge bg={index === 0 ? 'warning' : index === 1 ? 'info' : index === 2 ? 'success' : 'secondary'}>
                                {scout.reports} reports
                              </Badge>
                            </div>
                          </Col>
                        ))}
                      </Row>
                    </Col>
                  </Row>
                </>
              ) : (
                <div className="text-center py-5">
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
                  <h5 style={{ color: '#6c757d' }}>No timeline data available</h5>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

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

export default AnalyticsPage;