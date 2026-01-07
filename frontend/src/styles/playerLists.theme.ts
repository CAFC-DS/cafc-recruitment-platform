/**
 * Player Lists Theme
 *
 * Centralized styling constants for the Player Lists feature.
 * Ensures consistency across all components.
 */

// ========== Stage Colors ==========

export const stageColors = {
  "Stage 1": {
    bg: "#6b7280", // Gray
    text: "#ffffff",
    light: "#9ca3af",
    border: "#4b5563",
  },
  "Stage 2": {
    bg: "#f59e0b", // Amber
    text: "#ffffff",
    light: "#fbbf24",
    border: "#d97706",
  },
  "Stage 3": {
    bg: "#3b82f6", // Blue
    text: "#ffffff",
    light: "#60a5fa",
    border: "#2563eb",
  },
  "Stage 4": {
    bg: "#16a34a", // Green
    text: "#ffffff",
    light: "#22c55e",
    border: "#15803d",
  },
  "Archived": {
    bg: "#9ca3af", // Gray (archived)
    text: "#ffffff",
    light: "#d1d5db",
    border: "#6b7280",
  },
};

export const getStageBgColor = (stage: string): string => {
  return stageColors[stage as keyof typeof stageColors]?.bg || stageColors["Stage 1"].bg;
};

export const getStageTextColor = (stage: string): string => {
  return stageColors[stage as keyof typeof stageColors]?.text || stageColors["Stage 1"].text;
};

export const getStageLightColor = (stage: string): string => {
  return stageColors[stage as keyof typeof stageColors]?.light || stageColors["Stage 1"].light;
};

export const getStageBorderColor = (stage: string): string => {
  return stageColors[stage as keyof typeof stageColors]?.border || stageColors["Stage 1"].border;
};

// ========== List Colors ==========

// Color palette for list badges (cyclic rotation for multiple lists)
export const listBadgeColors = [
  { bg: "#3b82f6", text: "#ffffff" }, // Blue
  { bg: "#8b5cf6", text: "#ffffff" }, // Purple
  { bg: "#ec4899", text: "#ffffff" }, // Pink
  { bg: "#f59e0b", text: "#ffffff" }, // Amber
  { bg: "#10b981", text: "#ffffff" }, // Emerald
  { bg: "#06b6d4", text: "#ffffff" }, // Cyan
  { bg: "#f97316", text: "#ffffff" }, // Orange
  { bg: "#6366f1", text: "#ffffff" }, // Indigo
];

export const getListBadgeColor = (index: number) => {
  return listBadgeColors[index % listBadgeColors.length];
};

// ========== Spacing ==========

export const spacing = {
  xs: "4px",
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "24px",
  xxl: "32px",
};

// ========== Border Radius ==========

export const borderRadius = {
  sm: "4px",
  md: "8px",
  lg: "12px",
  xl: "16px",
  pill: "20px",
  full: "50%",
};

// ========== Shadows ==========

export const shadows = {
  none: "none",
  sm: "0 1px 3px rgba(0,0,0,0.05)",
  md: "0 2px 6px rgba(0,0,0,0.08)",
  lg: "0 4px 12px rgba(0,0,0,0.12)",
  xl: "0 8px 16px rgba(0,0,0,0.15)",
};

// ========== Transitions ==========

export const transitions = {
  fast: "all 0.15s ease",
  normal: "all 0.2s ease",
  slow: "all 0.3s ease",
};

// ========== Typography ==========

export const typography = {
  fontSizes: {
    xs: "0.7rem",
    sm: "0.8rem",
    md: "0.9rem",
    base: "1rem",
    lg: "1.1rem",
    xl: "1.25rem",
    xxl: "1.5rem",
  },
  fontWeights: {
    normal: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },
};

// ========== Neutral Colors ==========

export const colors = {
  gray: {
    50: "#f9fafb",
    100: "#f3f4f6",
    200: "#e5e7eb",
    300: "#d1d5db",
    400: "#9ca3af",
    500: "#6b7280",
    600: "#4b5563",
    700: "#374151",
    800: "#1f2937",
    900: "#111827",
  },
  white: "#ffffff",
  black: "#000000",
  primary: "#3b82f6",
  success: "#16a34a",
  warning: "#f59e0b",
  danger: "#dc2626",
  info: "#06b6d4",
};

// ========== Card Styles ==========

export const cardStyles = {
  default: {
    backgroundColor: colors.white,
    border: `1px solid ${colors.gray[200]}`,
    borderRadius: borderRadius.md,
    boxShadow: shadows.sm,
    transition: transitions.normal,
  },
  hover: {
    transform: "translateY(-1px)",
    boxShadow: shadows.md,
  },
  dragging: {
    opacity: 0.4,
    transform: "scale(1.02)",
    boxShadow: shadows.xl,
  },
};

// ========== Button Styles ==========

export const buttonStyles = {
  primary: {
    backgroundColor: colors.gray[900],
    color: colors.white,
    border: "none",
    borderRadius: borderRadius.pill,
    fontWeight: typography.fontWeights.semibold,
    padding: "6px 16px",
    transition: transitions.normal,
  },
  secondary: {
    backgroundColor: colors.white,
    color: colors.gray[700],
    border: `1px solid ${colors.gray[300]}`,
    borderRadius: borderRadius.pill,
    fontWeight: typography.fontWeights.medium,
    padding: "6px 16px",
    transition: transitions.normal,
  },
  danger: {
    backgroundColor: "transparent",
    color: colors.danger,
    border: `1px solid ${colors.danger}`,
    borderRadius: borderRadius.full,
    transition: transitions.normal,
  },
};

// ========== Badge Styles ==========

export const badgeStyles = {
  default: {
    borderRadius: "10px",
    padding: "3px 8px",
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
  },
  pill: {
    borderRadius: borderRadius.pill,
    padding: "4px 12px",
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
  },
};

// ========== Animation Durations ==========

export const animations = {
  durations: {
    fast: 150,
    normal: 200,
    slow: 300,
  },
};

// ========== Kanban Specific ==========

export const kanbanStyles = {
  columnWidth: "300px",
  columnMinWidth: "280px",
  columnMaxWidth: "350px",
  cardGap: spacing.sm,
  columnPadding: spacing.md,
  headerHeight: "60px",
};
