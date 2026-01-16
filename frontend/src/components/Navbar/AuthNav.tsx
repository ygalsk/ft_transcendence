import React from 'react';
import { Link } from 'react-router-dom';

type Props = {
  user?: { username?: string; avatarUrl?: string } | null;
  onLogout: () => void;
};

const AuthNav: React.FC<Props> = ({ user, onLogout }) => {
  const displayName = user?.username ?? 'Player';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <ul className="navlist" role="menubar" aria-label="User navigation">
      <li role="none">
        <Link to="/dashboard" role="menuitem" className="navlink">Dashboard</Link>
      </li>
      <li role="none">
        <Link to="/game/ranked" role="menuitem" className="navlink">Play</Link>
      </li>
      <li role="none">
        <Link to="/tournaments" role="menuitem" className="navlink">Tournaments</Link>
      </li>

      <li role="none" className="nav-user">
        <div className="user-pill" tabIndex={0} aria-label={`Logged in as ${displayName}`}>
          {user?.avatarUrl ? (
            // eslint-disable-next-line jsx-a11y/img-redundant-alt
            <img src={user.avatarUrl} alt={`${displayName} avatar`} className="user-avatar" />
          ) : (
            <div className="user-fallback" aria-hidden>{initial}</div>
          )}
          <span className="user-name">{displayName}</span>
          <button className="btn btn--ghost btn--logout" onClick={onLogout} aria-label="Logout">
            Logout
          </button>
        </div>
      </li>
    </ul>
  );
};

export default AuthNav;