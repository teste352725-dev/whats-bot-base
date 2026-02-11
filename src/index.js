await import("dotenv/config").catch((err) => {
  if (err?.code === "ERR_MODULE_NOT_FOUND" && String(err?.message || "").includes("dotenv")) {
    console.warn("⚠️ Pacote 'dotenv' não encontrado. Rode `npm install` para carregar variáveis do .env.");
    return;
  }

  throw err;
});

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import { startBot } from "./bot.js";
import { createQueue } from "./queue.js";
import { setHumanMode, isHumanMode } from "./store.js";

const app = express();
app.use(cors());
app.use(express.json());

const requestedPort = Number(process.env.PORT || 3333);
const PORT = Number.isFinite(requestedPort) && requestedPort > 0 ? requestedPort : 3333;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const BOT_NAME = process.env.BOT_NAME || "Bot";
const MAX_PORT_ATTEMPTS = Math.max(1, Number(process.env.PORT_RETRY_ATTEMPTS) || 15);

const allowlist = (process.env.ALLOWLIST_SEND || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const queue = createQueue({
  minDelayMs: process.env.MIN_DELAY_MS,
  maxDelayMs: process.env.MAX_DELAY_MS,
  maxPerMinute: process.env.MAX_PER_MINUTE
});

let sock = null;
let waStatus = "starting"; // starting | qr | online | offline

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  next();
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, waStatus, queue: queue.size() });
});

app.get("/api/status", (req, res) => {
  res.json({ ok: true, message: "Backend online 🚀", waStatus });
});

app.post("/api/human-mode", requireAdmin, (req, res) => {
  const { jid, enabled } = req.body || {};
  if (!jid) return res.status(400).json({ ok: false, error: "jid required" });
  const value = setHumanMode(jid, !!enabled);
  res.json({ ok: true, jid, humanMode: value });
});

app.get("/api/human-mode", requireAdmin, (req, res) => {
  const jid = req.query.jid;
  if (!jid) return res.status(400).json({ ok: false, error: "jid required" });
  res.json({ ok: true, jid, humanMode: isHumanMode(String(jid)) });
});

app.post("/api/send", requireAdmin, (req, res) => {
  const { to, text } = req.body || {};
  if (!to || !text) return res.status(400).json({ ok: false, error: "to and text required" });

  // Normaliza: usuário manda 5527... e vira jid
  const digits = String(to).replace(/\D/g, "");
  if (!digits) return res.status(400).json({ ok: false, error: "invalid to" });

  // allowlist (evita “disparo geral”)
  if (allowlist.length && !allowlist.includes(digits)) {
    return res.status(403).json({ ok: false, error: "number not in allowlist_send" });
  }

  const jid = `${digits}@s.whatsapp.net`;

  if (!sock) return res.status(503).json({ ok: false, error: "whatsapp not ready" });

  queue.push(async () => {
    await sock.sendMessage(jid, { text: String(text) });
  });

  res.json({ ok: true, queued: true, jid });
});

// Painel estático
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use("/", express.static(path.join(__dirname, "..", "public")));

function listenOnPort(port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => resolve(server));
    server.once("error", reject);
  });
}

async function startHttpServer() {
  let currentPort = PORT;

  for (let attempt = 1; attempt <= MAX_PORT_ATTEMPTS; attempt += 1) {
    try {
      await listenOnPort(currentPort);
      return currentPort;
    } catch (err) {
      if (err?.code === "EADDRINUSE") {
        if (attempt === MAX_PORT_ATTEMPTS) {
          throw new Error(`Porta em uso: não foi possível abrir de ${PORT} até ${currentPort}.`);
        }

        console.warn(`⚠️ Porta ${currentPort} em uso. Tentando ${currentPort + 1}...`);
        currentPort += 1;
        continue;
      }

      throw err;
    }
  }

  throw new Error("Falha ao iniciar o servidor HTTP.");
}

async function bootstrap() {
  try {
    const activePort = await startHttpServer();
    console.log(`✅ API rodando em http://localhost:${activePort}`);

    sock = await startBot({
      botName: BOT_NAME,
      onConnectionUpdate: (st) => {
        waStatus = st.status || "offline";
        console.log("📲 WhatsApp:", waStatus);
      }
    });
  } catch (err) {
    console.error("❌ Erro ao iniciar aplicação:", err?.message || err);
    process.exit(1);
  }
}

bootstrap();
