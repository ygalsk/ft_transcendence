const API_BASE = "/api/user"; // Adjusted for Caddy proxy

async function loadLeaderboard() {
  const tbody = document.getElementById("leaderboardBody");
  tbody.innerHTML = "<tr><td colspan='5'>Loading...</td></tr>";

  try {
    const res = await fetch(`${API_BASE}/leaderboard`);
    if (!res.ok) {
      tbody.innerHTML = `<tr><td colspan='5'>Failed to load leaderboard.</td></tr>`;
      return;
    }

    const data = await res.json();
    const players = data.leaderboard || [];

    tbody.innerHTML = "";

    if (players.length === 0) {
      tbody.innerHTML = "<tr><td colspan='5'>No players yet.</td></tr>";
      return;
    }

    players.forEach((p, index) => {
      const row = document.createElement("tr");

      row.innerHTML = `
        <td>${index + 1}</td>
        <td>${p.display_name}</td>
        <td>${p.elo ?? "—"}</td>
        <td>${p.wins ?? 0}</td>
        <td>${p.losses ?? 0}</td>
      `;

      tbody.appendChild(row);
    });
  } catch (err) {
    console.error("Leaderboard error:", err);
    tbody.innerHTML = `<tr><td colspan='5'>Error loading leaderboard.</td></tr>`;
  }
}

// Refresh button
document.getElementById("refreshBtn").addEventListener("click", loadLeaderboard);

// Auto-refresh every 10 seconds
setInterval(loadLeaderboard, 10000);

// Initial load
loadLeaderboard();
