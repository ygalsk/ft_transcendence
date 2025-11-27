// tournament.ts

const API = window.location.origin;

function $(id: string) {
  return document.getElementById(id) as HTMLElement;
}

function text(id: string, value: string) {
  const el = $(id);
  if (el) el.textContent = value;
}

function authHeader() {
  const JWT = localStorage.getItem("jwt");
  return JWT ? { Authorization: `Bearer ${JWT}` } : {};
}

// ---------------- LOGIN CHECK ----------------
window.addEventListener("DOMContentLoaded", () => {
  const JWT = localStorage.getItem("jwt");

  if (!JWT) {
    $("login_warning").classList.remove("hidden");
    $("main_ui").classList.add("hidden");
    return;
  }

  $("login_warning").classList.add("hidden");
  $("main_ui").classList.remove("hidden");

  bindTournamentEvents();
});

// ---------------- EVENT BINDINGS ----------------
function bindTournamentEvents() {

  // Load tournament info
  $("btn_load_tournament").addEventListener("click", async () => {
    const id = Number(($("tournament_id_input") as HTMLInputElement).value);
    if (!id) return text("tournament_info", "Enter tournament ID");

    text("tournament_info", "Loading...");

    const r = await fetch(`${API}/api/user/tournaments/${id}`, {
      headers: authHeader(),
    });
    text("tournament_info", JSON.stringify(await r.json(), null, 2));
  });

  // Join tournament with alias
  $("btn_join_tournament").addEventListener("click", async () => {
    const id = Number(($("join_tournament_id") as HTMLInputElement).value);
    const alias = ($("alias_input") as HTMLInputElement).value.trim();

    if (!id || !alias)
      return text("join_result", "Enter tournament ID + alias");

    text("join_result", "Joining...");

    const r = await fetch(`${API}/api/user/tournaments/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ tournamentId: id, alias }),
    });

    text("join_result", JSON.stringify(await r.json(), null, 2));
  });

  // Start tournament
  $("btn_start_tournament").addEventListener("click", async () => {
    const id = Number(($("start_tournament_id") as HTMLInputElement).value);
    if (!id) return text("start_result", "Enter tournament ID");

    text("start_result", "Starting...");

    const r = await fetch(`${API}/api/user/tournaments/${id}/start`, {
      method: "POST",
      headers: authHeader(),
    });

    text("start_result", JSON.stringify(await r.json(), null, 2));
  });

  // View bracket
  $("btn_view_bracket").addEventListener("click", async () => {
    const id = Number(($("bracket_tournament_id") as HTMLInputElement).value);
    const round = Number(($("bracket_round") as HTMLInputElement).value);

    if (!id || !round)
      return text("bracket_result", "Enter tournament ID + round");

    text("bracket_result", "Loading...");

    const r = await fetch(`${API}/api/user/tournaments/${id}/round/${round}`, {
      headers: authHeader(),
    });

    text("bracket_result", JSON.stringify(await r.json(), null, 2));
  });

  // Next Match
  $("btn_next_match").addEventListener("click", async () => {
    const id = Number(($("nextmatch_tournament_id") as HTMLInputElement).value);
    if (!id) return text("nextmatch_result", "Enter tournament ID");

    const JWT = localStorage.getItem("jwt");
    const decoded = JSON.parse(atob(JWT.split(".")[1]));
    const userId = decoded.userId;

    text("nextmatch_result", "Checking...");

    const r = await fetch(
      `${API}/api/user/tournaments/${id}/next-match?userId=${userId}`,
      { headers: authHeader() }
    );

    text("nextmatch_result", JSON.stringify(await r.json(), null, 2));
  });
}
