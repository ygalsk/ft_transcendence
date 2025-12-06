// src/tournament.ts

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

// --------------------------------------------------
// LOGIN CHECK
// --------------------------------------------------
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

// --------------------------------------------------
// ALL BUTTON HANDLERS
// --------------------------------------------------
function bindTournamentEvents() {

  // CREATE
  $("btn_create_tournament")?.addEventListener("click", async () => {
    const name = ( $("create_name") as HTMLInputElement ).value.trim();
    const max = Number(( $("create_max_players") as HTMLInputElement ).value);

    if (!name || !max)
      return text("create_result", "Enter name + max players");

    text("create_result", "Creating...");

    const r = await fetch(`${API}/api/user/tournaments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({
        name,
        max_players: max,
        is_public: true,
      }),
    });

    text("create_result", JSON.stringify(await r.json(), null, 2));
  });

  // LOAD
  $("btn_load_tournament")?.addEventListener("click", async () => {
    const id = Number(( $("tournament_id_input") as HTMLInputElement ).value);
    if (!id) return text("tournament_info", "Enter tournament ID");

    text("tournament_info", "Loading...");

    const r = await fetch(`${API}/api/user/tournaments/${id}`, {
      headers: authHeader(),
    });

    text("tournament_info", JSON.stringify(await r.json(), null, 2));
  });

  // JOIN
  $("btn_join_tournament")?.addEventListener("click", async () => {
    const id = Number(( $("join_tournament_id") as HTMLInputElement ).value);
    const alias = ( $("alias_input") as HTMLInputElement ).value.trim();

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

  // START
  $("btn_start_tournament")?.addEventListener("click", async () => {
    const id = Number(( $("start_tournament_id") as HTMLInputElement ).value);
    if (!id) return text("start_result", "Enter tournament ID");

    text("start_result", "Starting...");

    const r = await fetch(`${API}/api/user/tournaments/${id}/start`, {
      method: "POST",
      headers: authHeader(),
    });

    text("start_result", JSON.stringify(await r.json(), null, 2));
  });

  // BRACKET
  $("btn_view_bracket")?.addEventListener("click", async () => {
    const id = Number(( $("bracket_tournament_id") as HTMLInputElement ).value);
    const round = Number(( $("bracket_round") as HTMLInputElement ).value);

    if (!id || !round)
      return text("bracket_result", "Enter tournament ID + round");

    text("bracket_result", "Loading...");

    const r = await fetch(
      `${API}/api/user/tournaments/${id}/round/${round}`,
      { headers: authHeader() }
    );

    text("bracket_result", JSON.stringify(await r.json(), null, 2));
  });

  // NEXT MATCH
  $("btn_next_match")?.addEventListener("click", async () => {
    const id = Number(( $("nextmatch_tournament_id") as HTMLInputElement ).value);
    if (!id) return text("nextmatch_result", "Enter tournament ID");

    const JWT = localStorage.getItem("jwt");
    const decoded = JSON.parse(atob(JWT!.split(".")[1]));
    const userId = decoded.userId;

    text("nextmatch_result", "Checking...");

    const r = await fetch(
      `${API}/api/user/tournaments/${id}/next-match?userId=${userId}`,
      { headers: authHeader() }
    );

    const data = await r.json();
    text("nextmatch_result", JSON.stringify(data, null, 2));

    if (data.status === "ready" || data.status === "running") {
      const url =
        `/pong.html?` +
        `matchId=${encodeURIComponent(data.matchKey)}` +
        `&tId=${encodeURIComponent(data.tournamentId)}` +
        `&mId=${encodeURIComponent(data.tournamentMatchId)}` +
        `&alias=${encodeURIComponent(data.yourAlias || "")}` +
        `&opponent=${encodeURIComponent(data.opponentAlias || "")}`;

      window.location.href = url;
    }

  });
}
