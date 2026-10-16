import { Router } from "express";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import { pool } from "../db/pool.js";
import { currentUser, issueSession } from "../services/sessions.js";
import { hashPassword, verifyPassword } from "../services/passwords.js";
import { fail, transaction } from "../services/platform.js";
export const securityRouter = Router();
function password(v) {
  if (typeof v !== "string" || v.length < 8 || Buffer.byteLength(v) > 256)
    fail(400, "Use a password of at least 8 characters (up to 256 bytes).");
  return v;
}
const hash = (v) => createHash("sha256").update(v).digest("hex");
async function sendEmail(to, subject, body) {
  if (process.env.SMTP_HOST) {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });
    await transport.sendMail({
      from: process.env.MAIL_FROM,
      to,
      subject,
      text: body,
    });
    return;
  }
  if (process.env.NODE_ENV === "production" || !process.env.MAIL_OUTBOX_DIR)
    fail(503, "Email delivery is not configured.");
  const directory = path.resolve(process.env.MAIL_OUTBOX_DIR);
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(
      directory,
      `${Date.now()}-${randomBytes(5).toString("hex")}.json`,
    ),
    JSON.stringify({ to, subject, text: body }, null, 2),
    { mode: 0o600 },
  );
}
securityRouter.post("/password", async (req, res) => {
  const u = await currentUser(req);
  if (!u) fail(401, "Sign in required.");
  const next = password(req.body.password);
  const old = (
    await pool.query("SELECT password_hash FROM users WHERE id=$1", [u.id])
  ).rows[0].password_hash;
  if (old && !(await verifyPassword(req.body.current_password || "", old)))
    fail(400, "Current password is incorrect.");
  const value = await hashPassword(next);
  await transaction(async (db) => {
    await db.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
      value,
      u.id,
    ]);
    await db.query("DELETE FROM sessions WHERE user_id=$1", [u.id]);
  });
  await issueSession(req, res, u.id);
  res.json({ ok: true });
});
securityRouter.post("/sessions/revoke", async (req, res) => {
  const u = await currentUser(req);
  if (!u) fail(401, "Sign in required.");
  await pool.query("DELETE FROM sessions WHERE user_id=$1", [u.id]);
  await issueSession(req, res, u.id);
  res.json({ ok: true });
});
securityRouter.post("/email/verify", async (req, res) => {
  const u = await currentUser(req);
  if (!u) fail(401, "Sign in required.");
  if (u.email_verified) return res.json({ ok: true });
  const token = randomBytes(32).toString("hex");
  await pool.query(
    "INSERT INTO account_tokens(token_hash,user_id,purpose,expires_at) VALUES($1,$2,'verify',now()+interval '1 hour')",
    [hash(token), u.id],
  );
  await sendEmail(
    u.email,
    "Verify your kai email",
    `${process.env.APP_ORIGIN || "http://localhost:5175"}/security?purpose=verify&token=${token}`,
  );
  res.json({
    ok: true,
    delivery: process.env.SMTP_HOST ? "smtp" : "local-outbox",
  });
});
securityRouter.post("/password/forgot", async (req, res) => {
  if (
    !process.env.SMTP_HOST &&
    (!process.env.MAIL_OUTBOX_DIR || process.env.NODE_ENV === "production")
  )
    fail(503, "Email delivery is not configured.");
  const email =
    typeof req.body.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";
  const u = (
    await pool.query(
      "SELECT id,email FROM users WHERE lower(email)=$1 AND NOT suspended",
      [email],
    )
  ).rows[0];
  if (u) {
    const token = randomBytes(32).toString("hex");
    await pool.query(
      "INSERT INTO account_tokens(token_hash,user_id,purpose,expires_at) VALUES($1,$2,'reset',now()+interval '30 minutes')",
      [hash(token), u.id],
    );
    await sendEmail(
      u.email,
      "Reset your kai password",
      `${process.env.APP_ORIGIN || "http://localhost:5175"}/security?purpose=reset&token=${token}`,
    );
  }
  res.json({ ok: true });
});
securityRouter.post("/token", async (req, res) => {
  if (
    !["verify", "reset"].includes(req.body.purpose) ||
    typeof req.body.token !== "string" ||
    !/^[a-f\d]{64}$/.test(req.body.token)
  )
    fail(400, "Invalid link.");
  const newHash =
    req.body.purpose === "reset"
      ? await hashPassword(password(req.body.password))
      : null;
  await transaction(async (db) => {
    const t = (
      await db.query(
        "DELETE FROM account_tokens WHERE token_hash=$1 AND purpose=$2 AND expires_at>now() RETURNING *",
        [hash(req.body.token), req.body.purpose],
      )
    ).rows[0];
    if (!t) fail(400, "This link has expired or was already used.");
    if (newHash) {
      await db.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
        newHash,
        t.user_id,
      ]);
      await db.query("DELETE FROM sessions WHERE user_id=$1", [t.user_id]);
      await db.query(
        "DELETE FROM account_tokens WHERE user_id=$1 AND purpose='reset'",
        [t.user_id],
      );
    } else
      await db.query("UPDATE users SET email_verified=true WHERE id=$1", [
        t.user_id,
      ]);
  });
  res.json({ ok: true });
});
