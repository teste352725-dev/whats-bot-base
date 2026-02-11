import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";

import { sessionMiddleware, requireAuth } from "./sessions.js";
import { startBot } from "./bot.js";
import {
  listTickets,
  getMessages,
  addMessage,
  upsertTicket,
  markRead,
  setHumanMode,
  closeTicket
} from "./store.js";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(sessionMiddleware());

const PORT = Number(process.env.PORT || 3333);
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "admin123";
const BOT_NAME = process.env.BOT_NAME || "Bot";

let sock = null;
let waStatus = "starting";

const sseClients = new Set();

function sseBroadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) res.write(payload);
}

app.get("/api/events", requireAuth, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  sseClients.add(res);

  req.on("close", () => {
    sseClients.delete(res);
  });
});

app.post("/api/auth/login", async (req, res) => {
  const { user, pass } = req.body || {};
  if (!user || !pass) return res.status(400).json({ ok: false, error: "missing user/pass" });

  const okUser = String(user) === ADMIN_USER;
  const isHash = String(ADMIN_PASS).startsWith("$2a$") || String(ADMIN_PASS).startsWith("$2b$") || String(ADMIN_PASS).startsWith("$2y$");
  const okPass = isHash ? await bcrypt.compare(String(pass), String(ADMIN_PASS)) : String(pass) === ADMIN_PASS;

  if (!okUser || !okPass) return res.status(401).json({ ok: false, error: "invalid credentials" });

  req.session.user = { user: ADMIN_USER, role: "admin" };
  res.json({ ok: true, user: { user: ADMIN_USER, role: "admin" } });
});

app.get("/api/auth/me", (req, res) => {
  if (!req.session?.user) return res.status(401).json({ ok: false });
  res.json({ ok: true, user: req.session.user, waStatus });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, waStatus, botName: BOT_NAME });
});

app.get("/api/tickets", requireAuth, (req, res) => {
  res.json({ ok: true, tickets: listTickets(), waStatus });
});

app.get("/api/tickets/:jid/messages", requireAuth, (req, res) => {
  const jid = req.params.jid;
  markRead(jid);
  res.json({ ok: true, jid, messages: getMessages(jid) });
});

app.post("/api/tickets/:jid/human-mode", requireAuth, (req, res) => {
  const jid = req.params.jid;
  const enabled = !!req.body?.enabled;
  const value = setHumanMode(jid, enabled);
  sseBroadcast("ticket", { type: "humanMode", jid, enabled: value });
  res.json({ ok: true, jid, humanMode: value });
});

app.post("/api/tickets/:jid/close", requireAuth, (req, res) => {
  const jid = req.params.jid;
  closeTicket(jid);
  sseBroadcast("ticket", { type: "closed", jid });
  res.json({ ok: true, jid });
});

app.post("/api/tickets/:jid/send", requireAuth, async (req, res) => {
  const jid = req.params.jid;
  const text = String(req.body?.text || "").trim();
  if (!text) return res.status(400).json({ ok: false, error: "text required" });
  if (!sock) return res.status(503).json({ ok: false, error: "whatsapp offline" });

  await sock.sendMessage(jid, { text });

  const msg = addMessage(jid, {
    id: cryptoRandom(),
    at: Date.now(),
    direction: "out",
    text
  });

  sseBroadcast("message", { jid, message: msg });
  res.json({ ok: true });
});

function cryptoRandom() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use("/", express.static(path.join(__dirname, "..", "public")));

app.listen(PORT, async () => {
  console.log(`✅ API rodando em http://localhost:${PORT}`);

  sock = await startBot({
    onConnectionUpdate: (st) => {
      waStatus = st.status || "offline";
      console.log("📲 WhatsApp:", waStatus);
      sseBroadcast("wa", { waStatus });
    },
    onIncoming: ({ jid, text }) => {
      upsertTicket(jid, { displayName: jid });
      const msg = addMessage(jid, {
        id: cryptoRandom(),
        at: Date.now(),
        direction: "in",
        text
      });

      sseBroadcast("message", { jid, message: msg });
    }
  });
});
