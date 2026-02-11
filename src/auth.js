import fs from "fs";
import path from "path";

const USERS_FILE = path.resolve(process.env.USERS_FILE || "data/users.json");
const USERS_EXAMPLE_FILE = path.resolve("users.example.json");

function ensureUsersFile() {
  const dir = path.dirname(USERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(USERS_FILE)) return;

  if (fs.existsSync(USERS_EXAMPLE_FILE)) {
    fs.copyFileSync(USERS_EXAMPLE_FILE, USERS_FILE);
    return;
  }

  const fallback = {
    users: [
      {
        username: "admin",
        password: "admin123",
        role: "admin",
        tenants: ["efcol", "alef", "sejaprofeta"]
      },
      {
        username: "efcol.at1",
        password: "123",
        role: "agent",
        tenants: ["efcol"]
      },
      {
        username: "alef.at1",
        password: "123",
        role: "agent",
        tenants: ["alef"]
      },
      {
        username: "seja.at1",
        password: "123",
        role: "agent",
        tenants: ["sejaprofeta"]
      }
    ]
  };

  fs.writeFileSync(USERS_FILE, JSON.stringify(fallback, null, 2));
}

function loadUsers() {
  ensureUsersFile();

  try {
    const raw = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
    return Array.isArray(raw.users) ? raw.users : [];
  } catch {
    throw new Error(`Arquivo de usuários inválido: ${USERS_FILE}`);
  }
}

export function authMiddleware() {
  return (req, res, next) => {
    req.user = null;
    const cookie = req.headers.cookie || "";
    const sid = cookie.split(";").map((s) => s.trim()).find((s) => s.startsWith("sid="));
    if (sid) {
      try {
        const payload = JSON.parse(Buffer.from(sid.slice(4), "base64").toString("utf8"));
        if (payload && payload.username) req.user = payload;
      } catch {
        req.user = null;
      }
    }
    next();
  };
}

export function login(req, res) {
  const { username, password } = req.body || {};
  const u = loadUsers().find((x) => x.username === username && x.password === password);
  if (!u) return res.status(401).json({ ok: false, error: "login inválido" });
  const sid = Buffer.from(
    JSON.stringify({ username: u.username, role: u.role, tenants: u.tenants }),
    "utf8"
  ).toString("base64");
  res.setHeader("Set-Cookie", `sid=${sid}; Path=/; HttpOnly; SameSite=Lax`);
  res.json({ ok: true, role: u.role });
}

export function logout(req, res) {
  res.setHeader("Set-Cookie", "sid=; Path=/; Max-Age=0");
  res.json({ ok: true });
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ ok: false, error: "unauthorized" });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") return res.status(403).json({ ok: false, error: "forbidden" });
  next();
}
