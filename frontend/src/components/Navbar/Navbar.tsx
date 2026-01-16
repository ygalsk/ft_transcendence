import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthNav from './AuthNav';
import GuestNav from './GuestNav';
import '../../styles/Navbar.css';
import AuthContext from '../../context/AuthContext';

const Navbar: React.FC = () => {
  const navigate = useNavigate();
  // AuthContext typing may vary in your project; cast to any to avoid TS errors if needed.
  const auth = useContext(AuthContext) as any;
  const { user, isAuthenticated, loading, logout } = auth ?? {};

  if (loading) {
    // Render nothing while auth is being resolved (or a small placeholder)
    return <nav className="navbar navbar--placeholder" aria-hidden />;
  }

  const handleLogout = async () => {
    try {
      await logout(); // Auth logic lives in context
    } finally {
      navigate('/');
    }
  };

  return (
    <nav className="navbar" role="navigation" aria-label="Main navigation">
      <div className="navbar__inner">
        <div
          className="navbar__brand"
          onClick={() => navigate('/')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate('/')}
          aria-label="Go to home"
        >
          <span className="navbar__logo">🏓</span>
          <span className="navbar__title">Pong Arena</span>
        </div>

        <div className="navbar__links">
          {isAuthenticated ? (
            <AuthNav user={user} onLogout={handleLogout} />
          ) : (
            <GuestNav />
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;