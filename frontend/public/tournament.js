//
// Tournament Lobby Script
//

const API_BASE = "/api/user";

let currentTournamentId = null;
let currentUserId = null;

window.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  currentUserId = Number(localStorage.getItem("userId"));

  if (!token || !currentUserId) {
    alert("You must be logged in to access tournaments.");
    return;
  }

  document.getElementById("btnLoadTournament")
    .addEventListener("click", loadTournament);

  document.getElementById("btnJoin")
    .addEventListener("click", joinTournament);

  document.getElementById("btnStartTournament")
    .addEventListener("click", startTournament);

  document.getElementById("btnNextMatch")
    .addEventListener("click", goToNextMatch);
});


// -----------------------------------------------------------
// Load tournament
// -----------------------------------------------------------
async function loadTournament() {
  const id = Number(document.getElementById("tournamentIdInput").value);
  if (!id) return alert("Enter a tournament ID");

  currentTournamentId = id;

  const res = await fetch(`${API_BASE}/tournaments/${id}`);
  if (!res.ok) return alert("Tournament not found");

  const data = await res.json();
  showTournament(data);
  pollNextMatch();
}


// -----------------------------------------------------------
// Display tournament info
// -----------------------------------------------------------
function showTournament(data) {
  const box = document.getElementById("tournamentInfo");
  box.style.display = "block";

  box.innerHTML = `
    <h3>${data.tournament.name}</h3>
    <p>Status: <b>${data.tournament.status}</b></p>
    <p>Max players: ${data.tournament.max_players}</p>
    <p>Started: ${data.tournament.started_at ?? "Not yet"}</p>
  `;

  // Show join box only if pending
  if (data.tournament.status === "pending") {
    document.getElementById("joinBox").style.display = "block";
  } else {
    document.getElementById("joinBox").style.display = "none";
  }

  // Only creator can start
  if (
    data.tournament.status === "pending" &&
    data.tournament.created_by === currentUserId
  ) {
    document.getElementById("startBox").style.display = "block";
  } else {
    document.getElementById("startBox").style.display = "none";
  }

  // Players list
  const list = document.getElementById("playersList");
  const container = document.getElementById("players");

  list.style.display = "block";
  container.innerHTML = "";

  data.players.forEach(p => {
    container.innerHTML += `
      <div class="player">
        <b>${p.alias}</b> (ELO: ${p.elo})
      </div>
    `;
  });

  // Next match box visible only after start
  if (data.tournament.status === "running") {
    document.getElementById("nextMatchBox").style.display = "block";
  } else {
    document.getElementById("nextMatchBox").style.display = "none";
  }
}


// -----------------------------------------------------------
// Join tournament
// -----------------------------------------------------------
async function joinTournament() {
  const alias = document.getElementById("aliasInput").value;
  if (!alias.trim()) return alert("Alias required");

  const res = await fetch(`${API_BASE}/tournaments/join`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + localStorage.getItem("token"),
    },
    body: JSON.stringify({
      tournamentId: currentTournamentId,
      alias,
    }),
  });

  const data = await res.json();
  if (!res.ok) return alert(data.error || "Join failed");

  alert("Joined tournament as: " + alias);
  loadTournament();
}


// -----------------------------------------------------------
// Start tournament
// -----------------------------------------------------------
async function startTournament() {
  const res = await fetch(`${API_BASE}/tournaments/${currentTournamentId}/start`, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + localStorage.getItem("token"),
    },
  });

  const data = await res.json();
  if (!res.ok) return alert(data.error);

  alert("Tournament started!");
  loadTournament();
}


// -----------------------------------------------------------
// Poll next match every 4 seconds
// -----------------------------------------------------------
function pollNextMatch() {
  setInterval(checkNextMatch, 4000);
}


// -----------------------------------------------------------
// Ask backend what my next match is
// -----------------------------------------------------------
async function checkNextMatch() {
  if (!currentTournamentId || !currentUserId) return;

  const res = await fetch(
    `${API_BASE}/tournaments/${currentTournamentId}/next-match?userId=${currentUserId}`
  );

  const data = await res.json();

  const statusBox = document.getElementById("nextMatchStatus");
  const btn = document.getElementById("btnNextMatch");

  if (data.status === "ready") {
    statusBox.innerHTML = `
      Next match is ready!<br>
      Match #${data.matchId}, Round ${data.round}
    `;
    btn.dataset.matchId = data.matchId;
    btn.style.display = "block";
  }

  else if (data.status === "running") {
    statusBox.innerHTML = "Your match is already running!";
    btn.dataset.matchId = data.matchId;
    btn.style.display = "block";
  }

  else if (data.status === "eliminated") {
    statusBox.innerHTML = "❌ You have been eliminated.";
    btn.style.display = "none";
  }

  else if (data.status === "finished") {
    statusBox.innerHTML = "🏆 Tournament finished!";
    btn.style.display = "none";
  }

  else {
    statusBox.innerHTML = "Waiting for your next match…";
    btn.style.display = "none";
  }
}


// -----------------------------------------------------------
// JOIN the match → open Pong
// -----------------------------------------------------------
function goToNextMatch() {
  const matchId = document.getElementById("btnNextMatch").dataset.matchId;

  // The matchId is numeric DB ID.  
  // We need to fetch the actual pong_match_id.
  window.location.href = `/pong.html?matchId=${matchId}&tournamentId=${currentTournamentId}`;
}
