import { useEffect, useMemo, useRef, useState, useContext } from 'react';
import { io, Socket } from 'socket.io-client';
import { AuthContext } from '../context/AuthContext';
import '../styles/Play.css';

type GameState = {
  state: 'waiting' | 'starting' | 'playing' | 'paused' | 'finished';
  ball: { position: { x: number; y: number } };
  paddles: { left: { y: number; height: number }; right: { y: number; height: number } };
  score: { left: number; right: number };
};

type Phase = 'idle' | 'searching' | 'in_match';
type Side = 'left' | 'right';

export default function Play() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [countdown, setCountdown] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [status, setStatus] = useState<string>('Connecting…');
  const [aiDifficulty, setAiDifficulty] = useState<'easy' | 'medium' | 'hard'>('easy');

  // UI scoreboard state
  const scoreRef = useRef<{ left: number; right: number }>({ left: 0, right: 0 });
  const [score, setScore] = useState<{ left: number; right: number }>({ left: 0, right: 0 });
  const [youSide, setYouSide] = useState<Side | null>(null);
  const [leftName, setLeftName] = useState<string>('You');
  const [rightName, setRightName] = useState<string>('Opponent');

  // immediate, synchronous guards
  const phaseRef = useRef<Phase>('idle');
  const joinLockRef = useRef(false);

  const qs = useMemo(() => new URLSearchParams(window.location.search), []);
  const matchId = qs.get('matchId') || qs.get('match') || null;
  const tournamentId = qs.get('tId') || qs.get('tid') || null;
  const tournamentMatchId = qs.get('mId') || qs.get('tmid') || null;
  const yourAliasFromQuery = qs.get('alias') || 'You';
  const opponentAliasFromQuery = qs.get('opponent') || 'Opponent';
  const isTournament = !!(matchId && tournamentId && tournamentMatchId);

  const auth = useContext(AuthContext) as any;
  const user = auth?.user;
  const aliasFromUser =
    user?.display_name ??
    (user as any)?.user?.display_name ??
    (user as any)?.data?.display_name ??
    null;

  const youAlias = aliasFromUser || yourAliasFromQuery || 'You';
  const isRankedRoute = window.location.pathname.includes('/game/ranked');

  useEffect(() => {
    // init names before connect
    setLeftName(isTournament ? yourAliasFromQuery : youAlias);
    setRightName(isTournament ? opponentAliasFromQuery : 'Opponent');

    const token = localStorage.getItem('jwt') || localStorage.getItem('token') || null;
    const socket: Socket = io('/', {
      path: '/socket.io',
      withCredentials: true,
      auth: token ? { token } : {},
    });
    socketRef.current = socket;

    const setPhaseSafe = (p: Phase) => {
      phaseRef.current = p;
      setPhase(p);
    };

    const clearTimer = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    const draw = (state: GameState) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // center dashed line
      ctx.strokeStyle = '#333';
      ctx.setLineDash([10, 10]);
      ctx.beginPath();
      ctx.moveTo(canvas.width / 2, 0);
      ctx.lineTo(canvas.height / 2 + canvas.width / 2 - canvas.height / 2, canvas.height); // ensure full height line
      ctx.moveTo(canvas.width / 2, 0);
      ctx.lineTo(canvas.width / 2, canvas.height);
      ctx.stroke();
      ctx.setLineDash([]);

      // ball
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(state.ball.position.x, state.ball.position.y, 8, 0, Math.PI * 2);
      ctx.fill();

      // paddles
      ctx.fillRect(20, state.paddles.left.y, 10, state.paddles.left.height);
      ctx.fillRect(canvas.width - 30, state.paddles.right.y, 10, state.paddles.right.height);
    };

    const emitJoinMatch = () => {
      const s = socketRef.current;
      if (!s || !isTournament) return;
      s.emit('join_match', {
        matchId,
        tournamentId: Number(tournamentId),
        tournamentMatchId: Number(tournamentMatchId),
        alias: youAlias,
        ranked: true,
      });
    };

    socket.on('connect', () => {
      if (isTournament) {
        setPhaseSafe('searching');
        setStatus(`Joining tournament match <b>${matchId}</b>...<br>${yourAliasFromQuery} vs ${opponentAliasFromQuery}`);
        emitJoinMatch();
      } else {
        setPhaseSafe('idle');
        setStatus('Connected. Select a mode.');
      }
    });

    socket.on('disconnect', () => {
      setPhaseSafe('idle');
      setStatus('Disconnected. Reconnecting…');
      joinLockRef.current = false;
    });

    socket.on('connect_error', (e: Error) => setStatus(e?.message || 'Connection error'));
    socket.on('error', (e: any) => setStatus(e?.message || 'Server error'));

    socket.on('match_ready', ({ startAt, players }: { startAt: number; players?: any }) => {
      // Update names if server sends them
      if (players?.left?.displayName || players?.right?.displayName) {
        setLeftName(players.left?.displayName || leftName);
        setRightName(players.right?.displayName || rightName);
      }
      setPhaseSafe('searching');
      clearTimer();
      const tick = () => {
        const msLeft = startAt - Date.now();
        if (msLeft <= 0) {
          setCountdown(null);
          setStatus('Starting...');
          clearTimer();
          return;
        }
        const sec = Math.max(0, Math.ceil(msLeft / 1000));
        setCountdown(sec);
        setStatus(`Match ready. Starting in ${sec}s...`);
      };
      tick();
      timerRef.current = setInterval(tick, 250);
    });

    socket.on('match_start', (info: Record<string, any>) => {
      // info.you likely 'left' | 'right'
      if (info?.you === 'left' || info?.you === 'right') {
        setYouSide(info.you);
        // set names if provided
        if (info.players?.left?.displayName || info.players?.right?.displayName) {
          setLeftName(info.players.left?.displayName || leftName);
          setRightName(info.players.right?.displayName || rightName);
        } else if (!isTournament) {
          // Casual: if vs AI, show difficulty
          const maybeAI =
            info.mode === 'ai' || info.vsAi
              ? `AI (${aiDifficultyLabel(aiDifficulty)})`
              : 'Opponent';
          const youIsLeft = info.you === 'left';
          setLeftName(youIsLeft ? youAlias : maybeAI);
          setRightName(youIsLeft ? maybeAI : youAlias);
        }
      }
      setPhaseSafe('in_match');
      clearTimer();
      setCountdown(null);
      joinLockRef.current = false;
      setStatus(`<b>Match Started</b><br>You are: <b>${info.you}</b><br>Opponent: ${info.opponent}<br>Mode: ${info.mode}`);
    });

    socket.on('match_end', (end: any) => {
      setPhaseSafe('idle');
      clearTimer();
      setCountdown(null);
      joinLockRef.current = false;
      const leftN = end.players?.left?.displayName || leftName;
      const rightN = end.players?.right?.displayName || rightName;
      const winner = end.winnerSide === 'left' ? leftN : rightN;
      setStatus(
        `<b>Match Finished</b><br>Winner: ${winner}<br>Final Score: ${end.score.left} - ${end.score.right}<br>${leftN} vs ${rightN}`
      );
    });

    socket.on('state', (state: GameState) => {
      if (phaseRef.current === 'idle') return;
      // update scoreboard when score changes
      if (
        state.score.left !== scoreRef.current.left ||
        state.score.right !== scoreRef.current.right
      ) {
        scoreRef.current = { ...state.score };
        setScore({ ...state.score });
      }
      draw(state);
      switch (state.state) {
        case 'waiting':
          setStatus('Waiting for opponent to join... keep this page open.');
          break;
        case 'starting':
          setStatus('Get ready...');
          break;
        case 'playing':
          setStatus('Playing!');
          break;
        case 'paused':
          setStatus('Point scored...');
          break;
        case 'finished':
          setStatus('Match finished.');
          break;
      }
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') socket.emit('input', { up: true });
      if (e.key === 'ArrowDown') socket.emit('input', { down: true });
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') socket.emit('input', { up: false });
      if (e.key === 'ArrowDown') socket.emit('input', { down: false });
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      if (socket.connected) {
        socket.emit('cancel_search');
        socket.emit('leave_match');
      }
      clearTimer();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      socket.close();
      socketRef.current = null;
      joinLockRef.current = false;
      phaseRef.current = 'idle';
      setYouSide(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTournament, matchId, tournamentId, tournamentMatchId, yourAliasFromQuery, opponentAliasFromQuery, youAlias]);

  const aiDifficultyLabel = (d: 'easy' | 'medium' | 'hard') =>
    d === 'medium' ? 'Medium' : d === 'hard' ? 'Hard' : 'Easy';

  const requestJoin = (payload: any) => {
    const socket = socketRef.current;
    if (!socket) return;
    if (joinLockRef.current || phaseRef.current !== 'idle') return;

    joinLockRef.current = true;
    phaseRef.current = 'searching';
    setPhase('searching');
    setStatus('Joining queue…');

    // map 'medium' -> 'normal' for server compatibility
    const serverDifficulty =
      payload?.difficulty === 'medium' ? 'normal' : payload?.difficulty;

    const base = {
      ...payload,
      difficulty: serverDifficulty,
      ranked: isRankedRoute,
      alias: youAlias,
    };

    // Pre-set names for casual vs AI
    if (base.vsAi && !isTournament) {
      const aiName = `AI (${aiDifficultyLabel(aiDifficulty)})`;
      setLeftName(youAlias);
      setRightName(aiName);
      setScore({ left: 0, right: 0 });
      scoreRef.current = { left: 0, right: 0 };
      setYouSide('left');
    }

    socket.timeout(2000).emit('leave_match', () => {
      socket.timeout(5000).emit('join_casual', base, (ack?: { error?: string }) => {
        if (ack && ack.error) {
          setStatus(`Failed to join: ${ack.error}`);
          phaseRef.current = 'idle';
          setPhase('idle');
          joinLockRef.current = false;
          return;
        }
      });
    });
  };

  const leaveMatch = () => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('cancel_search');
    socket.emit('leave_match');
    phaseRef.current = 'idle';
    setPhase('idle');
    setCountdown(null);
    setStatus('Left match. Select a mode.');
    joinLockRef.current = false;
    // reset UI
    setScore({ left: 0, right: 0 });
    scoreRef.current = { left: 0, right: 0 };
    setYouSide(null);
    setLeftName(youAlias);
    setRightName('Opponent');
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
  };

  const difficultyButton = (value: 'easy' | 'medium' | 'hard', label: string) => (
    <button
      key={value}
      className={`seg ${aiDifficulty === value ? 'seg--active' : ''}`}
      onClick={() => setAiDifficulty(value)}
      disabled={phase !== 'idle'}
      aria-pressed={aiDifficulty === value}
    >
      {label}
    </button>
  );

  const youScore = youSide ? score[youSide] : score.left;
  const oppScore = youSide ? score[youSide === 'left' ? 'right' : 'left'] : score.right;

  return (
    <section className="play-container">
      <header className="play-header">
        <h1>Play</h1>
        {!isTournament && (
          <div className="play-actions">
            <div className="segmented">
              {difficultyButton('easy', 'Easy')}
              {difficultyButton('medium', 'Medium')}
              {difficultyButton('hard', 'Hard')}
            </div>
            <button
              className="btn btn--primary"
              onClick={() => requestJoin({ vsAi: true, difficulty: aiDifficulty })}
              disabled={phase !== 'idle'}
              title="Play against AI"
            >
              Play vs AI
            </button>
            <button
              className="btn btn--ghost"
              onClick={() => requestJoin({ vsAi: false })}
              disabled={phase !== 'idle'}
              title="Matchmaking vs human"
            >
              Play vs Human
            </button>
            <button className="btn" onClick={leaveMatch} disabled={phase === 'idle'}>
              Leave
            </button>
          </div>
        )}
      </header>

      {/* Scoreboard */}
      <div className="play-scoreboard">
        <div className="player-card player-card--left">
          <div className="avatar">{leftName.charAt(0).toUpperCase()}</div>
          <div className="meta">
            <div className="name">{leftName}</div>
            <div className="score">{youSide ? (youSide === 'left' ? youScore : oppScore) : score.left}</div>
          </div>
        </div>
        <div className="vs">VS</div>
        <div className="player-card player-card--right">
          <div className="meta meta--right">
            <div className="name">{rightName}</div>
            <div className="score">{youSide ? (youSide === 'left' ? oppScore : youScore) : score.right}</div>
          </div>
          <div className="avatar">{rightName.charAt(0).toUpperCase()}</div>
        </div>
      </div>

      {/* Stage */}
      <div className="play-stage">
        <canvas ref={canvasRef} id="gameCanvas" width={800} height={500} />
        {countdown && countdown > 0 && <div className="play-overlay">{countdown}</div>}
      </div>

      <p className="play-status" dangerouslySetInnerHTML={{ __html: status }} />
    </section>
  );
}