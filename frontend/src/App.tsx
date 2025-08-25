import React, { createContext, useState, useContext, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, useNavigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { ViewModeProvider } from './contexts/ViewModeContext';
import AppNavbar from './components/Navbar';
import HomePage from './pages/HomePage';
import ScoutingPage from './pages/ScoutingPage';
import IntelPage from './pages/IntelPage';
import LoginPage from './pages/LoginPage';
import PlayerProfilePage from './pages/PlayerProfilePage';
import PlayersPage from './pages/PlayersPage';
import AdminPage from './pages/AdminPage';
import { useCurrentUser } from './hooks/useCurrentUser';

interface AuthContextType {
  token: string | null;
  login: (newToken: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));

  const login = (newToken: string) => {
    setToken(newToken);
    localStorage.setItem('token', newToken);
  };

  const logout = () => {
    setToken(null);
    localStorage.removeItem('token');
  };

  // Validate token on app startup
  useEffect(() => {
    const validateToken = async () => {
      const storedToken = localStorage.getItem('token');
      if (storedToken) {
        try {
          // Simple validation check - just try to decode the JWT
          const payload = JSON.parse(atob(storedToken.split('.')[1]));
          const currentTime = Date.now() / 1000;
          
          // Check if token is expired
          if (payload.exp && payload.exp < currentTime) {
            logout();
          }
        } catch (error) {
          // Invalid token format
          console.warn('Invalid token found, clearing...');
          logout();
        }
      }
    };

    validateToken();
  }, []);

  // Auto-logout on tab close/browser exit
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Optional: Show confirmation dialog
      // return "Are you sure you want to leave? You will be logged out.";
      logout();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // User switched tabs or minimized - optional logout
        // Uncomment next line for aggressive logout:
        // logout();
      }
    };

    // Logout when tab/browser closes
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Optional: Logout when tab becomes hidden
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Session timeout after 30 minutes of inactivity
  useEffect(() => {
    let inactivityTimer: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(inactivityTimer);
      if (token) {
        inactivityTimer = setTimeout(() => {
          logout();
          alert('Session expired due to inactivity. Please login again.');
        }, 30 * 60 * 1000); // 30 minutes
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
              path="/admin"
              element={
                <PrivateRoute>
                  <AdminPage />
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