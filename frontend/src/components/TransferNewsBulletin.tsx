import React, { useEffect, useState } from "react";
import { Card, Spinner, Button, Collapse } from "react-bootstrap";
import { Newspaper } from "lucide-react";
import axiosInstance from "../axiosInstance";
import "./TransferNewsBulletin.css";

interface SquadChange {
  player_name: string;
  old_squad: string;
  new_squad: string;
  detected_at: string | null;
  season: string | null;
  competition: string | null;
}

function formatRelativeTime(isoDate: string | null): string {
  if (!isoDate) return "";
  const then = new Date(isoDate).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
}

const TransferNewsBulletin: React.FC = () => {
  const [changes, setChanges] = useState<SquadChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchChanges = async () => {
      try {
        const response = await axiosInstance.get("/squad-changes/recent");
        if (!cancelled) {
          setChanges(response.data.changes || []);
        }
      } catch (error) {
        console.error("Error fetching squad changes:", error);
        // Non-critical widget -- fail silently, matching the /database/metadata
        // pattern elsewhere in HomePage.tsx, so one panel's failure doesn't
        // affect the rest of the dashboard.
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchChanges();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="transfer-news-card">
      <div className="transfer-news-header">
        <div className="transfer-news-header-title">
          <Newspaper size={17} strokeWidth={1.75} />
          Transfer News
        </div>
        <Button
          variant="link"
          size="sm"
          className="transfer-news-toggle"
          onClick={() => setExpanded(!expanded)}
          title={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? "▲" : "▼"}
        </Button>
      </div>
      <Collapse in={expanded}>
        <div>
          <Card.Body className="transfer-news-body">
            {loading ? (
              <div className="text-center py-2">
                <Spinner animation="border" size="sm" />
              </div>
            ) : changes.length === 0 ? (
              <p className="transfer-news-empty">
                No squad changes in the last 7 days.
              </p>
            ) : (
              changes.map((change, index) => (
                <div className="transfer-news-row" key={`${change.player_name}-${change.detected_at}-${index}`}>
                  <div className="transfer-news-move">
                    <span className="transfer-news-player">{change.player_name}</span>{" "}
                    moved from{" "}
                    <span className="transfer-news-squad-old">{change.old_squad || "Unknown"}</span>
                    {" → "}
                    <span className="transfer-news-squad-new">{change.new_squad || "Unknown"}</span>
                  </div>
                  <div className="transfer-news-meta">
                    <span className="transfer-news-time">{formatRelativeTime(change.detected_at)}</span>
                    {(change.competition || change.season) && (
                      <span className="transfer-news-tag">
                        {[change.competition, change.season].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </Card.Body>
        </div>
      </Collapse>
    </Card>
  );
};

export default TransferNewsBulletin;
