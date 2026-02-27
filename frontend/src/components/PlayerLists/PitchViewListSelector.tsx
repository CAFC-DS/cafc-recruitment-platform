/**
 * PitchViewListSelector Component
 *
 * Displays player lists in a football pitch formation layout
 * Lists are positioned based on their names (GK, CB, CM, ST, etc.)
 */

import React from "react";
import { Badge } from "react-bootstrap";
import { badgeStyles, colors } from "../../styles/playerLists.theme";

interface PlayerList {
  id: number;
  list_name: string;
  player_count: number;
}

interface PitchViewListSelectorProps {
  lists: PlayerList[];
  visibleListIds: Set<number>;
  onToggleList: (listId: number) => void;
}

// Position mapping - maps common position names to pitch coordinates
const POSITION_MAP: Record<string, { row: number; col: number }> = {
  // Goalkeeper (row 0)
  GK: { row: 0, col: 2 },

  // Defenders (row 1)
  RB: { row: 1, col: 0 },
  RWB: { row: 1, col: 0 },
  RCB: { row: 1, col: 1 },
  CCB: { row: 1, col: 2 },
  LCB: { row: 1, col: 3 },
  LB: { row: 1, col: 4 },
  LWB: { row: 1, col: 4 },

  // Defensive Midfielders (row 2)
  LDM: { row: 2, col: 1 },
  CDM: { row: 2, col: 2 },
  RDM: { row: 2, col: 3 },
  DM: { row: 2, col: 2 },

  // Midfielders (row 3)
  LM: { row: 3, col: 0 },
  LCM: { row: 3, col: 1 },
  CM: { row: 3, col: 2 },
  RCM: { row: 3, col: 3 },
  RM: { row: 3, col: 4 },

  // Attacking Midfielders (row 4)
  LAM: { row: 4, col: 1 },
  CAM: { row: 4, col: 2 },
  RAM: { row: 4, col: 3 },
  AM: { row: 4, col: 2 },

  // Wingers (row 5)
  RW: { row: 5, col: 0 },
  LW: { row: 5, col: 4 },

  // Forwards (row 6)
  LF: { row: 6, col: 1 },
  CF: { row: 6, col: 2 },
  ST: { row: 6, col: 2 },
  RF: { row: 6, col: 3 },
};

/**
 * Extract position from list name
 * Looks for position abbreviations in the list name
 */
const extractPosition = (listName: string): string | null => {
  const upperName = listName.toUpperCase();

  // Check for exact matches first
  for (const position of Object.keys(POSITION_MAP)) {
    if (upperName === position || upperName.startsWith(position + " ") || upperName.endsWith(" " + position)) {
      return position;
    }
  }

  // Check for positions within the name
  for (const position of Object.keys(POSITION_MAP)) {
    if (upperName.includes(position)) {
      return position;
    }
  }

  return null;
};

export const PitchViewListSelector: React.FC<PitchViewListSelectorProps> = ({
  lists,
  visibleListIds,
  onToggleList,
}) => {
  // Categorize lists into positioned and unpositioned
  const positionedLists: Array<PlayerList & { position: string; row: number; col: number }> = [];
  const unpositionedLists: PlayerList[] = [];

  lists.forEach((list) => {
    const position = extractPosition(list.list_name);
    if (position && POSITION_MAP[position]) {
      const { row, col } = POSITION_MAP[position];
      positionedLists.push({ ...list, position, row, col });
    } else {
      unpositionedLists.push(list);
    }
  });

  // Create a 7x5 grid (7 rows for positions, 5 columns)
  const grid: Array<Array<PlayerList & { position: string } | null>> = Array(7)
    .fill(null)
    .map(() => Array(5).fill(null));

  // Place positioned lists in the grid
  positionedLists.forEach((list) => {
    grid[list.row][list.col] = list;
  });

  return (
    <div style={{ width: "600px", maxWidth: "100%" }}>
      {/* Pitch Grid */}
      <div
        style={{
          background: "linear-gradient(180deg, #1e7e34 0%, #28a745 100%)",
          borderRadius: "8px",
          padding: "10px",
          border: "2px solid #155724",
          position: "relative",
          minHeight: "240px",
        }}
      >
        {/* Pitch lines */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: "12px",
            border: "2px solid rgba(255, 255, 255, 0.3)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: 0,
            right: 0,
            height: "2px",
            background: "rgba(255, 255, 255, 0.3)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: "40px",
            height: "40px",
            border: "1px solid rgba(255, 255, 255, 0.3)",
            borderRadius: "50%",
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
          }}
        />

        {/* Grid Layout */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "5px",
            position: "relative",
            zIndex: 1,
          }}
        >
          {grid.map((row, rowIndex) => (
            <div
              key={rowIndex}
              style={{
                display: "flex",
                justifyContent: "space-evenly",
                alignItems: "center",
                gap: "4px",
                minHeight: "28px",
              }}
            >
              {row.map((list, colIndex) => (
                <div
                  key={`${rowIndex}-${colIndex}`}
                  style={{
                    flex: 1,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  {list ? (
                    <Badge
                      bg=""
                      onClick={() => onToggleList(list.id)}
                      style={{
                        ...badgeStyles.pill,
                        backgroundColor: visibleListIds.has(list.id)
                          ? "#fff"
                          : "rgba(255, 255, 255, 0.3)",
                        color: visibleListIds.has(list.id)
                          ? colors.primary
                          : "#fff",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                        fontSize: "0.6rem",
                        padding: "3px 6px",
                        fontWeight: "600",
                        border: visibleListIds.has(list.id)
                          ? `1px solid ${colors.primary}`
                          : "1px solid transparent",
                        boxShadow: visibleListIds.has(list.id)
                          ? "0 2px 6px rgba(0, 0, 0, 0.15)"
                          : "0 1px 3px rgba(0, 0, 0, 0.1)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "scale(1.05)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "scale(1)";
                      }}
                    >
                      {list.list_name} ({list.player_count})
                    </Badge>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Unpositioned Lists (displayed below pitch) */}
      {unpositionedLists.length > 0 && (
        <div className="mt-3">
          <div style={{ fontSize: "0.9rem", fontWeight: "600", marginBottom: "8px" }}>
            Other Lists:
          </div>
          <div className="d-flex gap-2 flex-wrap">
            {unpositionedLists.map((list) => {
              const isVisible = visibleListIds.has(list.id);
              return (
                <Badge
                  key={list.id}
                  bg=""
                  onClick={() => onToggleList(list.id)}
                  style={{
                    ...badgeStyles.pill,
                    backgroundColor: isVisible ? colors.primary : colors.gray[300],
                    color: isVisible ? colors.white : colors.gray[600],
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  {list.list_name} ({list.player_count})
                </Badge>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
