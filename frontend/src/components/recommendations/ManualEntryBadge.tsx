import React, { useState } from 'react';
import { Link } from 'react-router-dom';

interface ManualEntryBadgeProps {
  playerName: string;
  isAdmin: boolean;
  onFlag: () => Promise<void>;
  size?: 'sm' | 'md';
}

/**
 * Task 8 safety-net badge: rendered next to a recommendation's player name
 * when the backend's best-effort `player_manual_entry` signal is true (see
 * `serialize_recommendation_row` in backend/main.py).
 *
 * - Admins get a link straight into the admin duplicate-review tooling
 *   (General Clashes tab), pre-filtered to this player's name. General
 *   Clashes - not Internal Player Audit - is the tab that can actually
 *   surface an agent-created external duplicate paired with another
 *   external (synced) player; Internal Player Audit only anchors on
 *   internal players (CAFC_PLAYER_ID IS NOT NULL AND PLAYERID IS NULL).
 * - Every other `require_recs_viewer`-eligible role gets an informational
 *   badge plus a "Flag for admin review" action that never attempts to
 *   navigate to an admin-only page.
 */
const ManualEntryBadge: React.FC<ManualEntryBadgeProps> = ({ playerName, isAdmin, onFlag, size = 'md' }) => {
  const [flagging, setFlagging] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [flagError, setFlagError] = useState<string | null>(null);

  const badgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35rem',
    fontSize: size === 'sm' ? '0.7rem' : '0.75rem',
    fontWeight: 700,
    padding: '0.15rem 0.5rem',
    borderRadius: '999px',
    background: 'rgba(217, 119, 6, 0.12)',
    color: '#b45309',
    border: '1px solid rgba(217, 119, 6, 0.35)',
    whiteSpace: 'nowrap',
  };

  const handleFlag = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (flagging || flagged) return;
    try {
      setFlagging(true);
      setFlagError(null);
      await onFlag();
      setFlagged(true);
    } catch (err) {
      console.error(err);
      setFlagError('Failed to flag for review');
    } finally {
      setFlagging(false);
    }
  };

  if (isAdmin) {
    const deepLinkHref = `/admin?tab=general-clashes&name=${encodeURIComponent(playerName)}`;
    return (
      <Link
        to={deepLinkHref}
        style={{ ...badgeStyle, textDecoration: 'none', cursor: 'pointer' }}
        title="Open the General Clashes tab, pre-filtered to this player"
      >
        ⚠ Unverified — Manually Added Player
      </Link>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
      <span style={badgeStyle} title="This player's record looks like it was manually added rather than matched from an existing search">
        ⚠ Unverified — Manually Added Player
      </span>
      {flagged ? (
        <span className="agent-portal-meta" style={{ fontSize: '0.75rem' }}>Flagged for admin review</span>
      ) : (
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          style={{ fontSize: '0.7rem', padding: '0.1rem 0.5rem' }}
          onClick={handleFlag}
          disabled={flagging}
        >
          {flagging ? 'Flagging…' : 'Flag for admin review'}
        </button>
      )}
      {flagError ? <span className="text-danger" style={{ fontSize: '0.7rem' }}>{flagError}</span> : null}
    </span>
  );
};

export default ManualEntryBadge;
