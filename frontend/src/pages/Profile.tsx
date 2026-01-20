import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { authService } from '../services/authService';
import '../styles/Profile.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || window.location.origin;

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, loading, refresh } = useContext(AuthContext);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/login');
    }
  }, [loading, isAuthenticated, navigate]);

  useEffect(() => {
    if (user) {
      setDisplayName((user.display_name as string) || '');
      setEmail((user.email as string) || '');
      setBio((user.bio as string) || '');
    }
  }, [user]);

  const currentAvatarUrl = (() => {
    if (!user?.id) return null;
    // Add cache-busting timestamp to force reload after upload
    const timestamp = Date.now();
    return `${API_BASE}/api/user/${user.id}/avatar?t=${timestamp}`;
  })();

  const handleAvatarChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // ✅ Validate file type
    const validTypes = ['image/jpeg', 'image/png'];
    if (!validTypes.includes(file.type)) {
      setMessage({ type: 'error', text: 'Only JPEG and PNG images are allowed.' });
      return;
    }
    
    // ✅ Validate file size (2MB = 2 * 1024 * 1024 bytes)
    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      setMessage({ type: 'error', text: 'Image must be smaller than 2MB.' });
      return;
    }
    
    setAvatarFile(file);
    const url = URL.createObjectURL(file);
    setAvatarPreview(url);
    setMessage(null);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await authService.updateProfile({
        display_name: displayName,
        email,
        bio,
      });
      await refresh();
      setMessage({ type: 'success', text: 'Profile updated successfully.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message ?? 'Failed to update profile.' });
    } finally {
      setSaving(false);
    }
  };


  const handleUploadAvatar = async () => {
    if (!avatarFile) return;
    setAvatarSaving(true);
    setMessage(null);
    try {
      const res = await authService.uploadAvatar(avatarFile);
      console.log('Upload success:', res);
      setMessage({ type: 'success', text: 'Avatar uploaded successfully.' });
      setAvatarFile(null);
      setAvatarPreview(null);
      
      // Refresh user context instead of full page reload
      await refresh();
      setAvatarSaving(false);
    } catch (err: any) {
      console.error('Avatar upload error:', err);
      setMessage({ type: 'error', text: err?.message ?? 'Failed to upload avatar.' });
      setAvatarSaving(false);
    }
  };

  if (loading && !user) {
    return (
      <div className="page-profile">
        <div className="profile-loading">Loading profile…</div>
      </div>
    );
  }

  if (!user) {
    return null; // redirect effect will handle navigation
  }

  const wins = (user.wins as number) || 0;
  const losses = (user.losses as number) || 0;
  const total = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  return (
    <div className="page-profile">
      <div className="profile-container">
        <div className="profile-card">
          <h1 className="profile-title">Your Profile</h1>
          <p className="profile-subtitle">Manage your avatar, info, and view your stats.</p>

          <div className="profile-grid">
            {/* Left column: Avatar */}
            <section className="profile-avatar-section">
              <h2>Avatar</h2>
              <div className="profile-avatar-wrapper">
                <div className="profile-avatar-circle">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Avatar preview" />
                  ) : currentAvatarUrl ? (
                    <img src={currentAvatarUrl} alt="Current avatar" />
                  ) : (
                    <div className="profile-avatar-fallback">
                      {(user.display_name || user.email || 'U')
                        .toString()
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                  )}
                </div>
                <label className="profile-file-label">
                  <span>Choose new avatar</span>
                  <input type="file" accept="image/*" onChange={handleAvatarChange} />
                </label>
                {avatarFile && (
                  <button
                    type="button"
                    className="profile-avatar-save"
                    onClick={handleUploadAvatar}
                    disabled={avatarSaving}
                  >
                    {avatarSaving ? 'Uploading…' : 'Save avatar'}
                  </button>
                )}
              </div>

              {/* Stats section */}
              <div className="profile-stats">
                <h2>Game Stats</h2>
                <div className="profile-stat-grid">
                  <div className="profile-stat-item">
                    <div className="profile-stat-value">{wins}</div>
                    <div className="profile-stat-label">Wins</div>
                  </div>
                  <div className="profile-stat-item">
                    <div className="profile-stat-value">{losses}</div>
                    <div className="profile-stat-label">Losses</div>
                  </div>
                  <div className="profile-stat-item">
                    <div className="profile-stat-value">{winRate}%</div>
                    <div className="profile-stat-label">Win Rate</div>
                  </div>
                </div>
              </div>
            </section>

            {/* Right column: Info form */}
            <section className="profile-info-section">
              <h2>Profile Info</h2>
              <form className="profile-form" onSubmit={handleSaveProfile}>
                <div className="profile-field">
                  <label htmlFor="display_name">Display name</label>
                  <input
                    id="display_name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    autoComplete="nickname"
                  />
                </div>

                <div className="profile-field">
                  <label htmlFor="email">Email</label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>

                <div className="profile-field">
                  <label htmlFor="bio">Bio</label>
                  <textarea
                    id="bio"
                    rows={4}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Tell us about yourself…"
                  />
                </div>

                <button type="submit" disabled={saving}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </form>

              {/* Friends section placeholder */}
              <div className="profile-friends">
                <h2>Friends</h2>
                <p className="profile-friends-placeholder">Friends list coming soon…</p>
              </div>
            </section>
          </div>

          {message && <p className={`profile-status ${message.type}`}>{message.text}</p>}
        </div>
      </div>
    </div>
  );
};

export default Profile;