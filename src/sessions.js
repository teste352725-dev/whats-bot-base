import session from "express-session";

export function sessionMiddleware() {
  const secret = process.env.SESSION_SECRET || "dev-secret";
  return session({
    name: "wb.sid",
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 1000 * 60 * 60 * 12
    }
  });
}

export function requireAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ ok: false, error: "unauthorized" });
  next();
}
