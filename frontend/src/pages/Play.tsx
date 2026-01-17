import { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import '../styles/Play.css';

type GameState = {
  state: 'waiting' | 'starting' | 'playing' | 'paused' | 'finished';
  ball: { position: { x: number; y: number } };
  paddles: { left: { y: number; height: number }; right: { y: number; height: number } };
  score: { left: number; right: number };
};

type Phase = 'idle' | 'searching' | 'in_match';

export default function Play() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [countdown, setCountdown] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [status, setStatus] = useState<string>('Connecting…');

  // immediate, synchronous guards
  const phaseRef = useRef<Phase>('idle');
  const joinLockRef = useRef(false);

  const qs = useMemo(() => new URLSearchParams(window.location.search), []);
  const matchId = qs.get('matchId') || qs.get('match') || null;
  const tournamentId = qs.get('tId') || qs.get('tid') || null;
  const tournamentMatchId = qs.get('mId') || qs.get('tmid') || null;
  const yourAlias = qs.get('alias') || 'You';
  const opponentAlias = qs.get('opponent') || 'Opponent';
  const isTournament = !!(matchId && tournamentId && tournamentMatchId);

  useEffect(() => {
    const socket: Socket = io('/', {
      path: '/socket.io',
      withCredentials: true, // allow cookie auth
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

      // score
      ctx.font = '24px Arial';
      ctx.fillText(String(state.score.left), canvas.width / 2 - 50, 40);
      ctx.fillText(String(state.score.right), canvas.width / 2 + 30, 40);
    };

    const emitJoinMatch = () => {
      if (!isTournament) return;
      socket.emit('join_match', {
        matchId,
        tournamentId: Number(tournamentId),
        tournamentMatchId: Number(tournamentMatchId),
        alias: yourAlias,
      });
    };

    // listeners
    socket.on('connect', () => {
      if (isTournament) {
        setPhaseSafe('searching');
        setStatus(`Joining tournament match <b>${matchId}</b>...<br>${yourAlias} vs ${opponentAlias}`);
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

    socket.on('match_ready', ({ startAt }: { startAt: number }) => {
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
      setPhaseSafe('in_match');
      clearTimer();
      setCountdown(null);
      joinLockRef.current = false; // unlock; joined successfully
      setStatus(`<b>Match Started</b><br>You are: <b>${info.you}</b><br>Opponent: ${info.opponent}<br>Mode: ${info.mode}`);
    });

    socket.on('match_end', (end: any) => {
      setPhaseSafe('idle');
      clearTimer();
      setCountdown(null);
      joinLockRef.current = false;
      const leftName = end.players?.left?.displayName || (isTournament ? yourAlias : 'Left');
      const rightName = end.players?.right?.displayName || (isTournament ? opponentAlias : 'Right');
      const winner = end.winnerSide === 'left' ? leftName : rightName;
      setStatus(
        `<b>Match Finished</b><br>Winner: ${winner}<br>Final Score: ${end.score.left} - ${end.score.right}<br>${leftName} vs ${rightName}`
      );
    });

    socket.on('state', (state: GameState) => {
      // ignore any state when not in match/searching to avoid ghost draws
      if (phaseRef.current === 'idle') return;
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
    };
  }, [isTournament, matchId, tournamentId, tournamentMatchId, yourAlias, opponentAlias]);

  const requestJoin = (payload: any) => {
    const socket = socketRef.current;
    if (!socket) return;

    // hard guard against rapid clicks
    if (joinLockRef.current || phaseRef.current !== 'idle') return;
    joinLockRef.current = true;
    phaseRef.current = 'searching';
    setPhase('searching');
    setStatus('Joining queue…');

    // leave first, then join (serialize with ack/timeout)
    socket.timeout(2000).emit('leave_match', () => {
      socket.timeout(5000).emit('join_casual', payload, (ack?: { error?: string }) => {
        if (ack && ack.error) {
          setStatus(`Failed to join: ${ack.error}`);
          phaseRef.current = 'idle';
          setPhase('idle');
          joinLockRef.current = false;
          return;
        }
        // wait for match_ready/match_start events
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
  };

  return (
    <section className="play-container">
      <header className="play-header">
        <h1>Play</h1>
        {!isTournament && (
          <div className="play-actions">
            <button
              className="btn btn--primary"
              onClick={() => requestJoin({ vsAi: true, difficulty: 'easy' })}
              disabled={phase !== 'idle'}
            >
              Vs AI (easy)
            </button>
            <button
              className="btn btn--ghost"
              onClick={() => requestJoin({ vsAi: false })}
              disabled={phase !== 'idle'}
            >
              Vs Human
            </button>
            <button className="btn" onClick={leaveMatch} disabled={phase === 'idle'}>
              Leave
            </button>
          </div>
        )}
      </header>

      <div className="play-stage">
        <canvas ref={canvasRef} id="gameCanvas" width={800} height={500} />
        {countdown && countdown > 0 && <div className="play-overlay">{countdown}</div>}
      </div>

      <p className="play-status" dangerouslySetInnerHTML={{ __html: status }} />
    </section>
  );
}