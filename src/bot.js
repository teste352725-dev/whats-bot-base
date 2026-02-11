import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";

export async function startBot({ onConnectionUpdate, onIncoming }) {
  const logger = pino({ level: "silent" });

  const { state, saveCreds } = await useMultiFileAuthState("data/baileys_auth");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    logger,
    version,
    auth: state,
    browser: Browsers.ubuntu("Chrome")
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, qr } = update;

    if (qr) {
      qrcode.generate(qr, { small: true });
      onConnectionUpdate?.({ status: "qr" });
    }

    if (connection === "open") onConnectionUpdate?.({ status: "online" });
    if (connection === "close") onConnectionUpdate?.({ status: "offline" });
  });

  sock.ev.on("messages.upsert", async (m) => {
    const msg = m.messages?.[0];
    if (!msg) return;
    if (msg.key.fromMe) return;

    const jid = msg.key.remoteJid;
    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      "";

    if (!jid) return;

    onIncoming?.({
      jid,
      text,
      raw: msg
    });
  });

  return sock;
}
