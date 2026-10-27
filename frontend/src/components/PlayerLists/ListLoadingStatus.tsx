import React, { useEffect, useState } from "react";
import "./ListLoadingStatus.css";

interface ListLoadingStatusProps {
  loading: boolean;
  initial?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

/** Reserve the status line while preserving results and keyboard focus on refresh. */
export default function ListLoadingStatus({ loading, initial = false, error, onRetry }: ListLoadingStatusProps) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!loading) return;
    const timer = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(timer);
  }, [loading]);

  return <div className={`list-loading-status${loading ? " list-loading-status--active" : ""}${error ? " list-loading-status--error" : ""}`}>
    <span role="status" aria-live="polite" aria-atomic="true">
      {loading ? <><i className="list-loading-status__indicator" aria-hidden="true" />
        {slow ? "This is taking longer than usual. Still loading…" : initial ? "Loading your recruitment lists…" : "Updating results · previous results remain visible"}</>
        : error ? "Results could not be updated. Your previous results are still available." : ""}
    </span>
    {!loading && error && onRetry && <button type="button" onClick={onRetry}>Try again</button>}
  </div>;
}
