import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import pino from "pino";
import { isHumanMode, setTag, getTag } from "./store.js";

export async function startBot({ botName, onConnectionUpdate }) {
  const logger = pino({ level: "silent" });

  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrcode.generate(qr, { small: true });
      onConnectionUpdate?.({ status: "qr" });
    }

    if (connection === "open") {
      onConnectionUpdate?.({ status: "online" });
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      onConnectionUpdate?.({ status: "offline", code });

      if (shouldReconnect) {
        // o index.js vai reiniciar via PM2/Watch ou você pode chamar startBot novamente
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages?.[0];
    if (!msg || msg.key.fromMe) return;

    const jid = msg.key.remoteJid;
    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      "";

    // Ignora grupos (você pode liberar depois)
    const isGroup = jid?.endsWith("@g.us");
    if (isGroup) return;

    // Se estiver em modo humano, não responde
    if (isHumanMode(jid)) return;

    const lower = (text || "").trim().toLowerCase();

    // Triagem simples
    // 1) primeira mensagem ou "menu"
    if (!text || lower === "menu" || lower === "oi" || lower === "olá" || lower === "ola") {
      await sock.sendMessage(jid, {
        text:
`👋 Olá! Eu sou o *${botName}*.

Me diga o que você precisa:
1) 📚 Cursos / Matrícula
2) 💳 Pagamento / Boleto
3) 🧑‍💼 Falar com atendente`
      });
      return;
    }

    // 2) seleção
    if (lower === "1") {
      setTag(jid, "cursos");
      await sock.sendMessage(jid, { text: "Show! Me diga: qual curso você quer e sua cidade/estado?" });
      return;
    }
    if (lower === "2") {
      setTag(jid, "pagamento");
      await sock.sendMessage(jid, { text: "Beleza. Você quer 2ª via, confirmar pagamento ou negociar? Me explica rapidinho." });
      return;
    }
    if (lower === "3" || lower.includes("atendente") || lower.includes("humano")) {
      setTag(jid, "handoff");
      await sock.sendMessage(jid, { text: "Certo ✅ Vou te encaminhar para um atendente. Enquanto isso, me diga seu nome e o motivo." });
      return;
    }

    // 3) resposta contextual básica
    const tag = getTag(jid);
    if (tag === "cursos") {
      await sock.sendMessage(jid, { text: "Perfeito. Vou registrar seu interesse e já já alguém te chama. Quer receber a grade/valores agora? (sim/não)" });
      return;
    }
    if (tag === "pagamento") {
      await sock.sendMessage(jid, { text: "Entendi. Você tem o número do pedido ou CPF (apenas os 3 primeiros e 2 últimos dígitos)?" });
      return;
    }

    // fallback
    await sock.sendMessage(jid, { text: "Entendi! Digite *menu* para ver opções, ou escreva *atendente* para falar com uma pessoa." });
  });

  return sock;
}
