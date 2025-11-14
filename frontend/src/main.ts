document.addEventListener("DOMContentLoaded", () => {
  const GATEWAY = window.location.origin;
  const CHAT_WS = "ws://localhost:3000/api/chat/ws";
  let JWT = localStorage.getItem("jwt") || "";

  // --- Helpers ---
  const el = (id) => document.getElementById(id);
  const set = (id, txt) => {
    const target = el(id);
    if (target) target.textContent = txt;
  };
  const append = (id, txt) => {
    const target = el(id);
    if (!target) return;
    target.textContent += "\n" + txt;
    target.scrollTop = target.scrollHeight;
  };
  const authHeader = () => (JWT ? { Authorization: `Bearer ${JWT}` } : {});

  // --- Token display ---
  const updateTokenDisplay = () => {
    const tokenBox = el("token_box");
    if (!tokenBox) return;
    tokenBox.textContent = JWT
      ? JWT.substring(0, 25) + "... (stored)"
      : "(no token)";
  };
  updateTokenDisplay();

  // --- Register ---
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
      const json = await r.json();
      set("reg_result", JSON.stringify(json, null, 2));
    } catch (err) {
      set("reg_result", "❌ " + err.message);
    }
  });

  // --- Login ---
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

  // --- Logout ---
  el("btn_logout")?.addEventListener("click", () => {
    JWT = "";
    localStorage.removeItem("jwt");
    updateTokenDisplay();
    set("login_result", "Logged out");
  });

  // --- Get Profile ---
  el("btn_get_profile")?.addEventListener("click", async () => {
    if (!JWT) return set("profile_result", "⚠️ No token, please login first.");
    const decoded = JSON.parse(atob(JWT.split(".")[1]));
    const id = decoded.userId;
    set("profile_result", "Loading profile...");
    try {
      const r = await fetch(`${GATEWAY}/api/user/${id}`, { headers: authHeader() });
      if (r.status === 401)
        return set("profile_result", "❌ Unauthorized (invalid token)");
      const json = await r.json();
      set("profile_result", JSON.stringify(json, null, 2));
    } catch (err) {
      set("profile_result", "❌ " + err.message);
    }
  });

  // --- Update Profile ---
  el("btn_update_profile")?.addEventListener("click", async () => {
    if (!JWT) return set("profile_result", "⚠️ No token, please login first.");
    const body = {
      display_name: el("update_display").value,
      bio: el("update_bio").value,
    };
    set("profile_result", "Updating profile...");
    try {
      const r = await fetch(`${GATEWAY}/api/user/me`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify(body),
      });
      const json = await r.json();
      set("profile_result", JSON.stringify(json, null, 2));
    } catch (err) {
      set("profile_result", "❌ " + err.message);
    }
  });

  // --- 2FA Setup ---
  el("btn_2fa_setup")?.addEventListener("click", async () => {
    set("twofa_result", "Requesting QR...");
    try {
      const r = await fetch(`${GATEWAY}/api/auth/2fa/setup`, {
        method: "POST",
        headers: authHeader(),
      });
      const json = await r.json();
      if (json.qrCode)
        el("qr_area").innerHTML = `<img src="${json.qrCode}" class="max-w-xs" />`;
      set("twofa_result", JSON.stringify(json, null, 2));
    } catch (err) {
      set("twofa_result", "❌ " + err.message);
    }
  });

  // --- 2FA Verify ---
  el("btn_2fa_verify")?.addEventListener("click", async () => {
    const code = el("twofa_code_input").value;
    set("twofa_result", "Verifying...");
    try {
      const r = await fetch(`${GATEWAY}/api/auth/2fa/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ code }),
      });
      const json = await r.json();
      set("twofa_result", JSON.stringify(json, null, 2));
    } catch (err) {
      set("twofa_result", "❌ " + err.message);
    }
  });

  // --- Chat Section (Basic) ---
  let socket = null;
  let currentRoom = null;

  el("btn_chat_connect")?.addEventListener("click", () => {
    if (socket && socket.connected) {
      append("chat_messages", "[system] Already connected.");
      return;
    }

    const roomName = el("chat_room").value.trim() || "lobby";
    currentRoom = roomName;
    append("chat_messages", `🔗 Connecting to room "${roomName}"...`);

    socket = io({ transports: ["websocket"] });

    socket.on("connect", () => {
      append("chat_messages", `✅ Connected! socket.id=${socket.id}`);
      socket.emit("join", roomName);
    });

    socket.on("system", (msg) => append("chat_messages", `🟢 ${msg}`));
    socket.on("message", (data) =>
      append("chat_messages", `💬 [${data.room}] <User ${data.senderId}>: ${data.content}`)
    );
    socket.on("disconnect", (r) => append("chat_messages", `🔴 Disconnected (${r})`));
    socket.on("connect_error", (e) => append("chat_messages", `⚠️ ${e.message}`));
  });

  el("btn_chat_disconnect")?.addEventListener("click", () => {
    if (socket) {
      socket.disconnect();
      append("chat_messages", "🔴 Disconnected manually.");
      socket = null;
    } else append("chat_messages", "⚠️ Not connected.");
  });

  el("btn_chat_send")?.addEventListener("click", () => {
    if (!socket || !socket.connected)
      return append("chat_messages", "⚠️ Not connected.");
    const msg = el("chat_input").value.trim();
    if (!msg) return;
    socket.emit("message", { room: currentRoom || "lobby", content: msg });
    el("chat_input").value = "";
    append("chat_messages", `📤 You: ${msg}`);
  });

  // --- 🎾 PLAY PONG ---
  const playBtn = el("btn_play_pong");
  if (playBtn) {
    playBtn.addEventListener("click", () => {
      const JWT = localStorage.getItem("jwt");
      if (!JWT) {
        alert("⚠️ Please log in first!");
        return;
      }
      window.location.href = "./pong.html"; // ✅ same origin keeps JWT
    });
  }
});
