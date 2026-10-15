import { createHash, randomBytes } from "node:crypto";
import { pool } from "../db/pool.js";

const COOKIE = "kai_session";
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const tokenPattern = /^[a-f\d]{64}$/;

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};

function digestToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueSession(req, res, userId) {
  const previous = req.cookies?.[COOKIE];
  if (typeof previous === "string" && tokenPattern.test(previous)) {
    await pool.query("DELETE FROM sessions WHERE token_hash = $1", [digestToken(previous)]);
  }

  const rawToken = randomBytes(32).toString("hex");
  await pool.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, $3)`,
    [digestToken(rawToken), userId, new Date(Date.now() + SESSION_LIFETIME_MS)],
  );

  res.cookie(COOKIE, rawToken, {
    ...cookieOptions,
    maxAge: SESSION_LIFETIME_MS,
  });
}

export async function currentUser(req) {
  const token = req.cookies?.[COOKIE];
  if (typeof token !== "string" || !tokenPattern.test(token)) return null;

  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.email_verified
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [digestToken(token)],
  );
  return rows[0] ?? null;
}

export async function destroySession(req, res) {
  const token = req.cookies?.[COOKIE];
  if (typeof token === "string" && tokenPattern.test(token)) {
    await pool.query("DELETE FROM sessions WHERE token_hash = $1", [digestToken(token)]);
  }
  res.clearCookie(COOKIE, cookieOptions);
}
