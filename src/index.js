import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import { authMiddleware, login, logout, requireAuth } from "./auth.js";
import { startWhatsApp } from "./wa.js";
import { listConversations, getConversation, addMessage, getAgentName, setAgentName } from "./store.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use(authMiddleware(process.env.SESSION_SECRET || "dev"));

let waStatus = "starting";
let sock = null;

app.post("/api/login", login);
app.post("/api/logout", logout);

app.get("/api/me", requireAuth, (req, res) => {
  res.json({ ok: true, ...req.user });
});

app.post("/api/agent-name", requireAuth, (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ ok: false, error: "name required" });
  setAgentName(req.user.username, name);
  res.json({ ok: true });
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, waStatus });
});

app.get("/api/conversations", requireAuth, (req, res) => {
  const tenant = String(req.query.tenant || "");
  if (!tenant) return res.status(400).json({ ok: false, error: "tenant required" });
  if (!req.user.tenants?.includes(tenant)) return res.status(403).json({ ok: false, error: "forbidden" });

  res.json({ ok: true, items: listConversations(tenant) });
});

app.get("/api/messages", requireAuth, (req, res) => {
  const tenant = String(req.query.tenant || "");
  const jid = String(req.query.jid || "");
  if (!tenant || !jid) return res.status(400).json({ ok: false, error: "tenant and jid required" });
  if (!req.user.tenants?.includes(tenant)) return res.status(403).json({ ok: false, error: "forbidden" });

  res.json({ ok: true, ...getConversation(tenant, jid) });
});

app.post("/api/send", requireAuth, async (req, res) => {
  const { tenant, jid, text } = req.body || {};
  if (!tenant || !jid || !text) return res.status(400).json({ ok: false, error: "tenant, jid, text required" });
  if (!req.user.tenants?.includes(tenant)) return res.status(403).json({ ok: false, error: "forbidden" });
  if (!sock) return res.status(503).json({ ok: false, error: "whatsapp offline" });

  const agentName = getAgentName(req.user.username) || req.user.username;

  addMessage({
    tenant,
    jid,
    msg: {
      from: "agent",
      text: String(text),
      ts: Date.now(),
      agentName
    }
  });

  await sock.sendMessage(jid, { text: String(text) });
  res.json({ ok: true });
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use("/", express.static(path.join(__dirname, "..", "public")));

const PORT = Number(process.env.PORT || 3334);
app.listen(PORT, async () => {
  console.log(`✅ API rodando em http://localhost:${PORT}`);

  sock = await startWhatsApp({
    onStatus: (st) => {
      waStatus = st;
      console.log("📲 WhatsApp:", waStatus);
    }
  });
});
