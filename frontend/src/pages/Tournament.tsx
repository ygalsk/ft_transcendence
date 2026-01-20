import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type TournamentItem = {
  id: number;
  name: string;
  status: 'pending' | 'active' | 'finished' | string;
  player_count?: number;
  max_players?: number;
  finished_at?: string | null;
  podium?: { winner?: string; runner_up?: string; third?: string; winner_id?: number };
  // New winner id (backend may use winner_id or winnerId)
  winner_id?: number;
  winnerId?: number;
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
function pickName(obj: any): string | null {
  if (!obj) return null;
  return obj.display_name ?? obj.alias ?? obj.name ?? obj.username ?? null;
}

export default function Tournament() {
  const navigate = useNavigate();

  const [filter, setFilter] = useState<'open' | 'finished'>('open');
  const [items, setItems] = useState<TournamentItem[]>([]);
  const [selected, setSelected] = useState<TournamentItem | null>(null);
  const [status, setStatus] = useState<string>('');
  const [leaderboard, setLeaderboard] = useState<any | null>(null);
  const [authed, setAuthed] = useState<boolean>(true);
  const pollRef = useRef<number | null>(null);

  // Create form
  const [name, setName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState<number>(8);
  const [search, setSearch] = useState<string>('');

  // Winner map (id -> winner name) for finished tournaments
  const [winners, setWinners] = useState<Record<number, string | null>>({});

  const loadTournaments = async (f = filter, q = '') => {
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
        setWinners({});
        setStatus(data?.error || data?.message || `HTTP ${res.status}`);
        return;
      }
      setAuthed(true);
      const data = await res.json();

      const listRaw: TournamentItem[] = data.tournaments || [];
      // Ensure finished view only shows truly finished tournaments
      const filteredList =
        f === 'finished'
          ? listRaw.filter((t) => (t.status ?? '').toLowerCase() === 'finished')
          : listRaw;

      setItems(filteredList);

      if (f === 'finished' && filteredList.length) {
        // Resolve champion names using winner_id from the tournament (preferred).
        // We DO NOT pick the top of the leaderboard for unfinished tournaments.
        setStatus('Loading winners…');
        try {
          const entries = await Promise.all(
            filteredList.map(async (t) => {
              // Prefer explicit winner id from item
              const wId =
                t.winner_id ??
                t.winnerId ??
                t.podium?.winner_id ??
                null;

              if (wId) {
                // Resolve name via leaderboard (has user_id + display fields)
                try {
                  const r = await fetch(`${API_BASE}/api/pong/tournaments/${t.id}/leaderboard`, {
                    credentials: 'include',
                    headers: authHeaders(),
                  });
                  const lb = await r.json().catch(() => ({}));
                  const rows: any[] = lb?.leaderboard ?? [];
                  const match = rows.find((row: any) => (row.user_id ?? row.id) === wId);
                  const name = pickName(match);
                  if (name) return [t.id, name] as [number, string | null];
                } catch {
                  // ignore and fall back to podium winner
                }
              }

              // Fallback to provided podium winner string if present
              if (t.podium?.winner) return [t.id, t.podium.winner] as [number, string | null];

              // No info found
              return [t.id, null] as [number, string | null];
            })
          );
          setWinners(Object.fromEntries(entries));
          setStatus(`${filteredList.length} finished shown`);
        } catch {
          setWinners({});
          setStatus(`${filteredList.length} finished shown`);
        }
      } else {
        setWinners({});
        setStatus(`${filteredList.length} open shown`);
      }
    } catch (e: any) {
      setItems([]);
      setWinners({});
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
        body: JSON.stringify({ name, max_players: maxPlayers}),
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
    setStatus(`Joining #${id}…`);
    try {
      const url = `${API_BASE}/api/pong/tournaments/join`;
      console.debug('POST', url, { tournamentId: id });
      const r = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ tournamentId: id }),
      });
      const text = await r.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {}
      if (!r.ok) {
        console.error('Join failed:', r.status, text);
        setStatus(data?.error || data?.message || `Join failed (HTTP ${r.status})`);
        return;
      }
      setStatus('Joined.');
      await loadTournaments('open');
      if (selected?.id === id) {
        viewLeaderboardFor(id);
      }
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    }
  };

  const viewLeaderboardFor = async (id: number) => {
    setStatus('Loading leaderboard…');
    try {
      const url = `${API_BASE}/api/pong/tournaments/${id}/leaderboard`;
      console.debug('GET', url);
      const r = await fetch(url, {
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
    setStatus('Starting tournament…');
    try {
      const url = `${API_BASE}/api/pong/tournaments/${id}/start`;
      console.debug('POST', url);
      const r = await fetch(url, {
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
      const url =
        `${API_BASE}/api/pong/tournaments/${id}/next-match` +
        (userId ? `?userId=${userId}` : '');
      console.debug('GET', url);
      const r = await fetch(url, { credentials: 'include', headers: authHeaders() });
      const data = await r.json();
      if (data.status === 'waiting') {
        setStatus('No match yet. Waiting…');
        scheduleNextMatchPoll(3000);
        return;
      }
      if (data.status === 'ready' || data.status === 'running') {
        cancelNextMatchPoll();
        const qs = new URLSearchParams({
          matchId: String(data.matchKey ?? ''),
          tId: String(data.tournamentId ?? id),
          mId: String(data.tournamentMatchId ?? ''),
          alias: String(data.yourAlias ?? ''),
          opponent: String(data.opponentAlias ?? ''),
        }).toString();
        navigate(`/game/ranked?${qs}`);
        return;
      }
      setStatus(`Status: ${data.status ?? 'unknown'}`);
      scheduleNextMatchPoll(5000);
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
      scheduleNextMatchPoll(5000);
    }
  };

  // Auto-load details when a row is selected
  useEffect(() => {
    if (!selected) {
      setLeaderboard(null);
      cancelNextMatchPoll();
      return;
    }
    viewLeaderboardFor(selected.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  // Initial load + periodic refresh that respects current filter/search
  useEffect(() => {
    loadTournaments(filter, search);
    const t = setInterval(() => {
      loadTournaments(filter, search);
    }, 10000);
    return () => {
      clearInterval(t);
      cancelNextMatchPoll();
    };
  }, [filter, search]);

  const toggleSelect = (t: TournamentItem) => {
    setSelected((cur) => (cur && cur.id === t.id ? null : t));
  };

  return (
    <section className="tournament-container" style={{ padding: 32 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <header
          className="tournament-header"
          style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}
        >
          <h1 style={{ margin: 0 }}>Tournaments</h1>
          <div className="actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className="btn btn--primary"
              onClick={() => {
                setFilter('open');
                loadTournaments('open', search);
              }}
            >
              Open
            </button>
            <button
              className="btn btn--ghost"
              onClick={() => {
                setFilter('finished');
                loadTournaments('finished', search);
              }}
            >
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
          <p style={{ color: '#eab308', marginTop: 8 }}>
            Login required. Please sign in to view and manage tournaments.
          </p>
        )}

        <p className="tournament-status" style={{ opacity: 0.85, marginTop: 8 }}>{status}</p>

        {/* Two-column layout: table left, details right */}
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', marginTop: 16 }}>
          {/* Left: list/table */}
          <div style={{ flex: 1, minWidth: 520 }}>
            {/* Create form */}
            <section className="create-panel" style={{ marginTop: 12, marginBottom: 12 }}>
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

            <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: 12 }}>
              <table className="tournament-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px 10px' }}>Name</th>
                    {filter === 'finished'
                      ? <th style={{ textAlign: 'left', padding: '8px 10px' }}>Finished</th>
                      : <th style={{ textAlign: 'left', padding: '8px 10px' }}>Status</th>}
                    {filter === 'finished'
                      ? <th style={{ textAlign: 'left', padding: '8px 10px' }}>Winner</th>
                      : <th style={{ textAlign: 'left', padding: '8px 10px' }}>Players</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr><td colSpan={3} style={{ padding: '10px' }}>No tournaments</td></tr>
                  ) : items.map((t) => {
                    const isSelected = selected?.id === t.id;
                    const isFinished = (t.status ?? '').toLowerCase() === 'finished';
                    const winnerName = isFinished ? (winners[t.id] ?? t.podium?.winner ?? null) : null;

                    return (
                      <tr
                        key={t.id}
                        onClick={() => toggleSelect(t)}
                        style={{
                          cursor: 'pointer',
                          background: isSelected ? 'rgba(255,255,255,0.06)' : undefined
                        }}
                      >
                        <td style={{ padding: '8px 10px' }}>{t.name}</td>
                        {filter === 'finished' ? (
                          <>
                            <td style={{ padding: '8px 10px' }}>
                              {t.finished_at ? new Date(t.finished_at).toLocaleString() : '-'}
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              {winnerName ? `🥇 ${winnerName}` : '-'}
                            </td>
                          </>
                        ) : (
                          <>
                            <td style={{ padding: '8px 10px' }}>{t.status}</td>
                            <td style={{ padding: '8px 10px' }}>{t.player_count}/{t.max_players}</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right: details panel (keeps list visible) */}
          <aside style={{ width: 380 }}>
            <div style={{ position: 'sticky', top: 16 }}>
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 12 }}>
                <h3 style={{ margin: '4px 0 8px' }}>{selected ? selected.name : 'Details'}</h3>

                {!selected ? (
                  <div style={{ opacity: 0.75 }}>Select a tournament to see actions and leaderboard.</div>
                ) : (
                  <>
                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                      <button
                        className="btn btn--primary"
                        onClick={() => goToMatch(selected.id)}
                        disabled={selected.status === 'finished' || !authed}
                        title="Go to your next match when ready"
                      >
                        Go to match
                      </button>
                      <button
                        className="btn btn--ghost"
                        onClick={() => startTournament(selected.id)}
                        disabled={
                          !authed ||
                          selected.status !== 'pending' ||
                          (selected.player_count ?? 0) < 2
                        }
                        title="Start when enough players joined (only pending)"
                      >
                        Start
                      </button>
                      <button
                        className="btn"
                        onClick={() => joinTournament(selected.id)}
                        disabled={
                          !authed ||
                          !(filter === 'open' && selected.status === 'pending' &&
                            (selected.player_count ?? 0) < (selected.max_players ?? 0))
                        }
                      >
                        Join
                      </button>
                      <button
                        className="btn"
                        onClick={() => viewLeaderboardFor(selected.id)}
                        disabled={!authed}
                        title="Refresh leaderboard"
                      >
                        Refresh leaderboard
                      </button>
                    </div>
                    <p style={{ opacity: 0.75, marginBottom: 12 }}>
                      Status: {selected.status} • Players: {selected.player_count}/{selected.max_players}
                    </p>

                    {/* Leaderboard only (bracket removed) */}
                    <h4 style={{ margin: '4px 0 8px' }}>Leaderboard</h4>
                    {leaderboard?.leaderboard?.length ? (
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                        {leaderboard.leaderboard.map((row: any, idx: number) => {
                          const name = row.display_name ?? row.alias ?? row.name ?? 'Unknown';
                          const points = row.points ?? row.wins ?? 0;
                          const rank = idx + 1;
                          const rankStyle = (() => {
                            if (rank === 1) return { background: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b55' };
                            if (rank === 2) return { background: '#9ca3af22', color: '#9ca3af', border: '1px solid #9ca3af55' };
                            if (rank === 3) return { background: '#b4530922', color: '#b45309', border: '1px solid #b4530955' };
                            return { background: 'rgba(255,255,255,0.06)', color: 'inherit', border: '1px solid rgba(255,255,255,0.12)' };
                          })();
                          return (
                            <li
                              key={idx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '10px 12px',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: 8,
                                background: 'rgba(255,255,255,0.02)',
                              }}
                            >
                              <span
                                style={{
                                  minWidth: 30,
                                  height: 30,
                                  borderRadius: 15,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: 700,
                                  ...rankStyle,
                                }}
                                title={`Rank #${rank}`}
                              >
                                {rank}
                              </span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {name}
                                </div>
                                {row.wins != null && (
                                  <div style={{ opacity: 0.7, fontSize: 12 }}>
                                    {row.wins} wins
                                  </div>
                                )}
                              </div>
                              <div style={{ fontWeight: 700 }}>{points} pts</div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <div style={{ opacity: 0.75 }}>No leaderboard yet.</div>
                    )}
                  </>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
