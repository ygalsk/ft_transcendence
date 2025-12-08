// Enhanced tournament lobby

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

let selectedTournament: { id: number; name: string; status: string } | null = null;
let cachedBracket: any = null;
let cachedLeaderboard: any = null;

function decodeUserId(): number | null {
  const JWT = localStorage.getItem("jwt");
  if (!JWT) return null;
  try {
    const decoded = JSON.parse(atob(JWT.split(".")[1]));
    return decoded.userId ?? null;
  } catch {
    return null;
  }
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
  loadOpenTournaments();
  restoreSelectedTournament();
});

// --------------------------------------------------
// Event bindings
// --------------------------------------------------
function bindTournamentEvents() {
  // Create
  $("btn_create_tournament")?.addEventListener("click", createTournament);

  // Refresh open
  $("btn_refresh_open")?.addEventListener("click", () => loadOpenTournaments());
  $("btn_load_all_open")?.addEventListener("click", () => loadOpenTournaments("all"));

  // Search
  $("search_name")?.addEventListener("input", () => {
    loadOpenTournaments();
  });

  // Delegated actions for open tournaments
  $("open_list")?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (!target) return;
    const row = target.closest("[data-id]") as HTMLElement | null;
    if (!row) return;
    const id = Number(row.dataset.id);
    const name = row.dataset.name || `Tournament ${id}`;
    const status = row.dataset.status || "pending";

    if (target.dataset.action === "join") {
      joinTournament(id);
    } else if (target.dataset.action === "select") {
      setSelectedTournament({ id, name, status });
    }
  });

  // Actions on selected tournament
  $("btn_go_match")?.addEventListener("click", goToMatch);
  $("btn_view_bracket")?.addEventListener("click", viewCurrentBracket);
  $("btn_view_leaderboard")?.addEventListener("click", viewLeaderboard);
  $("btn_start_tournament")?.addEventListener("click", startTournament);
}

// --------------------------------------------------
// API calls
// --------------------------------------------------
async function loadOpenTournaments(status: "open" | "all" = "open") {
  text("open_list_result", "Loading...");
  try {
    const q = ( $("search_name") as HTMLInputElement )?.value?.trim() || "";
    const res = await fetch(`${API}/api/user/tournaments?status=${status}&q=${encodeURIComponent(q)}`, {
      headers: authHeader(),
    });
    const data = await res.json();
    renderOpenTournaments(data.tournaments || []);
    text("open_list_result", `${(data.tournaments || []).length} shown`);
  } catch (err: any) {
    text("open_list_result", "Failed to load tournaments: " + err.message);
  }
}

async function createTournament() {
  const name = ( $("create_name") as HTMLInputElement ).value.trim();
  const max = Number(( $("create_max_players") as HTMLInputElement ).value);

  if (!name || !max) {
    return text("create_result", "Enter name + max players");
  }

  text("create_result", "Creating...");
  try {
    const r = await fetch(`${API}/api/user/tournaments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({
        name,
        max_players: max,
        is_public: true,
      }),
    });
    const data = await r.json();
    text(
      "create_result",
      `${r.ok ? "✅" : "❌"} ${JSON.stringify(data, null, 2)}`
    );
    loadOpenTournaments();
  } catch (err: any) {
    text("create_result", "Error: " + err.message);
  }
}

async function joinTournament(id: number) {
  const alias = prompt("Enter your alias for this tournament:");
  if (!alias) return;

  text("open_list_result", `Joining ${id}...`);
  try {
    const r = await fetch(`${API}/api/user/tournaments/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ tournamentId: id, alias }),
    });
    const data = await r.json();
    text("open_list_result", JSON.stringify(data, null, 2));
    loadOpenTournaments();
  } catch (err: any) {
    text("open_list_result", "Error: " + err.message);
  }
}

async function goToMatch() {
  if (!selectedTournament) {
    return text("selected_result", "Select a tournament first.");
  }
  const JWT = localStorage.getItem("jwt");
  if (!JWT) return text("selected_result", "Login required");
  const decoded = JSON.parse(atob(JWT.split(".")[1]));
  const userId = decoded.userId;

  text("selected_result", "Checking next match...");
  const url = `${API}/api/user/tournaments/${selectedTournament.id}/next-match?userId=${userId}`;
  try {
    const r = await fetch(url, { headers: authHeader() });
    const data = await r.json();
    text("selected_result", JSON.stringify(data, null, 2));
    renderNextMatchInfo(data);
    // refresh bracket view so pairing list is current
    await viewCurrentBracket();

    // If tournament already finished, make sure final results are shown
    if (data.status === "finished") {
      await viewCurrentBracket();
    }

    if (data.status === "ready" || data.status === "running") {
      const redirect =
        `/pong.html?` +
        `matchId=${encodeURIComponent(data.matchKey)}` +
        `&tId=${encodeURIComponent(data.tournamentId)}` +
        `&mId=${encodeURIComponent(data.tournamentMatchId)}` +
        `&alias=${encodeURIComponent(data.yourAlias || "")}` +
        `&opponent=${encodeURIComponent(data.opponentAlias || "")}`;
      window.location.href = redirect;
    }
  } catch (err: any) {
    text("selected_result", "Error: " + err.message);
  }
}

async function viewCurrentBracket() {
  if (!selectedTournament) return text("bracket_result", "Select a tournament first.");
  const table = $("bracket_table");
  if (table) table.textContent = "Loading current round...";
  try {
    const r = await fetch(
      `${API}/api/user/tournaments/${selectedTournament.id}/bracket`,
      { headers: authHeader() }
    );
    const data = await r.json();
    cachedBracket = data;
    cachedLeaderboard = null;
    renderBracket(data);
    renderNextMatchFromBracket();
    const finished = bracketFinished(data);
    if (finished) {
      await loadFinalResults();
    } else {
      setFinalResults("Tournament not finished yet.");
    }
  } catch (err: any) {
    if (table) table.textContent = "Error: " + err.message;
  }
}

async function viewLeaderboard() {
  if (!selectedTournament) return text("leaderboard_result", "Select a tournament first.");
  text("leaderboard_result", "Loading leaderboard...");
  try {
    const r = await fetch(
      `${API}/api/user/tournaments/${selectedTournament.id}/leaderboard`,
      { headers: authHeader() }
    );
    const data = await r.json();
    text("leaderboard_result", JSON.stringify(data, null, 2));
  } catch (err: any) {
    text("leaderboard_result", "Error: " + err.message);
  }
}

async function startTournament() {
  if (!selectedTournament) return text("selected_result", "Select a tournament first.");
  text("selected_result", "Starting...");
  try {
    const r = await fetch(
      `${API}/api/user/tournaments/${selectedTournament.id}/start`,
      { method: "POST", headers: authHeader() }
    );
    const data = await r.json();
    text("selected_result", JSON.stringify(data, null, 2));
    loadOpenTournaments();
  } catch (err: any) {
    text("selected_result", "Error: " + err.message);
  }
}

// --------------------------------------------------
// Render helpers
// --------------------------------------------------
function renderOpenTournaments(items: any[]) {
  const tbody = $("open_list");
  if (!tbody) return;
  tbody.innerHTML = "";
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-2 text-slate-400">No open tournaments</td></tr>`;
    return;
  }

  for (const t of items) {
    const tr = document.createElement("tr");
    tr.dataset.id = String(t.id);
    tr.dataset.name = t.name;
    tr.dataset.status = t.status;
    tr.innerHTML = `
      <td class="py-1">${t.name}</td>
      <td class="py-1">${t.status}</td>
      <td class="py-1">${t.player_count}/${t.max_players}</td>
      <td class="py-1">${t.can_join ? "Yes" : "No"}</td>
      <td class="py-1 space-x-2">
        <button data-action="select" class="bg-slate-700 px-2 py-1 rounded text-xs hover:bg-slate-600">Select</button>
        <button data-action="join" class="bg-emerald-600 px-2 py-1 rounded text-xs hover:bg-emerald-500" ${t.can_join ? "" : "disabled"}>Join</button>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

function setSelectedTournament(t: { id: number; name: string; status: string }) {
  selectedTournament = t;
  localStorage.setItem("lastTournamentId", String(t.id));
  text("selected_badge", `${t.name} (#${t.id})`);
  text(
    "selected_info",
    `ID: ${t.id}\nName: ${t.name}\nStatus: ${t.status}`
  );
  text("selected_result", "");
  const nextInfo = $("next_match_info");
  if (nextInfo) nextInfo.textContent = "Select \"Go to match\" to see your pairing.";
  cachedBracket = null;
  cachedLeaderboard = null;
  const table = $("bracket_table");
  if (table) table.textContent = "";
  setFinalResults("Tournament not finished yet.");
}

async function restoreSelectedTournament() {
  const lastId = localStorage.getItem("lastTournamentId");
  if (!lastId) return;
  try {
    const r = await fetch(`${API}/api/user/tournaments/${lastId}`, {
      headers: authHeader(),
    });
    if (!r.ok) return;
    const data = await r.json();
    setSelectedTournament({
      id: data.tournament.id,
      name: data.tournament.name,
      status: data.tournament.status,
    });
  } catch (_) {
    // ignore
  }
}

// Display helpers
function renderNextMatchInfo(data: any) {
  const el = $("next_match_info");
  if (!el) return;
  if (!data || !data.status) {
    el.textContent = "No data yet.";
    return;
  }
  if (data.status === "ready" || data.status === "running") {
    const opponent = data.opponentAlias || "TBD";
    el.textContent = `Round ${data.round ?? "?"}: You vs ${opponent}`;
    return;
  }
  if (data.status === "waiting") {
    el.textContent = "No match yet. Waiting for bracket to advance.";
    return;
  }
  if (data.status === "finished" || data.status === "eliminated") {
    el.textContent = `Tournament status: ${data.status}`;
    return;
  }
  el.textContent = JSON.stringify(data);
}

function renderBracket(data: any) {
  const table = $("bracket_table");
  if (!table) return;
  const rounds = data?.rounds || [];
  if (!rounds.length) {
    table.textContent = "No matches found (not started?).";
    return;
  }
  // Simple columnar bracket: one column per round
  const cols: string[] = [];
  for (const round of rounds) {
    const matches = round.matches as any[];
    const matchCards = matches
      .map((m) => {
        const left = m.left?.alias || "BYE";
        const right = m.right?.alias || "BYE";
        const score = m.score ? `${m.score.left}-${m.score.right}` : "";
        return `
          <div class="border border-slate-600 rounded p-2 mb-2">
            <div class="text-[11px] text-slate-400">#${m.index} • ${m.status}</div>
            <div class="text-[12px]">${left}</div>
            <div class="text-[12px]">${right}</div>
            ${score ? `<div class="text-[11px] text-emerald-300 mt-1">Score: ${score}</div>` : ""}
          </div>
        `;
      })
      .join("");
    cols.push(`
      <div class="min-w-[160px]">
        <div class="text-[12px] font-semibold text-purple-200 mb-2">Round ${round.round}</div>
        ${matchCards}
      </div>
    `);
  }

  table.innerHTML = `<div class="flex gap-4 overflow-x-auto">${cols.join("")}</div>`;
}

function renderNextMatchFromBracket() {
  const userId = decodeUserId();
  if (!userId || !cachedBracket?.rounds) return;
  const rounds = cachedBracket.rounds as any[];
  for (const round of rounds) {
    for (const m of round.matches) {
      const isYourMatch =
        (m.left && m.left.userId === userId) ||
        (m.right && m.right.userId === userId);
      if (!isYourMatch) continue;
      if (m.status === "pending" || m.status === "running") {
        const opponent =
          m.left?.userId === userId ? m.right : m.left;
        renderNextMatchInfo({
          status: m.status,
          round: round.round,
          opponentAlias: opponent?.alias || (opponent ? "Opponent" : "BYE"),
        });
        return;
      }
    }
  }
}

function bracketFinished(data: any): boolean {
  if (!data?.rounds || !data.rounds.length) return false;
  return data.rounds.every((r: any) =>
    (r.matches || []).every((m: any) => m.status === "finished")
  );
}

function setFinalResults(msg: string) {
  const el = $("final_results");
  if (el) el.textContent = msg;
}

async function loadFinalResults() {
  if (!selectedTournament) return;
  try {
    const r = await fetch(
      `${API}/api/user/tournaments/${selectedTournament.id}/leaderboard`,
      { headers: authHeader() }
    );
    const data = await r.json();
    cachedLeaderboard = data;

    const rounds = cachedBracket?.rounds || [];
    const lastRound = rounds[rounds.length - 1];
    const finalMatch = lastRound?.matches?.find((m: any) => m.status === "finished");

    const podiumLines: string[] = [];
    if (finalMatch) {
      const champ =
        finalMatch.winner_id === finalMatch.left?.userId
          ? finalMatch.left?.alias
          : finalMatch.right?.alias;
      const runner =
        finalMatch.winner_id === finalMatch.left?.userId
          ? finalMatch.right?.alias
          : finalMatch.left?.alias;
      if (champ) podiumLines.push(`🥇 Winner: ${champ}`);
      if (runner) podiumLines.push(`🥈 Runner-up: ${runner}`);
      if (finalMatch.score) {
        podiumLines.push(
          `Final score: ${finalMatch.score.left}-${finalMatch.score.right}`
        );
      }
    }

    const lb = data.leaderboard || [];
    const third = lb[2];
    if (third?.alias) {
      podiumLines.push(`🥉 Third: ${third.alias}`);
    }

    if (!podiumLines.length) {
      podiumLines.push("Tournament finished. Results unavailable.");
    }

    setFinalResults(podiumLines.join("\n"));
  } catch (err: any) {
    setFinalResults("Failed to load final results: " + err.message);
  }
}
