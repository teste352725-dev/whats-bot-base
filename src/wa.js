import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers
} from "@whiskeysockets/baileys";
import { upsertContact, addMessage, getContact } from "./store.js";
import { decideTenantForNewContact, getTenantConfig, triageTag } from "./triage.js";

export async function startWhatsApp({ onStatus }) {
  const authDir = process.env.WA_AUTH_DIR || "./data/wa-auth";
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    browser: Browsers.ubuntu("Chrome"),
    printQRInTerminal: true
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (u) => {
    const st = u.connection === "open" ? "online" : (u.connection === "close" ? "offline" : "starting");
    onStatus?.(st);
  });

  sock.ev.on("messages.upsert", async (m) => {
    const msg = m.messages?.[0];
    if (!msg) return;
    if (msg.key.fromMe) return;

    const jid = msg.key.remoteJid;
    if (!jid || !jid.endsWith("@s.whatsapp.net")) return;

    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      "";

    const phone = jid.split("@")[0];

    const contactName = msg.pushName || null;
    let pfpUrl = null;
    try {
      pfpUrl = await sock.profilePictureUrl(jid, "image");
    } catch {
      pfpUrl = null;
    }

    const existing = getContact(jid);
    const tenant = existing?.tenant || decideTenantForNewContact(text);
    const tag = existing?.tag || triageTag(tenant, text);

    upsertContact(jid, { phone, name: contactName, pfpUrl, tenant, tag });

    addMessage({
      tenant,
      jid,
      msg: {
        from: "client",
        text,
        ts: Date.now(),
        contactName
      }
    });

    if (!tag) {
      const cfg = getTenantConfig(tenant);
      await sock.sendMessage(jid, { text: cfg.welcome });
    }
  });

  return sock;
}
