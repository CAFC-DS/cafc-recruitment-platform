import React, { useLayoutEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { ACTIVE_STAGES } from "../../constants/stages";
import type { ListWithPlayers, PlayerInList } from "../../services/playerListsService";
import { getStageBgColor } from "../../styles/playerLists.theme";
import "./ShortlistPitch.css";

interface ShortlistPitchProps {
  lists: ListWithPlayers[];
  stages: string[];
  onStagesChange: (stages: string[]) => void;
  getPlayerPath: (universalId: string) => string;
  pendingStageChanges?: Map<number, string>;
  pendingRemovals?: Set<number>;
}

const POSITIONS = ["CF", "LW", "AM", "RW", "DM/CM", "LB/LWB", "RB/RWB", "LCB", "CCB", "RCB", "GK"];
const AREAS: Record<string, string> = {
  CF: "cf", LW: "lw", AM: "am", RW: "rw", "LB/LWB": "lb", "DM/CM": "cm",
  "RB/RWB": "rb", LCB: "lcb", CCB: "ccb", RCB: "rcb", GK: "gk",
};
const ALIASES: Record<string, string> = {
  ST: "CF", LB: "LB/LWB", LWB: "LB/LWB", RB: "RB/RWB", RWB: "RB/RWB",
  DM: "DM/CM", CM: "DM/CM", CDM: "DM/CM", CAM: "AM", CB: "CCB",
};

export function getPitchPosition(name: string): string | null {
  const normalized = name.toUpperCase().replace(/\s*\/\s*/g, "/").trim();
  if (POSITIONS.includes(normalized)) return normalized;
  if (ALIASES[normalized]) return ALIASES[normalized];
  // Use complete tokens, so RCB never accidentally becomes CB or RB.
  const token = normalized.split(/[\s_-]+/).find(part => POSITIONS.includes(part) || ALIASES[part]);
  return token ? ALIASES[token] || token : null;
}

export default function ShortlistPitch({ lists, stages, onStagesChange, getPlayerPath, pendingStageChanges, pendingRemovals }: ShortlistPitchProps) {
  // An empty filter means all active stages, matching the table and API filters.
  const selectedStages: readonly string[] = stages.length ? stages : ACTIVE_STAGES;
  const groups = useMemo(() => {
    const result = new Map<string, { key: string; label: string; position: string | null; players: PlayerInList[] }>();
    POSITIONS.forEach(position => result.set(position, { key: position, label: position, position, players: [] }));
    lists.forEach(list => {
      const position = getPitchPosition(list.list_name);
      const key = position || `list-${list.id}`;
      const group = result.get(key) || { key, label: position || list.list_name, position, players: [] };
      const seen = new Set(group.players.map(player => player.universal_id));
      list.players.forEach(player => {
        const stage = pendingStageChanges?.get(player.item_id) || player.stage;
        if (pendingRemovals?.has(player.item_id) || stage === "Archived" || !selectedStages.includes(stage) || seen.has(player.universal_id)) return;
        seen.add(player.universal_id);
        group.players.push({ ...player, stage });
      });
      group.players.sort((a, b) => (b.stage || "").localeCompare(a.stage || "") || (a.player_name || "").localeCompare(b.player_name || ""));
      result.set(key, group);
    });
    return Array.from(result.values()).sort((a, b) => {
      const aOrder = a.position ? POSITIONS.indexOf(a.position) : POSITIONS.length;
      const bOrder = b.position ? POSITIONS.indexOf(b.position) : POSITIONS.length;
      return aOrder - bOrder || a.label.localeCompare(b.label);
    });
  }, [lists, selectedStages, pendingStageChanges, pendingRemovals]);
  const fieldRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field || typeof ResizeObserver === "undefined") return;
    const alignFullbacks = () => {
      const fullback = field.querySelector<HTMLElement>('[aria-label="LB/LWB players"]');
      if (!fullback || window.innerWidth < 768) {
        field.style.removeProperty("--pitch-fullback-offset");
        return;
      }
      const previousOffset = parseFloat(field.style.getPropertyValue("--pitch-fullback-offset")) || 0;
      const bounds = field.getBoundingClientRect();
      const naturalTop = fullback.getBoundingClientRect().top - previousOffset;
      field.style.setProperty("--pitch-fullback-offset", `${bounds.top + bounds.height / 2 - naturalTop}px`);
    };
    alignFullbacks();
    const observer = new ResizeObserver(alignFullbacks);
    observer.observe(field);
    return () => observer.disconnect();
  }, [groups]);
  const count = groups.reduce((sum, group) => sum + group.players.length, 0);
  const stageTotals = selectedStages.map(stage => ({ stage, count: groups.reduce((sum, group) => sum + group.players.filter(player => player.stage === stage).length, 0) }));

  const renderGroup = (group: typeof groups[number]) => {
    const twoColumns = ["CF", "AM", "DM/CM", "GK"].includes(group.position || "") && group.players.length > 3;
    return (
      <section key={group.key} className={`shortlist-pitch__group${group.players.length ? "" : " shortlist-pitch__group--empty"}`} style={{ gridArea: group.position ? AREAS[group.position] : undefined }} aria-label={`${group.label} players`}>
        <h3>{group.label}<span>{group.players.length}</span></h3>
        {group.players.length ? (
          <ul style={twoColumns ? { "--pitch-rows": Math.ceil(group.players.length / 2) } as React.CSSProperties : undefined} className={twoColumns ? "shortlist-pitch__players shortlist-pitch__players--two" : "shortlist-pitch__players"}>
            {group.players.map(player => (
              <li key={player.universal_id}>
                <Link to={getPlayerPath(player.universal_id)} title={`${player.player_name} · ${player.stage}${player.squad_name ? ` · ${player.squad_name}` : ""}`}>
                  <span className="shortlist-pitch__stage" style={{ backgroundColor: getStageBgColor(player.stage), color: ["Stage 2", "Stage 3", "Stage 4"].includes(player.stage) ? "#111827" : "#ffffff" }} aria-label={player.stage}>{player.stage.replace("Stage ", "")}</span>
                  <span className="shortlist-pitch__name"><span>{player.player_name || "Unnamed player"}</span>{player.squad_name && <small>{player.squad_name}</small>}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="shortlist-pitch__empty-position">No players</p>}
      </section>
    );
  };

  return (
    <section className="shortlist-pitch" aria-label="Recruitment shortlist pitch map">
      <div className="shortlist-pitch__toolbar">
        <p><strong>{count} positional entries shown</strong><span>Highest stage first, then name</span></p>
        <fieldset aria-label="Stage totals"><legend>Recruitment stages</legend>
          {ACTIVE_STAGES.map(stage => (
            <button key={stage} type="button" aria-label={stage} aria-pressed={selectedStages.includes(stage)} onClick={() => onStagesChange(selectedStages.includes(stage) ? selectedStages.filter(value => value !== stage) : [...selectedStages, stage])}>
              <i style={{ backgroundColor: getStageBgColor(stage) }} aria-hidden="true" />{stage}{selectedStages.includes(stage) && <span className="shortlist-pitch__stage-count">{stageTotals.find(total => total.stage === stage)?.count || 0}</span>}
            </button>
          ))}
        </fieldset>
      </div>




      {count === 0 && <p className="shortlist-pitch__no-results" role="status">No players match these lists, stages and filters. Select another stage or adjust the filters.</p>}
      <div className="shortlist-pitch__scroll" tabIndex={0} aria-label="Positional shortlist">
        <div ref={fieldRef} className="shortlist-pitch__field">
          <svg className="shortlist-pitch__markings" viewBox="0 0 1000 1400" preserveAspectRatio="none" aria-hidden="true">
            <rect x="25" y="25" width="950" height="1350" />
            <path d="M25 700H975 M290 25V230H710V25 M410 25V100H590V25 M290 1375V1170H710V1375 M410 1375V1300H590V1375" />
            <circle cx="500" cy="700" r="105" />
            <path d="M425 230Q500 300 575 230 M425 1170Q500 1100 575 1170" />
            <circle cx="500" cy="700" r="4" /><circle cx="500" cy="165" r="4" /><circle cx="500" cy="1235" r="4" />
          </svg>
          <div className="shortlist-pitch__layout">{groups.filter(group => group.position).map(renderGroup)}</div>
        </div>
      </div>
      {groups.some(group => !group.position) && <div className="shortlist-pitch__other"><h3>Other selected lists</h3>{groups.filter(group => !group.position).map(renderGroup)}</div>}
      <p className="shortlist-pitch__caption">Totals count positional entries; a player can appear in more than one position. Click a name to open their profile. Stage colours match the recruitment lists.</p>
    </section>
  );
}
