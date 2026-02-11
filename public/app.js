const $ = (id) => document.getElementById(id);

let state = {
  me: null,
  tickets: [],
  activeJid: null,
  activeHuman: false
};

async function api(url, opts = {}) {
  const r = await fetch(url, { credentials: "include", ...opts });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) {
    location.href = "/login.html";
    return null;
  }
  return data;
}

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

function setWaBadge(status) {
  const badge = $("waBadge");
  badge.textContent = `WhatsApp: ${status}`;
  badge.style.borderColor =
    status === "online" ? "rgba(46,229,157,.35)" :
    status === "qr" ? "rgba(255,204,102,.35)" :
    "rgba(255,255,255,.10)";
}

function renderTickets(list) {
  const q = $("search").value.trim().toLowerCase();
  const el = $("ticketList");
  el.innerHTML = "";

  const filtered = list.filter((t) => !q || (t.displayName || "").toLowerCase().includes(q) || (t.jid || "").includes(q));

  for (const t of filtered) {
    const div = document.createElement("div");
    div.className = "ticket" + (t.jid === state.activeJid ? " active" : "");
    const unread = t.unread ? `<span class="pill unread">${t.unread} novo</span>` : "";
    const closed = t.status === "closed" ? `<span class="pill closed">fechado</span>` : "";
    div.innerHTML = `
      <div class="row">
        <div class="name">${escapeHtml(t.displayName || t.jid)}</div>
        <div style="display:flex; gap:8px; align-items:center;">
          ${closed}
          ${unread}
          <span class="meta">${fmtTime(t.updatedAt || Date.now())}</span>
        </div>
      </div>
      <div class="last">${escapeHtml(t.lastMessage || "")}</div>
    `;
    div.onclick = () => openTicket(t.jid);
    el.appendChild(div);
  }
}

function renderMessages(messages) {
  const el = $("messages");
  el.innerHTML = "";
  for (const m of messages) {
    const b = document.createElement("div");
    b.className = "bubble " + (m.direction === "out" ? "out" : "in");
    b.innerHTML = `
      <div>${escapeHtml(m.text || "")}</div>
      <div class="time">${fmtTime(m.at || Date.now())}</div>
    `;
    el.appendChild(b);
  }
  el.scrollTop = el.scrollHeight;
}

async function refreshTickets() {
  const data = await api("/api/tickets");
  if (!data?.ok) return;
  state.tickets = data.tickets || [];
  setWaBadge(data.waStatus || "offline");
  renderTickets(state.tickets);
}

async function openTicket(jid) {
  state.activeJid = jid;
  $("chatTitle").textContent = jid;
  $("chatSub").textContent = "Carregando...";

  await refreshTickets();
  const data = await api(`/api/tickets/${encodeURIComponent(jid)}/messages`);
  if (!data?.ok) return;

  $("chatSub").textContent = "Conversa";
  renderMessages(data.messages || []);
}

async function sendMessage(text) {
  const jid = state.activeJid;
  if (!jid) return;

  const r = await api(`/api/tickets/${encodeURIComponent(jid)}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });

  if (!r?.ok) alert(r?.error || "Falha ao enviar");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;"
  }[c]));
}

async function init() {
  const me = await api("/api/auth/me");
  if (!me?.ok) return;
  state.me = me.user;

  setWaBadge(me.waStatus || "offline");

  $("logoutBtn").onclick = async () => {
    await api("/api/auth/logout", { method: "POST" });
    location.href = "/login.html";
  };

  $("search").addEventListener("input", () => renderTickets(state.tickets));

  $("sendForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("text");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    await sendMessage(text);
  });

  $("humanBtn").onclick = async () => {
    const jid = state.activeJid;
    if (!jid) return alert("Selecione uma conversa");
    state.activeHuman = !state.activeHuman;
    const r = await api(`/api/tickets/${encodeURIComponent(jid)}/human-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: state.activeHuman })
    });
    if (!r?.ok) return alert(r?.error || "Falha");
    $("humanBtn").textContent = r.humanMode ? "Modo humano: ON" : "Modo humano";
  };

  $("closeBtn").onclick = async () => {
    const jid = state.activeJid;
    if (!jid) return alert("Selecione uma conversa");
    const ok = confirm("Fechar este ticket?");
    if (!ok) return;
    const r = await api(`/api/tickets/${encodeURIComponent(jid)}/close`, { method: "POST" });
    if (!r?.ok) return alert(r?.error || "Falha");
    await refreshTickets();
  };

  const ev = new EventSource("/api/events", { withCredentials: true });
  ev.addEventListener("wa", (e) => {
    const data = JSON.parse(e.data);
    setWaBadge(data.waStatus || "offline");
  });
  ev.addEventListener("message", async (e) => {
    const data = JSON.parse(e.data);
    await refreshTickets();

    if (data.jid && data.jid === state.activeJid) {
      const hist = await api(`/api/tickets/${encodeURIComponent(state.activeJid)}/messages`);
      if (hist?.ok) renderMessages(hist.messages || []);
    }
  });

  await refreshTickets();
}

init();
