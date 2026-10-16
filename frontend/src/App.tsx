// FORCE CACHE REFRESH - UI REDESIGN COMPLETE
import React, { lazy, Suspense, useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { BrowserRouter as Router, Route, Routes, useNavigate, useLocation, Navigate } from 'react-router-dom';

import { ThemeProvider } from './contexts/ThemeContext';
import { ViewModeProvider } from './contexts/ViewModeContext';
import { CurrentUserProvider, useCurrentUser } from './hooks/useCurrentUser';
import AppNavbar from './components/Navbar';
export { useAuth } from './contexts/AuthContext';

const HomePage = lazy(() => import('./pages/HomePage'));
const ScoutingPage = lazy(() => import('./pages/ScoutingPage'));
const IntelPage = lazy(() => import('./pages/IntelPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const PlayerProfilePage = lazy(() => import('./pages/PlayerProfilePage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const PersonalAnalyticsPage = lazy(() => import('./pages/PersonalAnalyticsPage'));
const PlayerListsPage = lazy(() => import('./pages/PlayerListsPage'));
const KanbanPage = lazy(() => import('./pages/KanbanPage'));
const SharedReportPage = lazy(() => import('./pages/SharedReportPage'));
const AgentLandingPage = lazy(() => import('./pages/agents/AgentLandingPage'));
const AgentLoginPage = lazy(() => import('./pages/agents/AgentLoginPage'));
const AgentRegisterPage = lazy(() => import('./pages/agents/AgentRegisterPage'));
const AgentResetPasswordPage = lazy(() => import('./pages/agents/AgentResetPasswordPage'));
const AgentDashboardPage = lazy(() => import('./pages/agents/AgentDashboardPage'));
const AgentSubmitPage = lazy(() => import('./pages/agents/AgentSubmitPage'));
const AgentSubmissionDetailPage = lazy(() => import('./pages/agents/AgentSubmissionDetailPage'));
const AdminEmailPage = lazy(() => import('./pages/AdminEmailPage'));
const AgentEditSubmissionPage = lazy(() => import('./pages/agents/AgentEditSubmissionPage'));
const InternalRecommendationsPage = lazy(() => import('./pages/internal/InternalRecommendationsPage'));
const ListsGatewayPage = lazy(() => import('./pages/ListsGatewayPage'));
const ExternalRecommendationsListPage = lazy(() => import('./pages/ExternalRecommendationsListPage'));
const EmergingTalentListsPage = lazy(() => import('./pages/EmergingTalentListsPage'));
const EmergingTalentKanbanPage = lazy(() => import('./pages/EmergingTalentKanbanPage'));
const StyleTilePage = lazy(() => import('./pages/StyleTilePage'));

const PrivateRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { token } = useAuth();
  const { user, loading } = useCurrentUser();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!token) {
      navigate('/login', { state: { from: location.pathname } });
    } else if (!loading && user?.role === 'agent') {
      navigate('/agents/dashboard', { replace: true });
    }
  }, [token, loading, user, navigate, location]);

  return token && user && user.role !== 'agent' ? children : null; // Render children only if authenticated
};

const AgentRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { token } = useAuth();
  const { user, loading } = useCurrentUser();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!token) {
      navigate('/agents/login', { state: { from: location.pathname } });
    } else if (!loading && user && user.role !== 'agent') {
      navigate('/', { replace: true });
    }
  }, [token, user, loading, navigate, location]);

  return token && user?.role === 'agent' ? children : null;
};

const PublicAgentRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { token } = useAuth();
  const { user, loading } = useCurrentUser();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && token && user?.role === 'agent') {
      navigate('/agents/dashboard', { replace: true });
    } else if (!loading && token && user && user.role !== 'agent') {
      navigate('/', { replace: true });
    }
  }, [token, user, loading, navigate]);

  if (token && loading) {
    return null;
  }

  return !token ? children : null;
};

const AdminRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { token } = useAuth();
  const { canAccessAdmin, loading, user } = useCurrentUser();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!token) {
      navigate('/login', { state: { from: location.pathname } });
    } else if (!loading && user?.role === 'agent') {
      navigate('/agents/dashboard', { replace: true });
    } else if (!loading && !canAccessAdmin) {
      navigate('/', { replace: true });
    }
  }, [token, canAccessAdmin, loading, user, navigate, location]);

  return token && canAccessAdmin ? children : null;
};

const IntelRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { token } = useAuth();
  const { canAccessIntel, loading, user } = useCurrentUser();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!token) {
      navigate('/login', { state: { from: location.pathname } });
    } else if (!loading && user?.role === 'agent') {
      navigate('/agents/dashboard', { replace: true });
    } else if (!loading && !canAccessIntel) {
      navigate('/', { replace: true });
    }
  }, [token, canAccessIntel, loading, user, navigate, location]);

  return token && canAccessIntel ? children : null;
};

const AnalyticsRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { token } = useAuth();
  const { canAccessAnalytics, loading, user } = useCurrentUser();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!token) {
      navigate('/login', { state: { from: location.pathname } });
    } else if (!loading && user?.role === 'agent') {
      navigate('/agents/dashboard', { replace: true });
    } else if (!loading && !canAccessAnalytics) {
      navigate('/', { replace: true });
    }
  }, [token, canAccessAnalytics, loading, user, navigate, location]);

  return token && canAccessAnalytics ? children : null;
};

const ListsRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { token } = useAuth();
  const { canAccessLists, loading, user } = useCurrentUser();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!token) {
      navigate('/login', { state: { from: location.pathname } });
    } else if (!loading && user?.role === 'agent') {
      navigate('/agents/dashboard', { replace: true });
    } else if (!loading && !canAccessLists) {
      navigate('/', { replace: true });
    }
  }, [token, canAccessLists, loading, user, navigate, location]);

  return token && canAccessLists ? children : null;
};

const ScoutingRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { token } = useAuth();
  const { canAccessRecommendations, loading, user } = useCurrentUser();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!token) {
      navigate('/login', { state: { from: location.pathname } });
    } else if (!loading && user?.role === 'agent') {
      navigate('/agents/dashboard', { replace: true });
    } else if (!loading && !canAccessRecommendations) {
      navigate('/', { replace: true });
    }
  }, [token, canAccessRecommendations, loading, user, navigate, location]);

  return token && canAccessRecommendations ? children : null;
};

// External recommendations: admin/senior manager (via Lists) + the read-only intel_reviewer.
const ExternalRecsRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { token } = useAuth();
  const { canAccessExternalRecs, loading, user } = useCurrentUser();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!token) {
      navigate('/login', { state: { from: location.pathname } });
    } else if (!loading && user?.role === 'agent') {
      navigate('/agents/dashboard', { replace: true });
    } else if (!loading && !canAccessExternalRecs) {
      navigate('/', { replace: true });
    }
  }, [token, canAccessExternalRecs, loading, user, navigate, location]);

  return token && canAccessExternalRecs ? children : null;
};

// New wrapper component for LoginPage
const LoginPageWrapper: React.FC = () => {
  const { login } = useAuth();
  return <LoginPage onLoginSuccess={login} />;
};

// Home page wrapper that redirects to login if not authenticated
const HomePageWrapper: React.FC = () => {
  const { token } = useAuth();
  const { user, loading } = useCurrentUser();
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      if (!token) {
        navigate('/login');
      } else if (!loading && user?.role === 'agent') {
        navigate('/agents/dashboard');
      } else if (!loading && user?.role === 'intel_reviewer') {
        // Scoped read-only role: land on Intel (their home).
        navigate('/intel', { replace: true });
      }
      if (!loading) {
        setAuthChecked(true);
      }
    };

    checkAuth();
  }, [token, user, loading, navigate]);

  // Don't render anything until auth check is complete
  if (!authChecked) {
    return null;
  }

  return token && user && user.role !== 'agent' && user.role !== 'intel_reviewer' ? <HomePage /> : null;
};

// Conditional navbar wrapper - only show navbar if not on shared report page
const ConditionalNavbar: React.FC = () => {
  const location = useLocation();
  const isSharedReportPage = location.pathname.startsWith('/shared-report/');
  const isAgentPortalPage = location.pathname.startsWith('/agents');
  const isStyleTilePage = location.pathname.startsWith('/design/style-tile');
  const isLoginPage = location.pathname === '/login';

  return isSharedReportPage || isAgentPortalPage || isStyleTilePage || isLoginPage ? null : <AppNavbar />;
};


function App() {
  return (
    <ThemeProvider>
      <ViewModeProvider>
        <Router>
          <AuthProvider>
            <CurrentUserProvider>
            <ConditionalNavbar />
            <Suspense fallback={<div role="status" aria-live="polite" className="text-center p-4">Loading page…</div>}>
          <Routes>
            <Route path="/" element={<HomePageWrapper />} />
            <Route path="/login" element={<LoginPageWrapper />} /> {/* Use the wrapper here */}
            <Route path="/agents" element={<PublicAgentRoute><AgentLandingPage /></PublicAgentRoute>} />
            <Route path="/agents/login" element={<PublicAgentRoute><AgentLoginPage /></PublicAgentRoute>} />
            <Route path="/agents/register" element={<PublicAgentRoute><AgentRegisterPage /></PublicAgentRoute>} />
            {/* Public: admin-issued one-time reset link (agent may be logged out) */}
            <Route path="/agents/reset-password" element={<AgentResetPasswordPage />} />
            <Route path="/agents/dashboard" element={<AgentRoute><AgentDashboardPage /></AgentRoute>} />
            <Route path="/agents/submit" element={<AgentRoute><AgentSubmitPage /></AgentRoute>} />
            <Route path="/agents/submissions/:id" element={<AgentRoute><AgentSubmissionDetailPage /></AgentRoute>} />
            <Route path="/agents/submissions/:id/resubmit" element={<AgentRoute><AgentEditSubmissionPage resubmit /></AgentRoute>} />
            <Route path="/agents/submissions/:id/edit" element={<AgentRoute><AgentEditSubmissionPage /></AgentRoute>} />
            {/* Public route for shared reports - no authentication required */}
            <Route path="/shared-report/:token" element={<SharedReportPage />} />
            {/* Design system Phase 0 style tile -- provisional, review-only, no auth */}
            <Route path="/design/style-tile" element={<StyleTilePage />} />
            <Route
              path="/scouting"
              element={
                <ScoutingRoute>
                  <ScoutingPage />
                </ScoutingRoute>
              }
            />
            <Route
              path="/intel"
              element={
                <IntelRoute>
                  <IntelPage />
                </IntelRoute>
              }
            />
            <Route
              path="/lists"
              element={
                <ListsRoute>
                  <ListsGatewayPage />
                </ListsRoute>
              }
            />
            <Route
              path="/lists/internal"
              element={
                <ListsRoute>
                  <PlayerListsPage />
                </ListsRoute>
              }
            />
            <Route
              path="/lists/internal/kanban"
              element={
                <ListsRoute>
                  <KanbanPage />
                </ListsRoute>
              }
            />
            <Route path="/lists/kanban" element={<Navigate to="/lists/internal/kanban" replace />} />
            <Route
              path="/lists/external"
              element={
                <ExternalRecsRoute>
                  <ExternalRecommendationsListPage />
                </ExternalRecsRoute>
              }
            />
            <Route
              path="/lists/emerging-talent"
              element={
                <ListsRoute>
                  <EmergingTalentListsPage />
                </ListsRoute>
              }
            />
            <Route
              path="/lists/emerging-talent/kanban"
              element={
                <ListsRoute>
                  <EmergingTalentKanbanPage />
                </ListsRoute>
              }
            />
            <Route
              path="/player/:playerId"
              element={
                <PrivateRoute>
                  <PlayerProfilePage />
                </PrivateRoute>
              }
            />
            <Route
              path="/player-profile/:cafcPlayerId"
              element={
                <PrivateRoute>
                  <PlayerProfilePage />
                </PrivateRoute>
              }
            />
            <Route path="/admin/email" element={<AdminRoute><AdminEmailPage /></AdminRoute>} />
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminPage />
                </AdminRoute>
              }
            />
            <Route
              path="/analytics"
              element={
                <AnalyticsRoute>
                  <AnalyticsPage />
                </AnalyticsRoute>
              }
            />
            <Route
              path="/me"
              element={
                <PrivateRoute>
                  <PersonalAnalyticsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/internal/recommendations"
              element={
                <PrivateRoute>
                  <InternalRecommendationsPage />
                </PrivateRoute>
              }
            />
          </Routes>
            </Suspense>
            </CurrentUserProvider>
          </AuthProvider>
        </Router>
      </ViewModeProvider>
    </ThemeProvider>
  );
}

export default App;
