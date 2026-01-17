import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type TournamentItem = {
  id: number;
  name: string;
  status: 'pending' | 'active' | 'finished' | string;
  player_count?: number;
  max_players?: number;
  finished_at?: string | null;
  podium?: { winner?: string; runner_up?: string; third?: string };
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || window.location.origin;

function getToken(): string | null {
  return localStorage.getItem('jwt') || localStorage.getItem('token');
}
function authHeaders(extra: Record<string, string> = {}) {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}`, ...extra } : { ...extra };
}
function decodeUserId(): number | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.userId ?? null;
  } catch {
    return null;
  }
}

export default function Tournament() {
  const navigate = useNavigate();

  const [filter, setFilter] = useState<'open' | 'finished'>('open');
  const [items, setItems] = useState<TournamentItem[]>([]);
  const [selected, setSelected] = useState<TournamentItem | null>(null);
  const [status, setStatus] = useState<string>('');
  const [bracket, setBracket] = useState<any | null>(null);
  const [leaderboard, setLeaderboard] = useState<any | null>(null);
  const [authed, setAuthed] = useState<boolean>(true);
  const pollRef = useRef<number | null>(null);

  // Create form
  const [name, setName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState<number>(8);
  const [search, setSearch] = useState<string>('');

  const loadTournaments = async (f = filter, q = '') => {
    setFilter(f);
    setStatus('Loading tournaments…');
    try {
      const res = await fetch(
        `${API_BASE}/api/pong/tournaments/?status=${f}&q=${encodeURIComponent(q)}`,
        { credentials: 'include', headers: authHeaders() }
      );
      if (!res.ok) {
        setAuthed(res.status !== 401);
        const data = await res.json().catch(() => ({}));
        setItems([]);
        setStatus(data?.error || data?.message || `HTTP ${res.status}`);
        return;
      }
      setAuthed(true);
      const data = await res.json();
      const list = data.tournaments || [];
      setItems(list);
      setStatus(`${list.length} ${f === 'finished' ? 'finished' : 'open'} shown`);
    } catch (e: any) {
      setStatus(`Failed: ${e.message}`);
    }
  };

  const createTournament = async () => {
    if (!name || !maxPlayers) {
      setStatus('Enter name and max players');
      return;
    }
    setStatus('Creating tournament…');
    try {
      const r = await fetch(`${API_BASE}/api/pong/tournaments/`, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name, max_players: maxPlayers, is_public: true }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setStatus(data?.error || data?.message || 'Create failed');
        return;
      }
      setStatus('Tournament created.');
      setName('');
      setMaxPlayers(8);
      loadTournaments('open');
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    }
  };

  const joinTournament = async (id: number) => {
    const alias = window.prompt('Enter your alias for this tournament:');
    if (!alias) return;
    setStatus(`Joining #${id}…`);
    try {
      const r = await fetch(`${API_BASE}/api/pong/tournaments/join`, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ tournamentId: id, alias }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setStatus(data?.error || data?.message || 'Join failed');
        return;
      }
      setStatus('Joined.');
      loadTournaments('open');
      // Refresh selection panel if open
      if (selected && selected.id === id) {
        viewLeaderboardFor(id);
      }
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    }
  };

  const viewBracketFor = async (id: number) => {
    setStatus('Loading bracket…');
    try {
      const r = await fetch(`${API_BASE}/api/pong/tournaments/${id}/bracket`, {
        credentials: 'include',
        headers: authHeaders(),
      });
      const data = await r.json();
      setBracket(data);
      setStatus('Bracket loaded.');
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    }
  };

  const viewLeaderboardFor = async (id: number) => {
    setStatus('Loading leaderboard…');
    try {
      const r = await fetch(`${API_BASE}/api/pong/tournaments/${id}/leaderboard`, {
        credentials: 'include',
        headers: authHeaders(),
      });
      const data = await r.json();
      setLeaderboard(data);
      setStatus('Leaderboard loaded.');
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    }
  };

  const startTournament = async (id: number) => {
    const t = items.find((x) => x.id === id);
    if (!t) return;
    if (t.status !== 'pending') {
      setStatus('Cannot start: tournament already started or finished.');
      return;
    }
    if ((t.player_count ?? 0) < 2) {
      setStatus('Need at least 2 players to start.');
      return;
    }
    setStatus('Starting tournament…');
    try {
      const r = await fetch(`${API_BASE}/api/pong/tournaments/${id}/start`, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({}),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setStatus(data?.error || data?.message || 'Start failed');
        return;
      }
      setStatus('Tournament started.');
      await loadTournaments('open');
      await viewBracketFor(id);
      scheduleNextMatchPoll(3000);
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    }
  };

  const cancelNextMatchPoll = () => {
    if (pollRef.current !== null) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  };
  const scheduleNextMatchPoll = (delayMs = 3000) => {
    cancelNextMatchPoll();
    pollRef.current = window.setTimeout(() => {
      if (selected) goToMatch(selected.id);
    }, delayMs);
  };

  const goToMatch = async (id: number) => {
    setStatus('Checking next match…');
    try {
      const userId = decodeUserId();
      const r = await fetch(
        `${API_BASE}/api/pong/tournaments/${id}/next-match${userId ? `?userId=${userId}` : ''}`,
        { credentials: 'include', headers: authHeaders() }
      );
      const data = await r.json();

      if (data.status === 'waiting') {
        setStatus('No match yet. Waiting for bracket to advance…');
        scheduleNextMatchPoll(3000);
        return;
      }
      if (data.status === 'ready' || data.status === 'running') {
        cancelNextMatchPoll();
        const qs = new URLSearchParams({
          matchId: String(data.matchKey),
          tId: String(data.tournamentId),
          mId: String(data.tournamentMatchId),
          alias: String(data.yourAlias || ''),
          opponent: String(data.opponentAlias || ''),
        }).toString();
        navigate(`/game/ranked?${qs}`);
        return;
      }
      setStatus(`Status: ${data.status}`);
      scheduleNextMatchPoll(5000);
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
      scheduleNextMatchPoll(5000);
    }
  };

  // Auto-load details when a row is selected
  useEffect(() => {
    if (!selected) {
      setBracket(null);
      setLeaderboard(null);
      cancelNextMatchPoll();
      return;
    }
    viewBracketFor(selected.id);
    viewLeaderboardFor(selected.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  useEffect(() => {
    loadTournaments('open');
    const t = setInterval(() => filter === 'open' && loadTournaments('open', search), 10000);
    return () => {
      clearInterval(t);
      cancelNextMatchPoll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSelect = (t: TournamentItem) => {
    setSelected((cur) => (cur && cur.id === t.id ? null : t));
  };

  return (
    <section className="tournament-container" style={{ padding: 16 }}>
      <header className="tournament-header" style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Tournaments</h1>
        <div className="actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn--primary" onClick={() => loadTournaments('open', search)}>
            Open
          </button>
          <button className="btn btn--ghost" onClick={() => loadTournaments('finished', search)}>
            Finished
          </button>
          <input
            type="search"
            placeholder="Search name…"
            value={search}
            onChange={(e) => {
              const v = e.target.value;
              setSearch(v);
              loadTournaments(filter, v);
            }}
          />
        </div>
      </header>

      {!authed && (
        <p style={{ color: '#eab308' }}>
          Login required. Please sign in to view and manage tournaments.
        </p>
      )}

      <p className="tournament-status" style={{ opacity: 0.85 }}>{status}</p>

      {/* Create form */}
      <section className="create-panel" style={{ marginTop: 12 }}>
        <h2 style={{ margin: '8px 0' }}>Create tournament</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            type="number"
            min={2}
            max={64}
            value={maxPlayers}
            onChange={(e) => setMaxPlayers(Number(e.target.value))}
          />
          <button className="btn btn--primary" onClick={createTournament} disabled={!authed}>
            Create
          </button>
        </div>
      </section>

      {/* List with expandable details row */}
      <table className="tournament-table" style={{ width: '100%', marginTop: 16, borderCollapse: 'separate', borderSpacing: 0 }}>
        <thead>
          <tr>
            <th>Name</th>
            {filter === 'finished' ? <th>Finished</th> : <th>Status</th>}
            {filter === 'finished' ? <th>Winners</th> : <th>Players</th>}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr><td colSpan={3}>No tournaments</td></tr>
          ) : items.map((t) => {
            const canJoin = filter === 'open' && t.status === 'pending' && (t.player_count ?? 0) < (t.max_players ?? 0);
            const winners =
              t.podium
                ? [
                    t.podium.winner ? `🥇 ${t.podium.winner}` : null,
                    t.podium.runner_up ? `🥈 ${t.podium.runner_up}` : null,
                    t.podium.third ? `🥉 ${t.podium.third}` : null,
                  ].filter(Boolean).join(' • ')
                : '-';
            const isSelected = selected?.id === t.id;

            return (
              <>
                <tr
                  key={`row-${t.id}`}
                  onClick={() => toggleSelect(t)}
                  style={{ cursor: 'pointer', background: isSelected ? 'rgba(255,255,255,0.04)' : undefined }}
                >
                  <td>{t.name}</td>
                  {filter === 'finished' ? (
                    <>
                      <td>{t.finished_at ? new Date(t.finished_at).toLocaleString() : '-'}</td>
                      <td>{winners}</td>
                    </>
                  ) : (
                    <>
                      <td>{t.status}</td>
                      <td>{t.player_count}/{t.max_players}</td>
                    </>
                  )}
                </tr>

                {isSelected && (
                  <tr key={`details-${t.id}`} className="details-row">
                    <td colSpan={3} style={{ padding: 12, background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        {/* Actions */}
                        <div style={{ minWidth: 260 }}>
                          <h3 style={{ margin: '4px 0 8px' }}>Actions</h3>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              className="btn btn--primary"
                              onClick={() => goToMatch(t.id)}
                              disabled={t.status === 'finished' || !authed}
                              title="Go to your next match when ready"
                            >
                              Go to match
                            </button>
                            <button
                              className="btn"
                              onClick={() => viewBracketFor(t.id)}
                              disabled={!authed}
                            >
                              Refresh bracket
                            </button>
                            <button
                              className="btn"
                              onClick={() => viewLeaderboardFor(t.id)}
                              disabled={!authed}
                            >
                              Refresh leaderboard
                            </button>
                            <button
                              className="btn btn--ghost"
                              onClick={() => startTournament(t.id)}
                              disabled={
                                !authed ||
                                t.status !== 'pending' ||
                                (t.player_count ?? 0) < 2
                              }
                              title="Start when enough players joined (only pending)"
                            >
                              Start tournament
                            </button>
                            <button
                              className="btn"
                              onClick={() => joinTournament(t.id)}
                              disabled={!canJoin || !authed}
                              title={canJoin ? 'Join this tournament' : 'Join disabled'}
                            >
                              Join
                            </button>
                          </div>
                          <p style={{ opacity: 0.75, marginTop: 8 }}>
                            Status: {t.status} • Players: {t.player_count}/{t.max_players}
                          </p>
                        </div>

                        {/* Leaderboard */}
                        <div style={{ flex: 1, minWidth: 280 }}>
                          <h3 style={{ margin: '4px 0 8px' }}>Leaderboard</h3>
                          {leaderboard?.leaderboard?.length ? (
                            <ol style={{ margin: 0, paddingLeft: 18 }}>
                              {leaderboard.leaderboard.map((row: any, idx: number) => (
                                <li key={idx}>
                                  {row.alias ?? row.name ?? 'Unknown'} — {row.points ?? row.wins ?? 0}
                                </li>
                              ))}
                            </ol>
                          ) : (
                            <div style={{ opacity: 0.75 }}>No leaderboard yet.</div>
                          )}
                        </div>

                        {/* Bracket preview */}
                        <div style={{ flex: 1, minWidth: 280 }}>
                          <h3 style={{ margin: '4px 0 8px' }}>Bracket</h3>
                          {bracket?.rounds?.length ? (
                            <div style={{ display: 'flex', gap: 12, overflowX: 'auto' }}>
                              {bracket.rounds.map((round: any, ri: number) => (
                                <div key={ri} style={{ minWidth: 160 }}>
                                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Round {round.round}</div>
                                  {(round.matches || []).map((m: any, mi: number) => {
                                    const score = m.score ? `${m.score.left}-${m.score.right}` : '';
                                    return (
                                      <div key={mi} style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: 8, marginBottom: 8 }}>
                                        <div style={{ fontSize: 11, opacity: 0.7 }}>#{m.index} • {m.status}</div>
                                        <div style={{ fontSize: 12 }}>{m.left?.alias || 'BYE'}</div>
                                        <div style={{ fontSize: 12 }}>{m.right?.alias || 'BYE'}</div>
                                        {score && <div style={{ fontSize: 11, color: '#86efac', marginTop: 4 }}>Score: {score}</div>}
                                      </div>
                                    );
                                  })}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ opacity: 0.75 }}>No bracket yet.</div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}