import React, { useRef, useEffect, useState } from 'react';
import { Modal, Row, Col, Badge, Card, Button } from 'react-bootstrap';
import { getFlagColor, getContrastTextColor } from '../utils/colorUtils';
import axiosInstance from '../axiosInstance';
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
  const modalContentRef = useRef<HTMLDivElement>(null);
  const [playerData, setPlayerData] = useState<any>(null);
  const [loadingPlayerData, setLoadingPlayerData] = useState(false);

  // Fetch player data when modal opens
  useEffect(() => {
    const fetchPlayerData = async () => {
      if (show && report && report.player_name) {
        setLoadingPlayerData(true);
        try {
          // Try to fetch player by name - adjust endpoint as needed
          const response = await axiosInstance.get(`/players?search=${encodeURIComponent(report.player_name)}`);
          if (response.data && response.data.length > 0) {
            setPlayerData(response.data[0]); // Take first match
          }
        } catch (error) {
          console.warn('Could not fetch player data:', error);
        } finally {
          setLoadingPlayerData(false);
        }
      }
    };

    fetchPlayerData();
  }, [show, report]);

  if (!report) {
    return null;
  }

  const handleExportPDF = async () => {
    try {
      // Dynamic import to avoid bundling issues
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');

      if (modalContentRef.current) {
        // Hide the modal backdrop and buttons temporarily for clean export
        const modalBackdrop = document.querySelector('.modal-backdrop');
        const modalFooter = document.querySelector('.modal-footer');
        const originalBackdropDisplay = modalBackdrop ? (modalBackdrop as HTMLElement).style.display : '';
        const originalFooterDisplay = modalFooter ? (modalFooter as HTMLElement).style.display : '';
        const originalClassName = modalContentRef.current.className;

        if (modalBackdrop) (modalBackdrop as HTMLElement).style.display = 'none';
        if (modalFooter) (modalFooter as HTMLElement).style.display = 'none';

        // Apply PDF optimization class and set dimensions for A4 landscape
        modalContentRef.current.className += ' pdf-export-optimized';

        // Wait for layout to settle after CSS changes
        await new Promise(resolve => setTimeout(resolve, 800));

        // Capture the modal content with optimized settings for full content
        const canvas = await html2canvas(modalContentRef.current, {
          scale: 2.5, // Balanced scale for quality and file size
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          logging: false,
          // Remove fixed dimensions to capture full content
          onclone: (clonedDoc) => {
            // Ensure the PDF styles are applied in the cloned document
            const modalBody = clonedDoc.querySelector('.modal-body');
            if (modalBody) {
              (modalBody as HTMLElement).style.width = '1260px';
              (modalBody as HTMLElement).style.maxWidth = 'none';
              (modalBody as HTMLElement).style.minHeight = '850px';
              (modalBody as HTMLElement).style.overflow = 'visible';
              (modalBody as HTMLElement).style.padding = '20px';
              (modalBody as HTMLElement).style.boxSizing = 'border-box';
            }

            // Force apply performance score styling directly
            const performanceScore = clonedDoc.querySelector('.performance-score-large');
            if (performanceScore) {
              (performanceScore as HTMLElement).style.fontSize = '60px';
              (performanceScore as HTMLElement).style.padding = '18px 30px';
              (performanceScore as HTMLElement).style.fontWeight = '700';
              (performanceScore as HTMLElement).style.lineHeight = '1';
              (performanceScore as HTMLElement).style.display = 'inline-block';
              (performanceScore as HTMLElement).style.minWidth = '120px';
            }

            // Force apply better text sizing for all content
            const allText = clonedDoc.querySelectorAll('p, span:not(.performance-score-large), small');
            allText.forEach(element => {
              (element as HTMLElement).style.fontSize = '16px';
              (element as HTMLElement).style.lineHeight = '1.4';
            });

            // Force apply chart container sizing
            const chartContainers = clonedDoc.querySelectorAll('[style*="480px"]');
            chartContainers.forEach(container => {
              (container as HTMLElement).style.width = '460px';
              (container as HTMLElement).style.height = '460px';
            });
          }
        });

        // Create PDF in A4 landscape format
        const pdf = new jsPDF({
          orientation: 'landscape',
          unit: 'mm',
          format: 'a4'
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.95); // High quality JPEG for smaller file size
        const pdfWidth = 297; // A4 landscape width in mm
        const pdfHeight = 210; // A4 landscape height in mm
        const margin = 5; // Minimal margins for maximum content space

        // Calculate dimensions with proper aspect ratio for A4 page
        const availableWidth = pdfWidth - (margin * 2);
        const availableHeight = pdfHeight - (margin * 2);

        const imgAspectRatio = canvas.width / canvas.height;
        const availableAspectRatio = availableWidth / availableHeight;

        let imgWidth, imgHeight;

        if (imgAspectRatio > availableAspectRatio) {
          // Image is wider than available space - fit to width
          imgWidth = availableWidth;
          imgHeight = availableWidth / imgAspectRatio;
        } else {
          // Image is taller than available space - fit to height
          imgHeight = availableHeight;
          imgWidth = availableHeight * imgAspectRatio;
        }

        // Center the image on the page
        const xOffset = (pdfWidth - imgWidth) / 2;
        const yOffset = (pdfHeight - imgHeight) / 2;

        pdf.addImage(imgData, 'JPEG', xOffset, yOffset, imgWidth, imgHeight);

        // Save the PDF
        const fileName = `${report.player_name}_Report_${new Date().toISOString().split('T')[0]}.pdf`;
        pdf.save(fileName);

        // Restore original display properties and class name
        if (modalBackdrop) (modalBackdrop as HTMLElement).style.display = originalBackdropDisplay;
        if (modalFooter) (modalFooter as HTMLElement).style.display = originalFooterDisplay;
        modalContentRef.current.className = originalClassName;
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    }
  };

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
            size: 8, // Smaller font for A4 printing
            weight: 'bold'
          },
          color: '#212529',
          padding: 15, // Reduced padding for compact A4 layout
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

  // Red-green gradient color functions for scoring
  const getPerformanceScoreColor = (score: number) => {
    // Scale from 1-10 to red-green gradient
    const red = Math.max(0, 255 - (score - 1) * 28.33);
    const green = Math.min(255, (score - 1) * 28.33);
    return `rgb(${Math.round(red)}, ${Math.round(green)}, 0)`;
  };

  const getPerformanceScoreVariant = (score: number) => {
    if (score === 10) return 'gold';
    if (score === 9) return 'silver';  
    if (score >= 7) return 'success'; // 7-8 green
    if (score >= 3) return 'warning'; // 3-6 amber
    return 'danger'; // 1-3 red
  };

  const getAttributeScoreColor = (score: number) => {
    // Scale from 0-100 to red-green gradient
    const red = Math.max(0, 255 - score * 2.55);
    const green = Math.min(255, score * 2.55);
    return `rgb(${Math.round(red)}, ${Math.round(green)}, 0)`;
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
  
  // Function to create flag badge with standardized colors
  const getFlagBadge = (flagCategory: string) => {
    const flagColor = getFlagColor(flagCategory);
    const textColor = getContrastTextColor(flagColor);

    return (
      <span
        className="badge"
        style={{ backgroundColor: flagColor, color: textColor, border: 'none' }}
      >
        {flagCategory || 'Flag'}
      </span>
    );
  };
  
  // Check if this is a flag report for simplified layout
  const isFlagReport = report.report_type?.toLowerCase() === 'flag' || report.report_type?.toLowerCase() === 'flag assessment';

  return (
    <Modal show={show} onHide={onHide} size="xl" centered>
      <Modal.Header closeButton style={{ backgroundColor: '#000000', color: 'white' }} className="modal-header-dark">
        <Modal.Title>
          {reportInfo.icon} {report.player_name} - {reportInfo.title}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body ref={modalContentRef}>
        {isFlagReport ? (
          /* Simplified Flag Report Layout */
          <>
            {/* Report Overview */}
            <Card className="mb-4">
              <Card.Header className="bg-light">
                <div className="d-flex justify-content-between align-items-center">
                  <h5 className="mb-0">📊 Report Overview</h5>
                  {getFlagBadge(`🚩 ${report.flag_category || 'Flag'}`)}
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
                    <p><strong>Fixture Date:</strong> {new Date(report.fixture_date).toLocaleDateString('en-GB')}</p>
                    <p><strong>Flag Type:</strong>
                      <span className="ms-2">
                        {getFlagBadge(report.flag_category || 'Not specified')}
                      </span>
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
            {/* Report Overview + Performance Score Split Row */}
            <Row className="mb-3">
              <Col md={8}>
                <Card className="h-100">
                  <Card.Header className="py-2">
                    <h6 className="mb-0" style={{ fontSize: '14px' }}>📊 Report Overview</h6>
                  </Card.Header>
                  <Card.Body className="py-2">
                    <Row style={{ fontSize: '11px' }}>
                      <Col md={6}>
                        <p className="mb-1"><strong>Player:</strong> {report.player_name} | <strong>Squad:</strong> {playerData?.current_team || playerData?.squad || 'Loading...'}</p>
                        <p className="mb-1"><strong>Position:</strong> {report.position_played || 'Not specified'} | <strong>Formation:</strong> {report.formation || 'Not specified'}</p>
                        <p className="mb-0"><strong>Build:</strong> {report.build} | <strong>Height:</strong> {report.height}</p>
                      </Col>
                      <Col md={6}>
                        <p className="mb-1"><strong>Fixture:</strong> {report.home_squad_name} vs {report.away_squad_name}</p>
                        <p className="mb-1"><strong>Report Date:</strong> {new Date(report.created_at).toLocaleDateString('en-GB')} | <strong>Fixture Date:</strong> {new Date(report.fixture_date).toLocaleDateString('en-GB')}</p>
                        <p className="mb-0"><strong>Scout:</strong> {report.scout_name}</p>
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>
              </Col>
              <Col md={4}>
                <Card className="h-100">
                  <Card.Header className="py-2">
                    <h6 className="mb-0" style={{ fontSize: '14px' }}>🏆 Performance Score</h6>
                  </Card.Header>
                  <Card.Body className="d-flex align-items-center justify-content-center py-2">
                    <div className="text-center">
                      <div className="mb-2">
                        <span className="badge performance-badge performance-score-large" style={{ backgroundColor: getPerformanceScoreColor(report.performance_score), color: 'white' }}>
                          {report.performance_score}
                        </span>
                      </div>
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            </Row>

            {/* Attribute Analysis with Integrated Metrics */}
            <Row className="mb-3">
              <Col md={12}>
                <Card>
                  <Card.Header className="py-2">
                    <h6 className="mb-0" style={{ fontSize: '14px' }}>📈 Attribute Analysis</h6>
                  </Card.Header>
                  <Card.Body className="py-2">
                    {/* Split Layout: Chart Left, Cards Right */}
                    <Row>
                      {/* Left Column: Polar Chart - Increased size */}
                      <Col md={7}>
                        <div style={{ height: '500px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <div style={{ width: '480px', height: '480px' }}>
                            <PolarArea data={polarAreaChartData} options={polarAreaChartOptions} />
                          </div>
                        </div>
                      </Col>

                      {/* Right Column: Metrics + Strengths & Weaknesses Cards - Slightly smaller */}
                      <Col md={5} className="d-flex flex-column">
                        {/* Attribute Metrics Section */}
                        <div className="text-center mb-3 attribute-metrics">
                          <div className="d-flex justify-content-center gap-4">
                            <div className="text-center">
                              <div className="mb-1">
                                <span className="badge" style={{ backgroundColor: getAttributeScoreColor(report.average_attribute_score), color: 'white', fontSize: '14px', padding: '8px 12px', fontWeight: 'bold' }}>
                                  {report.average_attribute_score}
                                </span>
                              </div>
                              <small style={{ fontSize: '10px', color: '#666' }}>Average Attribute Score</small>
                            </div>
                            <div className="text-center">
                              <div className="mb-1">
                                <span className="badge" style={{ backgroundColor: getAttributeScoreColor(report.total_attribute_score), color: 'white', fontSize: '14px', padding: '8px 12px', fontWeight: 'bold' }}>
                                  {report.total_attribute_score}
                                </span>
                              </div>
                              <small style={{ fontSize: '10px', color: '#666' }}>Total Attribute Score</small>
                            </div>
                          </div>
                        </div>

                        {/* Strengths Card */}
                        <Card className="mb-3 flex-fill" style={{ backgroundColor: '#f0f9f0', border: '1px solid #d4edda' }}>
                          <Card.Header className="py-2 px-3" style={{ backgroundColor: '#e8f5e8', borderBottom: '1px solid #d4edda' }}>
                            <strong style={{ fontSize: '12px', color: '#155724' }}>✅ Strengths</strong>
                          </Card.Header>
                          <Card.Body className="py-3 px-3">
                            <div>
                              {report.strengths && report.strengths.length > 0 ? (
                                report.strengths.map((strength: string, index: number) => (
                                  <span key={index} className="badge me-2 mb-2" style={{ backgroundColor: '#16a34a', color: 'white', fontSize: '10px', padding: '4px 7px' }}>
                                    {strength}
                                  </span>
                                ))
                              ) : (
                                <span className="text-muted" style={{ fontSize: '10px' }}>No strengths specified</span>
                              )}
                            </div>
                          </Card.Body>
                        </Card>

                        {/* Areas for Improvement Card */}
                        <Card className="flex-fill" style={{ backgroundColor: '#fef8f0', border: '1px solid #fce4b3' }}>
                          <Card.Header className="py-2 px-3" style={{ backgroundColor: '#fcf4e6', borderBottom: '1px solid #fce4b3' }}>
                            <strong style={{ fontSize: '12px', color: '#8b5a00' }}>⚠️ Areas for Improvement</strong>
                          </Card.Header>
                          <Card.Body className="py-3 px-3">
                            <div>
                              {report.weaknesses && report.weaknesses.length > 0 ? (
                                report.weaknesses.map((weakness: string, index: number) => (
                                  <span key={index} className="badge me-2 mb-2" style={{ backgroundColor: '#d97706', color: 'white', fontSize: '10px', padding: '4px 7px' }}>
                                    {weakness}
                                  </span>
                                ))
                              ) : (
                                <span className="text-muted" style={{ fontSize: '10px' }}>No weaknesses specified</span>
                              )}
                            </div>
                          </Card.Body>
                        </Card>
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>
              </Col>
            </Row>

            {/* Compact Scout Analysis Section */}
            <Row>
              <Col md={12}>
                <Card>
                  <Card.Header className="py-2">
                    <h6 className="mb-0" style={{ fontSize: '14px' }}>📝 Scout Analysis</h6>
                  </Card.Header>
                  <Card.Body className="py-2">
                    <div className="mb-3">
                      <div className="d-flex align-items-center mb-1">
                        <strong style={{ fontSize: '12px', color: '#333' }}>Summary:</strong>
                      </div>
                      <div className="border-start border-secondary border-3 ps-2">
                        <p className="mb-0" style={{ whiteSpace: 'pre-wrap', fontSize: '11px', lineHeight: '1.4' }}>
                          {report.summary}
                        </p>
                      </div>
                    </div>

                    {report.justification && (
                      <div>
                        <div className="d-flex align-items-center mb-1">
                          <strong style={{ fontSize: '12px', color: '#333' }}>Justification & Rationale:</strong>
                        </div>
                        <div className="border-start border-secondary border-3 ps-2">
                          <p className="mb-0" style={{ whiteSpace: 'pre-wrap', fontSize: '11px', lineHeight: '1.4' }}>
                            {report.justification}
                          </p>
                        </div>
                      </div>
                    )}
                  </Card.Body>
                </Card>
              </Col>
            </Row>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={handleExportPDF}>
          📄 Export as PDF
        </Button>
        <Button variant="outline-dark" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
};



export default PlayerReportModal;
