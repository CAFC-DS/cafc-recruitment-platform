// FORCE CACHE REFRESH - UI REDESIGN COMPLETE
import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Route, Routes, useNavigate, useLocation, Navigate } from 'react-router-dom';

import { ThemeProvider } from './contexts/ThemeContext';
import { ViewModeProvider } from './contexts/ViewModeContext';
import { useCurrentUser } from './hooks/useCurrentUser';
import AppNavbar from './components/Navbar';
import HomePage from './pages/HomePage';
import ScoutingPage from './pages/ScoutingPage';
import IntelPage from './pages/IntelPage';
import LoginPage from './pages/LoginPage';
import PlayerProfilePage from './pages/PlayerProfilePage';
import AdminPage from './pages/AdminPage';
import AnalyticsPage from './pages/AnalyticsPage';
import PlayerListsPage from './pages/PlayerListsPage';
import KanbanPage from './pages/KanbanPage';
import SharedReportPage from './pages/SharedReportPage';
import AgentLandingPage from './pages/agents/AgentLandingPage';
import AgentLoginPage from './pages/agents/AgentLoginPage';
import AgentRegisterPage from './pages/agents/AgentRegisterPage';
import AgentDashboardPage from './pages/agents/AgentDashboardPage';
import AgentSubmitPage from './pages/agents/AgentSubmitPage';
import AgentSubmissionDetailPage from './pages/agents/AgentSubmissionDetailPage';
import InternalRecommendationsPage from './pages/internal/InternalRecommendationsPage';
import ListsGatewayPage from './pages/ListsGatewayPage';
import ExternalRecommendationsListPage from './pages/ExternalRecommendationsListPage';

interface AuthContextType {
  token: string | null;
  login: (newToken: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));

  const login = useCallback((newToken: string) => {
    setToken(newToken);
    localStorage.setItem('token', newToken);
  }, []);

  const logout = () => {
    setToken(null);
    localStorage.removeItem('token');
  };

  // Basic token validation on app startup (less aggressive)
  useEffect(() => {
    const validateToken = async () => {
      const storedToken = localStorage.getItem('token');
      if (storedToken) {
        try {
          // Only validate token format, not expiry - let token refresh handle expiry
          const payload = JSON.parse(atob(storedToken.split('.')[1]));

          // Only logout if token is malformed or significantly expired (more than 24 hours)
          const currentTime = Date.now() / 1000;
          if (payload.exp && payload.exp < currentTime - (24 * 60 * 60)) {
            console.warn('Token extremely expired, clearing...');
            logout();
          }
        } catch (error) {
          // Invalid token format - only clear if completely malformed
          console.warn('Malformed token found, clearing...');
          logout();
        }
      }
    };

    validateToken();
  }, []);

  // Optional logout behaviors (disabled to prevent accidental logouts)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // User switched tabs or minimized - do nothing
        // Aggressive logout disabled to prevent accidental logouts during report uploads
      }
    };

    // Only listen for visibility changes, no auto-logout on page refresh
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Session timeout after 20 minutes of inactivity
  useEffect(() => {
    let inactivityTimer: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(inactivityTimer);
      if (token) {
        inactivityTimer = setTimeout(() => {
          logout();
          alert('Session expired due to inactivity. Please login again.');
        }, 20 * 60 * 1000); // 20 minutes
      }
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    
    if (token) {
      events.forEach(event => {
        document.addEventListener(event, resetTimer, true);
      });
      resetTimer(); // Start timer
    }

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, resetTimer, true);
      });
      clearTimeout(inactivityTimer);
    };
  }, [token]);

  // Automatic token refresh every 15 minutes for active users
  useEffect(() => {
    let refreshTimer: NodeJS.Timeout;

    const refreshToken = async () => {
      if (!token) return;

      try {
        const response = await fetch(`${process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'production' ? 'https://cafc-recruitment-platform-production.up.railway.app' : 'http://localhost:8000')}/auth/refresh`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          login(data.access_token);
        }
      } catch (error) {
        console.warn('Token refresh failed:', error);
      }
    };

    const startRefreshTimer = () => {
      clearTimeout(refreshTimer);
      if (token) {
        refreshTimer = setTimeout(() => {
          refreshToken();
          startRefreshTimer(); // Schedule next refresh
        }, 15 * 60 * 1000); // 15 minutes
      }
    };

    startRefreshTimer();

    return () => {
      clearTimeout(refreshTimer);
    };
  }, [token, login]);

  return (
    <AuthContext.Provider value={{ token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

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

  return token && user && user.role !== 'agent' ? <HomePage /> : null;
};

// Conditional navbar wrapper - only show navbar if not on shared report page
const ConditionalNavbar: React.FC = () => {
  const location = useLocation();
  const isSharedReportPage = location.pathname.startsWith('/shared-report/');
  const isAgentPortalPage = location.pathname.startsWith('/agents');

  return isSharedReportPage || isAgentPortalPage ? null : <AppNavbar />;
};


function App() {
  return (
    <ThemeProvider>
      <ViewModeProvider>
        <Router>
          <AuthProvider>
            <ConditionalNavbar />
          <Routes>
            <Route path="/" element={<HomePageWrapper />} />
            <Route path="/login" element={<LoginPageWrapper />} /> {/* Use the wrapper here */}
            <Route path="/agents" element={<PublicAgentRoute><AgentLandingPage /></PublicAgentRoute>} />
            <Route path="/agents/login" element={<PublicAgentRoute><AgentLoginPage /></PublicAgentRoute>} />
            <Route path="/agents/register" element={<PublicAgentRoute><AgentRegisterPage /></PublicAgentRoute>} />
            <Route path="/agents/dashboard" element={<AgentRoute><AgentDashboardPage /></AgentRoute>} />
            <Route path="/agents/submit" element={<AgentRoute><AgentSubmitPage /></AgentRoute>} />
            <Route path="/agents/submissions/:id" element={<AgentRoute><AgentSubmissionDetailPage /></AgentRoute>} />
            {/* Public route for shared reports - no authentication required */}
            <Route path="/shared-report/:token" element={<SharedReportPage />} />
            <Route
              path="/scouting"
              element={
                <PrivateRoute>
                  <ScoutingPage />
                </PrivateRoute>
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
                <ListsRoute>
                  <ExternalRecommendationsListPage />
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
              path="/internal/recommendations"
              element={
                <PrivateRoute>
                  <InternalRecommendationsPage />
                </PrivateRoute>
              }
            />
          </Routes>
          </AuthProvider>
        </Router>
      </ViewModeProvider>
    </ThemeProvider>
  );
}

export default App;
