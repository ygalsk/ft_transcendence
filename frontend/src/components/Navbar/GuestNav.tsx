import React from 'react';
import { Link } from 'react-router-dom';

const GuestNav: React.FC = () => {
  return (
    <ul className="navlist" role="menubar" aria-label="Guest navigation">
      {/* Removed Home link */}
      <li role="none">
        <Link to="/game/guest" role="menuitem" className="navlink">Play Now</Link>
      </li>
      <li role="none" className="nav-actions">
        <Link to="/login" className="btn btn--primary" role="button">Login</Link>
        <Link to="/register" className="btn btn--ghost" role="button">Register</Link>
      </li>
    </ul>
  );
};

export default GuestNav;