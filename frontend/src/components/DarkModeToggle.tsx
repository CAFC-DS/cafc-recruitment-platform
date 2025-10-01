import React from "react";
import { Button } from "react-bootstrap";
import { useTheme } from "../contexts/ThemeContext";

const DarkModeToggle: React.FC = () => {
  const { theme, toggleDarkMode } = useTheme();

  return (
    <Button
      variant="outline-light"
      size="sm"
      onClick={toggleDarkMode}
      className="d-flex align-items-center"
      style={{
        border: "none",
        backgroundColor: "transparent",
      }}
    >
      {theme.isDark ? (
        <>
          <span className="me-1">☀️</span>
          <span className="d-none d-md-inline">Light</span>
        </>
      ) : (
        <>
          <span className="me-1">🌙</span>
          <span className="d-none d-md-inline">Dark</span>
        </>
      )}
    </Button>
  );
};

export default DarkModeToggle;
