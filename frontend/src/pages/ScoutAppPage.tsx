import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Alert, Spinner } from "react-bootstrap";
import axiosInstance from "../axiosInstance";
import { useAuth } from "../App";
import { usePersistentState } from "../hooks/usePersistentState";

interface ScoutAppLink {
  url: string;
  built_at: string | null;
}

// Messages to and from the scout app (data-scoring dashboard/scout/scout.js). It runs on
// the bucket's origin, where its own storage can't tell our accounts apart, so it asks
// us for its filters on load and sends them back as they change.
const SCOUT_MSG = "cafc-scout";
const MAX_SAVED_FILTERS_CHARS = 50_000;
type ScoutFilters = Record<string, unknown>;

const isScoutFilters = (value: unknown): value is ScoutFilters =>
  typeof value === "object" && value !== null && !Array.isArray(value) &&
  JSON.stringify(value).length <= MAX_SAVED_FILTERS_CHARS;

const originOf = (url: string) => {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

const formatBuiltAt = (builtAt: string | null) => {
  if (!builtAt) return "unknown";
  const date = new Date(builtAt);
  if (Number.isNaN(date.getTime())) return builtAt;
  return date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
};

// Shows the weekly-published scout app (data-scoring) in a full-height iframe.
// The backend returns a presigned link that expires after 10 minutes; once loaded,
// the app runs entirely in the browser, so the expiry only affects reloading the frame.
const ScoutAppPage: React.FC<{ active?: boolean }> = ({ active = true }) => {
  const { token } = useAuth();
  const [link, setLink] = useState<ScoutAppLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [height, setHeight] = useState<number>(600);
  const frameAreaRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [savedFilters, setSavedFilters] = usePersistentState<ScoutFilters | null>("scoutApp:filters", null);
  const savedFiltersRef = useRef(savedFilters);
  savedFiltersRef.current = savedFilters;

  useEffect(() => {
    // Kept mounted across tabs: fetch once, and retry a failure on coming back.
    if (!token || !active || link) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, active]);

  // Only our own frame, loaded from the link we were given, may read or save filters.
  useEffect(() => {
    const frameOrigin = link ? originOf(link.url) : null;
    if (!frameOrigin) return;
    const onMessage = (event: MessageEvent) => {
      const frame = frameRef.current?.contentWindow;
      if (!frame || event.source !== frame || event.origin !== frameOrigin) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type === `${SCOUT_MSG}:ready`) {
        frame.postMessage({ type: `${SCOUT_MSG}:filters`, version: 1, filters: savedFiltersRef.current }, frameOrigin);
      } else if (data.type === `${SCOUT_MSG}:save` && isScoutFilters(data.filters)) {
        setSavedFilters(data.filters);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [link, setSavedFilters]);

  // Fill the viewport below the navbar and the "Data as of" line.
  useLayoutEffect(() => {
    if (!active) return;
    const resize = () => {
      const top = frameAreaRef.current?.getBoundingClientRect().top ?? 0;
      setHeight(Math.max(400, window.innerHeight - top));
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [link, loading, active]);

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
          ref={frameRef}
          title="CAFC scout app"
          src={link.url}
          style={{ width: "100%", height, border: 0, display: "block" }}
        />
      </div>
    </div>
  );
};

export default ScoutAppPage;
