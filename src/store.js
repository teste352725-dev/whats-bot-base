import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(
      STORE_FILE,
      JSON.stringify({ contacts: {}, convos: {}, agents: {} }, null, 2)
    );
  }
}

function read() {
  ensure();
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    const fallback = { contacts: {}, convos: {}, agents: {} };
    fs.writeFileSync(STORE_FILE, JSON.stringify(fallback, null, 2));
    return fallback;
  }
}

function write(data) {
  ensure();
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));
}

export function upsertContact(jid, patch) {
  const db = read();
  db.contacts[jid] = { ...(db.contacts[jid] || {}), ...patch };
  write(db);
  return db.contacts[jid];
}

export function addMessage({ tenant, jid, msg }) {
  const db = read();
  if (!db.convos[tenant]) db.convos[tenant] = {};
  if (!db.convos[tenant][jid]) db.convos[tenant][jid] = { messages: [], updatedAt: Date.now() };
  db.convos[tenant][jid].messages.push(msg);
  db.convos[tenant][jid].updatedAt = Date.now();
  write(db);
}

export function listConversations(tenant) {
  const db = read();
  const t = db.convos[tenant] || {};
  const items = Object.entries(t).map(([jid, v]) => {
    const last = v.messages[v.messages.length - 1];
    const c = db.contacts[jid] || {};
    return {
      jid,
      updatedAt: v.updatedAt,
      lastText: last?.text || "",
      displayName: c.name || c.phone || jid,
      tag: c.tag || null
    };
  });
  items.sort((a, b) => b.updatedAt - a.updatedAt);
  return items;
}

export function getConversation(tenant, jid) {
  const db = read();
  const c = db.contacts[jid] || {};
  const conv = db.convos?.[tenant]?.[jid] || { messages: [] };
  return {
    header: {
      jid,
      phone: c.phone || jid,
      displayName: c.name || c.phone || jid,
      tag: c.tag || null,
      pfpUrl: c.pfpUrl || null
    },
    items: conv.messages
  };
}

export function setAgentName(username, name) {
  const db = read();
  db.agents[username] = { ...(db.agents[username] || {}), name };
  write(db);
  return name;
}

export function getAgentName(username) {
  const db = read();
  return db.agents?.[username]?.name || null;
}

export function getContact(jid) {
  const db = read();
  return db.contacts[jid] || null;
}
