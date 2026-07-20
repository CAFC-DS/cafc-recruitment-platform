import React from "react";
import logo from "../../assets/logo.png";
import "./AuthShell.css";

interface AuthShellProps {
  eyebrow: string;
  heading: string;
  wide?: boolean;
  children: React.ReactNode;
}

const AuthShell: React.FC<AuthShellProps> = ({ eyebrow, heading, wide, children }) => {
  return (
    <div className="login-shell">
      <div className="login-watermark" aria-hidden="true" />

      <div className={`login-card${wide ? " login-card-wide" : ""}`}>
        <div className="login-card-header">
          <img src={logo} alt="" className="login-crest" />
          <div>
            <div className="login-masthead">{eyebrow}</div>
            <h1 className="login-heading">{heading}</h1>
          </div>
        </div>

        <hr className="login-divider" />

        {children}
      </div>
    </div>
  );
};

export default AuthShell;
