import React, { useState } from "react";
import { Container, Alert, Spinner, Tabs, Tab } from "react-bootstrap";
import { useCurrentUser } from "../hooks/useCurrentUser";
import PlayerAnalyticsTab from "../components/analytics/PlayerAnalyticsTab";
import MatchTeamAnalyticsTab from "../components/analytics/MatchTeamAnalyticsTab";
import ScoutAnalyticsTab from "../components/analytics/ScoutAnalyticsTab";

const AnalyticsPage: React.FC = () => {
  const { canAccessAnalytics, loading: userLoading } = useCurrentUser();
  const [activeTab, setActiveTab] = useState<string>("players");

  // Check permissions
  if (userLoading) {
    return (
      <Container
        className="d-flex justify-content-center align-items-center"
        style={{ minHeight: "50vh" }}
      >
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
          <p>
            You don't have permission to access analytics. This feature is only
            available to managers and administrators.
          </p>
        </Alert>
      </Container>
    );
  }

  return (
    <Container className="mt-4">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>📊 Analytics Dashboard</h2>
        <span className="badge badge-neutral-grey">
          Comprehensive Recruitment Analytics
        </span>
      </div>

      {/* Tabbed Interface */}
      <Tabs
        id="analytics-tabs"
        activeKey={activeTab}
        onSelect={(k) => setActiveTab(k || "players")}
        className="mb-4"
        style={{
          borderBottom: "2px solid #dee2e6",
        }}
      >
        <Tab
          eventKey="players"
          title={
            <span>
              <span style={{ fontSize: "1.2rem", marginRight: "8px" }}>👤</span>
              <strong>Player Analytics</strong>
            </span>
          }
          tabClassName="custom-tab"
        >
          <PlayerAnalyticsTab />
        </Tab>

        <Tab
          eventKey="matches"
          title={
            <span>
              <span style={{ fontSize: "1.2rem", marginRight: "8px" }}>⚽</span>
              <strong>Match & Team Analytics</strong>
            </span>
          }
          tabClassName="custom-tab"
        >
          <MatchTeamAnalyticsTab />
        </Tab>

        <Tab
          eventKey="scouts"
          title={
            <span>
              <span style={{ fontSize: "1.2rem", marginRight: "8px" }}>🔍</span>
              <strong>Scout Analytics</strong>
            </span>
          }
          tabClassName="custom-tab"
        >
          <ScoutAnalyticsTab />
        </Tab>
      </Tabs>

      <style>{`
        .custom-tab {
          font-weight: 500;
          padding: 12px 24px;
          transition: all 0.3s ease;
        }

        .nav-tabs .custom-tab:hover {
          background-color: #f8f9fa;
        }

        .nav-tabs .custom-tab.active {
          border-bottom: 3px solid #000 !important;
          font-weight: 600;
        }

        .badge-neutral-grey {
          background-color: #6c757d;
          color: white;
          padding: 8px 16px;
          font-size: 0.875rem;
          font-weight: 500;
        }

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

        .nav-tabs {
          border-bottom: 2px solid #dee2e6;
        }

        .nav-tabs .nav-link {
          border: none;
          color: #495057;
          padding: 1rem 1.5rem;
          font-size: 1rem;
          border-bottom: 3px solid transparent;
        }

        .nav-tabs .nav-link:hover {
          border-bottom: 3px solid #dee2e6;
          background-color: #f8f9fa;
        }

        .nav-tabs .nav-link.active {
          color: #000;
          background-color: transparent;
          border-bottom: 3px solid #000;
        }
      `}</style>
    </Container>
  );
};

export default AnalyticsPage;
