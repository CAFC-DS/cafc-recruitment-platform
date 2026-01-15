import React, { useRef, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Container,
  Alert,
  Spinner,
  Row,
  Col,
  Card,
  Button,
} from "react-bootstrap";
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
import axios from "axios";

import {
  getPerformanceScoreColor,
  getAttributeScoreColor,
  getAverageAttributeScoreColor,
  getFlagColor,
  getContrastTextColor,
  getGradeColor,
} from "../utils/colorUtils";
import { extractVSSScore } from "../utils/reportUtils";

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

const SharedReportPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pageContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchReport = async () => {
      if (!token) {
        setError("No share token provided");
        setLoading(false);
        return;
      }

      try {
        const baseURL =
          process.env.REACT_APP_API_URL || "http://localhost:3001";
        const response = await axios.get(`${baseURL}/public/report/${token}`);
        setReport(response.data);
      } catch (err: any) {
        console.error("Error fetching shared report:", err);
        if (err.response?.status === 404) {
          setError("Share link not found");
        } else if (err.response?.status === 403) {
          setError(
            err.response.data?.detail ||
              "This share link has expired or been revoked",
          );
        } else {
          setError(
            "Failed to load report. Please check the link and try again.",
          );
        }
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [token]);

  if (loading) {
    return (
      <Container
        className="d-flex justify-content-center align-items-center"
        style={{ minHeight: "100vh" }}
      >
        <div className="text-center">
          <Spinner animation="border" role="status" />
          <p className="mt-3">Loading shared report...</p>
        </div>
      </Container>
    );
  }

  if (error) {
    return (
      <Container className="mt-5">
        <Alert variant="danger">
          <Alert.Heading>Access Denied</Alert.Heading>
          <p>{error}</p>
        </Alert>
      </Container>
    );
  }

  if (!report) {
    return null;
  }

  const getBirthDate = () => {
    const possibleBirthDate =
      report.birth_date ||
      report.player_birth_date ||
      report.date_of_birth ||
      report.birthDate ||
      report.BIRTHDATE;

    if (!possibleBirthDate) {
      return null;
    }

    const birthDate = new Date(possibleBirthDate);
    return isNaN(birthDate.getTime()) ? null : birthDate;
  };

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

  const formatBirthDateWithAge = () => {
    const birthDate = getBirthDate();
    const calculatedAge = calculateAgeAtFixture();
    const reportAge = report.age;

    if (birthDate) {
      const formattedDate = birthDate.toLocaleDateString("en-GB");
      return calculatedAge !== null
        ? `${formattedDate} (${calculatedAge})`
        : formattedDate;
    } else if (reportAge) {
      return `Age: ${reportAge}`;
    } else {
      return "N/A";
    }
  };

  const handleExportPDF = async () => {
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");

      if (pageContentRef.current) {
        const canvas = await html2canvas(pageContentRef.current, {
          scale: 2.0,
          useCORS: true,
          allowTaint: true,
          backgroundColor: "#ffffff",
          logging: false,
        });

        const imgData = canvas.toDataURL("image/png", 1.0);
        const canvasAspectRatio = canvas.width / canvas.height;
        let pdfWidth, pdfHeight;

        if (canvasAspectRatio > 1) {
          pdfWidth = 297;
          pdfHeight = 210;
        } else {
          pdfWidth = 210;
          pdfHeight = 297;
        }

        const pdf = new jsPDF({
          orientation: canvasAspectRatio > 1 ? "landscape" : "portrait",
          unit: "mm",
          format: "a4",
        });

        const margin = 3;
        const availableWidth = pdfWidth - margin * 2;
        const availableHeight = pdfHeight - margin * 2;
        const pixelsToMm = 25.4 / 96 / 2;
        const canvasWidthMm = canvas.width * pixelsToMm;
        const canvasHeightMm = canvas.height * pixelsToMm;
        const scaleToFitWidth = availableWidth / canvasWidthMm;
        const scaleToFitHeight = availableHeight / canvasHeightMm;
        const scale = Math.min(scaleToFitWidth, scaleToFitHeight);
        const heightRatio = canvasHeightMm / availableHeight;
        const adjustedScale = heightRatio < 0.7 ? scale * 1.3 : scale;
        const imgWidth = canvasWidthMm * adjustedScale;
        const imgHeight = canvasHeightMm * adjustedScale;
        const xOffset = (pdfWidth - imgWidth) / 2;
        const yOffset = margin + (availableHeight - imgHeight) * 0.3;

        pdf.addImage(imgData, "PNG", xOffset, yOffset, imgWidth, imgHeight);
        const fileName = `${report.player_name}_Report_${new Date()
          .toISOString()
          .split("T")[0]}.pdf`;
        pdf.save(fileName);
      }
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Failed to generate PDF. Please try again.");
    }
  };

  const getAttributeGroupColor = (attributeName: string) => {
    const groupColors = {
      "PHYSICAL / PSYCHOLOGICAL": "#009FB7",
      ATTACKING: "#9370DB",
      DEFENDING: "#7FC8F8",
    };

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

    return groupColors["PHYSICAL / PSYCHOLOGICAL"];
  };

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
    return { group: "PHYSICAL / PSYCHOLOGICAL", order: 1 };
  };

  const sortedAttributes = report.individual_attribute_scores
    ? Object.entries(report.individual_attribute_scores).sort(([a], [b]) => {
        const groupA = getAttributeGroup(a);
        const groupB = getAttributeGroup(b);
        if (groupA.order !== groupB.order) {
          return groupA.order - groupB.order;
        }
        return a.localeCompare(b);
      })
    : [];

  const chartLabels = sortedAttributes.map(([label]) => label);
  const chartData = sortedAttributes.map(([, value]) => {
    return (value as number) === 0 ? 10 : value;
  });

  const actualValues = sortedAttributes.map(([, value]) => value as number);

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
    if (color.includes("rgba(224, 224, 224")) {
      return "rgba(192, 192, 192, 0.5)";
    }
    let r = parseInt(color.slice(1, 3), 16);
    let g = parseInt(color.slice(3, 5), 16);
    let b = parseInt(color.slice(5, 7), 16);
    r = Math.max(0, r - 40);
    g = Math.max(0, g - 40);
    b = Math.max(0, b - 40);
    return `#${r.toString(16).padStart(2, "0")}${g
      .toString(16)
      .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
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
    rotation: 0,
    circumference: 360,
    scales: {
      r: {
        display: true,
        min: 0,
        max: 10,
        ticks: {
          display: true,
          stepSize: 2,
          font: {
            size: 10,
          },
        },
        grid: {
          display: true,
        },
        angleLines: {
          display: true,
        },
        pointLabels: {
          display: true,
          font: {
            size: 12,
            weight: "bold",
          },
          color: "#212529",
          padding: 15,
          centerPointLabels: true,
          callback: function (value: any, index: number) {
            if (Array.isArray(chartLabels[index])) {
              return chartLabels[index];
            }
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
                return words;
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
          const actualValue = actualValues[context.dataIndex];
          return actualValue === 0 ? "N/A" : actualValue;
        },
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
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
    const hasFlag = report.flag_category && report.flag_category.trim() !== "";

    if (hasFlag) {
      return {
        color: "warning",
        icon: report.is_archived ? "📄" : "🏳️",
        title: report.is_archived
          ? "Archived Report"
          : "Flag Assessment Report",
      };
    }

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

  const getFlagBadge = (flagCategory: string) => {
    const flagColor = getFlagColor(flagCategory);
    const textColor = getContrastTextColor(flagColor);

    return (
      <span
        className="badge"
        style={{
          backgroundColor: flagColor,
          color: textColor,
          border: "none",
        }}
      >
        {flagCategory || "Flag"}
      </span>
    );
  };

  const hasFlag = report.flag_category && report.flag_category.trim() !== "";
  const isFlagReport =
    hasFlag ||
    report.report_type?.toLowerCase() === "flag" ||
    report.report_type?.toLowerCase() === "flag assessment" ||
    report.report_type?.toLowerCase() === "flag_assessment";

  return (
    <div style={{ backgroundColor: "#f8f9fa", minHeight: "100vh" }}>
      <Container fluid="xl" className="py-4">
        {/* Page Header */}
        <div className="mb-4 d-flex justify-content-between align-items-center">
          <h3 className="mb-0">
            {reportInfo.icon} {report.player_name} - {reportInfo.title}
          </h3>
          <Button variant="dark" onClick={handleExportPDF}>
            📄 Export as PDF
          </Button>
        </div>

        <div ref={pageContentRef}>
          {report.is_archived && (
            <div className="archived-report-banner">
              📦 ARCHIVED REPORT - This is a historical report and does not
              affect player statistics or analytics.
            </div>
          )}

          {isFlagReport ? (
            <>
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
                        {report.squad_name ||
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
                      {!report.is_archived && (
                        <>
                          <p className="mb-1">
                            <strong>Position | Formation:</strong>{" "}
                            {report.position_played || "Not specified"} |{" "}
                            {report.formation || "Not specified"}
                          </p>
                          <p className="mb-0">
                            <strong>Build | Height:</strong>{" "}
                            {report.build || "N/A"} | {report.height || "N/A"}
                          </p>
                        </>
                      )}
                      {report.is_archived && (
                        <p className="mb-0">
                          <strong>Position:</strong>{" "}
                          {report.position_played || "Not specified"}
                        </p>
                      )}
                    </Col>
                    <Col md={4}>
                      <p className="mb-1">
                        <strong>Fixture Date:</strong>{" "}
                        {report.fixture_date
                          ? new Date(report.fixture_date).toLocaleDateString(
                              "en-GB",
                            )
                          : "N/A"}
                      </p>
                      <p className="mb-1">
                        <strong>Report Date:</strong>{" "}
                        {new Date(report.created_at).toLocaleDateString(
                          "en-GB",
                        )}
                      </p>
                      <p className="mb-0">
                        <strong>Scout:</strong> {report.scout_name}
                      </p>
                      <p className="mb-0 mt-2">
                        {report.is_archived && report.flag_category ? (
                          <>
                            <span
                              className="badge-grade me-2"
                              style={{
                                backgroundColor: getGradeColor(
                                  report.flag_category,
                                ),
                              }}
                            >
                              {report.flag_category}
                            </span>
                            {extractVSSScore(report.summary) && (
                              <span className="badge-vss">
                                VSS Score: {extractVSSScore(report.summary)}/32
                              </span>
                            )}
                          </>
                        ) : (
                          getFlagBadge(report.flag_category || "Not specified")
                        )}
                      </p>
                    </Col>
                  </Row>
                </Card.Body>
              </Card>

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
            <>
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
                            {report.squad_name ||
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
                            <strong>Fixture:</strong> {report.home_squad_name}{" "}
                            vs {report.away_squad_name}
                          </p>
                          {!report.is_archived && (
                            <>
                              <p className="mb-1">
                                <strong>Position | Formation:</strong>{" "}
                                {report.position_played || "Not specified"} |{" "}
                                {report.formation || "Not specified"}
                              </p>
                              <p className="mb-0">
                                <strong>Build | Height:</strong>{" "}
                                {report.build || "N/A"} |{" "}
                                {report.height || "N/A"}
                              </p>
                            </>
                          )}
                          {report.is_archived && (
                            <p className="mb-0">
                              <strong>Position:</strong>{" "}
                              {report.position_played || "Not specified"}
                            </p>
                          )}
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
                        {report.is_potential
                          ? "⭐ Potential Score"
                          : "🏆 Performance Score"}
                      </h6>
                    </Card.Header>
                    <Card.Body className="d-flex align-items-center justify-content-center py-2">
                      <div className="text-center">
                        <div className="mb-2">
                          <span
                            className={`badge performance-badge performance-score-large ${
                              report.performance_score === 9
                                ? "performance-score-9"
                                : report.performance_score === 10
                                ? "performance-score-10"
                                : ""
                            }`}
                            style={{
                              backgroundColor: getPerformanceScoreColor(
                                report.performance_score,
                              ),
                              color: "white",
                            }}
                            title={
                              report.is_potential
                                ? "Potential Score"
                                : undefined
                            }
                          >
                            {report.performance_score}
                            {report.is_potential && "*"}
                          </span>
                        </div>
                      </div>
                    </Card.Body>
                  </Card>
                </Col>
              </Row>

              <Row className="mb-3">
                <Col md={12}>
                  <Card>
                    <Card.Header className="py-2">
                      <h6 className="mb-0" style={{ fontSize: "14px" }}>
                        📈 Attribute Analysis
                      </h6>
                    </Card.Header>
                    <Card.Body className="py-2">
                      <Row>
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

                        <Col md={3} className="d-flex flex-column">
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
                            <strong
                              style={{ fontSize: "12px", color: "#333" }}
                            >
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
                          <strong
                            style={{ fontSize: "12px", color: "#333" }}
                          >
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
                            <strong
                              style={{ fontSize: "12px", color: "#333" }}
                            >
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
        </div>
      </Container>
      <div className="text-center py-4 text-muted">
        <small>This report was shared via a secure link</small>
      </div>
    </div>
  );
};

export default SharedReportPage;