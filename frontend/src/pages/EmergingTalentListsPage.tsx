import React from "react";
import { useSearchParams } from "react-router-dom";
import PlayerListsPage from "./PlayerListsPage";
import AgeGroupToggle, { AgeGroup } from "../components/PlayerLists/AgeGroupToggle";

/**
 * Emerging Talent shortlist (table view). Wraps the shared PlayerListsPage,
 * scoping it to the emerging_talent_u21 / emerging_talent_u18 category. The
 * U21/U18 toggle renders in the page header (accessory slot) and is kept in the
 * URL (?age=) so it survives the table <-> kanban switch. The `key` forces a
 * clean remount (and refetch) when the toggle changes.
 */
const EmergingTalentListsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const age: AgeGroup = searchParams.get("age") === "u18" ? "u18" : "u21";
  const category = `emerging_talent_${age}`;

  return (
    <PlayerListsPage
      key={category}
      category={category}
      kanbanPath={`/lists/emerging-talent/kanban?age=${age}`}
      headerTitle="Emerging Talent"
      headerCopy={`${age.toUpperCase()} shortlist — same recruitment pipeline as the first team.`}
      headerAccessory={
        <AgeGroupToggle value={age} onChange={(next) => setSearchParams({ age: next })} />
      }
    />
  );
};

export default EmergingTalentListsPage;
