import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Container,
  Row,
  Col,
  Card,
  Button,
  Form,
  Alert,
  Spinner,
  Modal,
  Table,
  Dropdown,
  Collapse,
} from "react-bootstrap";
import { PolarArea } from "react-chartjs-2";
import ChartDataLabels from "chartjs-plugin-datalabels";
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";
import axiosInstance from "../axiosInstance";
import PlayerReportModal from "../components/PlayerReportModal";
import IntelReportModal from "../components/IntelReportModal";
import ShareLinkModal from "../components/ShareLinkModal";
import { useViewMode } from "../contexts/ViewModeContext";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { getPerformanceScoreColor, getFlagColor, getContrastTextColor, getGradeColor } from "../utils/colorUtils";
import { extractVSSScore } from "../utils/reportUtils";
import {
  PlayerProfile,
  PlayerAttributes,
  AttributeData,
} from "../types/Player";

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

interface ScoutReport {
  report_id: number;
  report_date: string;
  scout_name: string;
  is_archived?: boolean;
  summary?: string;
  game_date: string | null;
  fixture: string | null;
  fixture_date: string | null;
  overall_rating: number | null;
  attribute_count: number;
  report_type: string | null;
  position_played: string | null;
  flag_category?: string;
  scouting_type?: string;
  is_potential?: boolean;
}

interface ScoutReportsData {
  player_id: number;
  total_reports: number;
  reports: ScoutReport[];
}

// Helper functions for flag badges
const getFlagBadge = (report: ScoutReport) => {
  // For archived reports, show grade badge in table view
  if (report.is_archived && report.flag_category) {
    // Format grade text to split on "/" for better wrapping
    const gradeText = report.flag_category.includes('/')
      ? report.flag_category.split('/').map((part, index, array) => (
          <React.Fragment key={index}>
            {part.trim()}{index < array.length - 1 && '/'}
            {index < array.length - 1 && <br />}
          </React.Fragment>
        ))
      : report.flag_category;

    return (
      <span
        className="badge-grade"
        style={{
          backgroundColor: getGradeColor(report.flag_category),
          color: "white",
          fontSize: "0.8rem",
          padding: "4px 8px",
          fontWeight: "500",
          lineHeight: "1.2",
        }}
        title={`Grade: ${report.flag_category}`}
      >
        {gradeText}
      </span>
    );
  }

  // For regular flag reports, show flag emoji with color
  const flagColor = getFlagColor(report.flag_category || "");
  return (
    <span
      className="badge"
      style={{
        backgroundColor: flagColor,
        color: "white",
        border: "none",
        cursor: "pointer",
        fontWeight: "500",
      }}
      title={`Flag: ${report.flag_category || "Unknown"}`}
    >
      🏳️
    </span>
  );
};

const getFlagTypeText = (flagType?: string) => {
  const flagColor = getFlagColor(flagType || "");

  return (
    <span
      className="badge"
      style={{
        backgroundColor: flagColor,
        color: "white",
        border: "none",
        fontWeight: "500",
        fontSize: "0.9rem",
      }}
    >
      {flagType || "Flag"}
    </span>
  );
};

const getScoutingTypeBadge = (scoutingType: string) => {
  const icon = scoutingType.toLowerCase() === "live" ? "🏟️" : "💻";
  return (
    <span
      className="badge badge-neutral-grey"
      style={{ cursor: "pointer", fontSize: "16px" }}
      title={`Scouting Type: ${scoutingType}`}
    >
      {icon}
    </span>
  );
};

const getReportTypeBadge = (
  reportType: string,
  _scoutingType: string,
  report: ScoutReport,
) => {
  // For archived reports in card view, don't show badge in Tags section
  // (they have ARCHIVED banner at top instead)
  if (report.is_archived) {
    return null;
  }

  switch (reportType.toLowerCase()) {
    case "flag":
    case "flag assessment":
      return getFlagBadge(report);
    case "clips":
      return <span className="badge badge-neutral-grey">Clips</span>;
    case "player assessment":
    case "player":
      return null; // Remove Player Assessment badge
    default:
      return <span className="badge badge-neutral-grey">{reportType}</span>;
  }
};

const PlayerProfilePage: React.FC = () => {
  const { playerId, cafcPlayerId } = useParams<{
    playerId?: string;
    cafcPlayerId?: string;
  }>();

  // Determine which ID to use - external or manual
  const actualPlayerId = playerId || cafcPlayerId;
  const navigate = useNavigate();
  const { viewMode, setViewMode } = useViewMode();
  const { canGenerateShareLinks } = useCurrentUser();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [attributes, setAttributes] = useState<PlayerAttributes | null>(null);
  const [scoutReportsData, setScoutReportsData] =
    useState<ScoutReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [attributesLoading, setAttributesLoading] = useState(true);
  const [scoutReportsLoading, setScoutReportsLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedReport, setSelectedReport] = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showIntelModal, setShowIntelModal] = useState(false);
  const [selectedIntelId, setSelectedIntelId] = useState<number | null>(null);
  const [loadingReportId, setLoadingReportId] = useState<number | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareReportId, setShareReportId] = useState<number | null>(null);

  // Notes functionality
  const [showAddNoteModal, setShowAddNoteModal] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [isPrivateNote, setIsPrivateNote] = useState(true);
  const [addingNote, setAddingNote] = useState(false);

  // Position filter for radar charts - updated for multi-select
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [positionAttributes, setPositionAttributes] = useState<string[]>([]);
  const [positionAttributeScores, setPositionAttributeScores] = useState<{
    [key: string]: number;
  }>({});
  const [availablePositions, setAvailablePositions] = useState<string[]>([]);
  const [positionCounts, setPositionCounts] = useState<Array<{position: string, report_count: number}>>([]);

  // Report filtering for attribute analysis
  const [selectedReportIds, setSelectedReportIds] = useState<number[]>([]);
  const [filteredReports, setFilteredReports] = useState<any[]>([]);
  const [filteredAttributeScores, setFilteredAttributeScores] = useState<{
    [key: string]: { avg_score: number; report_count: number };
  }>({});

  // Report carousel controls
  const [currentReportPage, setCurrentReportPage] = useState(0);

  // Collapsible sections
  const [scoutingHistoryExpanded, setScoutingHistoryExpanded] = useState(false);
  const [intelExpanded, setIntelExpanded] = useState(false);
  const [attributeBreakdownExpanded, setAttributeBreakdownExpanded] = useState(true);

  // View mode for Intel section
  const [intelViewMode, setIntelViewMode] = useState<"cards" | "table">("cards");

  // Player stages from lists
  const [playerStages, setPlayerStages] = useState<Array<{ list_name: string; stage: string }>>([]);

  // Red-green gradient color functions for scoring (now using utility)

  // Group-based color mapping using same colors as PlayerReportModal
  const getAttributeGroupColor = (groupName: string) => {
    // Define attribute groups and their colors - Professional Teal/Purple/Blue palette
    const groupColors = {
      "PHYSICAL / PSYCHOLOGICAL": "#009FB7", // Light blue - calm, balanced
      ATTACKING: "#9370DB", // Purple - energetic, forward-thinking
      DEFENDING: "#7FC8F8", // Light blue - strong, protective
    };

    // Map common group names to our color categories
    const normalizedName = groupName.toUpperCase();
    if (
      normalizedName.includes("PHYSICAL") ||
      normalizedName.includes("MENTAL") ||
      normalizedName.includes("PSYCHOLOGICAL")
    ) {
      return groupColors["PHYSICAL / PSYCHOLOGICAL"];
    }
    if (
      normalizedName.includes("ATTACKING") ||
      normalizedName.includes("TECHNICAL") ||
      normalizedName.includes("OFFENSIVE")
    ) {
      return groupColors["ATTACKING"];
    }
    if (
      normalizedName.includes("DEFENDING") ||
      normalizedName.includes("DEFENSIVE")
    ) {
      return groupColors["DEFENDING"];
    }

    // Default fallback color
    return "#6c757d";
  };

  // Position options from ScoutingAssessmentModal
  const playerPositions = [
    "GK",
    "RB",
    "RWB",
    "RCB(3)",
    "RCB(2)",
    "CCB(3)",
    "LCB(2)",
    "LCB(3)",
    "LWB",
    "LB",
    "DM",
    "CM",
    "RAM",
    "AM",
    "LAM",
    "RW",
    "LW",
    "Target Man CF",
    "In Behind CF",
  ];

  // Get available positions from scout reports
  const getAvailablePositions = () => {
    if (!profile?.scout_reports) return [];
    const positions = profile.scout_reports
      .map((report) => report.position_played)
      .filter((pos) => pos && pos.trim() !== "")
      .filter((pos, index, arr) => arr.indexOf(pos) === index);
    return positions;
  };

  // Handle position change - updated to support multiple positions
  const handlePositionChange = async (positions: string[]) => {
    setSelectedPositions(positions);

    if (positions.length > 0) {
      try {
        // Fetch attributes for all selected positions
        const attributePromises = positions.map(position =>
          axiosInstance.get(`/attributes/${position}`)
        );
        const responses = await Promise.all(attributePromises);

        // Union of all attributes from selected positions
        const allPositionAttributes = new Set<string>();
        responses.forEach(response => {
          response.data.forEach((attr: string) => allPositionAttributes.add(attr));
        });

        const mergedAttributes = Array.from(allPositionAttributes);
        setPositionAttributes(mergedAttributes);

        // If reports are selected, re-fetch data from ALL selected reports (no position filter to backend)
        // Position selection only determines which attributes to DISPLAY, not which reports to include
        if (selectedReportIds.length > 0) {
          // Fetch all attributes from selected reports without position filter
          await fetchFilteredAttributes(selectedReportIds);
        } else {
          // No reports selected - fetch position-based aggregation across all reports
          const params = new URLSearchParams();
          params.append('position_filter', positions.join(','));

          const attributeResponse = await axiosInstance.get(
            `/players/${playerId}/attributes?${params.toString()}`
          );

          // Extract scores from the response
          const positionScores: { [key: string]: number } = {};
          if (attributeResponse.data?.attribute_groups) {
            Object.values(attributeResponse.data.attribute_groups).flat().forEach((attr: any) => {
              positionScores[attr.name] = attr.average_score;
            });
          }

          setPositionAttributeScores(positionScores);
        }

        // Update filtered reports based on selected positions
        updateFilteredReports(positions, selectedReportIds);
      } catch (error) {
        console.error("Error fetching attributes:", error);
        setPositionAttributes([]);
        setPositionAttributeScores({});
      }
    } else {
      setPositionAttributes([]);
      setPositionAttributeScores({});
      // If reports are still selected, re-fetch with auto-detected positions
      if (selectedReportIds.length > 0) {
        fetchFilteredAttributes(selectedReportIds);
      } else {
        setFilteredAttributeScores({});
      }
      // Reset filtered reports when no positions selected
      updateFilteredReports([], selectedReportIds);
    }
  };

  // Update filtered reports based on position and report selections
  const updateFilteredReports = (positions: string[], reportIds: number[]) => {
    if (!scoutReportsData?.reports) {
      setFilteredReports([]);
      return;
    }

    let filtered = scoutReportsData.reports;

    // Filter by positions if any are selected
    if (positions.length > 0) {
      filtered = filtered.filter(report =>
        report.position_played && positions.includes(report.position_played)
      );
    }

    setFilteredReports(filtered);
  };

  // Handle report selection for attribute filtering
  const handleReportSelection = (reportIds: number[]) => {
    setSelectedReportIds(reportIds);
    // Fetch filtered attribute scores from backend
    if (reportIds.length > 0) {
      fetchFilteredAttributes(reportIds);
    } else {
      setFilteredAttributeScores({});
    }
  };

  // Fetch filtered attributes based on selected reports
  const fetchFilteredAttributes = async (reportIds: number[]) => {
    if (!playerId || reportIds.length === 0) {
      setFilteredAttributeScores({});
      return;
    }

    try {
      const params = new URLSearchParams();
      params.append('report_ids', reportIds.join(','));

      // If no position is manually selected, extract positions from the selected reports
      // and update positionAttributes for chart display
      if (selectedPositions.length === 0 && scoutReportsData?.reports) {
        const selectedReports = scoutReportsData.reports.filter(r => reportIds.includes(r.report_id));
        const reportPositions = Array.from(new Set(selectedReports.map(r => r.position_played).filter((pos): pos is string => Boolean(pos))));

        // Update position attributes for the chart
        if (reportPositions.length > 0) {
          try {
            const positionAttrs = await Promise.all(
              reportPositions.map((pos) =>
                axiosInstance.get(`/attributes/${pos}`)
              )
            );
            const allPositionAttributes = new Set<string>();
            positionAttrs.forEach((res) => {
              res.data.forEach((attr: string) =>
                allPositionAttributes.add(attr)
              );
            });
            setPositionAttributes(Array.from(allPositionAttributes));
          } catch (error) {
            console.error("Error fetching position attributes:", error);
          }
        }
      }

      // Do NOT send position_filter to backend when fetching report-based data
      // Position selection only controls which attributes to DISPLAY on frontend
      // Backend should return ALL attributes from the selected reports
      const response = await axiosInstance.get(
        `/players/${playerId}/attributes?${params.toString()}`
      );

      // Transform response to match expected format
      const scores: { [key: string]: { avg_score: number; report_count: number } } = {};

      if (response.data?.attribute_groups) {
        Object.values(response.data.attribute_groups).flat().forEach((attr: any) => {
          scores[attr.name] = {
            avg_score: attr.average_score,
            report_count: attr.report_count,
          };
        });
      }

      setFilteredAttributeScores(scores);
    } catch (error) {
      console.error("Error fetching filtered attributes:", error);
      setFilteredAttributeScores({});
    }
  };

  // Clear all filters
  const clearFilters = () => {
    setSelectedPositions([]);
    setSelectedReportIds([]);
    setFilteredReports([]);
    setFilteredAttributeScores({});
    setPositionAttributes([]);
    setPositionAttributeScores({});
  };

  // Helper functions for attribute grouping (copied from PlayerReportModal)
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

  const getPositionAttributeGroupColor = (attributeName: string) => {
    // Group-based color mapping using exact colors from PlayerReportModal
    const groupColors: { [key: string]: string } = {
      "PHYSICAL / PSYCHOLOGICAL": "#009FB7", // Light blue   - calm, balanced
      ATTACKING: "#9370DB", // Purple - energetic, forward-thinking
      DEFENDING: "#7FC8F8", // Brown - strong, protective
    };

    const group = getAttributeGroup(attributeName);
    return groupColors[group.group] || "#009FB7"; // Fallback to default color
  };

  // Function to convert score to level description (from PlayerReportModal)
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

  // Get polar area chart data using exact logic from PlayerReportModal
  const getPolarAreaChartData = () => {
    // Check if we have attributes and scores (either from position selection or report selection)
    const hasScores = Object.keys(positionAttributeScores).length > 0 || Object.keys(filteredAttributeScores).length > 0;
    if (!positionAttributes.length || !hasScores) return null;

    // Use filtered scores if reports are selected, otherwise use position-filtered scores
    const scoresToUse = selectedReportIds.length > 0 && Object.keys(filteredAttributeScores).length > 0
      ? filteredAttributeScores
      : positionAttributeScores;

    // When both reports and positions are selected:
    // - scoresToUse contains ALL attributes from selected reports (no position filter on backend)
    // - positionAttributes contains only attributes from manually selected positions
    // - We filter to show only attributes that are BOTH in positionAttributes AND have scores in the selected reports

    // Sort attributes by group like PlayerReportModal
    const sortedAttributes = positionAttributes
      .filter((attr) => {
        // Only include attributes that exist in the score data
        // This ensures we only show position-relevant attributes that actually have data in the selected reports
        return scoresToUse[attr] !== undefined;
      })
      .map((attr) => {
        // Handle both formats: direct number or object with avg_score
        const score = typeof scoresToUse[attr] === 'object'
          ? (scoresToUse[attr] as { avg_score: number; report_count: number }).avg_score
          : (scoresToUse[attr] || 0);
        return [attr, score];
      })
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
      (value as number) === 0
        ? "rgba(224, 224, 224, 0.5)"
        : getPositionAttributeGroupColor(attributeName as string),
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

    return {
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
      actualValues, // Store actual values for tooltips
    };
  };

  // Calculate average performance score from scout reports
  const calculateAveragePerformanceScore = () => {
    if (!profile?.scout_reports || profile.scout_reports.length === 0) {
      return null;
    }

    const reportsWithScores = profile.scout_reports.filter(
      (report) => report.performance_score && report.performance_score > 0,
    );
    if (reportsWithScores.length === 0) {
      return null;
    }

    const total = reportsWithScores.reduce(
      (sum, report) => sum + report.performance_score,
      0,
    );
    return Math.round((total / reportsWithScores.length) * 10) / 10; // Round to 1 decimal place
  };

  useEffect(() => {
    if (actualPlayerId) {
      fetchPlayerProfile();
      fetchPlayerAttributes();
      fetchScoutReports();
      fetchPositionCounts();
      fetchPlayerStages();
    }
  }, [actualPlayerId]);

  // Update available positions when profile changes
  useEffect(() => {
    if (profile) {
      const positions = getAvailablePositions();
      setAvailablePositions(positions);
      // No default selection - user must select positions manually
    }
  }, [profile]);

  const fetchPlayerProfile = async () => {
    if (!actualPlayerId) {
      setError("No player ID provided");
      setLoading(false);
      return;
    }

    try {
      const response = await axiosInstance.get(
        `/players/${actualPlayerId}/profile`,
      );
      setProfile(response.data);
    } catch (error: any) {
      console.error("Error fetching player profile:", error);
      setError("Failed to load player profile");
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
      const response = await axiosInstance.get(
        `/players/${actualPlayerId}/attributes`,
      );
      setAttributes(response.data);
    } catch (error: any) {
      console.error("Error fetching player attributes:", error);
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
      const response = await axiosInstance.get(
        `/players/${actualPlayerId}/scout-reports`,
      );
      setScoutReportsData(response.data);
    } catch (error: any) {
      console.error("Error fetching scout reports:", error);
      // Don't set main error - scout reports are optional
    } finally {
      setScoutReportsLoading(false);
    }
  };

  const fetchPositionCounts = async () => {
    if (!actualPlayerId) {
      return;
    }

    try {
      const response = await axiosInstance.get(
        `/players/${actualPlayerId}/position-counts`,
      );
      setPositionCounts(response.data.position_counts || []);
    } catch (error: any) {
      console.error("Error fetching position counts:", error);
    }
  };

  const fetchPlayerStages = async () => {
    if (!actualPlayerId) {
      console.log("fetchPlayerStages: No actualPlayerId");
      return;
    }

    try {
      console.log(`fetchPlayerStages: Fetching stages for player ${actualPlayerId}`);
      const response = await axiosInstance.get(
        `/players/${actualPlayerId}/lists`,
      );
      console.log("fetchPlayerStages: Response received:", response.data);
      // Extract list name and stage from each list membership
      const listData = response.data.lists || response.data; // Handle both formats
      const stages = listData.map((item: any) => ({
        list_name: item.list_name,
        stage: item.stage,
      }));
      console.log("fetchPlayerStages: Extracted stages:", stages);
      setPlayerStages(stages);
    } catch (error: any) {
      console.error("Error fetching player stages:", error);
      console.error("Error details:", error.response?.data);
    }
  };

  const handleOpenReportModal = async (reportId: number) => {
    setLoadingReportId(reportId);
    try {
      const response = await axiosInstance.get(`/scout_reports/${reportId}`);
      setSelectedReport(response.data);
      setShowReportModal(true);
    } catch (error) {
      console.error("Error fetching report:", error);
    } finally {
      setLoadingReportId(null);
    }
  };

  const addNote = async () => {
    if (!profile || !newNote.trim()) return;

    setAddingNote(true);
    try {
      await axiosInstance.post(`/players/${profile.player_id}/notes`, {
        player_id: profile.player_id,
        note_content: newNote.trim(),
        is_private: isPrivateNote,
      });

      setNewNote("");
      setIsPrivateNote(true);
      setShowAddNoteModal(false);

      fetchPlayerProfile();
    } catch (error) {
      console.error("Error adding note:", error);
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
            <h5>⚠️ {error || "Player not found"}</h5>
            <Button
              variant="outline-dark"
              size="sm"
              onClick={() => navigate(-1)}
            >
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
                  <div className="player-position">{profile.position}</div>
                  <div className="club-name">{profile.squad_name}</div>
                  <div className="position-age">
                    {profile.birth_date
                      ? `${new Date(profile.birth_date).toLocaleDateString("en-GB")} (${profile.age})`
                      : "N/A"}
                  </div>
                </div>
                {(() => {
                  const avgScore = calculateAveragePerformanceScore();
                  return (
                    avgScore && (
                      <div className="average-performance-score mt-2">
                        <span className="score-label">
                          Average Performance Score:
                        </span>
                        <span
                          className={`badge score-badge ms-2 ${
                            avgScore === 9 ? 'performance-score-9' :
                            avgScore === 10 ? 'performance-score-10' : ''
                          }`}
                          style={{
                            backgroundColor: getPerformanceScoreColor(avgScore),
                            color: "white !important",
                            fontWeight: "bold",
                            fontSize: "1rem",
                            padding: "0.4rem 0.8rem",
                            ...(avgScore !== 9 && avgScore !== 10 ? { border: "none" } : {}),
                          }}
                        >
                          {avgScore}/10
                        </span>
                      </div>
                    )
                  );
                })()}
                {/* Player Stages from Lists */}
                {playerStages.length > 0 && (
                  <div className="player-stages mt-2">
                    <span className="score-label">Stage:</span>
                    {playerStages.map((stageInfo, index) => {
                      // Color code stages
                      const getStageColor = (stage: string) => {
                        switch (stage) {
                          case "Stage 1": return "#6c757d";
                          case "Stage 2": return "#0dcaf0";
                          case "Stage 3": return "#ffc107";
                          case "Stage 4": return "#198754";
                          case "Archived": return "#dc3545";
                          default: return "#6c757d";
                        }
                      };

                      return (
                        <span
                          key={index}
                          className="badge stage-badge ms-2 me-2 mb-1"
                          style={{
                            backgroundColor: getStageColor(stageInfo.stage),
                            color: "white",
                            fontWeight: "500",
                            fontSize: "0.85rem",
                            padding: "0.3rem 0.6rem",
                          }}
                        >
                          {stageInfo.stage}
                        </span>
                      );
                    })}
                  </div>
                )}
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

        {/* Reports Row - Scouting/Intel Stack + Attributes Side by Side */}
        <Row className="mt-4 mb-4">
          {/* Left Column - Scouting History and Intel Stacked */}
          <Col lg={5} className="mb-4 mb-lg-0">
            {/* Recent Scouting History */}
            <div className="horizontal-timeline-section mb-4">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <div className="d-flex align-items-center gap-2">
                  <h4 className="section-title mb-0">📅 Scouting History</h4>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => setScoutingHistoryExpanded(!scoutingHistoryExpanded)}
                    style={{
                      textDecoration: "none",
                      color: "#666",
                      fontSize: "1.2rem",
                      padding: "0",
                    }}
                    title={scoutingHistoryExpanded ? "Collapse" : "Expand"}
                  >
                    {scoutingHistoryExpanded ? "▲" : "▼"}
                  </Button>
                </div>
                {scoutingHistoryExpanded && (
                  <div className="btn-group">
                    <Button
                      variant={viewMode === "cards" ? "secondary" : "outline-secondary"}
                      size="sm"
                      onClick={() => setViewMode("cards")}
                      style={
                        viewMode === "cards"
                          ? {
                              backgroundColor: "#000000",
                              borderColor: "#000000",
                              color: "white",
                            }
                          : { color: "#000000", borderColor: "#000000" }
                      }
                    >
                      Cards
                    </Button>
                    <Button
                      variant={viewMode === "table" ? "secondary" : "outline-secondary"}
                      size="sm"
                      onClick={() => setViewMode("table")}
                      style={
                        viewMode === "table"
                          ? {
                              backgroundColor: "#000000",
                              borderColor: "#000000",
                              color: "white",
                            }
                          : { color: "#000000", borderColor: "#000000" }
                      }
                    >
                      Table
                    </Button>
                  </div>
                )}
              </div>

          {scoutReportsLoading ? (
            <div className="text-center py-3">
              <Spinner animation="border" size="sm" className="me-2" />
              Loading scout reports...
            </div>
          ) : scoutReportsData && scoutReportsData.reports.length > 0 ? (
            <>
              {/* Summary Stats - Always Visible */}
              <div className="timeline-summary-compact mb-3" style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.4rem",
                fontSize: "0.85rem",
                backgroundColor: "#ffffff",
                padding: "0.75rem",
                borderRadius: "6px",
                border: "1px solid #e5e7eb",
                textAlign: "center"
              }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "center" }}>
                  <span className="summary-stat">
                    <strong>{scoutReportsData.total_reports}</strong> reports
                  </span>
                  <span className="summary-stat">
                    <strong>
                      {
                        scoutReportsData.reports.filter(
                          (r) => r.overall_rating && r.overall_rating >= 7,
                        ).length
                      }
                    </strong>{" "}
                    high ratings (7+)
                  </span>
                  <span className="summary-stat">
                    <strong>
                      {
                        new Set(scoutReportsData.reports.map((r) => r.scout_name))
                          .size
                      }
                    </strong>{" "}
                    different scouts
                  </span>
                </div>

                {scoutReportsData.reports.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "center" }}>
                    <span className="summary-stat">
                      Latest Assessment: <strong>{new Date(scoutReportsData.reports[0].report_date).toLocaleDateString()}</strong>
                    </span>
                    {scoutReportsData.reports[0].overall_rating && (
                      <span className="summary-stat">
                        Latest Score:
                        <span
                          className="badge ms-1"
                          style={{
                            backgroundColor: getPerformanceScoreColor(scoutReportsData.reports[0].overall_rating),
                            color: "white",
                            fontSize: "0.7rem",
                            padding: "2px 6px",
                          }}
                        >
                          {scoutReportsData.reports[0].overall_rating}
                        </span>
                      </span>
                    )}
                    {(() => {
                      const positionCounts = scoutReportsData.reports
                        .filter(r => r.position_played)
                        .reduce((acc: { [key: string]: number }, r) => {
                          acc[r.position_played!] = (acc[r.position_played!] || 0) + 1;
                          return acc;
                        }, {});
                      const topPositions = Object.entries(positionCounts)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 3)
                        .map(([pos, count]) => `${count} ${pos}`)
                        .join(", ");
                      return topPositions && (
                        <span className="summary-stat">
                          Positions: <strong>{topPositions}</strong>
                        </span>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Collapsible Details Section */}
              <Collapse in={scoutingHistoryExpanded}>
                <div>
                  {/* Conditional Rendering: Table View or Cards View */}
                  {viewMode === "table" ? (
                /* TABLE VIEW */
                <div className="table-responsive">
                  <Table
                    responsive
                    hover
                    striped
                    className="table-compact table-sm"
                    style={{ textAlign: "center" }}
                  >
                    <thead className="table-dark">
                      <tr>
                        <th>Report Date</th>
                        <th>Scout</th>
                        <th>Type</th>
                        <th>Fixture Date</th>
                        <th>Fixture</th>
                        <th>Position</th>
                        <th>Score</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scoutReportsData.reports.map((report) => (
                        <tr key={report.report_id}>
                          <td>
                            {report.report_date
                              ? new Date(report.report_date).toLocaleDateString()
                              : "N/A"}
                          </td>
                          <td>{report.scout_name || "N/A"}</td>
                          <td>
                            {getReportTypeBadge(
                              report.report_type || "",
                              report.scouting_type || "",
                              report,
                            )}
                            {report.scouting_type && (
                              <span className="ms-1">
                                {getScoutingTypeBadge(report.scouting_type)}
                              </span>
                            )}
                            {report.is_archived && report.flag_category && (
                              <span className="ms-1">
                                <span
                                  className="badge-grade"
                                  style={{
                                    backgroundColor: getGradeColor(report.flag_category),
                                    color: "white",
                                    fontSize: "0.65rem",
                                    padding: "2px 6px",
                                    fontWeight: "500",
                                    lineHeight: "1.2",
                                  }}
                                  title={`Grade: ${report.flag_category}`}
                                >
                                  {report.flag_category.includes('/')
                                    ? report.flag_category.split('/').map((part, index, array) => (
                                        <React.Fragment key={index}>
                                          {part.trim()}{index < array.length - 1 && '/'}
                                          {index < array.length - 1 && <br />}
                                        </React.Fragment>
                                      ))
                                    : report.flag_category}
                                </span>
                              </span>
                            )}
                          </td>
                          <td>
                            {report.fixture_date
                              ? new Date(report.fixture_date).toLocaleDateString()
                              : report.game_date
                              ? new Date(report.game_date).toLocaleDateString()
                              : "N/A"}
                          </td>
                          <td>{report.fixture || "N/A"}</td>
                          <td>{report.position_played || "N/A"}</td>
                          <td>
                            <div className="d-flex align-items-center justify-content-center gap-1">
                              <span
                                className={`badge ${
                                  report.overall_rating === 9 ? 'performance-score-9' :
                                  report.overall_rating === 10 ? 'performance-score-10' : ''
                                }`}
                                style={{
                                  backgroundColor: getPerformanceScoreColor(
                                    report.overall_rating || 0,
                                  ),
                                  color: "white !important",
                                  fontWeight: "bold",
                                  fontSize: "0.9rem",
                                  ...(report.overall_rating !== 9 && report.overall_rating !== 10 ? { border: "none" } : {}),
                                }}
                                title={report.is_potential ? "Potential Score" : undefined}
                              >
                                {report.overall_rating}{report.is_potential && "*"}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div
                              className="btn-group"
                              style={{ justifyContent: "center" }}
                            >
                              <Button
                                size="sm"
                                onClick={() => {
                                  if (
                                    report.report_type?.toLowerCase() === "intel" ||
                                    report.report_type?.toLowerCase() === "intel report"
                                  ) {
                                    setSelectedIntelId(report.report_id);
                                    setShowIntelModal(true);
                                  } else {
                                    handleOpenReportModal(report.report_id);
                                  }
                                }}
                                disabled={loadingReportId === report.report_id}
                                title="View Report"
                                className="btn-action-circle btn-action-view"
                              >
                                {loadingReportId === report.report_id ? (
                                  <Spinner as="span" animation="border" size="sm" />
                                ) : (
                                  "👁️"
                                )}
                              </Button>
                              {canGenerateShareLinks && (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setShareReportId(report.report_id);
                                    setShowShareModal(true);
                                  }}
                                  title="Generate shareable link"
                                  className="btn-action-circle ms-1"
                                >
                                  🔗
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
                  ) : (
                    /* Report Cards - Fixed Height Scrollable Container */
                    <div style={{
                      maxHeight: "400px",
                      overflowY: "auto",
                      overflowX: "hidden",
                      paddingRight: "10px",
                      marginBottom: "1rem"
                    }}>
                      <Row>
                        {scoutReportsData.reports.map((report, index) => (
                          <Col key={report.report_id} className="mb-3" xs={12} md={6}>
                            <Card
                              className={`shadow-sm hover-card ${report.is_archived ? 'report-card-archived' : ''}`}
                              style={{ borderRadius: "8px", border: "1px solid #dee2e6", height: "100%" }}
                            >
                      <Card.Body className="p-3">
                        {/* Top Row - 2 columns */}
                        <Row className="mb-3 pb-2 border-bottom">
                          {/* Left: Player Info */}
                          <Col xs={6}>
                            <div>
                              <div
                                className="fw-bold d-block mb-1"
                                style={{
                                  color: "#212529",
                                  fontSize: "1rem",
                                  textAlign: "left",
                                }}
                              >
                                {profile.player_name}
                              </div>
                              <small className="text-muted d-block">
                                Position: {report.position_played || "N/A"}
                              </small>
                              <small className="text-muted d-block">
                                Age: {profile.age || "N/A"}
                              </small>
                            </div>
                          </Col>

                          {/* Right: Scout Info */}
                          <Col xs={6} className="text-end">
                            <div>
                              {report.is_archived && (
                                <span className="badge-archived d-block mb-1">ARCHIVED</span>
                              )}
                              <small className="text-muted d-block">
                                {report.scout_name}
                              </small>
                              <small className="text-muted d-block">
                                Report Date:{" "}
                                {new Date(report.report_date).toLocaleDateString()}
                              </small>
                            </div>
                          </Col>
                        </Row>

                        {/* Middle Row - 2 columns */}
                        <Row className="mb-3 pb-2 border-bottom">
                          {/* Left: Fixture Info */}
                          <Col xs={6}>
                            <div>
                              {report.fixture_date && report.fixture_date !== "N/A" ? (
                                <>
                                  <small
                                    className="text-muted d-block mb-1"
                                    style={{ fontSize: "0.75rem", lineHeight: "1.2" }}
                                  >
                                    <span className="fw-semibold">Fixture Date:</span>{" "}
                                    {new Date(report.fixture_date).toLocaleDateString()}
                                  </small>
                                  {report.fixture && report.fixture !== "N/A" && (
                                    <small
                                      className="text-muted d-block"
                                      style={{ fontSize: "0.75rem", lineHeight: "1.2" }}
                                    >
                                      <span className="fw-semibold">Fixture:</span>{" "}
                                      {report.fixture}
                                    </small>
                                  )}
                                </>
                              ) : (
                                <>
                                  <small
                                    className="text-muted d-block mb-1"
                                    style={{ fontSize: "0.75rem", lineHeight: "1.2" }}
                                  >
                                    <span className="fw-semibold">Fixture Date:</span> N/A
                                  </small>
                                  <small
                                    className="text-muted d-block"
                                    style={{ fontSize: "0.75rem", lineHeight: "1.2" }}
                                  >
                                    <span className="fw-semibold">Fixture:</span> N/A
                                  </small>
                                </>
                              )}
                            </div>
                          </Col>

                          {/* Right: Score */}
                          <Col xs={6} className="text-end">
                            <div>
                              {report.is_archived && report.flag_category ? (
                                <>
                                  <span
                                    className="badge-grade d-block mb-1"
                                    style={{
                                      backgroundColor: getGradeColor(report.flag_category),
                                      fontSize: "0.7rem",
                                      lineHeight: "1.2",
                                    }}
                                  >
                                    {report.flag_category.includes('/')
                                      ? report.flag_category.split('/').map((part, index, array) => (
                                          <React.Fragment key={index}>
                                            {part.trim()}{index < array.length - 1 && '/'}
                                            {index < array.length - 1 && <br />}
                                          </React.Fragment>
                                        ))
                                      : report.flag_category}
                                  </span>
                                  {report.summary && extractVSSScore(report.summary!) && (
                                    <span className="badge-vss d-block" style={{ fontSize: "0.7rem" }}>
                                      VSS Score: {extractVSSScore(report.summary)}/32
                                    </span>
                                  )}
                                </>
                              ) : report.report_type?.toLowerCase() !== "flag" &&
                                report.report_type?.toLowerCase() !== "flag assessment" ? (
                                <>
                                  <small className="text-muted fw-semibold d-block">Score</small>
                                  {report.overall_rating && (
                                    <span
                                      className={`badge ${
                                        report.overall_rating === 9 ? 'performance-score-9' :
                                        report.overall_rating === 10 ? 'performance-score-10' : ''
                                      }`}
                                      style={{
                                        backgroundColor: getPerformanceScoreColor(
                                          report.overall_rating,
                                        ),
                                        color: "white !important",
                                        fontWeight: "bold",
                                        fontSize: "0.9rem",
                                        ...(report.overall_rating !== 9 && report.overall_rating !== 10 ? { border: "none" } : {}),
                                      }}
                                      title={report.is_potential ? "Potential Score" : undefined}
                                    >
                                      {report.overall_rating}{report.is_potential && "*"}
                                    </span>
                                  )}
                                </>
                              ) : (
                                getFlagTypeText(report.flag_category)
                              )}
                            </div>
                          </Col>
                        </Row>

                        {/* Bottom Row - Tags and Actions */}
                        <Row className="align-items-center">
                          {/* Left: Tags */}
                          <Col xs={6}>
                            <div className="d-flex align-items-center gap-1">
                              <small className="text-muted fw-semibold me-1">Tags:</small>
                              {getReportTypeBadge(
                                report.report_type || "",
                                report.scouting_type || "",
                                report,
                              )}
                              {report.scouting_type && (
                                <span className="ms-1">
                                  {getScoutingTypeBadge(report.scouting_type)}
                                </span>
                              )}
                            </div>
                          </Col>

                          {/* Right: Actions */}
                          <Col xs={6} className="text-end">
                            <div className="d-flex justify-content-end gap-1">
                              <Button
                                size="sm"
                                onClick={() => handleOpenReportModal(report.report_id)}
                                disabled={loadingReportId === report.report_id}
                                title="View Report"
                                className="btn-action-circle btn-action-view"
                              >
                                {loadingReportId === report.report_id ? (
                                  <Spinner as="span" animation="border" size="sm" />
                                ) : (
                                  "👁️"
                                )}
                              </Button>
                              {canGenerateShareLinks && (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setShareReportId(report.report_id);
                                    setShowShareModal(true);
                                  }}
                                  title="Generate shareable link"
                                  className="btn-action-circle"
                                >
                                  🔗
                                </Button>
                              )}
                            </div>
                          </Col>
                        </Row>
                      </Card.Body>
                    </Card>
                  </Col>
                ))}
                    </Row>
                    </div>
                  )}
                </div>
              </Collapse>
            </>
          ) : (
              <div className="empty-state-compact">
                <p>No scout reports available yet.</p>
              </div>
            )}
            </div>

            {/* Player Intel Section */}
            {profile.intel_reports && profile.intel_reports.length > 0 ? (
              <div className="horizontal-timeline-section">
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <div className="d-flex align-items-center gap-2">
                    <h4 className="section-title mb-0">📋 Intel History</h4>
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => setIntelExpanded(!intelExpanded)}
                      style={{
                        textDecoration: "none",
                        color: "#666",
                        fontSize: "1.2rem",
                        padding: "0",
                      }}
                      title={intelExpanded ? "Collapse" : "Expand"}
                    >
                      {intelExpanded ? "▲" : "▼"}
                    </Button>
                  </div>
                  {intelExpanded && (
                    <div className="btn-group">
                      <Button
                        variant={intelViewMode === "cards" ? "secondary" : "outline-secondary"}
                        size="sm"
                        onClick={() => setIntelViewMode("cards")}
                        style={
                          intelViewMode === "cards"
                            ? {
                                backgroundColor: "#000000",
                                borderColor: "#000000",
                                color: "white",
                              }
                            : { color: "#000000", borderColor: "#000000" }
                        }
                      >
                        Cards
                      </Button>
                      <Button
                        variant={intelViewMode === "table" ? "secondary" : "outline-secondary"}
                        size="sm"
                        onClick={() => setIntelViewMode("table")}
                        style={
                          intelViewMode === "table"
                            ? {
                                backgroundColor: "#000000",
                                borderColor: "#000000",
                                color: "white",
                              }
                            : { color: "#000000", borderColor: "#000000" }
                        }
                      >
                        Table
                      </Button>
                    </div>
                  )}
                </div>

            {/* Summary Stats - Always Visible */}
            <div className="timeline-summary-compact mb-3" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", fontSize: "0.85rem" }}>
              <span className="summary-stat">
                <strong>{profile.intel_reports.length}</strong> intel report{profile.intel_reports.length !== 1 ? 's' : ''}
              </span>
              <span className="summary-stat">
                <strong>
                  {profile.intel_reports.filter((intel) => intel.action_required === "Discuss Urgently").length}
                </strong>{" "}
                urgent
              </span>
              <span className="summary-stat">
                <strong>
                  {new Set(profile.intel_reports.map((intel) => intel.contact_name)).size}
                </strong>{" "}
                different contacts
              </span>
            </div>

            {/* Collapsible Details Section */}
            <Collapse in={intelExpanded}>
              <div>
                {/* Conditional Rendering: Table View or Cards View */}
                {intelViewMode === "table" ? (
                  /* TABLE VIEW */
                  <div className="table-responsive">
                    <Table
                      responsive
                      hover
                      striped
                      className="table-compact table-sm"
                      style={{ textAlign: "center" }}
                    >
                      <thead className="table-dark">
                        <tr>
                          <th>Date</th>
                          <th>Contact</th>
                          <th>Organisation</th>
                          <th>Action Required</th>
                          <th>Transfer Fee</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profile.intel_reports.map((intel) => {
                          const getActionColor = (action: string) => {
                            switch (action) {
                              case "Discuss Urgently": return "#dc3545";
                              case "Monitor": return "#ffc107";
                              case "Beyond Us": return "#6c757d";
                              case "No Action": return "#6c757d";
                              default: return "#6c757d";
                            }
                          };

                          return (
                            <tr key={intel.intel_id}>
                              <td>
                                {intel.created_at
                                  ? new Date(intel.created_at).toLocaleDateString()
                                  : "N/A"}
                              </td>
                              <td>{intel.contact_name || "N/A"}</td>
                              <td>{intel.contact_organisation || "N/A"}</td>
                              <td>
                                <span
                                  className="badge"
                                  style={{
                                    backgroundColor: getActionColor(intel.action_required),
                                    color: "white",
                                    fontWeight: "500",
                                    fontSize: "0.75rem",
                                  }}
                                >
                                  {intel.action_required || "N/A"}
                                </span>
                              </td>
                              <td>{intel.transfer_fee || "N/A"}</td>
                              <td>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setSelectedIntelId(intel.intel_id);
                                    setShowIntelModal(true);
                                  }}
                                  title="View Intel Report"
                                  className="btn-action-circle btn-action-view"
                                >
                                  👁️
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </Table>
                  </div>
                ) : (
                  /* CARDS VIEW - Fixed Height Scrollable Container */
                  <div style={{
                    maxHeight: "400px",
                    overflowY: "auto",
                    overflowX: "hidden",
                    paddingRight: "10px",
                    marginBottom: "1rem"
                  }}>
                      <Row>
                        {profile.intel_reports.map((intel) => {
                          const getActionColor = (action: string) => {
                            switch (action) {
                              case "Discuss Urgently": return "#dc3545";
                              case "Monitor": return "#ffc107";
                              case "Beyond Us": return "#6c757d";
                              case "No Action": return "#6c757d";
                              default: return "#6c757d";
                            }
                          };

                          return (
                            <Col key={intel.intel_id} className="mb-3" xs={12} md={6}>
                              <Card
                                className="shadow-sm hover-card"
                                style={{ borderRadius: "8px", border: "1px solid #dee2e6", height: "100%" }}
                              >
                              <Card.Body className="p-3">
                                {/* Top Row - Contact Info */}
                                <Row className="mb-3 pb-2 border-bottom">
                                  <Col xs={12}>
                                    <div className="fw-bold d-block mb-1" style={{ color: "#212529", fontSize: "0.95rem" }}>
                                      {intel.contact_name || "Unknown Contact"}
                                    </div>
                                    <small className="text-muted d-block" style={{ fontSize: "0.8rem" }}>
                                      {intel.contact_organisation || "No Organisation"}
                                    </small>
                                    <small className="text-muted d-block" style={{ fontSize: "0.75rem" }}>
                                      {intel.created_at
                                        ? new Date(intel.created_at).toLocaleDateString()
                                        : "N/A"}
                                    </small>
                                  </Col>
                                </Row>

                                {/* Middle Row - Action Required */}
                                <Row className="mb-3 pb-2 border-bottom">
                                  <Col xs={12}>
                                    <small className="text-muted fw-semibold d-block mb-1">Action Required</small>
                                    <span
                                      className="badge"
                                      style={{
                                        backgroundColor: getActionColor(intel.action_required),
                                        color: "white",
                                        fontWeight: "500",
                                        fontSize: "0.75rem",
                                      }}
                                    >
                                      {intel.action_required || "N/A"}
                                    </span>
                                  </Col>
                                </Row>

                                {/* Transfer Fee & Notes */}
                                <Row className="mb-3 pb-2 border-bottom">
                                  <Col xs={12}>
                                    {intel.transfer_fee && (
                                      <>
                                        <small className="text-muted fw-semibold d-block mb-1">Transfer Fee</small>
                                        <div className="text-dark" style={{ fontSize: "0.85rem" }}>
                                          {intel.transfer_fee}
                                        </div>
                                      </>
                                    )}
                                    {intel.conversation_notes && (
                                      <>
                                        <small className="text-muted fw-semibold d-block mb-1 mt-2">Notes</small>
                                        <div className="text-muted" style={{ fontSize: "0.75rem", lineHeight: "1.3" }}>
                                          {intel.conversation_notes.substring(0, 100)}
                                          {intel.conversation_notes.length > 100 && "..."}
                                        </div>
                                      </>
                                    )}
                                  </Col>
                                </Row>

                                {/* Bottom Row - Actions */}
                                <Row>
                                  <Col xs={12} className="text-end">
                                    <Button
                                      size="sm"
                                      onClick={() => {
                                        setSelectedIntelId(intel.intel_id);
                                        setShowIntelModal(true);
                                      }}
                                      title="View Intel Report"
                                      className="btn-action-circle btn-action-view"
                                    >
                                      👁️
                                    </Button>
                                  </Col>
                                </Row>
                              </Card.Body>
                            </Card>
                          </Col>
                        );
                      })}
                    </Row>
                  </div>
                  )}
                </div>
              </Collapse>
              </div>
            ) : (
              <div className="horizontal-timeline-section h-100">
                <h4 className="section-title mb-3">📋 Intel History</h4>
                <div className="empty-state-compact">
                  <p>No intel reports available yet.</p>
                </div>
              </div>
            )}
          </Col>

          {/* Attribute Analysis Section - Right Column (Wider) */}
          <Col lg={7}>
            <div className="horizontal-timeline-section h-100">
              <div className="radar-charts-section">
          <div className="radar-header mb-3">
            <h4 className="section-title mb-0" style={{ display: "inline-block", borderBottom: "2px solid #e5e7eb", paddingBottom: "0.5rem" }}>📊 Attribute Analysis</h4>
          </div>

          {(() => {
              const chartData = getPolarAreaChartData();
              const hasChartData = chartData && chartData.labels.length > 0;

              return (
                <>
                  {/* Chart and Tables Side by Side */}
                  <Row>
                    {/* Polar Chart - Left Side */}
                    <Col lg={attributeBreakdownExpanded ? 7 : 12} className="mb-4" style={{ position: "relative" }}>
                      <div
                        style={{
                          height: "800px",
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {hasChartData ? (
                          (() => {
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
                                      if (Array.isArray(chartData.labels[index])) {
                                        return chartData.labels[index];
                                      }
                                      // Split long labels that are still strings
                                      if (
                                        typeof chartData.labels[index] === "string" &&
                                        chartData.labels[index].length > 12
                                      ) {
                                        const label = chartData.labels[index] as string;
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
                                      return chartData.labels[index];
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
                                    const actualValue =
                                      chartData.actualValues[context.dataIndex];
                                    return actualValue === 0 ? "N/A" : actualValue;
                                  },
                                },
                                tooltip: {
                                  callbacks: {
                                    label: (context: any) => {
                                      // Show actual score (0) for zero-scored attributes, not display value (10)
                                      const actualValue =
                                        chartData.actualValues[context.dataIndex];
                                      const levelDescription = getScoreLevel(actualValue);
                                      return actualValue === 0
                                        ? "N/A"
                                        : `${actualValue}: ${levelDescription}`;
                                    },
                                  },
                                },
                              },
                            };

                            return (
                              <div style={{ width: "750px", height: "750px" }}>
                                <PolarArea
                                  data={chartData}
                                  options={polarAreaChartOptions}
                                />
                              </div>
                            );
                          })()
                        ) : (
                          <div className="text-center py-4">
                            <p className="text-muted">
                              No attribute data available for the selected position(s).
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Toggle Button for Attribute Breakdown */}
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        onClick={() => setAttributeBreakdownExpanded(!attributeBreakdownExpanded)}
                        style={{
                          position: "absolute",
                          top: "10px",
                          right: "10px",
                          zIndex: 10,
                          borderRadius: "50%",
                          width: "40px",
                          height: "40px",
                          padding: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center"
                        }}
                        title={attributeBreakdownExpanded ? "Hide Breakdown" : "Show Breakdown"}
                      >
                        {attributeBreakdownExpanded ? "▶" : "◀"}
                      </Button>
                    </Col>

                    {/* Tables - Right Side */}
                    {attributeBreakdownExpanded && (
                      <Col lg={5}>
                      {/* Filters Section */}
                      <div className="mb-3">
                        <div className="d-flex align-items-center gap-2 flex-wrap">
                          {/* Multi-select Position Dropdown */}
                          <Dropdown>
                            <Dropdown.Toggle variant="outline-secondary" id="position-filter-dropdown" size="sm" style={{ minWidth: "150px", fontSize: "0.85rem" }}>
                              {selectedPositions.length === 0
                                ? "Positions"
                                : `${selectedPositions.length} selected`}
                            </Dropdown.Toggle>
                            <Dropdown.Menu style={{ maxHeight: "400px", overflowY: "auto" }}>
                              {positionCounts.map((posCount) => (
                                <Dropdown.Item
                                  key={posCount.position}
                                  as="div"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    const newSelection = selectedPositions.includes(posCount.position)
                                      ? selectedPositions.filter(p => p !== posCount.position)
                                      : [...selectedPositions, posCount.position];
                                    handlePositionChange(newSelection);
                                  }}
                                  style={{ cursor: "pointer" }}
                                >
                                  <Form.Check
                                    type="checkbox"
                                    label={`${posCount.position} (${posCount.report_count})`}
                                    checked={selectedPositions.includes(posCount.position)}
                                    onChange={() => {}} // Handled by parent onClick
                                    style={{ pointerEvents: "none" }}
                                  />
                                </Dropdown.Item>
                              ))}
                            </Dropdown.Menu>
                          </Dropdown>

                          {/* Multi-select Reports Dropdown */}
                          <Dropdown>
                            <Dropdown.Toggle
                              variant="outline-secondary"
                              id="reports-filter-dropdown"
                              size="sm"
                              style={{ minWidth: "150px", fontSize: "0.85rem" }}
                              disabled={filteredReports.length === 0 && selectedPositions.length > 0}
                            >
                              {selectedReportIds.length === 0
                                ? "Reports"
                                : `${selectedReportIds.length} selected`}
                            </Dropdown.Toggle>
                            <Dropdown.Menu style={{ maxHeight: "400px", overflowY: "auto", minWidth: "300px" }}>
                              {(selectedPositions.length > 0 ? filteredReports : scoutReportsData?.reports || []).map((report) => (
                                <Dropdown.Item
                                  key={report.report_id}
                                  as="div"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    const newSelection = selectedReportIds.includes(report.report_id)
                                      ? selectedReportIds.filter(id => id !== report.report_id)
                                      : [...selectedReportIds, report.report_id];
                                    handleReportSelection(newSelection);
                                  }}
                                  style={{ cursor: "pointer" }}
                                >
                                  <Form.Check
                                    type="checkbox"
                                    label={
                                      <span style={{ fontSize: "0.85rem" }}>
                                        {report.report_date} - {report.scout_name} - {report.position_played}
                                        {report.overall_rating && ` (${report.overall_rating}/10)`}
                                      </span>
                                    }
                                    checked={selectedReportIds.includes(report.report_id)}
                                    onChange={() => {}} // Handled by parent onClick
                                    style={{ pointerEvents: "none" }}
                                  />
                                </Dropdown.Item>
                              ))}
                              {(selectedPositions.length > 0 ? filteredReports : scoutReportsData?.reports || []).length === 0 && (
                                <Dropdown.Item disabled>No reports available</Dropdown.Item>
                              )}
                            </Dropdown.Menu>
                          </Dropdown>

                          {/* Clear Filters Button */}
                          {(selectedPositions.length > 0 || selectedReportIds.length > 0) && (
                            <Button
                              variant="outline-danger"
                              size="sm"
                              onClick={clearFilters}
                              style={{ fontSize: "0.85rem" }}
                            >
                              Clear
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Attribute Breakdown Card */}
                      <Card
                        className="shadow-sm mb-4"
                        style={{ borderRadius: "12px" }}
                      >
                        <Card.Header
                          style={{ backgroundColor: "#f8f9fa", color: "#495057" }}
                        >
                          <h6 className="mb-0">📋 Attribute Breakdown</h6>
                        </Card.Header>
                        <Card.Body>
                            {hasChartData ? (
                              <>
                                {selectedReportIds.length > 0 && (
                                  <div className="alert alert-info mb-3" style={{ fontSize: "0.85rem", padding: "0.5rem" }}>
                                    <strong>Filtered View:</strong> Showing averages from {selectedReportIds.length} selected report(s)
                                  </div>
                                )}
                                <div className="attribute-breakdown">
                                  {chartData.labels.map((label, index) => {
                                    const filteredValue = chartData.actualValues[index];
                                    // Get overall average if we're showing filtered data
                                    const overallValue = selectedReportIds.length > 0 && positionAttributeScores[label]
                                      ? positionAttributeScores[label]
                                      : null;

                                    return (
                                      <div
                                        key={label}
                                        className="attribute-breakdown-item mb-2"
                                      >
                                        <div className="d-flex justify-content-between align-items-center">
                                          <span
                                            className="attribute-name"
                                            style={{ fontSize: "0.85rem", flex: 1 }}
                                          >
                                            {label}
                                          </span>
                                          <div className="d-flex gap-2 align-items-center">
                                            {selectedReportIds.length > 0 && overallValue !== null && (
                                              <span
                                                className="badge bg-secondary"
                                                style={{
                                                  fontSize: "0.7rem",
                                                  fontWeight: "normal",
                                                }}
                                                title="Overall average across all reports"
                                              >
                                                All: {overallValue === 0 ? "N/A" : `${overallValue.toFixed(2)}`}
                                              </span>
                                            )}
                                            <span
                                              className="badge"
                                              style={{
                                                backgroundColor:
                                                  chartData.datasets[0].backgroundColor[
                                                    index
                                                  ],
                                                color: "white !important",
                                                fontWeight: "bold",
                                                fontSize: "0.75rem",
                                                border: `2px solid ${chartData.datasets[0].borderColor[index]}`,
                                              }}
                                              title={selectedReportIds.length > 0 ? "Filtered average" : "Overall average"}
                                            >
                                              {filteredValue === 0
                                                ? "N/A"
                                                : `${filteredValue.toFixed(2)}/10`}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </>
                            ) : (
                              <div className="text-center text-muted py-3">
                                No attribute data available for the selected position(s).
                              </div>
                            )}
                          </Card.Body>
                      </Card>
                    </Col>
                    )}
                  </Row>
                </>
              );
            })()}
              </div>
            </div>
          </Col>
        </Row>
      </Container>

      {/* Add Note Modal */}
      <Modal
        show={showAddNoteModal}
        onHide={() => setShowAddNoteModal(false)}
        className="clean-modal"
      >
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
          <Button
            variant="outline-secondary"
            onClick={() => setShowAddNoteModal(false)}
          >
            Cancel
          </Button>
          <Button
            variant="dark"
            onClick={addNote}
            disabled={addingNote || !newNote.trim()}
          >
            {addingNote ? <Spinner animation="border" size="sm" /> : "Add Note"}
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

      {/* Share Link Modal */}
      {shareReportId && (
        <ShareLinkModal
          show={showShareModal}
          onHide={() => setShowShareModal(false)}
          reportId={shareReportId}
        />
      )}

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
          flex-direction: column;
          align-items: flex-start;
          gap: 0.25rem;
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
