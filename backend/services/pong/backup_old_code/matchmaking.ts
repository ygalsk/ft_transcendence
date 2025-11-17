import { FastifyInstance } from 'fastify';
import { Socket } from 'socket.io';
import { createGameRoom } from './room';

// -------------------- Matchmaking Queue --------------------
let waitingPlayer: Socket | null = null;

export function handlePlayerJoin(app: FastifyInstance, socket: Socket): void {
  if (!waitingPlayer) {
    // No one waiting, add this player to queue
    waitingPlayer = socket;
    socket.emit("waiting", { message: "🕐 Waiting for opponent..." });
    app.log.info({ socketId: socket.id }, 'Player added to matchmaking queue');
  } else {
    // Someone is waiting, create a game room
    const p1 = waitingPlayer;
    const p2 = socket;
    waitingPlayer = null;

    app.log.info({
      player1: p1.id,
      player2: p2.id
    }, 'Match found, creating game room');

    createGameRoom(app, p1, p2);
  }
}

export function handlePlayerLeave(socket: Socket): void {
  // Remove from waiting queue if they were waiting
  if (waitingPlayer?.id === socket.id) {
    waitingPlayer = null;
  }
}

export function getWaitingPlayer(): Socket | null {
  return waitingPlayer;
}
