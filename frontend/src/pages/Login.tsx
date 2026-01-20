import React, { useContext, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/authService';
import { AuthContext } from '../context/AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const { setUser } = useContext(AuthContext); // consume context setter
  const [form, setForm] = useState({ email: '', password: '', twofa: '' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [debugPayload, setDebugPayload] = useState<string | null>(null);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setDebugPayload(null);

    try {
      const result = await authService.login(form.email, form.password, form.twofa || undefined);
      setDebugPayload(JSON.stringify(result, null, 2));

      // Hydrate context from /api/user/me
      try {
        const profile = await authService.me<Record<string, unknown>>();
        const normalized =
          (profile as any)?.user ??
          (profile as any)?.data ??
          profile;
        setUser?.(normalized as any);
      } catch {
        // ignore; still redirect
      }

      setMessage({ type: 'success', text: 'Login successful. Redirecting…' });
      navigate('/');
      return;
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message ?? 'Unexpected error' });
    } finally {
      setLoading(false);
    }
  };

  const handleMe = async () => {
    try {
      const profile = await authService.me<Record<string, unknown>>();
      setDebugPayload(JSON.stringify(profile, null, 2));
      setMessage({ type: 'success', text: 'Fetched /api/user/me payload.' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message ?? 'Unable to fetch /api/user/me' });
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="login-title">Welcome Back</h1>
        <p className="login-subtitle">Sign in to reach the API</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <input name="email" type="email" placeholder="Email" value={form.email} onChange={handleChange} required />
          <input name="password" type="password" placeholder="Password" value={form.password} onChange={handleChange} required />
          <input name="twofa" placeholder="2FA code (optional)" value={form.twofa} onChange={handleChange} />
          <button type="submit" disabled={loading}>
            {loading ? 'Contacting API…' : 'Login'}
          </button>
        </form>

        {message && <p className={`login-status ${message.type}`}>{message.text}</p>}

        <div className="login-actions">
          <button type="button" className="secondary" onClick={() => navigate('/')}>
            ← Back home
          </button>
          <button type="button" onClick={handleMe}>
            Call /api/user/me
          </button>
        </div>

        {debugPayload && <pre className="login-debug">{debugPayload}</pre>}
      </div>
    </div>
  );
}