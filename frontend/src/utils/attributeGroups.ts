// Grouping of report attributes into the three polar-chart groups.
//
// The authoritative group comes from the backend (POSITION_ATTRIBUTES.ATTRIBUTE_GROUP),
// as a { attributeName: group } map for the report's position. The same attribute
// name can belong to different groups for different positions — "Aerial Ability"
// is DEFENDING for a centre back but ATTACKING for a target CF — so a name alone
// is not enough. The name lists below are only a fallback for attributes the
// backend map doesn't cover.

export type AttributeGroupName =
  | "PHYSICAL / PSYCHOLOGICAL"
  | "ATTACKING"
  | "DEFENDING";

export type AttributeGroupMap = Record<string, string> | undefined | null;

export const ATTRIBUTE_GROUP_COLORS: Record<AttributeGroupName, string> = {
  "PHYSICAL / PSYCHOLOGICAL": "#009FB7",
  ATTACKING: "#9370DB",
  DEFENDING: "#7FC8F8",
};

const GROUP_ORDER: Record<AttributeGroupName, number> = {
  "PHYSICAL / PSYCHOLOGICAL": 1,
  ATTACKING: 2,
  DEFENDING: 3,
};

const FALLBACK_PHYSICAL_PSYCHOLOGICAL = [
  "Athleticism & Pace",
  "Stamina & Work Rate",
  "Strength & Physicality",
  "Size & Physicality",
  "Proactive",
  "Movement",
  "Communication, Leadership & Organisation",
  "Technical Ability",
];

const FALLBACK_ATTACKING = [
  "Distribution",
  "Attacking Transitions & Impact",
  "Crossing",
  "Ball Progression",
  "Composure",
  "Starting & Building Attacks",
  "Receiving & Ball Carrying",
  "Attacking Movement",
  "Attacking Creativity",
  "Finishing",
  "Ball Carrying",
  "Ball Carrying & Attacking 1v1",
  "Final Third Movement",
  "Chance Creation",
  "Link Play / Ball Retention",
  "Hold-Up Play / Ball Retention",
  "Aerial Ability",
  "Distribution - Short / Building Attacks",
  "Distribution – Long / Starting Attacks",
];

const FALLBACK_DEFENDING = [
  "Aerial & Defending The Box",
  "Defensive Positioning & Anticipation",
  "Defending In Wide Areas",
  "Defensive Transitions & Recovery",
  "Aggressive & Front Footed",
  "Defensive Positioning",
  "Anticipation / Sense of Danger",
  "Defending The Box",
  "Starting Position",
  "Command of The Box",
  "Shot Stopping",
  "Handling",
  "Defensive Transitions & Impact",
];

const normalizeGroup = (group: string): AttributeGroupName | null => {
  const g = group.toUpperCase();
  if (g.includes("PHYSICAL") || g.includes("PSYCHOLOGICAL")) {
    return "PHYSICAL / PSYCHOLOGICAL";
  }
  if (g.includes("ATTACKING")) return "ATTACKING";
  if (g.includes("DEFENDING")) return "DEFENDING";
  return null;
};

const fallbackGroup = (attributeName: string): AttributeGroupName => {
  const matches = (list: string[]) =>
    list.some((attr) => attributeName.includes(attr));
  if (matches(FALLBACK_PHYSICAL_PSYCHOLOGICAL)) return "PHYSICAL / PSYCHOLOGICAL";
  if (matches(FALLBACK_ATTACKING)) return "ATTACKING";
  if (matches(FALLBACK_DEFENDING)) return "DEFENDING";
  return "PHYSICAL / PSYCHOLOGICAL";
};

export const getAttributeGroup = (
  attributeName: string,
  groups?: AttributeGroupMap,
): { group: AttributeGroupName; order: number } => {
  const fromBackend = groups?.[attributeName];
  const group =
    (fromBackend && normalizeGroup(fromBackend)) || fallbackGroup(attributeName);
  return { group, order: GROUP_ORDER[group] };
};

export const getAttributeGroupColor = (
  attributeName: string,
  groups?: AttributeGroupMap,
): string => ATTRIBUTE_GROUP_COLORS[getAttributeGroup(attributeName, groups).group];
