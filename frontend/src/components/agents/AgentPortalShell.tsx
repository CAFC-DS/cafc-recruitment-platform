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
