document.addEventListener("DOMContentLoaded", () => {
  const GATEWAY = window.location.origin;
  let JWT = localStorage.getItem("jwt") || "";

  const el = (id) => document.getElementById(id);
  const set = (id, txt) => { const t = el(id); if (t) t.textContent = txt; };
  const append = (id, txt) => {
    const t = el(id);
    if (!t) return;
    t.textContent += "\n" + txt;
    t.scrollTop = t.scrollHeight;
  };
  const authHeader = () => (JWT ? { Authorization: `Bearer ${JWT}` } : {});

  // ---------------- NAVIGATION UPDATER ----------------
  function updateNavLinks() {
    const loggedIn = !!JWT;
    const warning = el("nav_warning");
    const linkTournament = el("link_tournament");
    const linkLeaderboard = el("link_leaderboard");

    if (!warning || !linkTournament || !linkLeaderboard) return;

    if (loggedIn) {
      warning.classList.add("hidden");
      linkTournament.classList.remove("opacity-50", "pointer-events-none");
      linkLeaderboard.classList.remove("opacity-50", "pointer-events-none");
    } else {
      warning.classList.remove("hidden");
      linkTournament.classList.add("opacity-50", "pointer-events-none");
      linkLeaderboard.classList.add("opacity-50", "pointer-events-none");
    }
  }

  // ---------------- TOKEN DISPLAY ----------------
  const updateTokenDisplay = () => {
    const box = el("token_box");
    if (!box) return;
    box.textContent = JWT ? JWT.substring(0, 25) + "... (stored)" : "(no token)";
    updateNavLinks();
  };
  updateTokenDisplay();


  // ---------------- REGISTER ----------------
  el("btn_register")?.addEventListener("click", async () => {
    const body = {
      email: el("reg_email").value,
      password: el("reg_pass").value,
      display_name: el("reg_display").value,
    };
    set("reg_result", "Registering...");
    try {
      const r = await fetch(`${GATEWAY}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      set("reg_result", JSON.stringify(await r.json(), null, 2));
    } catch (err) {
      set("reg_result", "❌ " + err.message);
    }
  });


  // ---------------- LOGIN ----------------
  el("btn_login")?.addEventListener("click", async () => {
    const body = {
      email: el("login_email").value,
      password: el("login_pass").value,
      twofa_code: el("login_2fa").value || undefined,
    };
    set("login_result", "Logging in...");
    try {
      const r = await fetch(`${GATEWAY}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await r.json();
      if (json.token) {
        JWT = json.token;
        localStorage.setItem("jwt", JWT);
        updateTokenDisplay();
        set("login_result", "✅ Logged in successfully");
      } else {
        set("login_result", JSON.stringify(json, null, 2));
      }
    } catch (err) {
      set("login_result", "❌ " + err.message);
    }
  });


  // ---------------- LOGOUT ----------------
  el("btn_logout")?.addEventListener("click", () => {
    JWT = "";
    localStorage.removeItem("jwt");
    updateTokenDisplay();
    set("login_result", "Logged out");
  });


  // ---------------- PROFILE ----------------
  el("btn_get_profile")?.addEventListener("click", async () => {
    if (!JWT) return set("profile_result", "⚠️ Login first.");
    const decoded = JSON.parse(atob(JWT.split(".")[1]));
    const id = decoded.userId;

    set("profile_result", "Loading...");
    try {
      const r = await fetch(`${GATEWAY}/api/user/${id}`, { headers: authHeader() });
      set("profile_result", JSON.stringify(await r.json(), null, 2));
    } catch (err) {
      set("profile_result", "❌ " + err.message);
    }
  });

  el("btn_update_profile")?.addEventListener("click", async () => {
    if (!JWT) return set("profile_result", "⚠️ Login first.");
    const body = {
      display_name: el("update_display").value,
      bio: el("update_bio").value,
    };
    try {
      const r = await fetch(`${GATEWAY}/api/user/me`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify(body),
      });
      set("profile_result", JSON.stringify(await r.json(), null, 2));
    } catch (err) {
      set("profile_result", "❌ " + err.message);
    }
  });


  // ---------------- 2FA ----------------
  el("btn_2fa_setup")?.addEventListener("click", async () => {
    set("twofa_result", "Requesting QR...");
    try {
      const r = await fetch(`${GATEWAY}/api/auth/2fa/setup`, {
        method: "POST",
        headers: authHeader(),
      });
      const json = await r.json();
      if (json.qrCode)
        el("qr_area").innerHTML = `<img src="${json.qrCode}" class="max-w-xs mx-auto" />`;
      set("twofa_result", JSON.stringify(json, null, 2));
    } catch (err) {
      set("twofa_result", "❌ " + err.message);
    }
  });

  el("btn_2fa_verify")?.addEventListener("click", async () => {
    const code = el("twofa_code_input").value;
    set("twofa_result", "Verifying...");
    try {
      const r = await fetch(`${GATEWAY}/api/auth/2fa/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ code }),
      });
      set("twofa_result", JSON.stringify(await r.json(), null, 2));
    } catch (err) {
      set("twofa_result", "❌ " + err.message);
    }
  });


  // ---------------- PONG BUTTON ----------------
  const playBtn = el("btn_play_pong");
  if (playBtn) {
    playBtn.addEventListener("click", () => {
      if (!JWT) return alert("⚠️ Login first!");
      window.location.href = "./pong.html";
    });
  }

});
