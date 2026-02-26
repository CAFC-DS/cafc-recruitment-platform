import React, { useState } from "react";
import { Form, Button, Alert, Spinner } from "react-bootstrap";
import axiosInstance from "../axiosInstance";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import ForgotPasswordModal from "../components/ForgotPasswordModal";
import logo from "../assets/logo.png";

interface LoginPageProps {
  onLoginSuccess: (token: string) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await axiosInstance.post(
        "/token",
        new URLSearchParams({
          username: username,
          password: password,
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      );
      const { access_token } = response.data;
      onLoginSuccess(access_token);
      navigate("/");
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.detail || "Login failed");
      } else {
        setError("An unexpected error occurred");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "'Inter', sans-serif" }}>
      {/* Left panel — brand */}
      <div
        className="d-none d-md-flex"
        style={{
          width: "45%",
          background: "#0F172A",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Red accent bar at top */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "4px", background: "#CC0000" }} />

        {/* Subtle diagonal stripe background */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "repeating-linear-gradient(135deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 40px)",
          }}
        />

        <div style={{ position: "relative", textAlign: "center", padding: "2rem" }}>
          <img
            src={logo}
            alt="Charlton Athletic FC"
            style={{
              width: "96px",
              height: "96px",
              marginBottom: "1.5rem",
              filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.4))",
            }}
          />
          <h1
            style={{
              color: "#ffffff",
              fontSize: "1.75rem",
              fontWeight: 700,
              marginBottom: "0.5rem",
              letterSpacing: "-0.02em",
            }}
          >
            Charlton Athletic FC
          </h1>
          <p
            style={{
              color: "#CC0000",
              fontSize: "0.8rem",
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              marginBottom: "2.5rem",
            }}
          >
            Recruitment Platform
          </p>
          <p
            style={{
              color: "rgba(255,255,255,0.45)",
              fontSize: "0.95rem",
              fontWeight: 400,
              lineHeight: 1.8,
              maxWidth: "260px",
              margin: "0 auto",
            }}
          >
            Scouting. Intelligence. Recruitment.
          </p>
        </div>
      </div>

      {/* Right panel — form */}
      <div
        style={{
          flex: 1,
          background: "#F8FAFC",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
        }}
      >
        <div style={{ width: "100%", maxWidth: "380px" }}>
          {/* Mobile logo — only shown on small screens */}
          <div className="d-flex d-md-none align-items-center mb-4" style={{ gap: "0.75rem" }}>
            <img src={logo} alt="CAFC" style={{ width: "40px", height: "40px" }} />
            <span style={{ fontWeight: 700, fontSize: "1rem", color: "#0F172A" }}>
              Charlton Athletic FC
            </span>
          </div>

          <h2
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "#0F172A",
              marginBottom: "0.4rem",
              letterSpacing: "-0.02em",
            }}
          >
            Sign in
          </h2>
          <p style={{ color: "#64748B", fontSize: "0.875rem", marginBottom: "2rem" }}>
            Enter your credentials to access the platform
          </p>

          {error && (
            <Alert
              variant="danger"
              className="mb-3"
              style={{ fontSize: "0.875rem", borderRadius: "10px" }}
            >
              {error}
            </Alert>
          )}

          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3" controlId="username">
              <Form.Label
                style={{ fontWeight: 600, fontSize: "0.875rem", color: "#374151" }}
              >
                Username
              </Form.Label>
              <Form.Control
                type="text"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                style={{
                  borderRadius: "10px",
                  border: "1.5px solid #E2E8F0",
                  padding: "0.625rem 0.875rem",
                  fontSize: "0.9rem",
                }}
              />
            </Form.Group>

            <Form.Group className="mb-4" controlId="password">
              <Form.Label
                style={{ fontWeight: 600, fontSize: "0.875rem", color: "#374151" }}
              >
                Password
              </Form.Label>
              <Form.Control
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  borderRadius: "10px",
                  border: "1.5px solid #E2E8F0",
                  padding: "0.625rem 0.875rem",
                  fontSize: "0.9rem",
                }}
              />
            </Form.Group>

            <Button
              type="submit"
              className="w-100"
              disabled={loading}
              style={{
                background: "#CC0000",
                border: "none",
                borderRadius: "10px",
                fontWeight: 600,
                fontSize: "0.9rem",
                padding: "0.75rem",
                letterSpacing: "0.01em",
                transition: "all 0.2s ease",
              }}
            >
              {loading ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </Form>

          <div className="text-center mt-3">
            <button
              type="button"
              onClick={() => setShowForgotPassword(true)}
              style={{
                background: "none",
                border: "none",
                color: "#64748B",
                fontSize: "0.875rem",
                cursor: "pointer",
                padding: 0,
                textDecoration: "underline",
              }}
            >
              Forgot your password?
            </button>
          </div>
        </div>
      </div>

      <ForgotPasswordModal
        show={showForgotPassword}
        onHide={() => setShowForgotPassword(false)}
      />
    </div>
  );
};

export default LoginPage;
