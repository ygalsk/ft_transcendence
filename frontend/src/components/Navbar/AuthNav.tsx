import React from 'react';
import { Link } from 'react-router-dom';

type Props = {
  user?: { 
    id?: number | string;
    display_name?: string; 
    avatar_url?: string;
    avatarUrl?: string;
  } | null;
  onLogout: () => void | Promise<void>;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || window.location.origin;

// ...existing code...
const AuthNav: React.FC<Props> = ({ user, onLogout }) => {
  const displayName =
    user?.display_name ??
    (user as any)?.user?.display_name ??
    (user as any)?.data?.display_name ??
    'Player';
  const initial = displayName ? displayName.charAt(0).toUpperCase() : 'P';
  
  // Get avatar URL from user data
  const avatarUrl = user?.avatar_url || user?.avatarUrl;
  const userId = user?.id || (user as any)?.user?.id;
  const fullAvatarUrl = avatarUrl && userId 
    ? `${API_BASE}/api/user/${userId}/avatar?t=${Date.now()}` 
    : null;

  return (
    <ul className="navlist" role="menubar" aria-label="User navigation">
      <li role="none">
        <Link to="/leaderboard" role="menuitem" className="navlink">Leaderboard</Link>
      </li>
      <li role="none">
        <Link to="/game/ranked" role="menuitem" className="navlink">Play</Link>
      </li>
      <li role="none">
        <Link to="/tournaments" role="menuitem" className="navlink">Tournaments</Link>
      </li>
      <li role="none" className="nav-user">
        <Link to="/profile" className="user-pill" tabIndex={0} aria-label={`Logged in as ${displayName}`}>
          {fullAvatarUrl ? (
            <img src={fullAvatarUrl} alt={`${displayName} avatar`} className="user-avatar" />
          ) : (
            <div className="user-fallback" aria-hidden>{initial}</div>
          )}
          <span className="user-name">{displayName}</span>
        </Link>
        <button className="btn btn--ghost btn--logout" onClick={onLogout} aria-label="Logout">
          Logout
        </button>
      </li>
    </ul>
  );
};

export default AuthNav;