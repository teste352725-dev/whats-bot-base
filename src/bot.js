import makeWASocket, {
  Browsers,
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
    logger,
    browser: Browsers.ubuntu("Chrome")
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

  sock.ev.on("messages.upsert", async (m) => {
    try {
      const msg = m.messages?.[0];
      if (!msg) return;
      if (msg.key.fromMe) return;

      const jid = msg.key.remoteJid;
      if (!jid) return;

      // (por enquanto) ignora grupos — depois a gente ativa
      if (jid.endsWith("@g.us")) return;

      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        "";

      if (!text) return;

      // 1) Se esse chat está em MODO HUMANO, não responde
      if (isHumanMode(jid)) return;

      const lower = text.toLowerCase().trim();

      // 2) Se a pessoa digitar "atendente" ou "humano", escala direto
      if (lower.includes("atendente") || lower.includes("humano")) {
        const human = process.env.HUMAN_JID;
        const fallback = process.env.HUMAN_FALLBACK_TEXT || "Vou te encaminhar para um atendente.";

        await sock.sendMessage(jid, { text: fallback });

        if (human) {
          await sock.sendMessage(human, {
            text: `📩 *Novo atendimento*\nCliente: ${jid}\nMensagem: ${text}`
          });
        }
        return;
      }

      // 3) Triagem por "tag" (estado do atendimento)
      const currentTag = getTag(jid);

      // Se ainda não tem tag, mostra menu e tenta detectar
      if (!currentTag) {
        // tentativa de detecção automática
        let detected = null;

        if (lower.includes("curso") || lower.includes("turma") || lower === "1") detected = "cursos";
        if (lower.includes("comprar") || lower.includes("venda") || lower.includes("produto") || lower === "2") detected = "vendas";
        if (lower.includes("suporte") || lower.includes("problema") || lower.includes("erro") || lower === "3") detected = "suporte";
        if (lower.includes("pagamento") || lower.includes("pix") || lower.includes("boleto") || lower === "4") detected = "financeiro";

        if (!detected) {
          await sock.sendMessage(jid, {
            text:
              `Olá! 😊 Eu sou o *${process.env.BOT_NAME || "Bot"}*.\n\n` +
              `Me diga o que você precisa:\n` +
              `1) 📚 Cursos\n` +
              `2) 🛒 Vendas\n` +
              `3) 🛠️ Suporte\n` +
              `4) 💳 Financeiro\n\n` +
              `Responda com 1, 2, 3 ou 4.\n` +
              `Se preferir atendimento humano, digite *atendente*.`
          });
          return;
        }

        setTag(jid, detected);
      }

      // Recarrega tag (caso tenha sido setada agora)
      const tag = getTag(jid);

      // 4) Fluxos por área
      if (tag === "cursos") {
        await sock.sendMessage(jid, {
          text:
            "📚 *Cursos*\n" +
            "Me diga:\n" +
            "• Qual curso/turma você quer?\n" +
            "• Seu nome\n" +
            "• Seu WhatsApp (se for outro número)"
        });
        return;
      }

      if (tag === "vendas") {
        await sock.sendMessage(jid, {
          text:
            "🛒 *Vendas*\n" +
            "Me diga:\n" +
            "• Qual produto você quer\n" +
            "• Sua cidade\n" +
            "• Forma de pagamento (Pix/Cartão)"
        });
        return;
      }

      if (tag === "suporte") {
        await sock.sendMessage(jid, {
          text:
            "🛠️ *Suporte*\n" +
            "Descreva o problema e, se puder, mande print.\n" +
            "Se quiser atendimento humano, digite *atendente*."
        });
        return;
      }

      if (tag === "financeiro") {
        await sock.sendMessage(jid, {
          text:
            "💳 *Financeiro*\n" +
            "Você precisa de:\n" +
            "1) Pix\n" +
            "2) Boleto\n" +
            "3) Cartão\n\n" +
            "Responda com 1, 2 ou 3."
        });
        return;
      }

      // fallback final
      await sock.sendMessage(jid, { text: "Não entendi 😅. Digite *atendente* ou diga *curso / vendas / suporte / financeiro*." });
    } catch (e) {
      console.error("messages.upsert error:", e);
    }
  });

  return sock;
}
