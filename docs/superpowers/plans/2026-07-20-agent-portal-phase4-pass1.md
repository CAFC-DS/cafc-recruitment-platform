# Agent Portal Phase 4 Pass 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Agent Portal's auth pages (login, register, reset password, landing) and
persistent nav shell onto the same design-token system as the internal app, including dark-mode
support, via one shared reusable login layout.

**Architecture:** Extract the internal `LoginPage.tsx`'s already-token-based visual shell into a
new `AuthShell.tsx` component with a small props API (`eyebrow`, `heading`, `wide`, `children`).
Four Agent Portal pages (`AgentLoginPage`, `AgentRegisterPage`, `AgentResetPasswordPage`,
`AgentLandingPage`) drop their custom split-panel layout and render their existing form/content
through this shared shell instead. `AgentPortalShell.tsx` (nav header for logged-in agent pages)
gets its hardcoded colors/font swapped for the real design tokens and gains a dark-mode toggle.
Dead CSS is removed once nothing renders it.

**Tech Stack:** React 18 + TypeScript, react-bootstrap, CSS custom properties
(`var(--color-*)`, `var(--font-*)`) defined in `ThemeContext.tsx` and consumed via
`professional-theme.css`.

## Global Constraints

- **Frozen, never touched:** `frontend/src/utils/colorUtils.ts`,
  `frontend/src/styles/playerLists.theme.ts`, the `getAttributeGroupColor`/
  `getPositionAttributeGroupColor` blocks in `PlayerReportModal.tsx`/`PlayerProfilePage.tsx`/
  `SharedReportPage.tsx`, `Kanban/PlayerKanbanCard.tsx`/`Kanban/CollapsiblePlayerBar.tsx`/
  `Kanban/KanbanColumn.tsx` card-state border colors, `ScoutingAssessmentModal.tsx`.
- **No new test framework.** This codebase has no established component/visual test suite (only
  the default `App.test.tsx` boilerplate exists). Every task's verification step is the same
  Track 1 discipline used throughout this engagement: `npx tsc --noEmit` (must be clean),
  `npx eslint <changed files>` (compare warning count against the pre-task baseline — zero new
  warnings), and a frozen-file diff (`git diff main -- <frozen files>`, must be empty). Track 2
  (live browser check in both themes) is called out explicitly per task.
- **Routing/auth logic is never touched.** The `/agents/login` URL, the backend role-based
  redirect (`me.data.role === 'agent' ? '/agents/dashboard' : '/'`), and all `handleSubmit`
  network calls in every page below are carried over verbatim — only the JSX shell around them
  changes.
- **Working directory:** all file paths below are relative to
  `/Users/hashim.umarji/Desktop/CAFC/2025-26/Recruitment/Coding/NewRecruitmentPlatform-design-refresh/frontend/src/`
  unless stated otherwise.
- **Dev servers**, if you need to visually verify: backend
  `../backend && /Users/hashim.umarji/Desktop/CAFC/2025-26/Recruitment/Coding/NewRecruitmentPlatform/backend/venv/bin/python main.py`
  (port 8000, needs `backend/.env` and `backend/keys/` copied from the main checkout — both are
  gitignored and already present if you're continuing this session's worktree), frontend
  `npm start` (port 3001, `PORT=3001` is baked into `package.json`'s `start` script).

## Correction from the approved spec

The spec (`docs/superpowers/specs/2026-07-20-agent-portal-phase4-pass1-design.md`) said Task 7
would reuse `components/DarkModeToggle.tsx` "as-is." Investigation while writing this plan found
that component is **not actually used in production** — it only appears in the dev-only
`StyleTilePage.tsx`. The real, live dark-mode toggle (verified in `Navbar.tsx:777-778`) is a
`Dropdown.Item` with `onClick={toggleDarkMode}` and a `Sun`/`Moon` icon from `lucide-react`.
`AgentPortalShell.tsx`'s nav has no dropdown — it's a flat row of pill-shaped links (see the
existing "Log Out" button at `AgentPortalShell.tsx:46-56`, which is already a
`className="agent-portal-nav-link"` button with `style={{ border: 'none' }}`). Task 7 below
builds a small toggle button following that exact existing pattern (nav-link pill, `Sun`/`Moon`
icon, calls `toggleDarkMode` from `useTheme()` directly) instead of importing the unrelated
`DarkModeToggle.tsx`. This doesn't change the spec's intent (a working, visually-consistent
toggle in the nav) — only the specific component reused to build it.

---

## Task 1: Create `AuthShell` and migrate `LoginPage.tsx`

**Files:**
- Create: `frontend/src/components/auth/AuthShell.tsx`
- Modify: `frontend/src/pages/LoginPage.tsx`
- Modify: `frontend/src/pages/LoginPage.css`

**Interfaces:**
- Produces: `AuthShell` component, default export, props:
  ```ts
  interface AuthShellProps {
    eyebrow: string;
    heading: string;
    wide?: boolean;
    children: React.ReactNode;
  }
  ```
  Consumed by Tasks 2-5.

- [ ] **Step 1: Read the current files to confirm nothing has drifted since planning**

```bash
cat frontend/src/pages/LoginPage.tsx
cat frontend/src/pages/LoginPage.css
```

(Working from repo root
`/Users/hashim.umarji/Desktop/CAFC/2025-26/Recruitment/Coding/NewRecruitmentPlatform-design-refresh`.)

- [ ] **Step 2: Create `frontend/src/components/auth/AuthShell.tsx`**

```tsx
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
```

- [ ] **Step 3: Create `frontend/src/components/auth/AuthShell.css`**

This is `LoginPage.css`'s content moved verbatim, plus one new `.login-card-wide` modifier (the
value `680px` matches the outgoing `.agent-auth-card-wide`'s width so Register/Landing don't get
narrower than they are today).

```css
.login-shell {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  background-color: var(--color-header-bg);
  padding: 2rem;
}

/* Large, faint crest watermark -- a club artifact, not a decorative
   gradient/orb. Deliberately not the small logo used elsewhere. */
.login-watermark {
  position: absolute;
  top: 50%;
  right: -10%;
  width: 900px;
  height: 900px;
  transform: translateY(-50%);
  background-image: url("../../assets/logo.png");
  background-size: contain;
  background-repeat: no-repeat;
  filter: grayscale(1);
  opacity: 0.04;
  pointer-events: none;
}

.login-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 24rem;
  background-color: var(--color-surface);
  border-top: 3px solid var(--color-primary);
  border-radius: 6px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
  padding: 2rem 2.25rem 2.25rem;
}

.login-card-wide {
  max-width: 680px;
}

.login-card-header {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  margin-bottom: 1.25rem;
}

.login-crest {
  height: 44px;
  width: 44px;
  flex-shrink: 0;
  object-fit: contain;
}

.login-masthead {
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 0.72rem;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  margin-bottom: 0.15rem;
}

.login-heading {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.4rem;
  color: var(--color-text);
  margin: 0;
  line-height: 1.15;
}

.login-divider {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: 0 0 1.4rem;
}

.login-card label.form-label {
  font-family: var(--font-body);
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--color-text);
}

.login-card .form-control {
  border-radius: 4px;
}

.login-card .btn-primary {
  border-radius: 4px;
}

.login-form-footer {
  margin-top: 1.25rem;
  text-align: center;
}
```

- [ ] **Step 4: Delete `frontend/src/pages/LoginPage.css`**

```bash
rm frontend/src/pages/LoginPage.css
```

- [ ] **Step 5: Rewrite `frontend/src/pages/LoginPage.tsx` to render through `AuthShell`**

```tsx
import React, { useState } from "react";
import { Form, Button, Alert, Spinner } from "react-bootstrap";
import axiosInstance from "../axiosInstance";
import axios from "axios"; // Import axios for isAxiosError
import { useNavigate } from "react-router-dom";
import ForgotPasswordModal from "../components/ForgotPasswordModal";
import AuthShell from "../components/auth/AuthShell";

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
    <AuthShell eyebrow="Charlton Athletic" heading="Recruitment & Scouting">
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

      <ForgotPasswordModal
        show={showForgotPassword}
        onHide={() => setShowForgotPassword(false)}
      />
    </AuthShell>
  );
};

export default LoginPage;
```

Note: the `ForgotPasswordModal` is rendered *inside* `AuthShell`'s children here (it was a
sibling of `.login-shell` before). This is safe — `Modal` from react-bootstrap renders into a
React portal at `document.body`, so its position in the JSX tree doesn't affect where it visually
appears.

- [ ] **Step 6: Verify — typecheck, lint, frozen-file diff**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no output (clean).

```bash
npx eslint src/pages/LoginPage.tsx src/components/auth/AuthShell.tsx
```
Expected: no errors. (No pre-existing warnings on these files to compare against — both are
new/rewritten.)

```bash
cd .. && git diff main -- frontend/src/utils/colorUtils.ts frontend/src/styles/playerLists.theme.ts
```
Expected: no output (empty diff).

- [ ] **Step 7: Live check — internal login page renders identically**

Start the dev servers per the Global Constraints section if not already running. Navigate to
`http://localhost:3001/login` in both light and dark mode (toggle via Settings → Dark Mode in
the navbar once logged in elsewhere, or check `localStorage.getItem('darkMode')` before
navigating). Confirm: crest watermark, centered card, red top border, "Charlton Athletic" /
"Recruitment & Scouting" heading, username/password fields, "Forgot your password?" link, and
the modal it opens all look exactly as they did before this task (this task is a pure refactor —
zero visual change expected).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/auth/AuthShell.tsx frontend/src/components/auth/AuthShell.css frontend/src/pages/LoginPage.tsx
git rm frontend/src/pages/LoginPage.css
git commit -m "Extract AuthShell from LoginPage for reuse across internal and agent auth"
```

---

## Task 2: Migrate `AgentLoginPage.tsx` to `AuthShell`

**Files:**
- Modify: `frontend/src/pages/agents/AgentLoginPage.tsx`

**Interfaces:**
- Consumes: `AuthShell` from `../../components/auth/AuthShell` (Task 1)

- [ ] **Step 1: Rewrite `frontend/src/pages/agents/AgentLoginPage.tsx`**

```tsx
import React, { useState } from 'react';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import axiosInstance from '../../axiosInstance';
import { useAuth } from '../../App';
import AuthShell from '../../components/auth/AuthShell';

const AgentLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await axiosInstance.post(
        '/token',
        new URLSearchParams({ username: email.trim().toLowerCase(), password }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      login(response.data.access_token);
      const me = await axiosInstance.get('/users/me');
      navigate(me.data.role === 'agent' ? '/agents/dashboard' : '/');
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.detail || 'Login failed');
      } else {
        setError('Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell eyebrow="Charlton Athletic FC" heading="External Recommendation Portal">
      <h2 className="agent-auth-title">Sign in</h2>
      <p className="agent-auth-subtitle">Enter your credentials to access the external recommendation portal.</p>

      {error ? <Alert variant="danger" className="agent-auth-alert">{error}</Alert> : null}

      <Form onSubmit={handleSubmit}>
        <Form.Group className="mb-3">
          <Form.Label className="agent-auth-label">Email</Form.Label>
          <Form.Control
            className="agent-auth-input"
            type="email"
            placeholder="Enter email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Form.Group>
        <Form.Group className="mb-4">
          <Form.Label className="agent-auth-label">Password</Form.Label>
          <Form.Control
            className="agent-auth-input"
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Form.Group>

        <Button type="submit" className="agent-auth-button w-100" disabled={loading}>
          {loading ? (
            <>
              <Spinner animation="border" size="sm" className="me-2" />
              Signing in...
            </>
          ) : (
            'Sign in'
          )}
        </Button>
      </Form>

      <div style={{ marginTop: '1rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
        Need access? <Link to="/agents/register" className="agent-auth-inline-link">Register here</Link>
      </div>
      <div style={{ marginTop: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>
        Forgotten your password? Contact Charlton Athletic to be sent a reset link.
      </div>
    </AuthShell>
  );
};

export default AgentLoginPage;
```

Note what was dropped: `.agent-mobile-brand` (a small responsive-only crest+name block for the
old split-panel layout's mobile breakpoint) is gone because `AuthShell` already shows the crest
and brand name in its header at every viewport width — there's no longer a "desktop-only brand
panel that needs a mobile fallback" to work around. The two inline `color: '#64748B'` /
`'#94A3B8'` hex values are now `var(--color-text-muted)` (both were muted/secondary text; the
one-token collapse is intentional, not a mistake — the two-shade distinction doesn't exist
elsewhere in the app's muted-text usage).

- [ ] **Step 2: Verify — typecheck, lint, frozen-file diff**

```bash
cd frontend && npx tsc --noEmit
```
Expected: clean.

```bash
npx eslint src/pages/agents/AgentLoginPage.tsx
```
Expected: no errors, no new warnings.

```bash
cd .. && git diff main -- frontend/src/utils/colorUtils.ts frontend/src/styles/playerLists.theme.ts
```
Expected: empty.

- [ ] **Step 3: Live check**

Navigate to `http://localhost:3001/agents/login` in both themes. Confirm: same centered-card
shell as the internal login (crest, watermark, red top border), heading reads "External
Recommendation Portal", email/password fields, "Register here" link, and the two footer text
lines are all legible in dark mode (this is the exact bug class fixed earlier this session —
double-check nothing here is invisible-text-on-dark-background).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/agents/AgentLoginPage.tsx
git commit -m "Migrate AgentLoginPage to shared AuthShell"
```

---

## Task 3: Migrate `AgentRegisterPage.tsx` to `AuthShell` (wide variant)

**Files:**
- Modify: `frontend/src/pages/agents/AgentRegisterPage.tsx`

**Interfaces:**
- Consumes: `AuthShell` from `../../components/auth/AuthShell` (Task 1), rendered with `wide`

- [ ] **Step 1: Rewrite `frontend/src/pages/agents/AgentRegisterPage.tsx`**

```tsx
import React, { useState } from 'react';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import axios from 'axios';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { Link, useNavigate } from 'react-router-dom';
import axiosInstance from '../../axiosInstance';
import { useAuth } from '../../App';
import { agentRecommendationsService } from '../../services/agentRecommendationsService';
import AuthShell from '../../components/auth/AuthShell';

const AgentRegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({
    agent_name: '',
    agency: '',
    email: '',
    password: '',
    agent_number: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (field: string, value: string) =>
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

  const handlePhoneChange = (value?: string) =>
    setForm((current) => ({
      ...current,
      agent_number: value || '',
    }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedPhone = form.agent_number.trim();
    if (normalizedPhone && !isValidPhoneNumber(normalizedPhone)) {
      setError('Phone number must be in international format (e.g. +447700900123)');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await agentRecommendationsService.register({
        email: form.email,
        password: form.password,
        agent_name: form.agent_name,
        agency: form.agency,
        agent_number: normalizedPhone || undefined,
      });
      const tokenResponse = await axiosInstance.post(
        '/token',
        new URLSearchParams({ username: form.email.trim().toLowerCase(), password: form.password }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      login(tokenResponse.data.access_token);
      navigate('/agents/dashboard');
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.detail || 'Registration failed');
      } else {
        setError('Registration failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell eyebrow="Charlton Athletic FC" heading="External Recommendation Portal" wide>
      <h2 className="agent-auth-title">Register</h2>
      <p className="agent-auth-subtitle">Create your external portal account using your agency contact details.</p>
      <div style={{ color: 'var(--color-text)', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
        * Required fields
      </div>
      <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
        Your details are stored for identity verification and recommendation audit trail purposes.
      </div>
      {error ? <Alert variant="danger" className="agent-auth-alert">{error}</Alert> : null}

      <Form onSubmit={handleSubmit}>
        <div className="row g-3">
          <div className="col-md-6">
            <Form.Label className="agent-auth-label">Agent name *</Form.Label>
            <Form.Control className="agent-auth-input" value={form.agent_name} onChange={(e) => handleChange('agent_name', e.target.value)} required />
          </div>
          <div className="col-md-6">
            <Form.Label className="agent-auth-label">Agency *</Form.Label>
            <Form.Control className="agent-auth-input" value={form.agency} onChange={(e) => handleChange('agency', e.target.value)} required />
          </div>
          <div className="col-12">
            <Form.Label className="agent-auth-label">Email *</Form.Label>
            <Form.Control className="agent-auth-input" type="email" value={form.email} onChange={(e) => handleChange('email', e.target.value)} required />
          </div>
          <div className="col-12">
            <Form.Label className="agent-auth-label">Password *</Form.Label>
            <Form.Control className="agent-auth-input" type="password" value={form.password} onChange={(e) => handleChange('password', e.target.value)} required />
          </div>
          <div className="col-12">
            <Form.Label className="agent-auth-label">Phone number</Form.Label>
            <PhoneInput
              defaultCountry="GB"
              international
              countryCallingCodeEditable={false}
              placeholder="Enter phone number"
              value={form.agent_number || undefined}
              onChange={handlePhoneChange}
              className="agent-auth-phone-input"
            />
            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.82rem', marginTop: '0.45rem' }}>
              Stored as international format: {form.agent_number || '+44...'}
            </div>
          </div>
        </div>

        <div className="agent-auth-actions" style={{ marginTop: '1.5rem', justifyContent: 'space-between' }}>
          <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
            Already registered? <Link to="/agents/login" className="agent-auth-inline-link">Sign in</Link>
          </div>
          <Button type="submit" className="agent-auth-button" disabled={loading}>
            {loading ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Creating account...
              </>
            ) : (
              'Create account'
            )}
          </Button>
        </div>
      </Form>
    </AuthShell>
  );
};

export default AgentRegisterPage;
```

- [ ] **Step 2: Verify — typecheck, lint, frozen-file diff**

```bash
cd frontend && npx tsc --noEmit
```
Expected: clean.

```bash
npx eslint src/pages/agents/AgentRegisterPage.tsx
```
Expected: no errors, no new warnings.

```bash
cd .. && git diff main -- frontend/src/utils/colorUtils.ts frontend/src/styles/playerLists.theme.ts
```
Expected: empty.

- [ ] **Step 3: Live check**

Navigate to `http://localhost:3001/agents/register` in both themes. Confirm the card is visibly
wider than the login card (2-column field grid: Agent name/Agency side by side), the phone input
renders correctly (it's a third-party component — check it isn't rendering a stray white
background box in dark mode), and "* Required fields" / helper text / "Already registered? Sign
in" are all legible in both themes.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/agents/AgentRegisterPage.tsx
git commit -m "Migrate AgentRegisterPage to shared AuthShell (wide variant)"
```

---

## Task 4: Migrate `AgentResetPasswordPage.tsx` to `AuthShell`

**Files:**
- Modify: `frontend/src/pages/agents/AgentResetPasswordPage.tsx`

**Interfaces:**
- Consumes: `AuthShell` from `../../components/auth/AuthShell` (Task 1)

- [ ] **Step 1: Rewrite `frontend/src/pages/agents/AgentResetPasswordPage.tsx`**

```tsx
import React, { useState } from 'react';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import axios from 'axios';
import { Link, useSearchParams } from 'react-router-dom';
import { agentRecommendationsService } from '../../services/agentRecommendationsService';
import AuthShell from '../../components/auth/AuthShell';

const AgentResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!token) {
      setError('This reset link is invalid. Please request a new one from Charlton Athletic.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setLoading(true);
    try {
      await agentRecommendationsService.confirmPasswordReset({ token, new_password: newPassword });
      setSuccess(true);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.detail || 'Password reset failed');
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell eyebrow="Charlton Athletic FC" heading="External Recommendation Portal">
      <h2 className="agent-auth-title">Set a new password</h2>

      {success ? (
        <>
          <Alert variant="success" className="agent-auth-alert">
            Your password has been reset. You can now sign in with your new password.
          </Alert>
          <Link to="/agents/login" className="agent-auth-button w-100 d-inline-block text-center text-decoration-none">
            Go to sign in
          </Link>
        </>
      ) : (
        <>
          <p className="agent-auth-subtitle">Enter a new password for your agent account.</p>
          {error ? <Alert variant="danger" className="agent-auth-alert">{error}</Alert> : null}

          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3">
              <Form.Label className="agent-auth-label">New password</Form.Label>
              <Form.Control
                className="agent-auth-input"
                type="password"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
              <Form.Text className="text-muted">Minimum 8 characters</Form.Text>
            </Form.Group>
            <Form.Group className="mb-4">
              <Form.Label className="agent-auth-label">Confirm new password</Form.Label>
              <Form.Control
                className="agent-auth-input"
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </Form.Group>

            <Button type="submit" className="agent-auth-button w-100" disabled={loading}>
              {loading ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" />
                  Resetting...
                </>
              ) : (
                'Reset password'
              )}
            </Button>
          </Form>

          <div style={{ marginTop: '1rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
            Remembered it? <Link to="/agents/login" className="agent-auth-inline-link">Back to sign in</Link>
          </div>
        </>
      )}
    </AuthShell>
  );
};

export default AgentResetPasswordPage;
```

- [ ] **Step 2: Verify — typecheck, lint, frozen-file diff**

```bash
cd frontend && npx tsc --noEmit
```
Expected: clean.

```bash
npx eslint src/pages/agents/AgentResetPasswordPage.tsx
```
Expected: no errors, no new warnings.

```bash
cd .. && git diff main -- frontend/src/utils/colorUtils.ts frontend/src/styles/playerLists.theme.ts
```
Expected: empty.

- [ ] **Step 3: Live check**

Navigate to `http://localhost:3001/agents/reset-password?token=test` in both themes (the token
won't be valid, but the page renders regardless — submitting will show the "invalid" error,
which is fine, that's existing behavior). Confirm both the form state and the (simulated, by
temporarily flipping the `success` state in React DevTools if you want to check it, or trust the
JSX review) success-state Alert/button are legible in dark mode.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/agents/AgentResetPasswordPage.tsx
git commit -m "Migrate AgentResetPasswordPage to shared AuthShell"
```

---

## Task 5: Migrate `AgentLandingPage.tsx` to `AuthShell` (wide variant)

**Files:**
- Modify: `frontend/src/pages/agents/AgentLandingPage.tsx`

**Interfaces:**
- Consumes: `AuthShell` from `../../components/auth/AuthShell` (Task 1), rendered with `wide`

- [ ] **Step 1: Rewrite `frontend/src/pages/agents/AgentLandingPage.tsx`**

```tsx
import React from 'react';
import { Link } from 'react-router-dom';
import AuthShell from '../../components/auth/AuthShell';

const steps = [
  {
    title: '1. Register',
    copy: 'Create an approved agent account with your agency and contact details.',
  },
  {
    title: '2. Submit',
    copy: 'Send player information and commercial context through a structured recommendation intake.',
  },
  {
    title: '3. Track',
    copy: 'Monitor recommendation status changes through the same secure Charlton portal.',
  },
];

const AgentLandingPage: React.FC = () => {
  return (
    <AuthShell eyebrow="Charlton Athletic FC" heading="External Recommendation Portal" wide>
      <p className="agent-auth-badge" style={{ marginBottom: '1rem' }}>CAFC Recruitment</p>
      <h2 className="agent-auth-title" style={{ fontSize: '2rem' }}>External Player Recommendations</h2>
      <p className="agent-auth-subtitle" style={{ maxWidth: 560 }}>
        Register as an agent, submit a player through structural intake form, and track the review status through the platform.
      </p>

      <div className="agent-portal-inline-actions" style={{ marginBottom: '2rem' }}>
        <Link to="/agents/register" className="agent-auth-button" style={{ textDecoration: 'none', minWidth: 190 }}>
          Register
        </Link>
        <Link to="/agents/login" className="agent-portal-button-secondary">
          Log In
        </Link>
      </div>

      <div className="agent-portal-card">
        <div className="agent-portal-card-body">
          <div className="agent-portal-section-title">How the portal works</div>
          <div className="agent-portal-section-copy" style={{ marginBottom: '1.25rem' }}>
            This test release is built for controlled external intake. Agents can submit and track recommendations; internal staff manage review status inside the core scouting platform.
          </div>
          <div className="agent-portal-grid three-up">
            {steps.map((step) => (
              <div key={step.title} className="agent-portal-surface-muted">
                <div style={{ color: 'var(--color-text)', fontWeight: 800, marginBottom: '0.6rem' }}>{step.title}</div>
                <div className="agent-portal-meta">{step.copy}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AuthShell>
  );
};

export default AgentLandingPage;
```

Note: the old markup rendered the crest/heading/badge/copy *twice* — once in the brand panel,
once again (differently) atop the form panel. `AuthShell` already supplies the crest + eyebrow +
heading once, so the duplicate top-of-card block (`agent-auth-heading`, first
`agent-auth-badge`/`agent-auth-copy` in the old brand panel) is gone; the second, differently-worded
badge ("CAFC Recruitment") and copy are what's kept, since that's the page-specific content, not
shell chrome.

- [ ] **Step 2: Verify — typecheck, lint, frozen-file diff**

```bash
cd frontend && npx tsc --noEmit
```
Expected: clean.

```bash
npx eslint src/pages/agents/AgentLandingPage.tsx
```
Expected: no errors, no new warnings.

```bash
cd .. && git diff main -- frontend/src/utils/colorUtils.ts frontend/src/styles/playerLists.theme.ts
```
Expected: empty.

- [ ] **Step 3: Live check**

Find this page's route in `frontend/src/App.tsx` (search for `AgentLandingPage`) and navigate to
it directly in both themes. Confirm: no duplicate crest/heading, the three-step "How the portal
works" cards render correctly (these reuse `.agent-portal-card`/`.agent-portal-surface-muted`,
already dark-mode-fixed from the earlier Recommendations round — just double-check nothing
regressed), and both CTA buttons (Register / Log In) are visible and correctly styled.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/agents/AgentLandingPage.tsx
git commit -m "Migrate AgentLandingPage to shared AuthShell (wide variant)"
```

---

## Task 6: Remove dead split-panel CSS, fix remaining hardcoded red

**Files:**
- Modify: `frontend/src/styles/professional-theme.css`

**Interfaces:** none (CSS-only, no new exports).

- [ ] **Step 1: Confirm the classes are genuinely unused before deleting**

```bash
cd frontend/src
grep -rl "agent-auth-page\|agent-auth-layout\|agent-auth-brand-panel\|agent-auth-brand-content\|agent-auth-heading\b\|agent-auth-badge\|agent-auth-copy\|agent-auth-form-panel\|agent-auth-card\b\|agent-auth-card-wide\|agent-mobile-brand" pages/ components/
```
Expected output: nothing (all four migrated pages no longer reference these classes; if
anything is listed, stop and investigate before deleting — do not proceed to Step 2 until this
is empty).

- [ ] **Step 2: Delete the dead CSS block**

In `frontend/src/styles/professional-theme.css`, delete these rules (currently at approximately
lines 2325-2439, but confirm by searching for the selectors — line numbers may have drifted from
earlier edits in this session):

```css
.agent-auth-page { ... }
.agent-auth-layout { ... }
.agent-auth-brand-panel { ... }
.agent-auth-brand-panel::before { ... }
.agent-auth-brand-panel::after { ... }
.agent-auth-brand-content,
.agent-portal-shell-inner {   /* <-- KEEP the .agent-portal-shell-inner half of this selector,
                                      only remove .agent-auth-brand-content from the selector
                                      list, since .agent-portal-shell-inner is still used by
                                      AgentPortalShell.tsx (Task 7) */
  position: relative;
  z-index: 1;
}
.agent-auth-brand-content { ... }   /* the standalone rule below the shared one above */
.agent-auth-badge { ... }
.agent-auth-heading { ... }
.agent-auth-copy { ... }
.agent-auth-form-panel { ... }
.agent-auth-card { ... }
.agent-auth-card.agent-auth-card-wide { ... }
.agent-mobile-brand { ... }
```

**Important:** `.agent-auth-title` and `.agent-auth-subtitle` are still used (by
`AgentLoginPage`, `AgentRegisterPage`, `AgentResetPasswordPage`, `AgentLandingPage` — all four
still render a `<h2 className="agent-auth-title">` / `<p className="agent-auth-subtitle">` inside
`AuthShell`'s children). **Do not delete these two.** Verify with:

```bash
grep -rn "agent-auth-title\|agent-auth-subtitle" pages/agents/
```
Expected: 5+ matches across the four migrated pages. If this comes back empty, something in
Tasks 2-5 was written differently than planned — stop and reconcile before deleting CSS.

After deletion, the combined selector `.agent-auth-brand-content, .agent-portal-shell-inner`
becomes just `.agent-portal-shell-inner` on its own (no longer combined), i.e.:

```css
.agent-portal-shell-inner {
  position: relative;
  z-index: 1;
}
```

- [ ] **Step 3: Fix the remaining near-brand-red in `.agent-auth-inline-link`**

Find:
```css
.agent-auth-inline-link {
  color: #cc0000;
  font-weight: 600;
  text-decoration: none;
}
```

Replace with:
```css
.agent-auth-inline-link {
  color: var(--color-primary);
  font-weight: 600;
  text-decoration: none;
}
```

- [ ] **Step 4: Verify CSS is syntactically valid (brace balance) and nothing else broke**

```bash
python3 -c "
content = open('frontend/src/styles/professional-theme.css').read()
print('open:', content.count('{'), 'close:', content.count('}'))
"
```
Expected: the two numbers match.

```bash
cd frontend && npx tsc --noEmit
```
Expected: clean (CSS changes don't affect TypeScript, but this confirms nothing else in the repo
state is broken before you commit).

- [ ] **Step 5: Live check**

Reload every page touched in Tasks 1-5 (`/login`, `/agents/login`, `/agents/register`,
`/agents/reset-password?token=test`, and the agent landing page route) in the browser to confirm
none of them broke from the CSS deletion — since webpack dev server hot-reloads CSS, a stale
cached rule could mask a real breakage; a hard refresh (`cmd+shift+r`) on each page is worth
doing here specifically.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/styles/professional-theme.css
git commit -m "Remove dead split-panel auth CSS, tokenize remaining near-brand-red link color"
```

---

## Task 7: `AgentPortalShell.tsx` — real tokens + dark-mode toggle

**Files:**
- Modify: `frontend/src/components/agents/AgentPortalShell.tsx`
- Modify: `frontend/src/styles/professional-theme.css`

**Interfaces:**
- Consumes: `useTheme` from `../../contexts/ThemeContext` (existing hook, already used
  throughout the internal app this whole engagement — `const { theme, toggleDarkMode } = useTheme();`)
- Consumes: `Sun`, `Moon` from `lucide-react` (already a project dependency, used in `Navbar.tsx`)

- [ ] **Step 1: Rewrite `frontend/src/components/agents/AgentPortalShell.tsx`**

```tsx
import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import logo from '../../assets/logo.png';
import { useAuth } from '../../App';
import { useTheme } from '../../contexts/ThemeContext';

interface AgentPortalShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

const AgentPortalShell: React.FC<AgentPortalShellProps> = ({ title, subtitle, children, actions }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { theme, toggleDarkMode } = useTheme();

  const navClassName = (path: string) =>
    `agent-portal-nav-link${location.pathname === path ? ' active' : ''}`;

  return (
    <div className="agent-portal-shell">
      <div className="agent-portal-shell-inner">
        <header className="agent-portal-header">
          <div className="agent-portal-header-bar" />
          <div className="agent-portal-header-content">
            <div className="agent-portal-brand">
              <img
                src={logo}
                alt="Charlton Athletic"
                style={{ width: 54, height: 54, borderRadius: '999px', background: '#fff', padding: 4 }}
              />
              <div>
                <div className="agent-portal-eyebrow">Charlton Athletic FC</div>
                <div className="agent-portal-title">{title}</div>
                {subtitle ? <div className="agent-portal-subtitle">{subtitle}</div> : null}
              </div>
            </div>
            <div className="agent-portal-nav">
              <Link to="/agents/dashboard" className={navClassName('/agents/dashboard')}>
                Dashboard
              </Link>
              <Link to="/agents/submit" className={navClassName('/agents/submit')}>
                Submit a Player
              </Link>
              <button
                type="button"
                className="agent-portal-nav-link"
                style={{ border: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                onClick={toggleDarkMode}
              >
                {theme.isDark ? <Sun size={15} /> : <Moon size={15} />}
                {theme.isDark ? 'Light' : 'Dark'}
              </button>
              <button
                type="button"
                className="agent-portal-nav-link"
                style={{ border: 'none' }}
                onClick={() => {
                  logout();
                  navigate('/agents/login');
                }}
              >
                Log Out
              </button>
            </div>
          </div>
        </header>
        {actions ? <div className="agent-portal-inline-actions" style={{ marginBottom: '1rem' }}>{actions}</div> : null}
        <main>{children}</main>
      </div>
    </div>
  );
};

export default AgentPortalShell;
```

- [ ] **Step 2: Update the hardcoded values in `frontend/src/styles/professional-theme.css`**

Find (around where `.agent-portal-shell` through `.agent-portal-nav-link:hover` are defined):

```css
.agent-portal-shell {
  min-height: 100vh;
  background: linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%);
  font-family: 'Inter', sans-serif;
}
```

Replace with:

```css
.agent-portal-shell {
  min-height: 100vh;
  background: var(--color-background);
  font-family: var(--font-body);
}
```

Find:

```css
.agent-portal-header {
  background: #0f172a;
  border-radius: 24px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  color: #fff;
  overflow: hidden;
  position: relative;
  margin-bottom: 1.5rem;
}
```

Replace with:

```css
.agent-portal-header {
  background: var(--color-header-bg);
  border-radius: 24px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  color: #fff;
  overflow: hidden;
  position: relative;
  margin-bottom: 1.5rem;
}
```

Find:

```css
.agent-portal-header-bar {
  position: absolute;
  inset: 0 0 auto 0;
  height: 4px;
  background: #cc0000;
}
```

Replace with:

```css
.agent-portal-header-bar {
  position: absolute;
  inset: 0 0 auto 0;
  height: 4px;
  background: var(--color-primary);
}
```

Find:

```css
.agent-portal-nav-link:hover,
.agent-portal-nav-link.active {
  background: #cc0000;
  color: #fff;
}
```

Replace with:

```css
.agent-portal-nav-link:hover,
.agent-portal-nav-link.active {
  background: var(--color-primary);
  color: #fff;
}
```

Leave `.agent-portal-eyebrow` (`#fca5a5`), `.agent-portal-subtitle`
(`rgba(255,255,255,0.7)`), and `.agent-portal-nav-link`'s base state
(`rgba(255,255,255,0.06)` / `#e5e7eb`) unchanged — all three sit on `.agent-portal-header`,
which is always the dark `--color-header-bg` regardless of app theme (same pattern as the
internal Navbar, which is always-black/graphite too), so they don't need theme-conditional
values.

- [ ] **Step 3: Verify — typecheck, lint, frozen-file diff, CSS brace balance**

```bash
cd frontend && npx tsc --noEmit
```
Expected: clean.

```bash
npx eslint src/components/agents/AgentPortalShell.tsx
```
Expected: no errors, no new warnings.

```bash
cd .. && git diff main -- frontend/src/utils/colorUtils.ts frontend/src/styles/playerLists.theme.ts
```
Expected: empty.

```bash
python3 -c "
content = open('frontend/src/styles/professional-theme.css').read()
print('open:', content.count('{'), 'close:', content.count('}'))
"
```
Expected: matching counts.

- [ ] **Step 4: Live check**

Log in as an agent (or navigate directly to `/agents/dashboard` if already authenticated as one
from earlier testing) in both themes. Confirm: the header bar stays graphite-dark in both themes
(by design — matches the internal Navbar's always-dark chrome), the red accent bar and nav-link
hover/active states use the real brand red, the page background behind the header switches
between light and dark correctly, and — the actual point of this task — **clicking the new
dark-mode toggle in the nav actually switches the theme** and the icon/label swap (Moon/"Dark" ↔
Sun/"Light") matches the internal Navbar's equivalent control.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/agents/AgentPortalShell.tsx frontend/src/styles/professional-theme.css
git commit -m "Add dark-mode toggle to AgentPortalShell, tokenize font/color to match internal app"
```

---

## Task 8: Full Track 1 sweep and Track 2 sign-off

**Files:** none modified — this is a verification-only closing task.

- [ ] **Step 1: Full-repo typecheck**

```bash
cd frontend && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 2: Lint every file touched across Tasks 1-7**

```bash
npx eslint \
  src/pages/LoginPage.tsx \
  src/components/auth/AuthShell.tsx \
  src/pages/agents/AgentLoginPage.tsx \
  src/pages/agents/AgentRegisterPage.tsx \
  src/pages/agents/AgentResetPasswordPage.tsx \
  src/pages/agents/AgentLandingPage.tsx \
  src/components/agents/AgentPortalShell.tsx
```
Expected: no errors; any warnings present should be pre-existing ones already known from this
session's baseline (e.g. unrelated `react-hooks/exhaustive-deps` warnings elsewhere in the repo),
not new ones introduced by this plan.

- [ ] **Step 3: Frozen-file diff, one more time, against the full commit range**

```bash
cd .. && git diff main -- \
  frontend/src/utils/colorUtils.ts \
  frontend/src/styles/playerLists.theme.ts \
  frontend/src/components/Kanban/PlayerKanbanCard.tsx \
  frontend/src/components/Kanban/CollapsiblePlayerBar.tsx \
  frontend/src/components/Kanban/KanbanColumn.tsx \
  frontend/src/components/ScoutingAssessmentModal.tsx
```
Expected: no output.

- [ ] **Step 4: Live walkthrough, both themes, every page touched**

With both dev servers running, visit each of these URLs once in light mode and once in dark
mode, confirming legible text, correct brand colors, and no visual regressions:

- `http://localhost:3001/login` (internal — must look unchanged from before this plan)
- `http://localhost:3001/agents/login`
- `http://localhost:3001/agents/register`
- `http://localhost:3001/agents/reset-password?token=test`
- the agent landing page route (check `App.tsx` for the exact path)
- `http://localhost:3001/agents/dashboard` (or wherever `AgentPortalShell` is mounted — confirm
  the header/nav/toggle, not the dashboard body content, since the dashboard itself is Pass 2
  scope and may still look unmigrated)

- [ ] **Step 5: Update the design-system doc**

Append a short entry to `docs/DESIGN_SYSTEM_REFRESH.md` under the Phase 4 section (mirroring the
Track 2 round entries used throughout this engagement) summarizing: `AuthShell` created and
shared between `LoginPage.tsx` and four Agent Portal pages, `AgentPortalShell.tsx` tokenized and
given a working dark-mode toggle, dead split-panel CSS removed, and what remains for Pass 2
(`AgentDashboardPage.tsx`, `AgentSubmitPage.tsx`, `AgentEditSubmissionPage.tsx`,
`AgentSubmissionDetailPage.tsx`, `RecommendationForm.tsx`, `SubmissionStatusBadge.tsx`).

```bash
git add docs/DESIGN_SYSTEM_REFRESH.md
git commit -m "Record Phase 4 Pass 1 completion (agent auth pages + portal shell)"
```

---

## Self-review notes (for whoever executes this plan)

- **Spec coverage:** all 8 scope items from the approved spec map onto Tasks 1-7 (AuthShell +
  LoginPage = Task 1; AgentLoginPage = Task 2; AgentRegisterPage = Task 3;
  AgentResetPasswordPage = Task 4; AgentLandingPage = Task 5; AgentPortalShell = Task 7; CSS
  cleanup = Task 6). Task 8 covers the spec's "Verification" section.
- **Known deviation from the spec, documented above:** Task 7 builds its own toggle button
  instead of importing `DarkModeToggle.tsx`, because that component turned out to be unused
  dead code outside the dev-only style tile. The visual/functional outcome (a working toggle,
  consistent with the internal app's pattern) is unchanged.
- **Ordering rationale:** Task 6 (CSS deletion) is sequenced *after* Tasks 2-5 (all four page
  migrations) specifically so the "confirm zero remaining consumers" grep in Task 6 Step 1 has
  something real to check — deleting CSS before every consumer has migrated would be the exact
  kind of unsafe cleanup this plan's self-review caught once already during spec-writing.
