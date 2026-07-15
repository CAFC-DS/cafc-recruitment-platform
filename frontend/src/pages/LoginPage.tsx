import React, { useState } from "react";
import { Form, Button, Alert, Spinner } from "react-bootstrap";
import { ArrowRight } from "lucide-react";
import axiosInstance from "../axiosInstance";
import axios from "axios"; // Import axios for isAxiosError
import { useNavigate } from "react-router-dom";
import ForgotPasswordModal from "../components/ForgotPasswordModal";
import logo from "../assets/logo.png";
import "./LoginPage.css";

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
      navigate("/"); // Redirect to homepage on successful login
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
    <div className="login-shell">
      <div className="login-brand-panel">
        <img src={logo} alt="" className="login-brand-logo" />
        <h1 className="login-brand-heading">Scouting, organised.</h1>
        <p className="login-brand-copy">
          Reports, grades, and recommendations for every player on the radar
          &mdash; in one place for the whole recruitment team.
        </p>
      </div>

      <div className="login-form-panel">
        <div className="login-form-card">
          <div className="login-form-eyebrow">Recruitment platform</div>
          <h2 className="login-form-title">Sign in</h2>

          {error && <Alert variant="danger">{error}</Alert>}

          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3" controlId="username">
              <Form.Label>Username</Form.Label>
              <Form.Control
                type="text"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </Form.Group>

            <Form.Group className="mb-3" controlId="password">
              <Form.Label>Password</Form.Label>
              <Form.Control
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Form.Group>

            <Button
              variant="primary"
              type="submit"
              className="w-100 d-flex align-items-center justify-content-center gap-2"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Spinner animation="border" size="sm" />
                  Signing in&hellip;
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight size={16} />
                </>
              )}
            </Button>
          </Form>

          <div className="login-form-footer">
            <Button
              variant="link"
              className="p-0"
              onClick={() => setShowForgotPassword(true)}
            >
              Forgot your password?
            </Button>
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
