import React, { useContext, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/authService';
import { AuthContext } from '../context/AuthContext';

export default function Register() {
  const navigate = useNavigate();
  const { setUser } = useContext(AuthContext);
  const [form, setForm] = useState({ email: '', display_name: '', password: '', twofa: '' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [debugPayload, setDebugPayload] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setDebugPayload(null);

    try {
      const result = await authService.register({
        email: form.email,
        display_name: form.display_name,
        password: form.password,
        twofa: form.twofa || undefined,
      });
      setDebugPayload(JSON.stringify(result, null, 2));

      if (!(result as any).error) {
        // Optionally auto-login, then hydrate from /api/user/me
        try {
          await authService.login(form.email, form.password, form.twofa || undefined);
        } catch {
          // ignore
        }

        try {
          const profile = await authService.me<Record<string, unknown>>();
          const normalized =
            (profile as any)?.user ??
            (profile as any)?.data ??
            profile;
          setUser?.(normalized as any);
        } catch {
          // ignore
        }

        setMessage({ type: 'success', text: 'Account created. Redirecting…' });
        navigate('/');
        return;
      }

      setMessage({ type: 'error', text: (result as any).error ?? 'Registration failed' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message ?? 'Unexpected error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="login-title">Create your account</h1>
        <p className="login-subtitle">Register to start playing</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <input name="email" type="email" placeholder="Email" value={form.email} onChange={handleChange} required />
          <input name="display_name" placeholder="Display name" value={form.display_name} onChange={handleChange} required />
          <input name="password" type="password" placeholder="Password" value={form.password} onChange={handleChange} required />
          <input name="twofa" placeholder="2FA code (optional)" value={form.twofa} onChange={handleChange} />
          <button type="submit" disabled={loading}>
            {loading ? 'Creating account…' : 'Register'}
          </button>
        </form>

        {message && <p className={`login-status ${message.type}`}>{message.text}</p>}

        <div className="login-actions">
          <button type="button" className="secondary" onClick={() => navigate('/login')}>
            ← Back to login
          </button>
          <button type="button" onClick={() => navigate('/')}>
            Go home
          </button>
        </div>

        {debugPayload && <pre className="login-debug">{debugPayload}</pre>}
      </div>
    </div>
  );
}