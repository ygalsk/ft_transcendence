const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const statusBox = document.getElementById("status");

let socket = null;
let roomId = null;
let side = null;

let gameState = null;

// ----------------------------------------
// Connect to WebSocket
// ----------------------------------------
function connectSocket() {
  return io("http://localhost:8080", {
    path: "/socket.io",
    auth: {
      // No token → guest
      token: null
    }
  });
}

// ----------------------------------------
// Start handlers
// ----------------------------------------
document.getElementById("btn_ai").onclick = () => {
  socket = connectSocket();
  setupSocketHandlers();
  socket.emit("join_casual", { vsAi: true });
  setStatus("Joining AI...");
};

document.getElementById("btn_human").onclick = () => {
  socket = connectSocket();
  setupSocketHandlers();
  socket.emit("join_casual", { vsAi: false });
  setStatus("Waiting for human opponent...");
};

// ----------------------------------------
// Socket events
// ----------------------------------------
function setupSocketHandlers() {
  socket.on("connect", () => {
    console.log("Connected:", socket.id);
  });

  socket.on("waiting", (msg) => {
    setStatus(msg.message);
  });

  socket.on("match_start", (data) => {
    console.log("MATCH_START:", data);
    roomId = data.matchId;
    side = data.you;
    setStatus(`Match started! You are ${side}. Opponent: ${data.opponent}`);
  });

  socket.on("state", (state) => {
    // save state for rendering
    gameState = state;
  });

  socket.on("match_end", (res) => {
    setStatus(`Match ended! Winner: ${res.players[res.winnerSide].displayName}`);
  });
}

// ----------------------------------------
// Input handling (arrows)
// ----------------------------------------
let input = { up: false, down: false };

window.addEventListener("keydown", (ev) => {
  if (!socket) return;

  if (ev.key === "ArrowUp") {
    input.up = true;
    socket.emit("input", input);
  }

  if (ev.key === "ArrowDown") {
    input.down = true;
    socket.emit("input", input);
  }
});

window.addEventListener("keyup", (ev) => {
  if (!socket) return;

  if (ev.key === "ArrowUp") {
    input.up = false;
    socket.emit("input", input);
  }

  if (ev.key === "ArrowDown") {
    input.down = false;
    socket.emit("input", input);
  }
});

// ----------------------------------------
// Rendering loop (60 FPS)
// ----------------------------------------
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!gameState) {
    requestAnimationFrame(render);
    return;
  }

  const { ball, paddles, score, players, state } = gameState;

  // Court
  drawCourt();

  // Ball
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.arc(ball.position.x, ball.position.y, 8, 0, Math.PI * 2);
  ctx.fill();

  // Paddles
  ctx.fillStyle = "white";
  ctx.fillRect(20, paddles.left.y, 10, paddles.left.height);
  ctx.fillRect(canvas.width - 30, paddles.right.y, 10, paddles.right.height);

  // Score
  drawScore(players, score);

  // State text
  if (state === "starting") {
    drawCenterText("Get Ready!");
  }

  requestAnimationFrame(render);
}

function drawCourt() {
  ctx.strokeStyle = "#444";
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 0);
  ctx.lineTo(canvas.width / 2, canvas.height);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawScore(players, score) {
  ctx.font = "20px Arial";
  ctx.fillStyle = "white";
  ctx.textAlign = "center";

  ctx.fillText(`${players.left.displayName} : ${score.left}`, canvas.width * 0.25, 30);
  ctx.fillText(`${players.right.displayName} : ${score.right}`, canvas.width * 0.75, 30);
}

function drawCenterText(text) {
  ctx.font = "28px Arial";
  ctx.fillStyle = "yellow";
  ctx.textAlign = "center";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
}

function setStatus(text) {
  statusBox.innerText = text;
}

// Start rendering
render();
