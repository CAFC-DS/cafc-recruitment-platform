import React from 'react';
import { Link } from 'react-router-dom';
import { Navbar, Nav, Container, Button } from 'react-bootstrap';
import { useAuth } from '../App'; // Import useAuth
import { useTheme } from '../contexts/ThemeContext';
import DarkModeToggle from './DarkModeToggle';
import { useCurrentUser } from '../hooks/useCurrentUser';

const AppNavbar: React.FC = () => {
  const { token, logout } = useAuth(); // Use the auth hook
  const { theme } = useTheme();
  const { isAdmin } = useCurrentUser();

  return (
    <Navbar 
      expand="lg" 
      sticky="top"
      style={{
        backgroundColor: theme.colors.headerBg,
        borderBottom: `1px solid ${theme.colors.border}`
      }}
      variant="dark"
    >
      <Container>
        <Navbar.Brand as={Link} to="/">
          <img
            src={`${process.env.PUBLIC_URL}/logo.png`}
            width="30"
            height="30"
            className="d-inline-block align-top"
            alt="Charlton Athletic Logo"
          />
          {' '}
          Charlton Athletic
        </Navbar.Brand>
        <Navbar.Toggle aria-controls="basic-navbar-nav" />
        <Navbar.Collapse id="basic-navbar-nav">
          <Nav className="me-auto">
            {token && ( // Only show links if authenticated
              <>
                <Nav.Link as={Link} to="/">Home</Nav.Link>
                <Nav.Link as={Link} to="/scouting">⚽ Scouting</Nav.Link>
                <Nav.Link as={Link} to="/intel">🕵️ Intel</Nav.Link>
                <Nav.Link as={Link} to="/players">👥 Players</Nav.Link>
                {isAdmin && (
                  <Nav.Link as={Link} to="/admin">🔧 Admin</Nav.Link>
                )}
              </>
            )}
          </Nav>
          <Nav className="d-flex align-items-center">
            <DarkModeToggle />
            {token ? ( // Show logout button if authenticated
              <Button 
                variant="outline-light" 
                onClick={logout}
                className="ms-2"
                style={{ 
                  borderColor: theme.colors.border,
                  color: theme.colors.headerText 
                }}
              >
                Logout
              </Button>
            ) : (
              <Nav.Link as={Link} to="/login" className="ms-2">Login</Nav.Link> // Show login link if not authenticated
            )}
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
};

export default AppNavbar;
