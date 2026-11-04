import React, { useId } from "react";
import { OverlayTrigger, Tooltip } from "react-bootstrap";
import type { ListDataScore as ListDataScoreValue } from "../../services/playerListsService";
import { DataScoreBox } from "../player/PlayerDataScore";

const NO_SCORE = "Goalkeepers aren't in the data scores yet. Other players without a score have too little match data.";

const explain = (score?: ListDataScoreValue | null, emptyNote = NO_SCORE): { title: string; lines: string[] } => {
  if (!score) {
    return { title: "No data score", lines: [emptyNote] };
  }
  const band = score.band_name ? ` · ${score.band_name}` : "";
  if (score.kind === "career") {
    return {
      title: `Career score${band}`,
      lines: [
        "Every season weighted by how reliable it is, age-adjusted.",
        `${score.position}${score.seasons != null ? ` · ${score.seasons} season${score.seasons === 1 ? "" : "s"}` : ""}`,
      ],
    };
  }
  return {
    title: `CH index${band}`,
    lines: [
      "One season's score, shown because there's no career score yet.",
      `${score.position} · ${score.season}${score.min != null ? ` · ${score.min} min` : ""}`,
    ],
  };
};

/** A list row's data score: career, or that season's CH index marked "CH". The hover says which. */
const ListDataScore: React.FC<{ score?: ListDataScoreValue | null; emptyNote?: string }> = ({ score, emptyNote }) => {
  const id = useId();
  const { title, lines } = explain(score, emptyNote);
  return (
    <OverlayTrigger
      placement="top"
      trigger={["hover", "focus"]}
      overlay={
        <Tooltip id={`list-data-score-${id}`}>
          <strong>{title}</strong>
          {lines.map((line) => <div key={line}>{line}</div>)}
        </Tooltip>
      }
    >
      <span className="d-inline-flex align-items-center gap-1" tabIndex={0}>
        {score ? (
          <>
            <DataScoreBox value={score.value} band={score.band} />
            {score.kind === "ch_index" && <small className="text-muted">CH</small>}
          </>
        ) : (
          <span className="text-muted">N/A</span>
        )}
      </span>
    </OverlayTrigger>
  );
};

export default ListDataScore;
