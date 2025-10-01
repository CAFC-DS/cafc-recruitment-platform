// FORCE CACHE REFRESH - UI REDESIGN COMPLETE
import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Route, Routes, useNavigate, useLocation } from 'react-router-dom';

import { ThemeProvider } from './contexts/ThemeContext';
import { ViewModeProvider } from './contexts/ViewModeContext';
import { useCurrentUser } from './hooks/useCurrentUser';
import AppNavbar from './components/Navbar';
import HomePage from './pages/HomePage';
import ScoutingPage from './pages/ScoutingPage';
import IntelPage from './pages/IntelPage';
import LoginPage from './pages/LoginPage';
import PlayerProfilePage from './pages/PlayerProfilePage';
import PlayersPage from './pages/PlayersPage';
import AdminPage from './pages/AdminPage';
import AnalyticsPage from './pages/AnalyticsPage';

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
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!token) {
      navigate('/login', { state: { from: location.pathname } });
    }
  }, [token, navigate, location]);

  return token ? children : null; // Render children only if authenticated
};

const AdminManagerRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { token } = useAuth();
  const { canAccessPlayers, loading } = useCurrentUser();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!token) {
      navigate('/login', { state: { from: location.pathname } });
    } else if (!loading && !canAccessPlayers) {
      navigate('/', { replace: true });
    }
  }, [token, canAccessPlayers, loading, navigate, location]);

  return token && canAccessPlayers ? children : null;
};

// New wrapper component for LoginPage
const LoginPageWrapper: React.FC = () => {
  const { login } = useAuth();
  return <LoginPage onLoginSuccess={login} />;
};

// Home page wrapper that redirects to login if not authenticated
const HomePageWrapper: React.FC = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      if (!token) {
        navigate('/login');
      }
      setAuthChecked(true);
    };

    checkAuth();
  }, [token, navigate]);

  // Don't render anything until auth check is complete
  if (!authChecked) {
    return null;
  }

  return token ? <HomePage /> : null;
};


function App() {
  return (
    <ThemeProvider>
      <ViewModeProvider>
        <Router>
          <AuthProvider>
            <AppNavbar />
          <Routes>
            <Route path="/" element={<HomePageWrapper />} />
            <Route path="/login" element={<LoginPageWrapper />} /> {/* Use the wrapper here */}
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
                <PrivateRoute>
                  <IntelPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/players"
              element={
                <AdminManagerRoute>
                  <PlayersPage />
                </AdminManagerRoute>
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
                <PrivateRoute>
                  <AdminPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/analytics"
              element={
                <PrivateRoute>
                  <AnalyticsPage />
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