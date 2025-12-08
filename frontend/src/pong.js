// src/pong.js — updated tournament-aware logic

const jwt = localStorage.getItem("jwt") || localStorage.getItem("token");
const isAuthed = !!jwt;
const socket = io("/", {
  path: "/socket.io",
  transports: ["websocket"],
  auth: jwt ? { token: jwt } : {},
});

// --- DOM refs ---
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const countdownOverlay = document.getElementById("countdownOverlay");

const statusBox = document.getElementById("status");
let countdownTimer = null;
let hasStartedOnce = false;
let countdownSeconds = null;
const controls = document.getElementById("controls");
const btnAI = document.getElementById("btn_ai");
const btnHuman = document.getElementById("btn_human");
const metaBox = document.getElementById("meta");

// ----------------------------------------------
// PARAM PARSING — unified and simplified
// ----------------------------------------------
const url = new URLSearchParams(window.location.search);

const matchId = url.get("matchId") || url.get("match") || null;
const tournamentId = url.get("tId") || url.get("tid") || null;
const tournamentMatchId = url.get("mId") || url.get("tmid") || null;

const yourAlias = url.get("alias") || "You";
const opponentAlias = url.get("opponent") || "Opponent";

const isTournament =
  matchId && tournamentId && tournamentMatchId;

// Show metadata
if (metaBox) {
  metaBox.innerHTML = isTournament
    ? `
    <b>TOURNAMENT MATCH</b><br>
    Match Key: ${matchId}<br>
    Tournament: ${tournamentId}<br>
    DB Match ID: ${tournamentMatchId}<br>
    ${yourAlias} vs ${opponentAlias}
  `
    : "Casual mode";
}

// Hide casual UI during tournament
if (isTournament && controls) {
  controls.style.display = "none";
}

if (isTournament && !isAuthed && statusBox) {
  statusBox.textContent =
    "Login required for tournament play. Please log in again to continue.";
}

// ----------------------------------------------
// CASUAL MATCH BUTTONS
// ----------------------------------------------
if (btnAI) {
  btnAI.onclick = () => {
    socket.emit("join_casual", { vsAi: true, difficulty: "easy" });
    statusBox.textContent = "Joining vs AI (easy)...";
  };
}

if (btnHuman) {
  btnHuman.onclick = () => {
    socket.emit("join_casual", { vsAi: false });
    statusBox.textContent = "Waiting for another human...";
  };
}

// ----------------------------------------------
// AUTO-JOIN TOURNAMENT MATCH
// ----------------------------------------------
socket.on("connect", () => {
  if (isTournament && !isAuthed) return;

  if (!isTournament) {
    statusBox.textContent = "Connected. Select a mode.";
    return;
  }

  statusBox.innerHTML = `
    Joining tournament match <b>${matchId}</b>...<br>
    ${yourAlias} vs ${opponentAlias}
  `;

  socket.emit("join_match", {
    matchId,
    tournamentId: Number(tournamentId),
    tournamentMatchId: Number(tournamentMatchId),
    alias: yourAlias,
  });
});

socket.on("connect_error", (err) => {
  if (statusBox) statusBox.textContent = err.message || "Connection error";
});

socket.on("error", (err) => {
  if (!statusBox) return;
  statusBox.textContent =
    err?.message || JSON.stringify(err) || "Server rejected the request";
});

// ----------------------------------------------
// MATCH READY COUNTDOWN
// ----------------------------------------------
socket.on("match_ready", (info) => {
  if (!statusBox) return;
  const { startAt } = info;

  const updateCountdown = () => {
    const msLeft = startAt - Date.now();
    if (msLeft <= 0) {
      statusBox.textContent = "Starting...";
      clearInterval(countdownTimer);
      countdownTimer = null;
      countdownSeconds = null;
      return;
    }
    const sec = Math.max(0, Math.ceil(msLeft / 1000));
    countdownSeconds = sec;
    statusBox.textContent = `Match ready. Starting in ${sec}s...`;
  };

  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }

  updateCountdown();
  countdownTimer = setInterval(updateCountdown, 250);
});

// ----------------------------------------------
// RENDER LOOP
// ----------------------------------------------
function draw(state) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // background
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // center net
  ctx.strokeStyle = "#333";
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 0);
  ctx.lineTo(canvas.width / 2, canvas.height);
  ctx.stroke();
  ctx.setLineDash([]);

  // ball
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.arc(state.ball.position.x, state.ball.position.y, 8, 0, Math.PI * 2);
  ctx.fill();

  // paddles
  ctx.fillRect(20, state.paddles.left.y, 10, state.paddles.left.height);
  ctx.fillRect(
    canvas.width - 30,
    state.paddles.right.y,
    10,
    state.paddles.right.height
  );

  // score
  ctx.font = "24px Arial";
  ctx.fillText(state.score.left, canvas.width / 2 - 50, 40);
  ctx.fillText(state.score.right, canvas.width / 2 + 30, 40);

}

// ----------------------------------------------
// GAME STATE FROM SERVER
// ----------------------------------------------
socket.on("state", (state) => {
  draw(state);

  // Update countdown overlay text in HTML to avoid canvas flicker
  if (countdownOverlay) {
    if (countdownSeconds !== null && countdownSeconds > 0) {
      countdownOverlay.textContent = `${countdownSeconds}`;
      countdownOverlay.style.display = "flex";
    } else {
      countdownOverlay.textContent = "";
      countdownOverlay.style.display = "none";
    }
  }

  if (!statusBox) return;

  if (state.state === "playing") {
    hasStartedOnce = true;
    countdownSeconds = null;
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  switch (state.state) {
    case "waiting":
      statusBox.textContent = "Waiting for both players...";
      break;
    case "starting":
      statusBox.textContent = hasStartedOnce ? "Playing!" : "Get ready...";
      break;
    case "playing":
      statusBox.textContent = "Playing!";
      break;
    case "paused":
      statusBox.textContent = "Point scored...";
      break;
    case "finished":
      statusBox.textContent = "Match finished.";
      break;
  }
});

// ----------------------------------------------
// MATCH START / END MESSAGES
// ----------------------------------------------
socket.on("match_start", (info) => {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  countdownSeconds = null;
  statusBox.innerHTML = `
    <b>Match Started</b><br>
    You are: <b>${info.you}</b><br>
    Opponent: ${info.opponent}<br>
    Mode: ${info.mode}
  `;
});

socket.on("match_end", (end) => {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  countdownSeconds = null;
  const leftName =
    end.players?.left?.displayName ||
    (isTournament ? yourAlias : "Left");
  const rightName =
    end.players?.right?.displayName ||
    (isTournament ? opponentAlias : "Right");
  const winner =
    end.winnerSide === "left" ? leftName : rightName;
  statusBox.innerHTML = `
    <b>Match Finished</b><br>
    Winner: ${winner}<br>
    Final Score: ${end.score.left} - ${end.score.right}<br>
    ${leftName} vs ${rightName}
  `;

  if (end.tournamentId) {
    setTimeout(() => {
      window.location.href = "/tournament.html";
    }, 4000);
  }
});

// ----------------------------------------------
// INPUT
// ----------------------------------------------
document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowUp") socket.emit("input", { up: true });
  if (e.key === "ArrowDown") socket.emit("input", { down: true });
});
document.addEventListener("keyup", (e) => {
  if (e.key === "ArrowUp") socket.emit("input", { up: false });
  if (e.key === "ArrowDown") socket.emit("input", { down: false });
});
