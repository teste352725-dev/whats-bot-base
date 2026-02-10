import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, JSON.stringify({ humans: {}, tags: {} }, null, 2));
  }
}

function normalizeStore(raw) {
  if (!raw || typeof raw !== "object") {
    return { humans: {}, tags: {} };
  }

  return {
    humans: raw.humans && typeof raw.humans === "object" ? raw.humans : {},
    tags: raw.tags && typeof raw.tags === "object" ? raw.tags : {}
  };
}

export function loadStore() {
  ensure();
  try {
    const content = fs.readFileSync(STORE_FILE, "utf-8");
    return normalizeStore(JSON.parse(content));
  } catch {
    const fallback = { humans: {}, tags: {} };
    fs.writeFileSync(STORE_FILE, JSON.stringify(fallback, null, 2));
    return fallback;
  }
}

export function saveStore(store) {
  ensure();
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

export function setHumanMode(jid, enabled) {
  const store = loadStore();
  store.humans[jid] = !!enabled;
  saveStore(store);
  return store.humans[jid];
}

export function isHumanMode(jid) {
  const store = loadStore();
  return !!store.humans[jid];
}

export function setTag(jid, tag) {
  const store = loadStore();
  store.tags[jid] = tag;
  saveStore(store);
  return tag;
}

export function getTag(jid) {
  const store = loadStore();
  return store.tags[jid] || null;
}
