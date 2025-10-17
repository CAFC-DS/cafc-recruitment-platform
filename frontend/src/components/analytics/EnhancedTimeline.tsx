import React, { useRef } from "react";
import { Card, Form, Row, Col, Spinner } from "react-bootstrap";
import { Bar } from "react-chartjs-2";
import ExportButton from "./ExportButton";

interface TimelineDataPoint {
  month?: string;
  day?: string;
  totalReports: number;
  liveReports: number;
  videoReports: number;
  scouts?: { [key: string]: number };
}

interface EnhancedTimelineProps {
  title: string;
  data: TimelineDataPoint[];
  loading?: boolean;
  viewType: "monthly" | "daily";
  onViewTypeChange: (viewType: "monthly" | "daily") => void;
  minMonths?: number;
  onMinMonthsChange?: (months: number) => void;
  dateRange?: number;
  onDateRangeChange?: (days: number) => void;
  selectedFilter?: string;
  onFilterChange?: (filter: string) => void;
  selectedScout?: string;
  onScoutChange?: (scout: string) => void;
  topScouts?: { name: string; reports: number }[];
  color?: string;
}

const EnhancedTimeline: React.FC<EnhancedTimelineProps> = ({
  title,
  data,
  loading = false,
  viewType,
  onViewTypeChange,
  minMonths,
  onMinMonthsChange,
  dateRange,
  onDateRangeChange,
  selectedFilter = "ALL",
  onFilterChange,
  selectedScout = "ALL",
  onScoutChange,
  topScouts = [],
  color = "#6c757d",
}) => {
  const chartRef = useRef<HTMLDivElement>(null);

  const chartData = {
    labels: data.map((point) => {
      if (viewType === "daily" && point.day) {
        const date = new Date(point.day + "T00:00:00");
        return date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
      } else if (point.month) {
        const date = new Date(point.month + "-01");
        return date.toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
        });
      }
      return "";
    }),
    datasets: [
      {
        label: "Total Reports",
        data: data.map((point) => point.totalReports),
        borderColor: "#dc3545",
        backgroundColor: "rgba(220, 53, 69, 0.6)",
        borderWidth: 1,
      },
      {
        label: "Live Scouting",
        data: data.map((point) => point.liveReports),
        borderColor: "#28a745",
        backgroundColor: "rgba(40, 167, 69, 0.6)",
        borderWidth: 1,
      },
      {
        label: "Video Scouting",
        data: data.map((point) => point.videoReports),
        borderColor: "#17a2b8",
        backgroundColor: "rgba(23, 162, 184, 0.6)",
        borderWidth: 1,
      },
      ...(selectedScout !== "ALL" && data[0]?.scouts
        ? [
            {
              label: `${selectedScout} Reports`,
              data: data.map((point) => point.scouts?.[selectedScout] || 0),
              borderColor: "#ffc107",
              backgroundColor: "rgba(255, 193, 7, 0.6)",
              borderWidth: 2,
            },
          ]
        : []),
    ],
  };

  const exportData = data.map((point) => ({
    period: point.day || point.month || "",
    totalReports: point.totalReports,
    liveReports: point.liveReports,
    videoReports: point.videoReports,
    ...(selectedScout !== "ALL" && point.scouts
      ? { [`${selectedScout}_reports`]: point.scouts[selectedScout] || 0 }
      : {}),
  }));

  return (
    <Card
      className="shadow-sm"
      style={{ borderRadius: "12px", border: `2px solid ${color}` }}
    >
      <Card.Header
        style={{
          backgroundColor: "#000000",
          color: "white",
          borderRadius: "12px 12px 0 0",
        }}
      >
        <Row className="align-items-center">
          <Col>
            <h6 className="mb-0 text-white">{title}</h6>
          </Col>
          <Col xs="auto">
            <ExportButton
              data={exportData}
              filename={`${title.toLowerCase().replace(/\s+/g, "_")}`}
              chartRef={chartRef}
            />
          </Col>
        </Row>
      </Card.Header>
      <Card.Body>
        {/* Filters */}
        <Row className="mb-3">
          <Col md={3}>
            <Form.Select
              value={viewType}
              onChange={(e) => onViewTypeChange(e.target.value as "monthly" | "daily")}
              size="sm"
            >
              <option value="monthly">Monthly View</option>
              <option value="daily">Daily View</option>
            </Form.Select>
          </Col>
          {viewType === "monthly" && onMinMonthsChange && (
            <Col md={3}>
              <Form.Select
                value={minMonths || 0}
                onChange={(e) => onMinMonthsChange(Number(e.target.value))}
                size="sm"
              >
                <option value={0}>All Time</option>
                <option value={3}>Last 3 Months</option>
                <option value={6}>Last 6 Months</option>
                <option value={12}>Last 12 Months</option>
                <option value={24}>Last 24 Months</option>
              </Form.Select>
            </Col>
          )}
          {viewType === "daily" && onDateRangeChange && (
            <Col md={3}>
              <Form.Select
                value={dateRange}
                onChange={(e) => onDateRangeChange(Number(e.target.value))}
                size="sm"
              >
                <option value={7}>Last 7 Days</option>
                <option value={14}>Last 14 Days</option>
                <option value={30}>Last 30 Days</option>
                <option value={60}>Last 60 Days</option>
              </Form.Select>
            </Col>
          )}
          {onFilterChange && (
            <Col md={3}>
              <Form.Select
                value={selectedFilter}
                onChange={(e) => onFilterChange(e.target.value)}
                size="sm"
              >
                <option value="ALL">All Types</option>
                <option value="LIVE">Live Only</option>
                <option value="VIDEO">Video Only</option>
              </Form.Select>
            </Col>
          )}
          {onScoutChange && topScouts.length > 0 && (
            <Col md={3}>
              <Form.Select
                value={selectedScout}
                onChange={(e) => onScoutChange(e.target.value)}
                size="sm"
              >
                <option value="ALL">All Scouts</option>
                {topScouts.map((scout) => (
                  <option key={scout.name} value={scout.name}>
                    {scout.name}
                  </option>
                ))}
              </Form.Select>
            </Col>
          )}
        </Row>

        {/* Chart */}
        {loading ? (
          <div className="text-center py-5">
            <Spinner animation="border" role="status">
              <span className="visually-hidden">Loading timeline...</span>
            </Spinner>
          </div>
        ) : data.length > 0 ? (
          <div ref={chartRef} style={{ height: "400px" }}>
            <Bar
              data={chartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                  mode: "index" as const,
                  intersect: false,
                },
                plugins: {
                  title: {
                    display: false,
                  },
                  legend: {
                    position: "top" as const,
                    labels: { usePointStyle: true, padding: 15 },
                  },
                  tooltip: {
                    backgroundColor: "rgba(0, 0, 0, 0.8)",
                    titleColor: "#fff",
                    bodyColor: "#fff",
                    borderColor: "#dee2e6",
                    borderWidth: 1,
                    cornerRadius: 8,
                    displayColors: true,
                    callbacks: {
                      title: (context) => {
                        const dataPoint = data[context[0].dataIndex];
                        if (viewType === "daily" && dataPoint.day) {
                          const date = new Date(dataPoint.day + "T00:00:00");
                          return date.toLocaleDateString("en-US", {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          });
                        } else if (dataPoint.month) {
                          const date = new Date(dataPoint.month + "-01");
                          return date.toLocaleDateString("en-US", {
                            month: "long",
                            year: "numeric",
                          });
                        }
                        return "Unknown Date";
                      },
                      afterBody: (context) => {
                        const dataPoint = data[context[0].dataIndex];
                        if (dataPoint.scouts) {
                          const scouts = Object.entries(dataPoint.scouts);
                          return [
                            "",
                            "Scout Breakdown:",
                            ...scouts.map(
                              ([name, count]) => `  ${name}: ${count} reports`
                            ),
                          ];
                        }
                        return [];
                      },
                    },
                  },
                },
                scales: {
                  x: {
                    display: true,
                    title: {
                      display: true,
                      text: viewType === "daily" ? "Day" : "Month",
                      font: { weight: "bold" },
                    },
                    grid: { color: "rgba(0, 0, 0, 0.1)" },
                  },
                  y: {
                    display: true,
                    title: {
                      display: true,
                      text: "Number of Reports",
                      font: { weight: "bold" },
                    },
                    grid: { color: "rgba(0, 0, 0, 0.1)" },
                    beginAtZero: true,
                  },
                },
              }}
            />
          </div>
        ) : (
          <div className="text-center py-5">
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📊</div>
            <h5 style={{ color: "#6c757d" }}>No timeline data available</h5>
          </div>
        )}
      </Card.Body>
    </Card>
  );
};

export default EnhancedTimeline;
