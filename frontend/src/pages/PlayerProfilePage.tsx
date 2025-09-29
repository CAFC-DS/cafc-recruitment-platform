import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Container, Row, Col, Card, Badge, Button, Form, Alert, Spinner, Modal, ProgressBar } from 'react-bootstrap';
import { PolarArea } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import axiosInstance from '../axiosInstance';
import PlayerReportModal from '../components/PlayerReportModal';
import IntelReportModal from '../components/IntelReportModal';
import PitchView from '../components/PitchView';
import { getPerformanceScoreColor, getAttributeScoreColor, getFlagColor, getContrastTextColor } from '../utils/colorUtils';

ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  ArcElement,
  ChartDataLabels
);

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

interface AttributeData {
  name: string;
  average_score: number;
  report_count: number;
  display_order: number;
}

interface PlayerAttributes {
  player_id: number;
  player_position: string;
  attribute_group: string;
  attribute_groups: { [key: string]: AttributeData[] };
  total_reports: number;
  total_attributes: number;
}

interface ScoutReport {
  report_id: number;
  report_date: string;
  scout_name: string;
  game_date: string | null;
  fixture: string | null;
  fixture_date: string | null;
  overall_rating: number | null;
  attribute_count: number;
  report_type: string | null;
}

interface ScoutReportsData {
  player_id: number;
  total_reports: number;
  reports: ScoutReport[];
}

const PlayerProfilePage: React.FC = () => {
  const { playerId, cafcPlayerId } = useParams<{ playerId?: string; cafcPlayerId?: string }>();

  // Determine which ID to use - external or manual
  const actualPlayerId = playerId || cafcPlayerId;
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [attributes, setAttributes] = useState<PlayerAttributes | null>(null);
  const [scoutReportsData, setScoutReportsData] = useState<ScoutReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [attributesLoading, setAttributesLoading] = useState(true);
  const [scoutReportsLoading, setScoutReportsLoading] = useState(true);
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

  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Position filter for radar charts
  const [selectedPosition, setSelectedPosition] = useState<string>('');
  const [positionAttributes, setPositionAttributes] = useState<string[]>([]);
  const [positionAttributeScores, setPositionAttributeScores] = useState<{ [key: string]: number }>({});
  const [availablePositions, setAvailablePositions] = useState<string[]>([]);

  const getStatusBadge = (status: string) => {
    return <span className="badge badge-neutral-grey">🔍 Scouted</span>;
  };
  
  const pipelineStatuses = [];
  
  const updatePipelineStatus = async (newStatus: string) => {
    console.log('Pipeline status update:', newStatus);
  };

  // Red-green gradient color functions for scoring
  const getPerformanceScoreColor = (score: number) => {
    // Scale from 1-10 to red-green gradient
    const red = Math.max(0, 255 - (score - 1) * 28.33);
    const green = Math.min(255, (score - 1) * 28.33);
    return `rgb(${Math.round(red)}, ${Math.round(green)}, 0)`;
  };

  const getAttributeScoreColor = (score: number) => {
    // Scale from 0-100 to red-green gradient
    const red = Math.max(0, 255 - score * 2.55);
    const green = Math.min(255, score * 2.55);
    return `rgb(${Math.round(red)}, ${Math.round(green)}, 0)`;
  };

  // Group-based color mapping using same colors as PlayerReportModal
  const getAttributeGroupColor = (groupName: string) => {
    // Define attribute groups and their colors - Professional Teal/Purple/Blue palette
    const groupColors = {
      'PHYSICAL / PSYCHOLOGICAL': '#009FB7', // Light blue - calm, balanced
      'ATTACKING': '#9370DB', // Purple - energetic, forward-thinking
      'DEFENDING': '#7FC8F8', // Light blue - strong, protective
    };

    // Map common group names to our color categories
    const normalizedName = groupName.toUpperCase();
    if (normalizedName.includes('PHYSICAL') || normalizedName.includes('MENTAL') || normalizedName.includes('PSYCHOLOGICAL')) {
      return groupColors['PHYSICAL / PSYCHOLOGICAL'];
    }
    if (normalizedName.includes('ATTACKING') || normalizedName.includes('TECHNICAL') || normalizedName.includes('OFFENSIVE')) {
      return groupColors['ATTACKING'];
    }
    if (normalizedName.includes('DEFENDING') || normalizedName.includes('DEFENSIVE')) {
      return groupColors['DEFENDING'];
    }

    // Default fallback color
    return '#6c757d';
  };

  // Position options from ScoutingAssessmentModal
  const playerPositions = ["GK", "RB", "RWB", "RCB(3)", "RCB(2)", "CCB(3)", "LCB(2)", "LCB(3)", "LWB", "LB", "DM", "CM", "RAM", "AM", "LAM", "RW", "LW", "Target Man CF", "In Behind CF"];

  // Get available positions from scout reports
  const getAvailablePositions = () => {
    if (!profile?.scout_reports) return [];
    const positions = profile.scout_reports
      .map(report => report.position_played)
      .filter(pos => pos && pos.trim() !== '')
      .filter((pos, index, arr) => arr.indexOf(pos) === index);
    return positions;
  };

  // Handle position change like ScoutingAssessmentModal
  const handlePositionChange = async (position: string) => {
    setSelectedPosition(position);
    if (position) {
      try {
        const response = await axiosInstance.get(`/attributes/${position}`);
        setPositionAttributes(response.data);

        // Calculate average scores for this position's attributes
        const positionScores: { [key: string]: number } = {};

        if (attributes && attributes.attribute_groups) {
          // Flatten all attributes from all groups to find matches
          const allAttributes = Object.values(attributes.attribute_groups).flat();

          response.data.forEach((attr: string) => {
            const matchingAttribute = allAttributes.find((a: AttributeData) => a.name === attr);
            positionScores[attr] = matchingAttribute ? matchingAttribute.average_score : 0;
          });
        }

        setPositionAttributeScores(positionScores);
      } catch (error) {
        console.error('Error fetching attributes:', error);
        setPositionAttributes([]);
        setPositionAttributeScores({});
      }
    } else {
      setPositionAttributes([]);
      setPositionAttributeScores({});
    }
  };


  // Helper functions for attribute grouping (copied from PlayerReportModal)
  const getAttributeGroup = (attributeName: string) => {
    const physicalPsychological = [
      'Athleticism & Pace', 'Stamina & Work Rate', 'Strength & Physicality',
      'Size & Physicality', 'Proactive', 'Movement',
      'Communication, Leadership & Organisation', 'Technical Ability'
    ];

    const attacking = [
      'Distribution', 'Attacking Transitions & Impact', 'Crossing',
      'Ball Progression', 'Composure', 'Starting & Building Attacks',
      'Receiving & Ball Carrying', 'Attacking Movement', 'Attacking Creativity',
      'Finishing', 'Ball Carrying', 'Ball Carrying & Attacking 1v1',
      'Final Third Movement', 'Chance Creation', 'Link Play / Ball Retention',
      'Hold-Up Play / Ball Retention', 'Aerial Ability',
      'Distribution - Short / Building Attacks', 'Distribution – Long / Starting Attacks'
    ];

    const defending = [
      'Aerial & Defending The Box', 'Defensive Positioning & Anticipation',
      'Defending In Wide Areas', 'Defensive Transitions & Recovery',
      'Aggressive & Front Footed', 'Defensive Positioning',
      'Anticipation / Sense of Danger', 'Defending The Box',
      'Starting Position', 'Command of The Box', 'Shot Stopping', 'Handling',
      'Defensive Transitions & Impact'
    ];

    if (physicalPsychological.some(attr => attributeName.includes(attr))) {
      return { group: 'PHYSICAL / PSYCHOLOGICAL', order: 1 };
    } else if (attacking.some(attr => attributeName.includes(attr))) {
      return { group: 'ATTACKING', order: 2 };
    } else if (defending.some(attr => attributeName.includes(attr))) {
      return { group: 'DEFENDING', order: 3 };
    }
    return { group: 'PHYSICAL / PSYCHOLOGICAL', order: 1 }; // Default
  };

  const getPositionAttributeGroupColor = (attributeName: string) => {
    // Group-based color mapping using exact colors from PlayerReportModal
    const groupColors: { [key: string]: string } = {
      'PHYSICAL / PSYCHOLOGICAL': '#009FB7', // Light blue   - calm, balanced
      'ATTACKING': '#9370DB', // Purple - energetic, forward-thinking
      'DEFENDING': '#7FC8F8', // Brown - strong, protective
    };

    const group = getAttributeGroup(attributeName);
    return groupColors[group.group] || '#009FB7'; // Fallback to default color
  };

  // Function to convert score to level description (from PlayerReportModal)
  const getScoreLevel = (score: number) => {
    if (score === 0) return '0';
    switch (score) {
      case 10: return 'Mid Prem & Above';
      case 9: return 'Bottom Prem';
      case 8: return 'Top Champ';
      case 7: return 'Average Champ';
      case 6: return 'Top L1';
      case 5: return 'Average L1';
      case 4: return 'Top L2';
      case 3: return 'Average L2';
      case 2: return 'National League';
      case 1: return 'Step 2 & Below';
      default: return score.toString();
    }
  };

  // Get polar area chart data using exact logic from PlayerReportModal
  const getPolarAreaChartData = (position: string) => {
    if (!positionAttributes.length || !positionAttributeScores) return null;

    // Sort attributes by group like PlayerReportModal
    const sortedAttributes = positionAttributes
      .map(attr => [attr, positionAttributeScores[attr] || 0])
      .sort(([a], [b]) => {
        const groupA = getAttributeGroup(a as string);
        const groupB = getAttributeGroup(b as string);
        // First sort by group order, then alphabetically within group
        if (groupA.order !== groupB.order) {
          return groupA.order - groupB.order;
        }
        return (a as string).localeCompare(b as string);
      });

    const chartLabels = sortedAttributes.map(([label]) => label as string);
    const chartData = sortedAttributes.map(([, value]) => {
      // Give zero-scored attributes a large value (10) so they appear as prominent grey segments
      return (value as number) === 0 ? 10 : value;
    });

    // Keep track of actual values for tooltip display
    const actualValues = sortedAttributes.map(([, value]) => value as number);

    const sortedColors = sortedAttributes.map(([attributeName, value]) =>
      (value as number) === 0 ? 'rgba(224, 224, 224, 0.5)' : getPositionAttributeGroupColor(attributeName as string)
    );

    const sortedBorderColors = sortedColors.map(color => {
      // Keep light grey for zero attributes, darken others
      if (color.includes('rgba(224, 224, 224')) {
        return 'rgba(192, 192, 192, 0.5)'; // Slightly darker grey for border with transparency
      }
      // Simple darkening: convert hex to RGB, reduce values, convert back to hex
      let r = parseInt(color.slice(1, 3), 16);
      let g = parseInt(color.slice(3, 5), 16);
      let b = parseInt(color.slice(5, 7), 16);
      r = Math.max(0, r - 40);
      g = Math.max(0, g - 40);
      b = Math.max(0, b - 40);
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    });

    return {
      labels: chartLabels,
      datasets: [{
        label: 'Attribute Score',
        data: chartData,
        backgroundColor: sortedColors,
        borderColor: sortedBorderColors,
        borderWidth: 2,
      }],
      actualValues // Store actual values for tooltips
    };
  };

  // Calculate average performance score from scout reports
  const calculateAveragePerformanceScore = () => {
    if (!profile?.scout_reports || profile.scout_reports.length === 0) {
      return null;
    }

    const reportsWithScores = profile.scout_reports.filter(report => report.performance_score && report.performance_score > 0);
    if (reportsWithScores.length === 0) {
      return null;
    }

    const total = reportsWithScores.reduce((sum, report) => sum + report.performance_score, 0);
    return Math.round((total / reportsWithScores.length) * 10) / 10; // Round to 1 decimal place
  };

  useEffect(() => {
    if (actualPlayerId) {
      fetchPlayerProfile();
      fetchPlayerAttributes();
      fetchScoutReports();
    }
  }, [actualPlayerId]);

  // Update available positions when profile changes
  useEffect(() => {
    if (profile) {
      const positions = getAvailablePositions();
      setAvailablePositions(positions);
      if (positions.length > 0 && !selectedPosition) {
        setSelectedPosition(positions[0]); // Default to first position
      }
    }
  }, [profile]);

  const fetchPlayerProfile = async () => {
    if (!actualPlayerId) {
      setError('No player ID provided');
      setLoading(false);
      return;
    }

    try {
      const response = await axiosInstance.get(`/players/${actualPlayerId}/profile`);
      setProfile(response.data);
    } catch (error: any) {
      console.error('Error fetching player profile:', error);
      setError('Failed to load player profile');
    } finally {
      setLoading(false);
    }
  };

  const fetchPlayerAttributes = async () => {
    if (!actualPlayerId) {
      setAttributesLoading(false);
      return;
    }

    try {
      const response = await axiosInstance.get(`/players/${actualPlayerId}/attributes`);
      setAttributes(response.data);
    } catch (error: any) {
      console.error('Error fetching player attributes:', error);
      // Don't set main error - attributes are optional
    } finally {
      setAttributesLoading(false);
    }
  };

  const fetchScoutReports = async () => {
    if (!actualPlayerId) {
      setScoutReportsLoading(false);
      return;
    }

    try {
      const response = await axiosInstance.get(`/players/${actualPlayerId}/scout-reports`);
      setScoutReportsData(response.data);
    } catch (error: any) {
      console.error('Error fetching scout reports:', error);
      // Don't set main error - scout reports are optional
    } finally {
      setScoutReportsLoading(false);
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
      
      fetchPlayerProfile();
    } catch (error) {
      console.error('Error adding note:', error);
    } finally {
      setAddingNote(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-content">
          <Spinner animation="border" size="sm" />
          <span>Loading player profile...</span>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <Container className="mt-5">
        <div className="error-container">
          <Alert variant="danger" className="clean-alert">
            <h5>⚠️ {error || 'Player not found'}</h5>
            <Button variant="outline-dark" size="sm" onClick={() => navigate(-1)}>
              ← Go Back
            </Button>
          </Alert>
        </div>
      </Container>
    );
  }

  return (
    <div className="player-profile-page">
      <Container fluid className="px-4">
        {/* Clean Header */}
        <div className="profile-header">
          <div className="header-content">
            <div className="player-info">
              <div className="player-name-section">
                <div className="player-name-line">
                  <span className="player-firstname">{profile.first_name}</span>
                </div>
                <h1 className="player-lastname">{profile.last_name}</h1>
                <div className="player-meta">
                  <span className="club-name">{profile.squad_name}</span>
                  <span className="position-age">{profile.position} | Age: {profile.age} | Born: {profile.birth_date ? new Date(profile.birth_date).toLocaleDateString() : 'N/A'}</span>
                </div>
                {(() => {
                  const avgScore = calculateAveragePerformanceScore();
                  return avgScore && (
                    <div className="average-performance-score mt-2">
                      <span className="score-label">Average Performance Score:</span>
                      <span
                        className="badge score-badge ms-2"
                        style={{
                          backgroundColor: getPerformanceScoreColor(avgScore),
                          color: 'white',
                          fontWeight: 'bold',
                          fontSize: '1rem',
                          padding: '0.4rem 0.8rem'
                        }}
                      >
                        {avgScore}/10
                      </span>
                    </div>
                  );
                })()}
              </div>
            </div>
            
            <div className="header-actions">
              <Button 
                variant="outline-secondary" 
                size="sm" 
                className="clean-btn"
                onClick={() => navigate(-1)}
              >
                ← Back
              </Button>
            </div>
          </div>
        </div>

        {/* Horizontal Scout Reports Timeline */}
        <div className="horizontal-timeline-section mt-4 mb-4">
          <h4 className="section-title">📅 Recent Scouting History</h4>
          
          {scoutReportsLoading ? (
            <div className="text-center py-3">
              <Spinner animation="border" size="sm" className="me-2" />
              Loading scout reports...
            </div>
          ) : scoutReportsData && scoutReportsData.reports.length > 0 ? (
            <>
              {/* Summary Stats */}
              <div className="timeline-summary-compact mb-3">
                <span className="summary-stat">
                  <strong>{scoutReportsData.total_reports}</strong> reports
                </span>
                <span className="summary-stat">
                  <strong>{scoutReportsData.reports.filter(r => r.overall_rating && r.overall_rating >= 7).length}</strong> high ratings (7+)
                </span>
                <span className="summary-stat">
                  <strong>{new Set(scoutReportsData.reports.map(r => r.scout_name)).size}</strong> different scouts
                </span>
              </div>

              {/* Horizontal Timeline */}
              <div className="horizontal-timeline">
                <div className="timeline-track">
                  {scoutReportsData.reports.slice(0, 4).map((report, index) => (
                    <div key={report.report_id} className="timeline-card">
                      <div className="timeline-card-header">
                        <div className="timeline-card-date">
                          {new Date(report.report_date).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short'
                          })}
                        </div>
                        {report.overall_rating && (
                          <span className="badge timeline-rating" style={{ backgroundColor: getPerformanceScoreColor(report.overall_rating), color: 'white', fontWeight: 'bold' }}>
                            {report.overall_rating}
                          </span>
                        )}
                      </div>
                      
                      <div className="timeline-card-body">
                        <div className="timeline-card-type">
                          <span className="badge badge-neutral-grey type-badge">
                            {report.report_type || 'Scout Report'}
                          </span>
                        </div>
                        
                        <div className="timeline-card-fixture">
                          {report.fixture ? (
                            <>
                              <small className="fixture-text">{report.fixture}</small>
                              {report.fixture_date && (
                                <small className="fixture-date">
                                  {new Date(report.fixture_date).toLocaleDateString('en-GB')}
                                </small>
                              )}
                            </>
                          ) : (
                            <small className="no-fixture">No fixture info</small>
                          )}
                        </div>
                        
                        <div className="timeline-card-scout">
                          by {report.scout_name}
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant="outline-primary"
                        className="timeline-card-btn"
                        onClick={() => handleOpenReportModal(report.report_id)}
                        disabled={loadingReportId === report.report_id}
                      >
                        {loadingReportId === report.report_id ? 
                          <Spinner animation="border" size="sm" /> : 
                          'View'
                        }
                      </Button>
                      
                      {/* Connector line to next card */}
                      {index < Math.min(scoutReportsData.reports.length - 1, 3) && (
                        <div className="timeline-connector"></div>
                      )}
                    </div>
                  ))}
                </div>
                
                {scoutReportsData.reports.length > 4 && (
                  <div className="timeline-more">
                    <small className="text-muted">
                      +{scoutReportsData.reports.length - 4} more reports in tabs below
                    </small>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="empty-state-compact">
              <p>No scout reports available yet.</p>
            </div>
          )}
        </div>

        {/* Compact Attributes Section */}
        {attributesLoading ? (
          <div className="attributes-loading mt-3 mb-2">
            <div className="loading-content-compact">
              <Spinner animation="border" size="sm" />
              <span>Loading attributes...</span>
            </div>
          </div>
        ) : attributes && attributes.total_attributes > 0 ? (
          <div className="attributes-section-compact mt-3 mb-3">
            {/* Compact Legend */}
            <div className="attributes-legend-compact mb-2">
              <h4 className="legend-title-compact">📊 Player Attributes</h4>
              <p className="legend-text-compact">
                <span className="dot-compact filled"></span> = Average from {attributes.total_reports} report{attributes.total_reports !== 1 ? 's' : ''} | {attributes.total_attributes} attributes assessed
              </p>
            </div>

            {/* Compact Attribute Data */}
            <Row>
              {Object.entries(attributes.attribute_groups).map(([groupName, groupAttributes]) => {
                // Get emoji for group
                const groupEmojis: { [key: string]: string } = {
                  'Physical': '💪',
                  'Technical': '⚽',
                  'Mental': '🧠',
                  'Defensive': '🛡️',
                  'Attacking': '⚡',
                  'Other': '📊'
                };
                
                return (
                  <Col lg={4} md={6} key={groupName}>
                    <div className="attribute-section-compact mb-3" style={{
                      borderLeft: `6px solid ${getAttributeGroupColor(groupName)}`,
                      backgroundColor: `${getAttributeGroupColor(groupName)}15`,
                      border: `1px solid ${getAttributeGroupColor(groupName)}40`,
                      borderRadius: '8px',
                      padding: '12px'
                    }}>
                      <h5 className="section-title-compact" style={{
                        color: getAttributeGroupColor(groupName),
                        fontWeight: 'bold',
                        textShadow: '1px 1px 2px rgba(0,0,0,0.1)'
                      }}>
                        {groupEmojis[groupName] || '📊'} {groupName.split(' // ')[0]}
                      </h5>
                      <div className="attribute-grid-compact">
                        {groupAttributes.map((attr) => (
                          <div key={attr.name} className="attribute-row-compact">
                            <span className="attribute-name-compact">{attr.name}</span>
                            <div className="dots-compact">
                              {[...Array(10)].map((_, i) => (
                                <span
                                  key={i}
                                  className={`dot-mini ${i < Math.round(attr.average_score) ? 'filled' : 'empty'}`}
                                ></span>
                              ))}
                              <span className="score-compact">{attr.average_score.toFixed(2)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Col>
                );
              })}
            </Row>
          </div>
        ) : (
          <div className="no-attributes-section mt-4 mb-3">
            <div className="no-attributes-content">
              <h4>📊 Player Attributes</h4>
              <p>
                {profile.scout_reports.length === 0 
                  ? "No scout reports available yet. Attributes will appear here once scout assessments are submitted."
                  : "No attribute data found in the existing scout reports. Attributes may not have been assessed yet."
                }
              </p>
            </div>
          </div>
        )}

        {/* Position-Filterable Radar Charts */}
        <div className="radar-charts-section mt-4 mb-4">
          <div className="radar-header mb-3">
            <h4>📊 Position Analysis</h4>
            <div className="d-flex align-items-center gap-3">
              <Form.Select
                value={selectedPosition}
                onChange={(e) => handlePositionChange(e.target.value)}
                style={{ width: '200px' }}
              >
                <option value="">Select Position</option>
                {playerPositions.map(pos => (
                  <option key={pos} value={pos}>{pos}</option>
                ))}
              </Form.Select>
              <small className="text-muted">
                Available positions: {availablePositions.length > 0 ? availablePositions.join(', ') : 'Using default positions'}
              </small>
            </div>
          </div>

            {selectedPosition && (() => {
              const chartData = getPolarAreaChartData(selectedPosition);
              if (!chartData || !chartData.labels.length) {
                return (
                  <div className="text-center py-4">
                    <p className="text-muted">No attribute data available for {selectedPosition} position.</p>
                  </div>
                );
              }

              // Exact polar area chart options from PlayerReportModal
              const polarAreaChartOptions: any = {
                responsive: true,
                maintainAspectRatio: false,
                // Configure for better label alignment
                rotation: 0, // Start at 3 o'clock position
                circumference: 360, // Full circle
                scales: {
                  r: {
                    display: true,
                    min: 0,
                    max: 10,
                    ticks: {
                      display: true, // Show the radial axis numbers
                      stepSize: 2,
                      font: {
                        size: 10
                      }
                    },
                    grid: {
                      display: true, // Show the grid lines
                    },
                    angleLines: {
                      display: true, // Show the angle lines radiating from center
                    },
                    pointLabels: {
                      display: true,
                      font: {
                        size: 12, // Larger font for better readability
                        weight: 'bold'
                      },
                      color: '#212529',
                      padding: 15, // Reduced padding for compact A4 layout
                      centerPointLabels: true, // Center labels on their segments
                      callback: function(value: any, index: number) {
                        // Handle line wrapping for long labels
                        if (Array.isArray(chartData.labels[index])) {
                          return chartData.labels[index];
                        }
                        // Split long labels that are still strings
                        if (typeof chartData.labels[index] === 'string' && chartData.labels[index].length > 12) {
                          const label = chartData.labels[index] as string;
                          const words = label.split(' ');
                          if (words.length > 2) {
                            const midPoint = Math.ceil(words.length / 2);
                            return [
                              words.slice(0, midPoint).join(' '),
                              words.slice(midPoint).join(' ')
                            ];
                          } else if (words.length === 2) {
                            return words; // Return each word on separate line
                          }
                        }
                        return chartData.labels[index];
                      }
                    }
                  },
                },
                plugins: {
                  legend: {
                    position: 'bottom',
                    labels: {
                      generateLabels: () => {
                        return [
                          {
                            text: 'Physical/Psychological',
                            fillStyle: '#009FB7',
                            strokeStyle: '#009FB7',
                            lineWidth: 2,
                          },
                          {
                            text: 'Attacking',
                            fillStyle: '#9370DB',
                            strokeStyle: '#9370DB',
                            lineWidth: 2,
                          },
                          {
                            text: 'Defending',
                            fillStyle: '#7FC8F8',
                            strokeStyle: '#7FC8F8',
                            lineWidth: 2,
                          },
                          {
                            text: 'Attribute not scored',
                            fillStyle: 'rgba(224, 224, 224, 0.5)',
                            strokeStyle: 'rgba(192, 192, 192, 0.8)',
                            lineWidth: 2,
                          }
                        ];
                      }
                    }
                  },
                  datalabels: {
                    color: '#ffffff',
                    font: {
                      weight: 'bold',
                      size: 12,
                    },
                    formatter: (value: any, context: any) => {
                      // Show actual score (0) for zero-scored attributes, not display value (10)
                      const actualValue = chartData.actualValues[context.dataIndex];
                      return actualValue === 0 ? 'N/A' : actualValue;
                    },
                  },
                  tooltip: {
                    callbacks: {
                      label: (context: any) => {
                        // Show actual score (0) for zero-scored attributes, not display value (10)
                        const actualValue = chartData.actualValues[context.dataIndex];
                        const levelDescription = getScoreLevel(actualValue);
                        return actualValue === 0 ? 'N/A' : `${actualValue}: ${levelDescription}`;
                      }
                    }
                  }
                },
              };

              return (
                <Row>
                  <Col lg={9}>
                    <div style={{ height: '700px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: '680px', height: '680px' }}>
                        <PolarArea data={chartData} options={polarAreaChartOptions} />
                      </div>
                    </div>
                  </Col>
                  <Col lg={3} className="d-flex flex-column">
                    <Card className="shadow-sm flex-fill" style={{ borderRadius: '12px' }}>
                      <Card.Header style={{ backgroundColor: '#f8f9fa', color: '#495057' }}>
                        <h6 className="mb-0">📋 Attribute Breakdown</h6>
                      </Card.Header>
                      <Card.Body>
                        <div className="attribute-breakdown">
                          {chartData.labels.map((label, index) => (
                            <div key={label} className="attribute-breakdown-item mb-2">
                              <div className="d-flex justify-content-between align-items-center">
                                <span className="attribute-name" style={{ fontSize: '0.85rem' }}>{label}</span>
                                <span
                                  className="badge"
                                  style={{
                                    backgroundColor: chartData.datasets[0].backgroundColor[index],
                                    color: 'white',
                                    fontWeight: 'bold',
                                    fontSize: '0.75rem',
                                    border: `2px solid ${chartData.datasets[0].borderColor[index]}`
                                  }}
                                >
                                  {chartData.actualValues[index] === 0 ? 'N/A' : `${chartData.actualValues[index].toFixed(2)}/10`}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>
              );
            })()}
          </div>

      </Container>

      {/* Add Note Modal */}
      <Modal show={showAddNoteModal} onHide={() => setShowAddNoteModal(false)} className="clean-modal">
        <Modal.Header closeButton>
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
                className="clean-textarea"
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
          <Button variant="outline-secondary" onClick={() => setShowAddNoteModal(false)}>
            Cancel
          </Button>
          <Button 
            variant="dark" 
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
        .player-profile-page {
          min-height: 100vh;
          background: #fafafa;
          padding: 1rem 0;
        }

        .loading-container {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 50vh;
        }

        .loading-content {
          display: flex;
          align-items: center;
          gap: 1rem;
          color: #666;
          font-size: 0.95rem;
        }

        .error-container {
          display: flex;
          justify-content: center;
          padding: 2rem;
        }

        .clean-alert {
          border: none;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          text-align: center;
          max-width: 400px;
        }

        .profile-header {
          background: white;
          border-radius: 16px;
          padding: 2rem 2rem 1.5rem;
          box-shadow: 0 2px 12px rgba(0,0,0,0.08);
          margin-bottom: 1.5rem;
        }

        .header-content {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .player-info {
          flex: 1;
        }

        .player-name-section {
          max-width: 600px;
        }

        .player-firstname {
          font-size: 1.1rem;
          color: #888;
          font-weight: 400;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .player-lastname {
          font-size: 2.8rem;
          font-weight: 700;
          color: #222;
          margin: -0.2rem 0 0.8rem 0;
          line-height: 1;
        }

        .player-meta {
          display: flex;
          align-items: center;
          gap: 1rem;
          color: #666;
          font-size: 0.95rem;
        }

        .club-badge {
          font-size: 1.2rem;
        }

        .club-name {
          font-weight: 500;
          color: #333;
        }

        .position-age {
          color: #888;
        }

        .header-actions {
          display: flex;
          gap: 1rem;
        }

        .clean-btn {
          border: 1px solid #ddd;
          background: white;
          color: #666;
          border-radius: 8px;
          font-size: 0.9rem;
          padding: 0.5rem 1rem;
        }

        .clean-btn:hover {
          background: #f8f9fa;
          border-color: #bbb;
          color: #333;
        }

        .attributes-legend {
          background: #f8f9fa;
          border-radius: 12px;
          padding: 1rem 1.5rem;
          border-left: 4px solid #22c55e;
        }

        .legend-title {
          font-size: 1.1rem;
          font-weight: 600;
          color: #333;
          margin: 0 0 0.5rem 0;
        }

        .legend-text {
          font-size: 0.85rem;
          color: #666;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .attributes-loading {
          display: flex;
          justify-content: center;
          padding: 2rem;
        }

        .no-attributes-section {
          background: white;
          border-radius: 16px;
          padding: 2rem;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
          margin-bottom: 1.5rem;
          border: 2px dashed #e0e0e0;
          text-align: center;
        }

        .no-attributes-content h4 {
          color: #333;
          font-weight: 600;
          margin-bottom: 1rem;
        }

        .no-attributes-content p {
          color: #666;
          margin-bottom: 0;
          line-height: 1.6;
        }

        .attribute-section {
          background: white;
          border-radius: 16px;
          padding: 1.5rem;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
          margin-bottom: 1.5rem;
        }

        .section-title {
          font-size: 1.1rem;
          font-weight: 600;
          color: #333;
          margin-bottom: 1rem;
          border-bottom: 2px solid #f0f0f0;
          padding-bottom: 0.4rem;
        }

        .attribute-grid {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }

        .dot-rating-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.2rem 0;
        }

        .attribute-label {
          font-weight: 500;
          color: #333;
          min-width: 150px;
          font-size: 0.9rem;
        }

        .dots-and-score {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .dots-container {
          display: flex;
          gap: 3px;
        }

        .score-text {
          font-size: 0.8rem;
          color: #666;
          font-weight: 500;
          min-width: 35px;
        }

        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          border: 1px solid #ddd;
        }

        .dot.filled {
          background: #22c55e;
          border-color: #22c55e;
        }

        .dot.empty {
          background: white;
          border-color: #ddd;
        }


        .tabs-section {
          background: white;
          border-radius: 16px;
          padding: 0.5rem;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }

        .clean-tabs .nav-link {
          background: transparent;
          border: none;
          color: #666;
          font-weight: 500;
          padding: 1rem 2rem;
          border-radius: 12px;
          margin: 0 0.25rem;
        }

        .clean-tabs .nav-link.active {
          background: #f8f9fa;
          color: #333;
          border: 1px solid #e9ecef;
        }

        .tab-content-wrapper {
          padding: 1.5rem;
        }

        .report-section {
          margin-bottom: 2rem;
        }

        .report-title {
          font-size: 1.2rem;
          font-weight: 600;
          color: #333;
          margin-bottom: 1.5rem;
        }

        .empty-state {
          text-align: center;
          color: #888;
          padding: 2rem;
          background: #f8f9fa;
          border-radius: 12px;
          font-style: italic;
        }

        .report-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .report-card {
          background: #fafafa;
          border-radius: 12px;
          padding: 1.5rem;
          border: 1px solid #f0f0f0;
        }

        .report-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1rem;
        }

        .report-badges {
          display: flex;
          gap: 0.5rem;
        }

        .clean-badge {
          font-size: 0.75rem;
          border-radius: 6px;
          padding: 0.25rem 0.5rem;
        }

        .report-date {
          font-size: 0.8rem;
          color: #888;
        }

        .report-summary {
          color: #555;
          font-size: 0.9rem;
          line-height: 1.5;
          margin-bottom: 1rem;
        }

        .report-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .report-scout {
          font-size: 0.8rem;
          color: #888;
        }

        .report-scores {
          display: flex;
          gap: 0.5rem;
        }

        .score-badge {
          font-size: 0.7rem;
          border-radius: 6px;
        }

        .view-report-btn {
          font-size: 0.8rem;
          border-radius: 8px;
          padding: 0.4rem 1rem;
        }

        .contact-org {
          display: block;
          font-size: 0.8rem;
          color: #888;
          font-weight: normal;
        }

        .transfer-fee {
          font-size: 0.8rem;
          color: #666;
          font-weight: 500;
        }

        .data-table {
          background: #fafafa;
          border-radius: 12px;
          padding: 2rem;
        }

        .clean-table {
          background: white;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .clean-table th {
          background: #f8f9fa;
          color: #666;
          font-weight: 600;
          border: none;
          font-size: 0.85rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding: 1rem 0.75rem;
        }

        .clean-table td {
          border: none;
          border-bottom: 1px solid #f0f0f0;
          padding: 1rem 0.75rem;
          font-size: 0.9rem;
        }

        .summary-cell {
          max-width: 250px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .table-action-btn {
          font-size: 0.8rem;
          border-radius: 6px;
          padding: 0.25rem 0.75rem;
        }

        .notes-section {
          background: #fafafa;
          border-radius: 12px;
          padding: 2rem;
        }

        .notes-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
        }

        .add-note-btn {
          border-radius: 8px;
          font-size: 0.85rem;
          padding: 0.5rem 1rem;
        }

        .notes-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .note-card {
          background: white;
          border-radius: 10px;
          padding: 1.5rem;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .note-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1rem;
        }

        .note-author {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .private-badge {
          font-size: 0.7rem;
          border-radius: 4px;
        }

        .note-date {
          font-size: 0.8rem;
          color: #888;
        }

        .note-content {
          color: #555;
          font-size: 0.9rem;
          line-height: 1.6;
          margin: 0;
        }

        .clean-modal .modal-content {
          border: none;
          border-radius: 16px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.15);
        }

        .clean-modal .modal-header {
          border-bottom: 1px solid #f0f0f0;
          padding: 1.5rem 2rem 1rem;
        }

        .clean-modal .modal-body {
          padding: 2rem;
        }

        .clean-modal .modal-footer {
          border-top: 1px solid #f0f0f0;
          padding: 1rem 2rem 1.5rem;
        }

        .clean-textarea {
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          font-size: 0.9rem;
        }

        .clean-textarea:focus {
          border-color: #666;
          box-shadow: 0 0 0 2px rgba(102,102,102,0.1);
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

        @media (max-width: 768px) {
          .player-lastname {
            font-size: 2.5rem;
          }
          
          .attribute-label, .bar-label {
            min-width: 120px;
            font-size: 0.85rem;
          }
          
          .profile-header {
            padding: 2rem 1.5rem 1.5rem;
          }
          
          .header-content {
            flex-direction: column;
            gap: 1rem;
          }
          
          .clean-tabs .nav-link {
            padding: 0.75rem 1rem;
          }
        }
      `}</style>
    </div>
  );
};

export default PlayerProfilePage;