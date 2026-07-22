import { StylesConfig } from "react-select";

interface ThemeColorsForSelect {
  surface: string;
  background: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
}

/**
 * react-select renders its own DOM/CSS entirely independent of Bootstrap
 * variables, so it needs an explicit styles config to follow dark mode.
 */
export function getReactSelectStyles(
  colors: ThemeColorsForSelect,
  isDark: boolean,
): StylesConfig<any, boolean> {
  return {
    control: (base, state) => ({
      ...base,
      backgroundColor: colors.surface,
      borderColor: state.isFocused ? colors.primary : colors.border,
      boxShadow: state.isFocused ? `0 0 0 1px ${colors.primary}` : "none",
      "&:hover": {
        borderColor: colors.primary,
      },
    }),
    singleValue: (base) => ({
      ...base,
      color: colors.text,
    }),
    input: (base) => ({
      ...base,
      color: colors.text,
    }),
    placeholder: (base) => ({
      ...base,
      color: colors.textMuted,
    }),
    menu: (base) => ({
      ...base,
      backgroundColor: colors.surface,
      border: `1px solid ${colors.border}`,
      zIndex: 1050,
    }),
    menuList: (base) => ({
      ...base,
      backgroundColor: colors.surface,
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected
        ? colors.primary
        : state.isFocused
          ? (isDark ? "rgba(239, 68, 68, 0.15)" : "#fff1f2")
          : colors.surface,
      color: state.isSelected ? "#ffffff" : colors.text,
      "&:active": {
        backgroundColor: colors.primary,
        color: "#ffffff",
      },
    }),
    multiValue: (base) => ({
      ...base,
      backgroundColor: isDark ? "rgba(239, 68, 68, 0.15)" : "#fff1f2",
    }),
    multiValueLabel: (base) => ({
      ...base,
      color: isDark ? "#fca5a5" : "#9f1239",
    }),
    indicatorSeparator: (base) => ({
      ...base,
      backgroundColor: colors.border,
    }),
    dropdownIndicator: (base) => ({
      ...base,
      color: colors.textMuted,
    }),
    clearIndicator: (base) => ({
      ...base,
      color: colors.textMuted,
    }),
  };
}
