import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("data");
const DB_FILE = path.join(DATA_DIR, "db.json");

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify({ tickets: {}, messages: {}, humans: {} }, null, 2)
    );
  }
}

function normalizeDB(db) {
  if (!db || typeof db !== "object") return { tickets: {}, messages: {}, humans: {} };
  return {
    tickets: db.tickets && typeof db.tickets === "object" ? db.tickets : {},
    messages: db.messages && typeof db.messages === "object" ? db.messages : {},
    humans: db.humans && typeof db.humans === "object" ? db.humans : {}
  };
}

function readDB() {
  ensure();
  try {
    return normalizeDB(JSON.parse(fs.readFileSync(DB_FILE, "utf-8")));
  } catch {
    const fallback = { tickets: {}, messages: {}, humans: {} };
    fs.writeFileSync(DB_FILE, JSON.stringify(fallback, null, 2));
    return fallback;
  }
}

function writeDB(db) {
  ensure();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function upsertTicketInDB(db, jid, info = {}) {
  const now = Date.now();

  if (!db.tickets[jid]) {
    db.tickets[jid] = {
      jid,
      createdAt: now,
      updatedAt: now,
      status: "open",
      lastMessage: "",
      unread: 0,
      displayName: info.displayName || jid
    };
  } else {
    db.tickets[jid].updatedAt = now;
    if (info.displayName) db.tickets[jid].displayName = info.displayName;
  }

  return db.tickets[jid];
}

export function upsertTicket(jid, info = {}) {
  const db = readDB();
  const ticket = upsertTicketInDB(db, jid, info);
  writeDB(db);
  return ticket;
}

export function addMessage(jid, msg) {
  const db = readDB();
  upsertTicketInDB(db, jid);

  if (!db.messages[jid]) db.messages[jid] = [];
  db.messages[jid].push(msg);

  db.tickets[jid].updatedAt = Date.now();
  db.tickets[jid].lastMessage = msg.text || "";
  if (msg.direction === "in") db.tickets[jid].unread = (db.tickets[jid].unread || 0) + 1;

  writeDB(db);
  return msg;
}

export function listTickets() {
  const db = readDB();
  return Object.values(db.tickets).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function getTicket(jid) {
  const db = readDB();
  return db.tickets[jid] || null;
}

export function getMessages(jid) {
  const db = readDB();
  return db.messages[jid] || [];
}

export function markRead(jid) {
  const db = readDB();
  if (db.tickets[jid]) db.tickets[jid].unread = 0;
  writeDB(db);
  return true;
}

export function setHumanMode(jid, enabled) {
  const db = readDB();
  db.humans[jid] = !!enabled;
  writeDB(db);
  return db.humans[jid];
}

export function isHumanMode(jid) {
  const db = readDB();
  return !!db.humans[jid];
}

export function closeTicket(jid) {
  const db = readDB();
  if (db.tickets[jid]) db.tickets[jid].status = "closed";
  writeDB(db);
  return true;
}
