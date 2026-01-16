import { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import '../styles/Play.css';

type GameState = {
  state: 'waiting' | 'starting' | 'playing' | 'paused' | 'finished';
  ball: { position: { x: number; y: number } };
  paddles: { left: { y: number; height: number }; right: { y: number; height: number } };
  score: { left: number; right: number };
};

export default function Play() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const statusRef = useRef<HTMLParagraphElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

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
      withCredentials: true,
      // transports: ['websocket'], // allow polling → upgrade
    });
    socketRef.current = socket;

    const setStatus = (msg: string) => {
      if (statusRef.current) statusRef.current.innerHTML = msg;
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

      ctx.strokeStyle = '#333';
      ctx.setLineDash([10, 10]);
      ctx.beginPath();
      ctx.moveTo(canvas.width / 2, 0);
      ctx.lineTo(canvas.width / 2, canvas.height);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(state.ball.position.x, state.ball.position.y, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillRect(20, state.paddles.left.y, 10, state.paddles.left.height);
      ctx.fillRect(canvas.width - 30, state.paddles.right.y, 10, state.paddles.right.height);

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

    socket.on('connect', () => {
      if (isTournament) {
        setStatus(`Joining tournament match <b>${matchId}</b>...<br>${yourAlias} vs ${opponentAlias}`);
        emitJoinMatch();
      } else {
        setStatus('Connected. Select a mode.');
      }
    });

    socket.on('connect_error', (e: Error) => setStatus(e?.message || 'Connection error'));
    socket.on('error', (e: any) => setStatus(e?.message || 'Server error'));

    socket.on('match_ready', ({ startAt }: { startAt: number }) => {
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

    socket.on('match_start', (info: any) => {
      clearTimer();
      setCountdown(null);
      setStatus(`<b>Match Started</b><br>You are: <b>${info.you}</b><br>Opponent: ${info.opponent}<br>Mode: ${info.mode}`);
    });

    socket.on('match_end', (end: any) => {
      clearTimer();
      setCountdown(null);
      const leftName = end.players?.left?.displayName || (isTournament ? yourAlias : 'Left');
      const rightName = end.players?.right?.displayName || (isTournament ? opponentAlias : 'Right');
      const winner = end.winnerSide === 'left' ? leftName : rightName;
      setStatus(
        `<b>Match Finished</b><br>Winner: ${winner}<br>Final Score: ${end.score.left} - ${end.score.right}<br>${leftName} vs ${rightName}`
      );
    });

    socket.on('state', (state: GameState) => {
      draw(state);
      if (overlayRef.current) {
        if (countdown && countdown > 0) {
          overlayRef.current.textContent = String(countdown);
          overlayRef.current.style.display = 'flex';
        } else {
          overlayRef.current.textContent = '';
          overlayRef.current.style.display = 'none';
        }
      }
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
      clearTimer();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      socket.close();
      socketRef.current = null;
    };
  }, [isTournament, matchId, tournamentId, tournamentMatchId, yourAlias, opponentAlias]); // removed countdown

  return (
    <section className="play-container">
      <header className="play-header">
        <h1>Play</h1>
        {!isTournament && (
          <div className="play-actions">
            <button
              className="btn btn--primary"
              onClick={() => socketRef.current?.emit('join_casual', { vsAi: true, difficulty: 'easy' })}
            >
              Vs AI (easy)
            </button>
            <button
              className="btn btn--ghost"
              onClick={() => socketRef.current?.emit('join_casual', { vsAi: false })}
            >
              Vs Human
            </button>
          </div>
        )}
      </header>

      <div className="play-stage">
        <canvas ref={canvasRef} id="gameCanvas" width={800} height={500} />
        <div ref={overlayRef} id="countdownOverlay" className="play-overlay" />
      </div>

      <p ref={statusRef} id="status" className="play-status">Connecting…</p>
    </section>
  );
}