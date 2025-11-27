//
// pong.js — tournament-aware version
//

const socket = io("/", {
  path: "/socket.io",
  transports: ["websocket"]
});

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const statusBox = document.getElementById("status");

// ---------------------------------------------
// ⭐ NEW — parse URL params for tournament join
// ---------------------------------------------
const urlParams = new URLSearchParams(window.location.search);
const tournamentId = urlParams.get("tId");     // e.g. 3
const tournamentMatchId = urlParams.get("mId"); // e.g. 7

// If these exist → auto-join tournament
let autoJoinTournament = false;
if (tournamentId && tournamentMatchId) {
  autoJoinTournament = true;
}

// ---------------------------------------------
// Buttons for casual mode
// ---------------------------------------------
const btnAI = document.getElementById("btn_ai");
const btnHuman = document.getElementById("btn_human");

btnAI.onclick = () => {
  socket.emit("join_casual", { vsAi: true, difficulty: "medium" });
};

btnHuman.onclick = () => {
  socket.emit("join_casual", { vsAi: false });
};

// ---------------------------------------------
// AUTO-JOIN tournament match
// ---------------------------------------------
socket.on("connect", () => {
  if (autoJoinTournament) {
    const matchId = tournamentMatchId;
    const tId = Number(tournamentId);

    statusBox.innerHTML = `Joining tournament match ${matchId}...`;

    socket.emit("join_match", {
      matchId,
      tournamentId: tId
    });
  }
});

// ---------------------------------------------
// Rendering
// ---------------------------------------------
function draw(state) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Ball
  ctx.fillStyle = "white";
  const ball = state.ball;
  ctx.beginPath();
  ctx.arc(ball.position.x, ball.position.y, 8, 0, Math.PI * 2);
  ctx.fill();

  // Paddles
  ctx.fillRect(20, state.paddles.left.y, 10, state.paddles.left.height);
  ctx.fillRect(
    canvas.width - 30,
    state.paddles.right.y,
    10,
    state.paddles.right.height
  );

  // Score
  ctx.font = "24px Arial";
  ctx.fillText(state.score.left, canvas.width / 2 - 50, 40);
  ctx.fillText(state.score.right, canvas.width / 2 + 30, 40);
}

// ---------------------------------------------
// STATE from server
// ---------------------------------------------
socket.on("state", (state) => {
  draw(state);

  if (state.meta.isTournament) {
    statusBox.innerHTML = `
      Tournament Match #${state.meta.tournamentId}<br>
      Your side: ${state.players.left.userId === state.meta.userId ? "LEFT" : "RIGHT"}
    `;
  }
});

// ---------------------------------------------
// MATCH START
// ---------------------------------------------
socket.on("match_start", (info) => {
  statusBox.innerHTML = `
    Match started<br>
    Opponent: ${info.opponent}<br>
    Mode: ${info.mode}
  `;
});

// ---------------------------------------------
// MATCH END
// ---------------------------------------------
socket.on("match_end", (end) => {
  statusBox.innerHTML = `
    Match Ended<br>
    Winner: ${end.winnerSide.toUpperCase()}<br>
    Score: ${end.score.left} - ${end.score.right}
  `;

  // For tournaments → redirect back to tournament panel
  if (end.tournamentId) {
    setTimeout(() => {
      window.location.href = `/tournament.html`;
    }, 4000);
  }
});

// ---------------------------------------------
// INPUT EVENTS
// ---------------------------------------------
document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowUp") socket.emit("input", { up: true });
  if (e.key === "ArrowDown") socket.emit("input", { down: true });
});

document.addEventListener("keyup", (e) => {
  if (e.key === "ArrowUp") socket.emit("input", { up: false });
  if (e.key === "ArrowDown") socket.emit("input", { down: false });
});
