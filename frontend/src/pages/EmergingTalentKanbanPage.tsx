import React, { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import KanbanPage from "./KanbanPage";
import { usePersistentState } from "../hooks/usePersistentState";
import AgeGroupToggle, { AgeGroup } from "../components/PlayerLists/AgeGroupToggle";

/**
 * Emerging Talent shortlist (kanban view). Wraps the shared KanbanPage, scoping
 * it to the emerging_talent_u21 / emerging_talent_u18 category. The U21/U18
 * toggle renders in the page header (accessory slot) and is kept in the URL
 * (?age=) so it survives the table <-> kanban switch.
 */
const EmergingTalentKanbanPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [savedAge, setSavedAge] = usePersistentState<AgeGroup>("lists:emerging-talent:age", "u21");
  const age: AgeGroup = (searchParams.get("age") ?? savedAge) === "u18" ? "u18" : "u21";
  useEffect(() => setSavedAge(age), [age, setSavedAge]);
  const category = `emerging_talent_${age}`;

  return (
    <KanbanPage
      key={category}
      category={category}
      listPath={`/lists/emerging-talent?age=${age}`}
      headerTitle="Emerging Talent — Kanban"
      headerCopy={`${age.toUpperCase()} shortlist — same recruitment pipeline as the first team.`}
      headerAccessory={
        <AgeGroupToggle value={age} onChange={(next) => setSearchParams({ age: next })} />
      }
    />
  );
};

export default EmergingTalentKanbanPage;
