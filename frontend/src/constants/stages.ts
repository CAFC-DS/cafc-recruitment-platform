/** Ordered recruitment stages shared by lists, boards, filters and analytics. */
export const ACTIVE_STAGES = ["Stage 1", "Stage 2", "Stage 3", "Stage 4", "Stage 5"] as const;
export const ALL_STAGES = [...ACTIVE_STAGES, "Archived"] as const;

export const emptyStageCounts = (): Record<string, number> =>
  Object.fromEntries(ALL_STAGES.map(stage => [stage, 0]));
