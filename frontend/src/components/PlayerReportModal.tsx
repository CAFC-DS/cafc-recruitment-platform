import React, { useRef, useEffect, useState } from "react";
import { Modal, Row, Col, Card, Button } from "react-bootstrap";
import { PolarArea } from "react-chartjs-2";
import ChartDataLabels from "chartjs-plugin-datalabels";
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  ArcElement,
} from "chart.js";

import axiosInstance from "../axiosInstance";
import {
  getPerformanceScoreColor,
  getAttributeScoreColor,
  getAverageAttributeScoreColor,
  getFlagColor,
  getContrastTextColor,
} from "../utils/colorUtils";

ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  ArcElement,
  ChartDataLabels,
);

interface PlayerReportModalProps {
  show: boolean;
  onHide: () => void;
  report: any; // A more specific type should be used here
}

const PlayerReportModal: React.FC<PlayerReportModalProps> = ({
  show,
  onHide,
  report,
}) => {
  const modalContentRef = useRef<HTMLDivElement>(null);
  const [playerData, setPlayerData] = useState<any>(null);
  const [, setLoadingPlayerData] = useState(false);

  // Fetch player data when modal opens
  useEffect(() => {
    const fetchPlayerData = async () => {
      if (show && report && (report.player_id || report.player_name)) {
        setLoadingPlayerData(true);
        try {
          let playerResponse = null;

          // First try to get player by ID if available
          if (report.player_id) {
            try {
              playerResponse = await axiosInstance.get(
                `/players/${report.player_id}/profile`,
              );
            } catch (error) {
              console.warn("Could not fetch player by ID:", error);
            }
          }

          // If ID fetch failed, try search by name as fallback
          if (!playerResponse && report.player_name) {
            const searchResponse = await axiosInstance.get(
              `/players/search?query=${encodeURIComponent(report.player_name)}`,
            );
            if (searchResponse.data && searchResponse.data.length > 0) {
              // Try to get profile for the first search result
              const searchResult = searchResponse.data[0];
              if (searchResult.player_id) {
                try {
                  playerResponse = await axiosInstance.get(
                    `/players/${searchResult.player_id}/profile`,
                  );
                } catch (error) {
                  // Use search result data if profile fetch fails
                  setPlayerData(searchResult);
                }
              } else {
                setPlayerData(searchResult);
              }
            }
          }

          if (playerResponse) {
            setPlayerData(playerResponse.data);
          }
        } catch (error) {
          console.warn("Could not fetch player data:", error);
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

  // Function to get birth date from available data sources
  const getBirthDate = () => {
    // Try different potential field names for birth date
    const possibleBirthDate =
      playerData?.birth_date || // From profile endpoint
      playerData?.date_of_birth ||
      playerData?.dateOfBirth ||
      playerData?.birthDate || // camelCase version from API
      playerData?.BIRTHDATE || // uppercase version from database
      report.player_birth_date ||
      report.birth_date ||
      report.date_of_birth ||
      report.birthDate || // camelCase version
      report.BIRTHDATE; // uppercase version

    if (!possibleBirthDate) {
      return null;
    }

    const birthDate = new Date(possibleBirthDate);
    return isNaN(birthDate.getTime()) ? null : birthDate;
  };

  // Function to calculate age at fixture date
  const calculateAgeAtFixture = () => {
    const fixtureDate = new Date(report.fixture_date);
    const birthDate = getBirthDate();

    if (!birthDate) {
      return null;
    }

    const ageInMs = fixtureDate.getTime() - birthDate.getTime();
    const ageInYears = Math.floor(ageInMs / (365.25 * 24 * 60 * 60 * 1000));

    return ageInYears;
  };

  // Function to format birth date with age
  const formatBirthDateWithAge = () => {
    const birthDate = getBirthDate();
    const calculatedAge = calculateAgeAtFixture();
    const reportAge = report.age; // Use age from report if available

    if (birthDate) {
      // If we have birth date, show it with calculated age
      const formattedDate = birthDate.toLocaleDateString("en-GB");
      return calculatedAge !== null
        ? `${formattedDate} (${calculatedAge})`
        : formattedDate;
    } else if (reportAge) {
      // If we have age from report but no birth date, just show age
      return `Age: ${reportAge}`;
    } else {
      return "N/A";
    }
  };

  const handleExportPDF = async () => {
    try {
      // Dynamic import to avoid bundling issues
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");

      if (modalContentRef.current) {
        // Hide the modal backdrop and buttons temporarily for clean export
        const modalBackdrop = document.querySelector(".modal-backdrop");
        const modalFooter = document.querySelector(".modal-footer");
        const originalBackdropDisplay = modalBackdrop
          ? (modalBackdrop as HTMLElement).style.display
          : "";
        const originalFooterDisplay = modalFooter
          ? (modalFooter as HTMLElement).style.display
          : "";
        const originalClassName = modalContentRef.current.className;

        if (modalBackdrop)
          (modalBackdrop as HTMLElement).style.display = "none";
        if (modalFooter) (modalFooter as HTMLElement).style.display = "none";

        // Wait for layout to settle before capture
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Capture the modal content with original settings
        const canvas = await html2canvas(modalContentRef.current, {
          scale: 2.0, // Higher quality capture
          useCORS: true,
          allowTaint: true,
          backgroundColor: "#ffffff",
          logging: false,
        });

        // Create PDF based on the actual content dimensions to avoid stretching
        const imgData = canvas.toDataURL("image/png", 1.0); // High quality PNG

        // Calculate PDF dimensions based on canvas aspect ratio
        const canvasAspectRatio = canvas.width / canvas.height;
        let pdfWidth, pdfHeight;

        if (canvasAspectRatio > 1) {
          // Landscape oriented content
          pdfWidth = 297; // A4 landscape width
          pdfHeight = 210; // A4 landscape height
        } else {
          // Portrait oriented content
          pdfWidth = 210; // A4 portrait width
          pdfHeight = 297; // A4 portrait height
        }

        const pdf = new jsPDF({
          orientation: canvasAspectRatio > 1 ? "landscape" : "portrait",
          unit: "mm",
          format: "a4",
        });

        // Use minimal margins and scale up to fill more of the page
        const margin = 3;
        const availableWidth = pdfWidth - margin * 2;
        const availableHeight = pdfHeight - margin * 2;

        // Convert canvas pixels to mm (96 DPI standard)
        const pixelsToMm = 25.4 / 96 / 2; // Divided by 2 because we used scale 2.0
        const canvasWidthMm = canvas.width * pixelsToMm;
        const canvasHeightMm = canvas.height * pixelsToMm;

        // Calculate scale to fit the content better, prioritizing height usage
        const scaleToFitWidth = availableWidth / canvasWidthMm;
        const scaleToFitHeight = availableHeight / canvasHeightMm;

        // Use the larger scale that still fits to minimize margins
        const scale = Math.min(scaleToFitWidth, scaleToFitHeight);

        // If content is much shorter than page, scale it up more aggressively
        const heightRatio = canvasHeightMm / availableHeight;
        const adjustedScale = heightRatio < 0.7 ? scale * 1.3 : scale;

        const imgWidth = canvasWidthMm * adjustedScale;
        const imgHeight = canvasHeightMm * adjustedScale;

        // Center horizontally and vertically with slight bias toward top
        const xOffset = (pdfWidth - imgWidth) / 2;
        const yOffset = margin + (availableHeight - imgHeight) * 0.3; // 30% from top to balance margins

        pdf.addImage(imgData, "PNG", xOffset, yOffset, imgWidth, imgHeight);

        // Save the PDF
        const fileName = `${report.player_name}_Report_${new Date().toISOString().split("T")[0]}.pdf`;
        pdf.save(fileName);

        // Restore original display properties and class name
        if (modalBackdrop)
          (modalBackdrop as HTMLElement).style.display =
            originalBackdropDisplay;
        if (modalFooter)
          (modalFooter as HTMLElement).style.display = originalFooterDisplay;
        modalContentRef.current.className = originalClassName;
      }
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Failed to generate PDF. Please try again.");
    }
  };

  // Group-based color mapping using Red, Blue, Orange palette
  const getAttributeGroupColor = (attributeName: string) => {
    // Define attribute groups and their colors - Professional Teal/Coral/Purple palette
    const groupColors = {
      "PHYSICAL / PSYCHOLOGICAL": "#009FB7", // Light blue   - calm, balanced
      ATTACKING: "#9370DB", // Purple - energetic, forward-thinking
      DEFENDING: "#7FC8F8", // Brown - strong, protective
    };

    // Map attributes to groups (this would ideally come from backend)
    const physicalPsychological = [
      "Athleticism & Pace",
      "Stamina & Work Rate",
      "Strength & Physicality",
      "Size & Physicality",
      "Proactive",
      "Movement",
      "Communication, Leadership & Organisation",
      "Technical Ability",
    ];

    const attacking = [
      "Distribution",
      "Attacking Transitions & Impact",
      "Crossing",
      "Ball Progression",
      "Composure",
      "Starting & Building Attacks",
      "Receiving & Ball Carrying",
      "Attacking Movement",
      "Attacking Creativity",
      "Finishing",
      "Ball Carrying",
      "Ball Carrying & Attacking 1v1",
      "Final Third Movement",
      "Chance Creation",
      "Link Play / Ball Retention",
      "Hold-Up Play / Ball Retention",
      "Aerial Ability",
      "Distribution - Short / Building Attacks",
      "Distribution – Long / Starting Attacks",
    ];

    const defending = [
      "Aerial & Defending The Box",
      "Defensive Positioning & Anticipation",
      "Defending In Wide Areas",
      "Defensive Transitions & Recovery",
      "Aggressive & Front Footed",
      "Defensive Positioning",
      "Anticipation / Sense of Danger",
      "Defending The Box",
      "Starting Position",
      "Command of The Box",
      "Shot Stopping",
      "Handling",
      "Defensive Transitions & Impact",
    ];

    if (physicalPsychological.some((attr) => attributeName.includes(attr))) {
      return groupColors["PHYSICAL / PSYCHOLOGICAL"];
    } else if (attacking.some((attr) => attributeName.includes(attr))) {
      return groupColors["ATTACKING"];
    } else if (defending.some((attr) => attributeName.includes(attr))) {
      return groupColors["DEFENDING"];
    }

    // Default to orange if no match
    return groupColors["PHYSICAL / PSYCHOLOGICAL"];
  };

  // Colors are now generated in the sorted section above

  // Sort data by attribute group for logical ordering
  const getAttributeGroup = (attributeName: string) => {
    const physicalPsychological = [
      "Athleticism & Pace",
      "Stamina & Work Rate",
      "Strength & Physicality",
      "Size & Physicality",
      "Proactive",
      "Movement",
      "Communication, Leadership & Organisation",
      "Technical Ability",
    ];

    const attacking = [
      "Distribution",
      "Attacking Transitions & Impact",
      "Crossing",
      "Ball Progression",
      "Composure",
      "Starting & Building Attacks",
      "Receiving & Ball Carrying",
      "Attacking Movement",
      "Attacking Creativity",
      "Finishing",
      "Ball Carrying",
      "Ball Carrying & Attacking 1v1",
      "Final Third Movement",
      "Chance Creation",
      "Link Play / Ball Retention",
      "Hold-Up Play / Ball Retention",
      "Aerial Ability",
      "Distribution - Short / Building Attacks",
      "Distribution – Long / Starting Attacks",
    ];

    const defending = [
      "Aerial & Defending The Box",
      "Defensive Positioning & Anticipation",
      "Defending In Wide Areas",
      "Defensive Transitions & Recovery",
      "Aggressive & Front Footed",
      "Defensive Positioning",
      "Anticipation / Sense of Danger",
      "Defending The Box",
      "Starting Position",
      "Command of The Box",
      "Shot Stopping",
      "Handling",
      "Defensive Transitions & Impact",
    ];

    if (physicalPsychological.some((attr) => attributeName.includes(attr))) {
      return { group: "PHYSICAL / PSYCHOLOGICAL", order: 1 };
    } else if (attacking.some((attr) => attributeName.includes(attr))) {
      return { group: "ATTACKING", order: 2 };
    } else if (defending.some((attr) => attributeName.includes(attr))) {
      return { group: "DEFENDING", order: 3 };
    }
    return { group: "PHYSICAL / PSYCHOLOGICAL", order: 1 }; // Default
  };

  const sortedAttributes = Object.entries(report.individual_attribute_scores)
    // Include all attributes, including those with 0 scores
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
  const chartData = sortedAttributes.map(([, value]) => {
    // Give zero-scored attributes a large value (10) so they appear as prominent grey segments
    return (value as number) === 0 ? 10 : value;
  });

  // Keep track of actual values for tooltip display
  const actualValues = sortedAttributes.map(([, value]) => value as number);

  // Function to convert score to level description
  const getScoreLevel = (score: number) => {
    if (score === 0) return "0";
    switch (score) {
      case 10:
        return "Mid Prem & Above";
      case 9:
        return "Bottom Prem";
      case 8:
        return "Top Champ";
      case 7:
        return "Average Champ";
      case 6:
        return "Top L1";
      case 5:
        return "Average L1";
      case 4:
        return "Top L2";
      case 3:
        return "Average L2";
      case 2:
        return "National League";
      case 1:
        return "Step 2 & Below";
      default:
        return score.toString();
    }
  };
  const sortedColors = sortedAttributes.map(([attributeName, value]) =>
    (value as number) === 0
      ? "rgba(224, 224, 224, 0.5)"
      : getAttributeGroupColor(attributeName),
  );

  const sortedBorderColors = sortedColors.map((color) => {
    // Keep light grey for zero attributes, darken others
    if (color.includes("rgba(224, 224, 224")) {
      return "rgba(192, 192, 192, 0.5)"; // Slightly darker grey for border with transparency
    }
    // Simple darkening: convert hex to RGB, reduce values, convert back to hex
    let r = parseInt(color.slice(1, 3), 16);
    let g = parseInt(color.slice(3, 5), 16);
    let b = parseInt(color.slice(5, 7), 16);
    r = Math.max(0, r - 40);
    g = Math.max(0, g - 40);
    b = Math.max(0, b - 40);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  });

  const polarAreaChartData = {
    labels: chartLabels,
    datasets: [
      {
        label: "Attribute Score",
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
            size: 10,
          },
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
            weight: "bold",
          },
          color: "#212529",
          padding: 15, // Reduced padding for compact A4 layout
          centerPointLabels: true, // Center labels on their segments
          callback: function (value: any, index: number) {
            // Handle line wrapping for long labels
            if (Array.isArray(chartLabels[index])) {
              return chartLabels[index];
            }
            // Split long labels that are still strings
            if (
              typeof chartLabels[index] === "string" &&
              chartLabels[index].length > 12
            ) {
              const label = chartLabels[index] as string;
              const words = label.split(" ");
              if (words.length > 2) {
                const midPoint = Math.ceil(words.length / 2);
                return [
                  words.slice(0, midPoint).join(" "),
                  words.slice(midPoint).join(" "),
                ];
              } else if (words.length === 2) {
                return words; // Return each word on separate line
              }
            }
            return chartLabels[index];
          },
        },
      },
    },
    plugins: {
      legend: {
        position: "bottom",
        labels: {
          generateLabels: () => {
            return [
              {
                text: "Physical/Psychological",
                fillStyle: "#009FB7",
                strokeStyle: "#009FB7",
                lineWidth: 2,
              },
              {
                text: "Attacking",
                fillStyle: "#9370DB",
                strokeStyle: "#9370DB",
                lineWidth: 2,
              },
              {
                text: "Defending",
                fillStyle: "#7FC8F8",
                strokeStyle: "#7FC8F8",
                lineWidth: 2,
              },
              {
                text: "Attribute not scored",
                fillStyle: "rgba(224, 224, 224, 0.5)",
                strokeStyle: "rgba(192, 192, 192, 0.8)",
                lineWidth: 2,
              },
            ];
          },
        },
      },
      datalabels: {
        color: "#ffffff",
        font: {
          weight: "bold",
          size: 12,
        },
        formatter: (value: any, context: any) => {
          // Show actual score (0) for zero-scored attributes, not display value (10)
          const actualValue = actualValues[context.dataIndex];
          return actualValue === 0 ? "N/A" : actualValue;
        },
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            // Show actual score (0) for zero-scored attributes, not display value (10)
            const actualValue = actualValues[context.dataIndex];
            const levelDescription = getScoreLevel(actualValue);
            return actualValue === 0
              ? "N/A"
              : `${actualValue}: ${levelDescription}`;
          },
        },
      },
    },
  };


  const getReportTypeInfo = () => {
    const reportType = report.report_type || "Player Assessment";
    const purposeOfAssessment = report.purpose_of_assessment;

    // Check if this should be treated as a flag report based on flag_category
    const hasFlag = report.flag_category && report.flag_category.trim() !== "";

    if (hasFlag) {
      return {
        color: "warning",
        icon: "🏳️",
        title: "Flag Assessment Report",
      };
    }

    // Check if this is a Loan Report
    if (purposeOfAssessment === "Loan Report") {
      return { color: "dark", icon: "📋", title: "Loan Assessment Report" };
    }

    switch (reportType.toLowerCase()) {
      case "player assessment":
      case "player_assessment":
        return { color: "dark", icon: "⚽", title: "Player Assessment Report" };
      case "flag assessment":
      case "flag_assessment":
        return {
          color: "warning",
          icon: "🏳️",
          title: "Flag Assessment Report",
        };
      case "clips assessment":
      case "clip assessment":
      case "clips_assessment":
        return {
          color: "secondary",
          icon: "🎬",
          title: "Clips Assessment Report",
        };
      default:
        return { color: "dark", icon: "⚽", title: "Scouting Report" };
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
        style={{ backgroundColor: flagColor, color: textColor, border: "none" }}
      >
        {flagCategory || "Flag"}
      </span>
    );
  };

  // Check if this is a flag report for simplified layout
  const hasFlag = report.flag_category && report.flag_category.trim() !== "";
  const isFlagReport =
    hasFlag ||
    report.report_type?.toLowerCase() === "flag" ||
    report.report_type?.toLowerCase() === "flag assessment" ||
    report.report_type?.toLowerCase() === "flag_assessment";

  return (
    <Modal show={show} onHide={onHide} size="xl" centered>
      <Modal.Header
        closeButton
        style={{ backgroundColor: "#000000", color: "white" }}
        className="modal-header-dark"
      >
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
              <Card.Header className="bg-light text-dark">
                <h6 className="mb-0">📊 Report Overview</h6>
              </Card.Header>
              <Card.Body>
                <Row>
                  <Col md={4}>
                    <p className="mb-1">
                      <strong>Player:</strong> {report.player_name}
                    </p>
                    <p className="mb-1">
                      <strong>Team:</strong>{" "}
                      {playerData?.squad_name ||
                        report.home_squad_name ||
                        report.away_squad_name ||
                        "N/A"}
                    </p>
                    <p className="mb-0">
                      <strong>Date of Birth | Age:</strong>{" "}
                      {formatBirthDateWithAge()}
                    </p>
                  </Col>
                  <Col md={4}>
                    <p className="mb-1">
                      <strong>Fixture:</strong> {report.home_squad_name} vs{" "}
                      {report.away_squad_name}
                    </p>
                    <p className="mb-1">
                      <strong>Position | Formation:</strong>{" "}
                      {report.position_played || "Not specified"} |{" "}
                      {report.formation || "Not specified"}
                    </p>
                    <p className="mb-0">
                      <strong>Build | Height:</strong>{" "}
                      {report.build || "N/A"} | {report.height || "N/A"}
                    </p>
                  </Col>
                  <Col md={4}>
                    <p className="mb-1">
                      <strong>Fixture Date:</strong>{" "}
                      {report.fixture_date
                        ? new Date(report.fixture_date).toLocaleDateString("en-GB")
                        : "N/A"}
                    </p>
                    <p className="mb-1">
                      <strong>Report Date:</strong>{" "}
                      {new Date(report.created_at).toLocaleDateString("en-GB")}
                    </p>
                    <p className="mb-0">
                      <strong>Scout:</strong> {report.scout_name} |{" "}
                      {getFlagBadge(report.flag_category || "Not specified")}
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
                  <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>
                    {report.summary || "No summary provided"}
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
                    <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>
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
              <Col md={9}>
                <Card className="h-100">
                  <Card.Header className="py-2">
                    <h6 className="mb-0" style={{ fontSize: "14px" }}>
                      📊 Report Overview
                    </h6>
                  </Card.Header>
                  <Card.Body className="py-2">
                    <Row style={{ fontSize: "11px" }}>
                      <Col md={4}>
                        <p className="mb-1">
                          <strong>Player:</strong> {report.player_name}
                        </p>
                        <p className="mb-1">
                          <strong>Team:</strong>{" "}
                          {playerData?.squad_name ||
                            report.home_squad_name ||
                            report.away_squad_name ||
                            "N/A"}
                        </p>
                        <p className="mb-0">
                          <strong>Date of Birth | Age:</strong>{" "}
                          {formatBirthDateWithAge()}
                        </p>
                      </Col>
                      <Col md={4}>
                        <p className="mb-1">
                          <strong>Fixture:</strong> {report.home_squad_name} vs{" "}
                          {report.away_squad_name}
                        </p>
                        <p className="mb-1">
                          <strong>Position | Formation:</strong>{" "}
                          {report.position_played || "Not specified"} |{" "}
                          {report.formation || "Not specified"}
                        </p>
                        <p className="mb-0">
                          <strong>Build | Height:</strong>{" "}
                          {report.build || "N/A"} | {report.height || "N/A"}
                        </p>
                      </Col>
                      <Col md={4}>
                        <p className="mb-1">
                          <strong>Fixture Date:</strong>{" "}
                          {new Date(report.fixture_date).toLocaleDateString(
                            "en-GB",
                          )}
                        </p>
                        <p className="mb-1">
                          <strong>Report Date:</strong>{" "}
                          {new Date(report.created_at).toLocaleDateString(
                            "en-GB",
                          )}
                        </p>
                        <p className="mb-0">
                          <strong>Scout:</strong> {report.scout_name} |{" "}
                          {report.source_type ||
                            report.viewing_method ||
                            report.scouting_type ||
                            "Live"}
                        </p>
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>
              </Col>
              <Col md={3}>
                <Card className="h-100">
                  <Card.Header className="py-2">
                    <h6 className="mb-0" style={{ fontSize: "14px" }}>
                      🏆 Performance Score
                    </h6>
                  </Card.Header>
                  <Card.Body className="d-flex align-items-center justify-content-center py-2">
                    <div className="text-center">
                      <div className="mb-2">
                        <span
                          className={`badge performance-badge performance-score-large ${
                            report.performance_score === 9 ? 'performance-score-9' :
                            report.performance_score === 10 ? 'performance-score-10' : ''
                          }`}
                          style={{
                            backgroundColor: getPerformanceScoreColor(
                              report.performance_score,
                            ),
                            color: "white",
                          }}
                        >
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
                    <h6 className="mb-0" style={{ fontSize: "14px" }}>
                      📈 Attribute Analysis
                    </h6>
                  </Card.Header>
                  <Card.Body className="py-2">
                    {/* Split Layout: Chart Left, Cards Right */}
                    <Row>
                      {/* Left Column: Polar Chart - Increased size */}
                      <Col md={9}>
                        <div
                          style={{
                            height: "700px",
                            width: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <div style={{ width: "680px", height: "680px" }}>
                            <PolarArea
                              data={polarAreaChartData}
                              options={polarAreaChartOptions}
                            />
                          </div>
                        </div>
                      </Col>

                      {/* Right Column: Metrics + Strengths & Weaknesses Cards - Same size as performance section */}
                      <Col md={3} className="d-flex flex-column">
                        {/* Attribute Metrics Section */}
                        <div className="text-center mb-3 attribute-metrics">
                          <div className="d-flex justify-content-center gap-4">
                            <div className="text-center">
                              <div className="mb-1">
                                <span
                                  className="badge"
                                  style={{
                                    backgroundColor:
                                      getAverageAttributeScoreColor(
                                        report.average_attribute_score,
                                      ),
                                    color: "white",
                                    fontSize: "14px",
                                    padding: "8px 12px",
                                    fontWeight: "bold",
                                  }}
                                >
                                  {report.average_attribute_score}
                                </span>
                              </div>
                              <small
                                style={{ fontSize: "10px", color: "#666" }}
                              >
                                Average Attribute Score
                              </small>
                            </div>
                            <div className="text-center">
                              <div className="mb-1">
                                <span
                                  className="badge"
                                  style={{
                                    backgroundColor: getAttributeScoreColor(
                                      report.total_attribute_score,
                                    ),
                                    color: "white",
                                    fontSize: "14px",
                                    padding: "8px 12px",
                                    fontWeight: "bold",
                                  }}
                                >
                                  {report.total_attribute_score}
                                </span>
                              </div>
                              <small
                                style={{ fontSize: "10px", color: "#666" }}
                              >
                                Total Attribute Score
                              </small>
                            </div>
                          </div>
                        </div>

                        {/* Strengths Card */}
                        <Card
                          className="mb-3 flex-fill ms-3"
                          style={{
                            backgroundColor: "#f0f9f0",
                            border: "1px solid #d4edda",
                          }}
                        >
                          <Card.Header
                            className="py-2 px-3"
                            style={{
                              backgroundColor: "#e8f5e8",
                              borderBottom: "1px solid #d4edda",
                            }}
                          >
                            <strong
                              style={{ fontSize: "12px", color: "#155724" }}
                            >
                              ✅ Strengths
                            </strong>
                          </Card.Header>
                          <Card.Body className="py-3 px-3">
                            <div>
                              {report.strengths &&
                              report.strengths.length > 0 ? (
                                report.strengths.map(
                                  (strength: string, index: number) => (
                                    <span
                                      key={index}
                                      className="badge me-2 mb-2"
                                      style={{
                                        backgroundColor: "#16a34a",
                                        color: "white",
                                        fontSize: "10px",
                                        padding: "4px 7px",
                                      }}
                                    >
                                      {strength}
                                    </span>
                                  ),
                                )
                              ) : (
                                <span
                                  className="text-muted"
                                  style={{ fontSize: "10px" }}
                                >
                                  No strengths specified
                                </span>
                              )}
                            </div>
                          </Card.Body>
                        </Card>

                        {/* Areas for Improvement Card */}
                        <Card
                          className="flex-fill ms-3"
                          style={{
                            backgroundColor: "#fef8f0",
                            border: "1px solid #fce4b3",
                          }}
                        >
                          <Card.Header
                            className="py-2 px-3"
                            style={{
                              backgroundColor: "#fcf4e6",
                              borderBottom: "1px solid #fce4b3",
                            }}
                          >
                            <strong
                              style={{ fontSize: "12px", color: "#8b5a00" }}
                            >
                              ⚠️ Areas for Improvement
                            </strong>
                          </Card.Header>
                          <Card.Body className="py-3 px-3">
                            <div>
                              {report.weaknesses &&
                              report.weaknesses.length > 0 ? (
                                report.weaknesses.map(
                                  (weakness: string, index: number) => (
                                    <span
                                      key={index}
                                      className="badge me-2 mb-2"
                                      style={{
                                        backgroundColor: "#d97706",
                                        color: "white",
                                        fontSize: "10px",
                                        padding: "4px 7px",
                                      }}
                                    >
                                      {weakness}
                                    </span>
                                  ),
                                )
                              ) : (
                                <span
                                  className="text-muted"
                                  style={{ fontSize: "10px" }}
                                >
                                  No weaknesses specified
                                </span>
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
                    <h6 className="mb-0" style={{ fontSize: "14px" }}>
                      📝 Scout Analysis
                    </h6>
                  </Card.Header>
                  <Card.Body className="py-2">
                    {report.opposition_details && (
                      <div className="mb-3">
                        <div className="d-flex align-items-center mb-1">
                          <strong style={{ fontSize: "12px", color: "#333" }}>
                            Opposition Details:
                          </strong>
                        </div>
                        <div className="border-start border-secondary border-3 ps-2">
                          <p
                            className="mb-0"
                            style={{
                              whiteSpace: "pre-wrap",
                              fontSize: "11px",
                              lineHeight: "1.4",
                            }}
                          >
                            {report.opposition_details}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="mb-3">
                      <div className="d-flex align-items-center mb-1">
                        <strong style={{ fontSize: "12px", color: "#333" }}>
                          Summary:
                        </strong>
                      </div>
                      <div className="border-start border-secondary border-3 ps-2">
                        <p
                          className="mb-0"
                          style={{
                            whiteSpace: "pre-wrap",
                            fontSize: "11px",
                            lineHeight: "1.4",
                          }}
                        >
                          {report.summary}
                        </p>
                      </div>
                    </div>

                    {report.justification && (
                      <div>
                        <div className="d-flex align-items-center mb-1">
                          <strong style={{ fontSize: "12px", color: "#333" }}>
                            Justification & Rationale:
                          </strong>
                        </div>
                        <div className="border-start border-secondary border-3 ps-2">
                          <p
                            className="mb-0"
                            style={{
                              whiteSpace: "pre-wrap",
                              fontSize: "11px",
                              lineHeight: "1.4",
                            }}
                          >
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

      <style>{`
        .modal-header-dark .btn-close {
          filter: invert(1) grayscale(100%) brightness(200%);
        }
      `}</style>
    </Modal>
  );
};

export default PlayerReportModal;
