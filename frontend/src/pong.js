// src/pong.js — tournament-aware & casual

const socket = io("/", {
  path: "/socket.io",
  transports: ["websocket"],
});

// --- DOM refs ---
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const statusBox = document.getElementById("status");
const controls = document.getElementById("controls");
const btnAI = document.getElementById("btn_ai");
const btnHuman = document.getElementById("btn_human");
const metaBox = document.getElementById("meta");

// --------------------------------------------------
// ✅ Parse URL params (supports both old & new keys)
// --------------------------------------------------
const urlParams = new URLSearchParams(window.location.search);

// matchId used by server (pong_match_id like "t1-r1-m0")
const matchIdFromUrl =
  urlParams.get("match") ||
  urlParams.get("matchId") ||
  urlParams.get("m");

// tournament id
const tournamentIdFromUrl =
  urlParams.get("tId") ||
  urlParams.get("tid");

// tournament_match.id (numeric, from DB)
const tournamentMatchIdFromUrl =
  urlParams.get("mId") ||
  urlParams.get("tmid");

// aliases (optional, for display)
const yourAlias = urlParams.get("alias") || "You";
const opponentAlias = urlParams.get("opponent") || "Opponent";

const isTournamentMode =
  !!matchIdFromUrl && !!tournamentIdFromUrl && !!tournamentMatchIdFromUrl;

// Show debug info so we can *see* what’s going on
if (metaBox) {
  metaBox.innerHTML = isTournamentMode
    ? `Tournament mode<br>
       matchId = ${matchIdFromUrl}<br>
       tId = ${tournamentIdFromUrl}<br>
       mId = ${tournamentMatchIdFromUrl}<br>
       ${yourAlias} vs ${opponentAlias}`
    : "Casual mode. Use the buttons above.";
}

// If this is a tournament match, hide casual buttons
if (isTournamentMode && controls) {
  controls.style.display = "none";
}

// --------------------------------------------------
// CASUAL CONTROLS (only used when not in tournament)
// --------------------------------------------------
if (btnAI) {
  btnAI.onclick = () => {
    socket.emit("join_casual", { vsAi: true, difficulty: "medium" });
    if (statusBox) statusBox.textContent = "Joining vs AI...";
  };
}

if (btnHuman) {
  btnHuman.onclick = () => {
    socket.emit("join_casual", { vsAi: false });
    if (statusBox) statusBox.textContent = "Waiting for another player...";
  };
}

// --------------------------------------------------
// AUTO-JOIN TOURNAMENT MATCH ON CONNECT
// --------------------------------------------------
socket.on("connect", () => {
  if (!isTournamentMode) {
    if (statusBox) statusBox.textContent = "Connected. Choose a mode.";
    return;
  }

  const matchId = matchIdFromUrl;
  const tId = Number(tournamentIdFromUrl);
  const tMatchId = Number(tournamentMatchIdFromUrl);

  if (statusBox) {
    statusBox.innerHTML = `
      Joining tournament match <b>${matchId}</b>...<br>
      ${yourAlias} vs ${opponentAlias}
    `;
  }

  socket.emit("join_match", {
    matchId,                 // e.g. "t1-r1-m0"
    tournamentId: tId,       // numeric tournament id
    tournamentMatchId: tMatchId,
  });
});

// --------------------------------------------------
// RENDERING
// --------------------------------------------------
function draw(state) {
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Ball
  const ball = state.ball;
  ctx.fillStyle = "white";
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

// --------------------------------------------------
// STATE FROM SERVER
// --------------------------------------------------
socket.on("state", (state) => {
  draw(state);

  if (!statusBox) return;

  if (state.state === "waiting") {
    statusBox.textContent = "Waiting for both players...";
    return;
  }
  if (state.state === "starting") {
    statusBox.textContent = "Get ready...";
    return;
  }
  if (state.state === "playing") {
    statusBox.textContent = "Playing!";
    return;
  }
  if (state.state === "paused") {
    statusBox.textContent = "Point scored. Next serve incoming...";
    return;
  }
  if (state.state === "finished") {
    statusBox.textContent = "Match finished.";
  }
});

// --------------------------------------------------
// MATCH START / END
// --------------------------------------------------
socket.on("match_start", (info) => {
  if (!statusBox) return;
  statusBox.innerHTML = `
    Match started<br>
    You are: <b>${info.you}</b><br>
    Opponent: ${info.opponent}<br>
    Mode: ${info.mode}
  `;
});

socket.on("match_end", (end) => {
  if (!statusBox) return;

  statusBox.innerHTML = `
    Match Ended<br>
    Winner: ${end.winnerSide.toUpperCase()}<br>
    Score: ${end.score.left} - ${end.score.right}
  `;

  // If this was a tournament match, go back to tournament lobby afterwards
  if (end.tournamentId) {
    setTimeout(() => {
      window.location.href = `/tournament.html`;
    }, 4000);
  }
});

// --------------------------------------------------
// INPUT EVENTS
// --------------------------------------------------
document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowUp") socket.emit("input", { up: true });
  if (e.key === "ArrowDown") socket.emit("input", { down: true });
});

document.addEventListener("keyup", (e) => {
  if (e.key === "ArrowUp") socket.emit("input", { up: false });
  if (e.key === "ArrowDown") socket.emit("input", { down: false });
});
