import React from "react";
import { Card } from "react-bootstrap";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon?: string;
  subtitle?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  color?: string;
  loading?: boolean;
}

const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  icon,
  subtitle,
  trend,
  trendValue,
  color = "#6c757d",
  loading = false,
}) => {
  const getTrendIcon = () => {
    if (trend === "up") return "↑";
    if (trend === "down") return "↓";
    if (trend === "neutral") return "→";
    return "";
  };

  const getTrendColor = () => {
    if (trend === "up") return "#28a745";
    if (trend === "down") return "#dc3545";
    return "#6c757d";
  };

  return (
    <Card
      className="shadow-sm h-100"
      style={{
        borderRadius: "12px",
        border: `2px solid ${color}`,
        transition: "transform 0.2s, box-shadow 0.2s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.15)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
      }}
    >
      <Card.Body>
        <div className="d-flex justify-content-between align-items-start mb-2">
          <div style={{ fontSize: "0.875rem", color: "#6c757d", fontWeight: 500 }}>
            {title}
          </div>
          {icon && (
            <span style={{ fontSize: "1.5rem" }} role="img" aria-label={title}>
              {icon}
            </span>
          )}
        </div>
        {loading ? (
          <div className="placeholder-glow">
            <span className="placeholder col-6" style={{ height: "2.5rem" }}></span>
          </div>
        ) : (
          <>
            <div
              style={{
                fontSize: "2rem",
                fontWeight: "bold",
                color: color,
                marginBottom: "0.5rem",
              }}
            >
              {value}
            </div>
            {subtitle && (
              <div style={{ fontSize: "0.75rem", color: "#6c757d" }}>
                {subtitle}
              </div>
            )}
            {trend && trendValue && (
              <div
                style={{
                  fontSize: "0.875rem",
                  color: getTrendColor(),
                  marginTop: "0.5rem",
                  fontWeight: 500,
                }}
              >
                {getTrendIcon()} {trendValue}
              </div>
            )}
          </>
        )}
      </Card.Body>
    </Card>
  );
};

export default StatsCard;
