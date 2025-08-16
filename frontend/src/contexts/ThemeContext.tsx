import React, { createContext, useContext, useState, useEffect } from 'react';

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
  primary: '#b91c1c', // Professional red from screenshots
  primaryDark: '#991b1b',
  
  success: '#16a34a', // Keep vivid for performance scores
  warning: '#d97706',
  danger: '#dc2626',
  
  background: '#f8f9fa', // Light gray background
  surface: '#ffffff',
  border: '#e5e7eb',
  text: '#374151',
  textMuted: '#6b7280',
  
  headerBg: '#4b5563', // Dark gray header like screenshots
  headerText: '#ffffff',
};

const darkTheme: ThemeColors = {
  primary: '#dc2626', // Slightly brighter red for dark mode
  primaryDark: '#b91c1c',
  
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  
  background: '#111827',
  surface: '#1f2937',
  border: '#374151',
  text: '#f9fafb',
  textMuted: '#d1d5db',
  
  headerBg: '#111827',
  headerText: '#ffffff',
};

interface ThemeContextType {
  theme: Theme;
  toggleDarkMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  const theme: Theme = {
    isDark,
    colors: isDark ? darkTheme : lightTheme,
  };

  const toggleDarkMode = () => {
    setIsDark(!isDark);
    localStorage.setItem('darkMode', JSON.stringify(!isDark));
  };

  // Apply theme to CSS custom properties
  useEffect(() => {
    const root = document.documentElement;
    Object.entries(theme.colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`, value);
    });
    
    // Apply theme to body
    document.body.style.backgroundColor = theme.colors.background;
    document.body.style.color = theme.colors.text;
    
    // Apply Bootstrap variable overrides
    root.style.setProperty('--bs-primary', theme.colors.primary);
    root.style.setProperty('--bs-success', theme.colors.success);
    root.style.setProperty('--bs-warning', theme.colors.warning);
    root.style.setProperty('--bs-danger', theme.colors.danger);
    root.style.setProperty('--bs-light', theme.colors.surface);
    root.style.setProperty('--bs-dark', theme.colors.headerBg);
    root.style.setProperty('--bs-body-bg', theme.colors.background);
    root.style.setProperty('--bs-body-color', theme.colors.text);
    root.style.setProperty('--bs-border-color', theme.colors.border);
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
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};