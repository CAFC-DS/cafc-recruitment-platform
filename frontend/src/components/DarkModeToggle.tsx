import React from "react";
import { Button } from "react-bootstrap";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

const DarkModeToggle: React.FC = () => {
  const { theme, toggleDarkMode } = useTheme();

  return (
    <Button
      variant="outline-light"
      size="sm"
      onClick={toggleDarkMode}
      className="d-flex align-items-center gap-1"
      style={{
        border: "none",
        backgroundColor: "transparent",
      }}
    >
      {theme.isDark ? (
        <>
          <Sun size={15} />
          <span className="d-none d-md-inline">Light</span>
        </>
      ) : (
        <>
          <Moon size={15} />
          <span className="d-none d-md-inline">Dark</span>
        </>
      )}
    </Button>
  );
};

export default DarkModeToggle;
