import React, { createContext, useContext, useState, useEffect } from "react";

interface ThemeColors {
  // Brand colors (from screenshots)
  primary: string;
  primaryDark: string;

  // Status colors (keep vivid for performance indicators)
  success: string;
  warning: string;
  danger: string;

  // Neutral colors (professional, minimal)
  background: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;

  // Header/navigation
  headerBg: string;
  headerText: string;
}

interface Theme {
  isDark: boolean;
  colors: ThemeColors;
}

const lightTheme: ThemeColors = {
  primary: "#CC0000", // Vibrant CAFC red
  primaryDark: "#AA0000",

  success: "#16a34a", // Keep vivid for performance scores
  warning: "#d97706",
  danger: "#dc2626",

  background: "#F1F5F9", // Slate-100
  surface: "#ffffff",
  border: "#E2E8F0", // Slate-200
  text: "#1E293B", // Slate-800
  textMuted: "#64748B", // Slate-500

  headerBg: "#0F172A", // Rich navy-black
  headerText: "#ffffff",
};

const darkTheme: ThemeColors = {
  primary: "#CC0000", // Same red works on dark
  primaryDark: "#AA0000",

  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",

  background: "#0B0F19", // Deep navy
  surface: "#141824", // Slightly lighter surface
  border: "#1F2937", // Subtle border
  text: "#F1F5F9", // Clean white
  textMuted: "#94A3B8", // Slate-400

  headerBg: "#07090F", // Near-black
  headerText: "#F1F5F9",
};

interface ThemeContextType {
  theme: Theme;
  toggleDarkMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("darkMode");
    return saved ? JSON.parse(saved) : false;
  });

  const theme: Theme = {
    isDark,
    colors: isDark ? darkTheme : lightTheme,
  };

  const toggleDarkMode = () => {
    setIsDark(!isDark);
    localStorage.setItem("darkMode", JSON.stringify(!isDark));
  };

  // Apply theme to CSS custom properties
  useEffect(() => {
    const root = document.documentElement;
    Object.entries(theme.colors).forEach(([key, value]) => {
      root.style.setProperty(
        `--color-${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`,
        value,
      );
    });

    // Apply theme to body
    document.body.style.backgroundColor = theme.colors.background;
    document.body.style.color = theme.colors.text;

    // Add theme class to body for CSS targeting
    document.body.classList.remove("theme-light", "theme-dark");
    document.body.classList.add(isDark ? "theme-dark" : "theme-light");
    document.documentElement.setAttribute(
      "data-bs-theme",
      isDark ? "dark" : "light",
    );

    // Apply Bootstrap variable overrides
    root.style.setProperty("--bs-primary", theme.colors.primary);
    root.style.setProperty("--bs-success", theme.colors.success);
    root.style.setProperty("--bs-warning", theme.colors.warning);
    root.style.setProperty("--bs-danger", theme.colors.danger);
    root.style.setProperty("--bs-light", theme.colors.surface);
    root.style.setProperty("--bs-dark", theme.colors.headerBg);
    root.style.setProperty("--bs-body-bg", theme.colors.background);
    root.style.setProperty("--bs-body-color", theme.colors.text);
    root.style.setProperty("--bs-border-color", theme.colors.border);

    // Additional Bootstrap components
    root.style.setProperty("--bs-card-bg", theme.colors.surface);
    root.style.setProperty("--bs-card-border-color", theme.colors.border);
    root.style.setProperty("--bs-card-color", theme.colors.text);
    root.style.setProperty("--bs-modal-bg", theme.colors.surface);
    root.style.setProperty("--bs-modal-header-bg", theme.colors.surface);
    root.style.setProperty("--bs-modal-color", theme.colors.text);
    root.style.setProperty("--bs-nav-link-color", theme.colors.text);
    root.style.setProperty("--bs-navbar-brand-color", theme.colors.headerText);
    root.style.setProperty("--bs-table-bg", theme.colors.surface);
    root.style.setProperty("--bs-table-color", theme.colors.text);
    root.style.setProperty(
      "--bs-table-striped-bg",
      isDark ? "#1A2030" : "#f8f9fa",
    );
    root.style.setProperty(
      "--bs-table-hover-bg",
      isDark ? "#1F2937" : "#e9ecef",
    );
    root.style.setProperty("--bs-form-control-bg", theme.colors.surface);
    root.style.setProperty("--bs-form-control-color", theme.colors.text);
    root.style.setProperty(
      "--bs-form-control-border-color",
      theme.colors.border,
    );
    root.style.setProperty("--bs-btn-close-color", theme.colors.text);
    root.style.setProperty("--bs-dropdown-bg", theme.colors.surface);
    root.style.setProperty("--bs-dropdown-color", theme.colors.text);
    root.style.setProperty("--bs-dropdown-border-color", theme.colors.border);

    // Alert components
    root.style.setProperty("--bs-alert-bg", theme.colors.surface);
    root.style.setProperty("--bs-alert-border-color", theme.colors.border);
    root.style.setProperty("--bs-alert-color", theme.colors.text);

    // Additional dark mode specific overrides
    if (isDark) {
      root.style.setProperty("--bs-secondary", theme.colors.surface);
      root.style.setProperty("--bs-secondary-bg", theme.colors.surface);
      root.style.setProperty("--bs-tertiary-bg", theme.colors.background);
      root.style.setProperty("--bs-emphasis-color", theme.colors.text);
      root.style.setProperty("--bs-link-color", "#60a5fa");
      root.style.setProperty("--bs-link-hover-color", "#3b82f6");
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
