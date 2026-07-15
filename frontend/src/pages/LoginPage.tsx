import React, { useState } from "react";
import { Form, Button, Alert, Spinner } from "react-bootstrap";
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
      <div className="login-watermark" aria-hidden="true" />

      <div className="login-card">
        <div className="login-card-header">
          <img src={logo} alt="" className="login-crest" />
          <div>
            <div className="login-masthead">Charlton Athletic</div>
            <h1 className="login-heading">Recruitment &amp; Scouting</h1>
          </div>
        </div>

        <hr className="login-divider" />

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
            className="w-100"
            disabled={loading}
          >
            {loading ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Signing in&hellip;
              </>
            ) : (
              "Sign in"
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

      <ForgotPasswordModal
        show={showForgotPassword}
        onHide={() => setShowForgotPassword(false)}
      />
    </div>
  );
};

export default LoginPage;
