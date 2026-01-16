import { useEffect, useState } from 'react';
import '../styles/Leaderboard.css';

type Player = {
  display_name: string;
  elo?: number;
  wins?: number;
  losses?: number;
};

export default function Leaderboard() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLeaderboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/user/leaderboard', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load leaderboard');
      const data = await res.json();
      setPlayers(Array.isArray(data.leaderboard) ? data.leaderboard : []);
    } catch (e: any) {
      setError(e.message ?? 'Error loading leaderboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    loadLeaderboard();
    timer = setInterval(loadLeaderboard, 10000);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, []);

  return (
    <section className="leaderboard-container">
      <header className="leaderboard-header">
        <h1>Leaderboard</h1>
        <button className="btn btn--primary" onClick={loadLeaderboard} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {error && <p className="leaderboard-error">{error}</p>}

      <table className="leaderboard-table" aria-label="Leaderboard table">
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            <th>ELO</th>
            <th>Wins</th>
            <th>Losses</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={5}>Loading...</td></tr>
          ) : players.length === 0 ? (
            <tr><td colSpan={5}>No players yet.</td></tr>
          ) : (
            players.map((p, i) => (
              <tr key={`${p.display_name}-${i}`}>
                <td>{i + 1}</td>
                <td>{p.display_name}</td>
                <td>{p.elo ?? '—'}</td>
                <td>{p.wins ?? 0}</td>
                <td>{p.losses ?? 0}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}