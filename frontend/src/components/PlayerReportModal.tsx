import React from 'react';
import { Modal, Row, Col, Badge, Card, Button } from 'react-bootstrap';
import { PolarArea } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';

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

interface PlayerReportModalProps {
  show: boolean;
  onHide: () => void;
  report: any; // A more specific type should be used here
}

const PlayerReportModal: React.FC<PlayerReportModalProps> = ({ show, onHide, report }) => {
  if (!report) {
    return null;
  }

  // Group-based color mapping using Red, Blue, Orange palette
  const getAttributeGroupColor = (attributeName: string) => {
    // Define attribute groups and their colors - Professional Teal/Coral/Purple palette
    const groupColors = {
      'PHYSICAL / PSYCHOLOGICAL': '#20B2AA', // Teal - calm, balanced
      'ATTACKING': '#FF7F7F', // Coral - energetic, forward-thinking  
      'DEFENDING': '#9370DB', // Purple - strong, protective
    };
    
    // Map attributes to groups (this would ideally come from backend)
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
      return groupColors['PHYSICAL / PSYCHOLOGICAL'];
    } else if (attacking.some(attr => attributeName.includes(attr))) {
      return groupColors['ATTACKING'];
    } else if (defending.some(attr => attributeName.includes(attr))) {
      return groupColors['DEFENDING'];
    }
    
    // Default to orange if no match
    return groupColors['PHYSICAL / PSYCHOLOGICAL'];
  };

  // Colors are now generated in the sorted section above

  // Sort data by attribute group for logical ordering
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

  const sortedAttributes = Object.entries(report.individual_attribute_scores)
    .filter(([, value]) => (value as number) > 0) // Filter out 0 scores from polar chart
    .sort(([a], [b]) => {
      const groupA = getAttributeGroup(a);
      const groupB = getAttributeGroup(b);
      // First sort by group order, then alphabetically within group
      if (groupA.order !== groupB.order) {
        return groupA.order - groupB.order;
      }
      return a.localeCompare(b);
    });
  
  const chartLabels = sortedAttributes.map(([label]) => label);
  const chartData = sortedAttributes.map(([, value]) => value);
  const sortedColors = sortedAttributes.map(([attributeName]) => getAttributeGroupColor(attributeName));
  
  const sortedBorderColors = sortedColors.map(color => {
    // Simple darkening: convert hex to RGB, reduce values, convert back to hex
    let r = parseInt(color.slice(1, 3), 16);
    let g = parseInt(color.slice(3, 5), 16);
    let b = parseInt(color.slice(5, 7), 16);
    r = Math.max(0, r - 40);
    g = Math.max(0, g - 40);
    b = Math.max(0, b - 40);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  });

  const polarAreaChartData = {
    labels: chartLabels,
    datasets: [
      {
        label: 'Attribute Score',
        data: chartData,
        backgroundColor: sortedColors,
        borderColor: sortedBorderColors,
        borderWidth: 2,
      },
    ],
  };

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
            size: 9, // Even smaller font for better fit
            weight: 'bold'
          },
          color: '#212529',
          padding: 20, // More padding for better positioning
          centerPointLabels: true, // Center labels on their segments
          callback: function(value: any, index: number) {
            // Handle line wrapping for long labels
            if (Array.isArray(chartLabels[index])) {
              return chartLabels[index];
            }
            // Split long labels that are still strings
            if (typeof chartLabels[index] === 'string' && chartLabels[index].length > 12) {
              const label = chartLabels[index] as string;
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
            return chartLabels[index];
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
                fillStyle: '#20B2AA',
                strokeStyle: '#189a96',
                lineWidth: 2,
              },
              {
                text: 'Attacking', 
                fillStyle: '#FF7F7F',
                strokeStyle: '#e66666',
                lineWidth: 2,
              },
              {
                text: 'Defending',
                fillStyle: '#9370DB',
                strokeStyle: '#7b5cb8',
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
        formatter: (value: any) => {
          return value;
        },
      },
    },
  };

  // Red to green color scale for performance scores (1-10, with 6+ being green)
  const getPerformanceScoreColor = (score: number) => {
    if (score >= 6) return '#28a745'; // Green for 6+
    if (score >= 4) return '#ffc107'; // Yellow for 4-5
    return '#dc3545'; // Red for 1-3
  };

  const getPerformanceScoreVariant = (score: number) => {
    if (score === 10) return 'gold';
    if (score === 9) return 'silver';  
    if (score >= 7) return 'success'; // 7-8 green
    if (score >= 3) return 'warning'; // 3-6 amber
    return 'danger'; // 1-3 red
  };

  // Red to green color scale for attribute scores (total out of 100, with 60+ being green)
  const getAttributeScoreColor = (score: number) => {
    if (score >= 60) return '#28a745'; // Green for 60+
    if (score >= 40) return '#ffc107'; // Yellow for 40-59
    return '#dc3545'; // Red for below 40
  };

  const getAttributeScoreVariant = (score: number) => {
    if (score === 100) return 'gold';
    if (score >= 90) return 'silver';
    if (score >= 70) return 'success';
    if (score >= 40) return 'warning';
    return 'danger';
  };

  const getReportTypeInfo = () => {
    const reportType = report.report_type || 'Player Assessment';
    switch (reportType.toLowerCase()) {
      case 'player assessment':
      case 'player_assessment':
        return { color: 'dark', icon: '⚽', title: 'Player Assessment Report' };
      case 'flag assessment':
      case 'flag_assessment':
        return { color: 'warning', icon: '🚩', title: 'Flag Assessment Report' };
      case 'clips assessment':
      case 'clip assessment':
      case 'clips_assessment':
        return { color: 'secondary', icon: '🎬', title: 'Clips Assessment Report' };
      default:
        return { color: 'dark', icon: '⚽', title: 'Scouting Report' };
    }
  };

  const reportInfo = getReportTypeInfo();
  
  // Function to get flag badge CSS class based on flag category
  const getFlagBadgeClass = (flagCategory: string) => {
    switch (flagCategory?.toLowerCase()) {
      case 'positive':
        return 'flag-positive';
      case 'neutral':
        return 'flag-neutral';
      case 'negative':
        return 'flag-negative';
      default:
        return 'flag-default';
    }
  };
  
  // Check if this is a flag report for simplified layout
  const isFlagReport = report.report_type?.toLowerCase() === 'flag' || report.report_type?.toLowerCase() === 'flag assessment';

  return (
    <Modal show={show} onHide={onHide} size="xl" centered>
      <Modal.Header closeButton style={{ backgroundColor: '#000000', color: 'white' }} className="modal-header-dark">
        <Modal.Title>{reportInfo.icon} {report.player_name} - {reportInfo.title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {isFlagReport ? (
          /* Simplified Flag Report Layout */
          <>
            {/* Report Overview */}
            <Card className="mb-4">
              <Card.Header className="bg-light">
                <div className="d-flex justify-content-between align-items-center">
                  <h5 className="mb-0">📊 Report Overview</h5>
                  <Badge className={getFlagBadgeClass(report.flag_category)}>
                    🚩 {report.flag_category || 'Flag'}
                  </Badge>
                </div>
              </Card.Header>
              <Card.Body>
                <Row>
                  <Col md={6}>
                    <p><strong>Player:</strong> {report.player_name}</p>
                    <p><strong>Date Submitted:</strong> {new Date(report.created_at).toLocaleDateString()}</p>
                    <p><strong>Scout:</strong> {report.scout_name}</p>
                  </Col>
                  <Col md={6}>
                    <p><strong>Fixture:</strong> {report.home_squad_name} vs {report.away_squad_name}</p>
                    <p><strong>Date:</strong> {new Date(report.fixture_date).toLocaleDateString()}</p>
                    <p><strong>Flag Type:</strong> 
                      <Badge className={`ms-2 ${getFlagBadgeClass(report.flag_category)}`}>
                        {report.flag_category || 'Not specified'}
                      </Badge>
                    </p>
                  </Col>
                </Row>
              </Card.Body>
            </Card>

            {/* Summary Notes */}
            <Card className="mb-4">
              <Card.Header className="bg-light text-dark">
                <h6 className="mb-0">📝 Summary Notes</h6>
              </Card.Header>
              <Card.Body>
                <div className="border-start border-secondary border-4 ps-3">
                  <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>
                    {report.summary || 'No summary provided'}
                  </p>
                </div>
              </Card.Body>
            </Card>

            {/* Justification if available */}
            {report.justification && (
              <Card className="mb-4">
                <Card.Header className="bg-light text-dark">
                  <h6 className="mb-0">💭 Additional Details</h6>
                </Card.Header>
                <Card.Body>
                  <div className="border-start border-secondary border-4 ps-3">
                    <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>
                      {report.justification}
                    </p>
                  </div>
                </Card.Body>
              </Card>
            )}
          </>
        ) : (
          /* Full Player Assessment Report Layout */
          <>
            {/* Report Overview - Full Width Row */}
            <Row className="mb-4">
              <Col md={12}>
                <Card>
                  <Card.Header>
                    <div className="d-flex justify-content-between align-items-center">
                      <h5 className="mb-0">📊 Report Overview</h5>
                      <div>
                        <Badge bg={reportInfo.color} className="me-2">{report.report_type || 'Player Assessment'}</Badge>
                        {report.scouting_type && <Badge bg="secondary">{report.scouting_type}</Badge>}
                      </div>
                    </div>
                  </Card.Header>
                  <Card.Body>
                    <Row>
                      <Col md={6}>
                        <p><strong>Player:</strong> {report.player_name}</p>
                        <p><strong>Position:</strong> {report.position_played || 'Not specified'} &nbsp;&nbsp;&nbsp;<strong>Formation:</strong> {report.formation || 'Not specified'}</p>
                        <p><strong>Build:</strong> {report.build} &nbsp;&nbsp;&nbsp;<strong>Height:</strong> {report.height}</p>
                      </Col>
                      <Col md={6}>
                        <p><strong>Fixture:</strong> {report.home_squad_name} vs {report.away_squad_name}</p>
                        <p><strong>Date:</strong> {new Date(report.fixture_date).toLocaleDateString()}</p>
                        <p><strong>Scout:</strong> {report.scout_name}</p>
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>
              </Col>
            </Row>

            {/* Performance Metrics and Strengths/Weaknesses Row */}
            <Row className="mb-4">
              <Col md={6}>
                <Card className="h-100">
                  <Card.Header>
                    <h5 className="mb-0">🏆 Performance Metrics</h5>
                  </Card.Header>
                  <Card.Body>
                    <div className="text-center">
                      <Row>
                        <Col xs={4}>
                          <div className="border-end">
                            <h4 className="mb-1">
                              <Badge bg={getPerformanceScoreVariant(report.average_attribute_score)} className="performance-badge">
                                {report.average_attribute_score}
                              </Badge>
                            </h4>
                            <small className="text-muted">Average Score</small>
                          </div>
                        </Col>
                        <Col xs={4}>
                          <div className="border-end">
                            <h4 className="mb-1">
                              <Badge bg={getAttributeScoreVariant(report.total_attribute_score)} className="performance-badge">
                                {report.total_attribute_score}
                              </Badge>
                            </h4>
                            <small className="text-muted">Total Score</small>
                          </div>
                        </Col>
                        <Col xs={4}>
                          <div>
                            <h4 className="mb-1">
                              <Badge bg={getPerformanceScoreVariant(report.performance_score)} className="performance-badge">
                                {report.performance_score}
                              </Badge>
                            </h4>
                            <small className="text-muted">Performance</small>
                          </div>
                        </Col>
                      </Row>
                    </div>
                  </Card.Body>
                </Card>
              </Col>
              <Col md={6}>
                {/* Strengths & Weaknesses */}
                <Card className="h-100">
                  <Card.Header>
                    <h6 className="mb-0">💪 Strengths & Areas for Improvement</h6>
                  </Card.Header>
                  <Card.Body>
                    <div className="mb-3">
                      <strong className="text-success">✅ Strengths:</strong>
                      <div className="mt-2">
                        {report.strengths && report.strengths.length > 0 ? (
                          report.strengths.map((strength: string, index: number) => (
                            <Badge key={index} bg="success" className="me-1 mb-1">
                              {strength}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-muted">No strengths specified</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <strong className="text-warning">⚠️ Areas for Improvement:</strong>
                      <div className="mt-2">
                        {report.weaknesses && report.weaknesses.length > 0 ? (
                          report.weaknesses.map((weakness: string, index: number) => (
                            <Badge key={index} bg="warning" className="me-1 mb-1">
                              {weakness}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-muted">No weaknesses specified</span>
                        )}
                      </div>
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            </Row>

            {/* Attribute Analysis and Scout Summary/Justification Row */}
            <Row>
              <Col md={6}>
                {/* Attribute Analysis - Full Column */}
                <Card className="h-100">
                  <Card.Header>
                    <h6 className="mb-0">📈 Attribute Analysis</h6>
                  </Card.Header>
                  <Card.Body style={{ height: '500px', padding: '25px' }}>
                    <PolarArea data={polarAreaChartData} options={polarAreaChartOptions} />
                  </Card.Body>
                </Card>
              </Col>

              <Col md={6}>
                {/* Scout Summary and Justification Combined */}
                <div className="d-flex flex-column h-100">
                  {/* Summary */}
                  <Card className="mb-3 flex-fill">
                    <Card.Header>
                      <h6 className="mb-0">📝 Scout Summary</h6>
                    </Card.Header>
                    <Card.Body>
                      <div className="border-start border-secondary border-4 ps-3">
                        <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>
                          {report.summary}
                        </p>
                      </div>
                    </Card.Body>
                  </Card>

                  {/* Justification */}
                  <Card className="flex-fill">
                    <Card.Header>
                      <h6 className="mb-0">💭 Justification & Rationale</h6>
                    </Card.Header>
                    <Card.Body>
                      <div className="border-start border-secondary border-4 ps-3">
                        <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>
                          {report.justification}
                        </p>
                      </div>
                    </Card.Body>
                  </Card>
                </div>
              </Col>
            </Row>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-dark" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

// Add CSS for white close button, gold/silver badges, and flag colors
const style = document.createElement('style');
style.textContent = `
  .modal-header-dark .btn-close {
    filter: invert(1) grayscale(100%) brightness(200%);
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
`;
if (!document.head.querySelector('style[data-modal-fix]')) {
  style.setAttribute('data-modal-fix', 'true');
  document.head.appendChild(style);
}

export default PlayerReportModal;
