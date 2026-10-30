import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Alert, Spinner } from "react-bootstrap";
import axiosInstance from "../axiosInstance";
import { useAuth } from "../App";

interface ScoutAppLink {
  url: string;
  built_at: string | null;
}

const formatBuiltAt = (builtAt: string | null) => {
  if (!builtAt) return "unknown";
  const date = new Date(builtAt);
  if (Number.isNaN(date.getTime())) return builtAt;
  return date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
};

// Shows the weekly-published scout app (data-scoring) in a full-height iframe.
// The backend returns a presigned link that expires after 10 minutes; once loaded,
// the app runs entirely in the browser, so the expiry only affects reloading the frame.
const ScoutAppPage: React.FC = () => {
  const { token } = useAuth();
  const [link, setLink] = useState<ScoutAppLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [height, setHeight] = useState<number>(600);
  const frameAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    axiosInstance
      .get<ScoutAppLink>("/scout-app/link") // axiosInstance attaches the bearer token
      .then((response) => {
        if (!cancelled) setLink(response.data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.response?.data?.detail || "Could not load the scout app. Please try again later.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Fill the viewport below the navbar and the "Data as of" line.
  useLayoutEffect(() => {
    const resize = () => {
      const top = frameAreaRef.current?.getBoundingClientRect().top ?? 0;
      setHeight(Math.max(400, window.innerHeight - top));
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [link]);

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <Spinner animation="border" role="status" />
      </div>
    );
  }

  if (error || !link) {
    return (
      <div className="container py-4">
        <Alert variant="info">{error || "The scout app is not available."}</Alert>
      </div>
    );
  }

  return (
    <div>
      <div className="px-3 py-1 small text-muted">Data as of {formatBuiltAt(link.built_at)}</div>
      <div ref={frameAreaRef}>
        <iframe
          title="CAFC scout app"
          src={link.url}
          style={{ width: "100%", height, border: 0, display: "block" }}
        />
      </div>
    </div>
  );
};

export default ScoutAppPage;
